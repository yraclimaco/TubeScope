"""Loading the modelling table and splitting it without leakage."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd
import psycopg
from sklearn.model_selection import GroupKFold

LABEL = "is_multiday"
GROUP = "channel_id"
DATE = "first_chart_date"

_NUMERIC_COLUMNS = [
    "duration_minutes", "title_char_count", "description_word_count", "tags_count",
    "publish_hour_pt", "publish_isodow_pt", "days_published_before_chart",
    "channel_subscribers", "channel_total_views", "channel_video_count", "channel_age_days",
    "first_day_views", "first_day_engagement_rate", "first_chart_size",
]  # fmt: skip

_QUERY = """
SELECT region, video_id, channel_id, channel_title, category_id, category, title,
       first_chart_date, first_chart_source, first_chart_size,
       is_multiday, label_observable,
       duration_minutes::float8 AS duration_minutes, title_char_count, description_word_count,
       tags_count, definition, licensed_content, publish_hour_pt, publish_isodow_pt,
       days_published_before_chart, channel_subscribers, channel_total_views,
       channel_video_count, channel_country, channel_age_days, first_day_views,
       first_day_engagement_rate::float8 AS first_day_engagement_rate
FROM analytics.video_features
WHERE region = %(region)s
  AND (%(chart_size)s::int IS NULL OR first_chart_size = %(chart_size)s::int)
  AND (%(since)s::date IS NULL OR first_chart_date >= %(since)s::date)
ORDER BY first_chart_date, video_id
"""


def load_frame(
    conn: psycopg.Connection,
    *,
    region: str = "US",
    chart_size: int | None = 200,
    since: date | None = None,
) -> pd.DataFrame:
    """Rows of ``analytics.video_features`` (labelled or not) with numeric columns as floats."""
    with conn.cursor() as cur:
        cur.execute(_QUERY, {"region": region, "chart_size": chart_size, "since": since})
        columns = [d.name for d in cur.description]
        frame = pd.DataFrame(cur.fetchall(), columns=columns)
    for column in _NUMERIC_COLUMNS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").astype(float)
    frame[DATE] = pd.to_datetime(frame[DATE]).dt.date
    return frame


def labelled(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame[frame["label_observable"].astype(bool)].copy()
    out[LABEL] = out[LABEL].astype(int)
    return out.reset_index(drop=True)


@dataclass(frozen=True)
class TemporalSplit:
    train: pd.DataFrame
    test: pd.DataFrame
    cutoff: date  # first test date
    embargoed: int  # training rows dropped because their label falls in the test period


def temporal_split(frame: pd.DataFrame, test_fraction: float = 0.2) -> TemporalSplit:
    """Hold out the most recent chart days.

    The cutoff is the earliest date such that rows on or after it make up at most
    ``test_fraction`` of the data. A training video's label depends on the next chart day, so
    videos first charting the day before the cutoff are dropped (an embargo) to keep any
    test-period information out of training.
    """
    if not 0 < test_fraction < 1:
        raise ValueError("test_fraction must be between 0 and 1")
    counts = frame.groupby(DATE).size().sort_index()
    from_end = counts[::-1].cumsum()[::-1] / counts.sum()
    eligible = from_end[from_end <= test_fraction]
    if eligible.empty or len(counts) < 3:
        raise ValueError("not enough chart days for a temporal split")
    cutoff = eligible.index[0]
    embargo_day = cutoff - timedelta(days=1)
    test = frame[frame[DATE] >= cutoff]
    before = frame[frame[DATE] < cutoff]
    train = before[before[DATE] != embargo_day]
    return TemporalSplit(
        train=train.reset_index(drop=True),
        test=test.reset_index(drop=True),
        cutoff=cutoff,
        embargoed=len(before) - len(train),
    )


class ChannelKFold:
    """K-fold CV where all of a channel's videos land in the same fold.

    Groups are read from the ``channel_id`` column of ``X`` itself, so the splitter works
    inside nested estimators (calibration, grid search) without passing ``groups`` around.
    """

    def __init__(self, n_splits: int = 5):
        self.n_splits = n_splits

    def split(self, X, y=None, groups=None):
        yield from GroupKFold(n_splits=self.n_splits).split(X, y, np.asarray(X[GROUP]))

    def get_n_splits(self, X=None, y=None, groups=None) -> int:
        return self.n_splits

    def __repr__(self) -> str:
        return f"ChannelKFold(n_splits={self.n_splits})"
