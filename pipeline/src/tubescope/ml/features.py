"""Feature sets and the preprocessing that turns ``analytics.video_features`` rows into a matrix.

Every transformation lives inside the fitted pipeline, so a saved model accepts the same raw
columns the view produces (or a hand-built row in the what-if simulator).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

MISSING = "missing"


@dataclass(frozen=True)
class FeatureSet:
    name: str
    description: str
    log_numeric: tuple[str, ...]
    numeric: tuple[str, ...] = ()
    cyclic: dict[str, int] = field(default_factory=dict)
    categorical: tuple[str, ...] = ()

    @property
    def columns(self) -> list[str]:
        return [*self.log_numeric, *self.numeric, *self.cyclic, *self.categorical]


_PREPUBLISH = FeatureSet(
    name="prepublish",
    description=(
        "What a creator knows before publishing: channel size, video length, metadata and "
        "publish time. Used for the what-if simulator."
    ),
    log_numeric=(
        "channel_subscribers",
        "channel_total_views",
        "channel_video_count",
        "channel_age_days",
        "duration_minutes",
        "description_word_count",
        "tags_count",
    ),
    numeric=("title_char_count",),
    cyclic={"publish_hour_pt": 24, "publish_isodow_pt": 7},
    categorical=("category_id", "definition", "licensed_content", "channel_country"),
)

_CHARTDAY = FeatureSet(
    name="chartday",
    description=(
        "Everything in prepublish plus what is known at the end of a video's first chart day: "
        "views, engagement and how long after publishing it charted. Used for daily scoring."
    ),
    log_numeric=(*_PREPUBLISH.log_numeric, "first_day_views", "days_published_before_chart"),
    numeric=(*_PREPUBLISH.numeric, "first_day_engagement_rate"),
    cyclic=_PREPUBLISH.cyclic,
    categorical=_PREPUBLISH.categorical,
)

FEATURE_SETS: dict[str, FeatureSet] = {fs.name: fs for fs in (_PREPUBLISH, _CHARTDAY)}


# Module-level functions so fitted pipelines can be pickled and reloaded.


def to_float(X) -> np.ndarray:
    return pd.DataFrame(X).apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)


def log1p_nonnegative(X) -> np.ndarray:
    return np.log1p(np.clip(to_float(X), 0, None))


def cyclic_encode(X, periods: list[int]) -> np.ndarray:
    values = to_float(X)
    angles = 2 * np.pi * values / np.asarray(periods, dtype=float)
    out = np.concatenate([np.sin(angles), np.cos(angles)], axis=1)
    return np.nan_to_num(out, nan=0.0)


def as_category_strings(X) -> np.ndarray:
    frame = pd.DataFrame(X)
    return frame.apply(lambda col: col.map(lambda v: MISSING if pd.isna(v) else str(v))).to_numpy(
        dtype=object
    )


def build_preprocessor(
    feature_set: FeatureSet,
    *,
    impute: bool,
    scale: bool,
    only: tuple[str, ...] | None = None,
) -> ColumnTransformer:
    """Column transformer for a feature set.

    ``impute``: fill numeric gaps with the median plus a missing indicator (needed by linear
    models and random forests; gradient boosting handles NaN itself).
    ``only``: restrict to a subset of categorical columns (used by the category baseline).
    """

    def numeric_steps(first: FunctionTransformer) -> Pipeline:
        steps = [first]
        if impute:
            steps.append(SimpleImputer(strategy="median", add_indicator=True))
        if scale:
            steps.append(StandardScaler())
        return make_pipeline(*steps)

    categorical = make_pipeline(
        FunctionTransformer(as_category_strings),
        OneHotEncoder(handle_unknown="infrequent_if_exist", min_frequency=20, sparse_output=False),
    )

    if only is not None:
        return ColumnTransformer([("cat", categorical, list(only))], sparse_threshold=0)

    log_steps = numeric_steps(FunctionTransformer(log1p_nonnegative))
    transformers = [("log", log_steps, list(feature_set.log_numeric))]
    if feature_set.numeric:
        transformers.append(
            ("num", numeric_steps(FunctionTransformer(to_float)), list(feature_set.numeric))
        )
    if feature_set.cyclic:
        transformers.append(
            (
                "cyc",
                FunctionTransformer(
                    cyclic_encode, kw_args={"periods": list(feature_set.cyclic.values())}
                ),
                list(feature_set.cyclic),
            )
        )
    if feature_set.categorical:
        transformers.append(("cat", categorical, list(feature_set.categorical)))
    return ColumnTransformer(transformers, sparse_threshold=0)
