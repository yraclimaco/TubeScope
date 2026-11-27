from datetime import date, timedelta

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.dummy import DummyClassifier
from sklearn.pipeline import Pipeline

from tubescope import db
from tubescope.ml import dataset, evaluate, features, registry, train
from tubescope.ml.card import render_model_card

START = date(2025, 10, 1)


def synthetic_frame(n: int = 1500, days: int = 30, seed: int = 0) -> pd.DataFrame:
    """Labelled rows shaped like analytics.video_features with a learnable signal."""
    rng = np.random.default_rng(seed)
    category = rng.choice([10, 20, 24], size=n, p=[0.2, 0.6, 0.2])
    duration = np.where(category == 10, rng.normal(3.5, 1, n), rng.gamma(2, 10, n)).clip(0.2)
    subscribers = rng.lognormal(13, 2, n)
    logit = -2.2 + 1.6 * (category == 10) - 0.03 * duration + 0.2 * (np.log(subscribers) - 13)
    label = rng.random(n) < 1 / (1 + np.exp(-logit))
    frame = pd.DataFrame(
        {
            "region": "US",
            "video_id": [f"v{i}" for i in range(n)],
            "channel_id": [f"c{i}" for i in rng.integers(0, 200, n)],
            "category": pd.Series(category).map({10: "Music", 20: "Gaming", 24: "Entertainment"}),
            "category_id": category,
            "first_chart_date": [START + timedelta(days=int(d)) for d in rng.integers(0, days, n)],
            "label_observable": True,
            "is_multiday": label,
            "duration_minutes": duration,
            "title_char_count": rng.integers(10, 100, n).astype(float),
            "description_word_count": rng.integers(0, 400, n).astype(float),
            "tags_count": rng.integers(0, 30, n).astype(float),
            "definition": rng.choice(["hd", "sd"], n, p=[0.95, 0.05]),
            "licensed_content": rng.choice([True, False, None], n),
            "publish_hour_pt": rng.integers(0, 24, n).astype(float),
            "publish_isodow_pt": rng.integers(1, 8, n).astype(float),
            "days_published_before_chart": rng.integers(0, 5, n).astype(float),
            "channel_subscribers": np.where(rng.random(n) < 0.02, np.nan, subscribers),
            "channel_total_views": subscribers * rng.uniform(50, 300, n),
            "channel_video_count": rng.integers(10, 3000, n).astype(float),
            "channel_country": rng.choice(["US", "GB", None], n),
            "channel_age_days": rng.integers(100, 6000, n).astype(float),
            "first_day_views": rng.lognormal(13, 1.5, n),
            "first_day_engagement_rate": rng.uniform(0, 0.1, n),
        }
    )
    return dataset.labelled(frame)


# --- features -----------------------------------------------------------------


def test_log1p_clips_negatives_and_keeps_nan():
    out = features.log1p_nonnegative(pd.DataFrame({"a": [-5, 0, np.e - 1, None]}))
    assert out[:3, 0] == pytest.approx([0, 0, 1])
    assert np.isnan(out[3, 0])


def test_cyclic_encoding_wraps_hour_23_next_to_0():
    out = features.cyclic_encode(pd.DataFrame({"h": [0, 23, 12]}), periods=[24])
    assert np.linalg.norm(out[0] - out[1]) < np.linalg.norm(out[0] - out[2])


def test_category_strings_mark_missing():
    out = features.as_category_strings(pd.DataFrame({"a": [10, None, True]}))
    assert out[:, 0].tolist() == ["10", features.MISSING, "True"]


@pytest.mark.parametrize("impute", [True, False])
def test_preprocessor_handles_unseen_categories_and_missing(impute):
    frame = synthetic_frame(300)
    fs = features.FEATURE_SETS["chartday"]
    prep = features.build_preprocessor(fs, impute=impute, scale=impute).fit(frame)
    row = frame.head(1).copy()
    row["category_id"] = 999
    row["channel_country"] = "ZZ"
    row["channel_subscribers"] = np.nan
    out = prep.transform(row)
    assert out.shape[0] == 1
    if impute:
        assert not np.isnan(out).any()


# --- splits -------------------------------------------------------------------


def test_temporal_split_holds_out_latest_days_with_embargo():
    frame = synthetic_frame()
    split = dataset.temporal_split(frame, 0.2)
    assert min(split.test["first_chart_date"]) == split.cutoff
    assert max(split.train["first_chart_date"]) < split.cutoff - timedelta(days=1)
    assert len(split.test) <= 0.2 * len(frame)
    assert len(split.train) + len(split.test) + split.embargoed == len(frame)
    assert split.embargoed == (frame["first_chart_date"] == split.cutoff - timedelta(days=1)).sum()


def test_temporal_split_rejects_tiny_data():
    with pytest.raises(ValueError):
        dataset.temporal_split(synthetic_frame(50, days=2), 0.2)


def test_channel_kfold_keeps_channels_together():
    frame = synthetic_frame()
    for train_idx, val_idx in dataset.ChannelKFold(5).split(frame):
        assert not set(frame["channel_id"].iloc[train_idx]) & set(frame["channel_id"].iloc[val_idx])


# --- metrics ------------------------------------------------------------------


def test_perfectly_calibrated_predictions_have_small_ece():
    rng = np.random.default_rng(1)
    p = rng.uniform(0, 1, 20_000)
    y = (rng.uniform(0, 1, p.size) < p).astype(int)
    assert evaluate.expected_calibration_error(y, p) < 0.02
    assert evaluate.expected_calibration_error(y, np.full_like(p, 0.9)) > 0.3


def test_threshold_and_top_fraction():
    y = np.array([0, 0, 0, 1, 1])
    p = np.array([0.1, 0.2, 0.3, 0.8, 0.9])
    assert evaluate.best_f1_threshold(y, p) == pytest.approx(0.8)
    assert evaluate.top_fraction_precision(y, p, 0.4) == 1.0
    metrics = evaluate.classification_metrics(y, p, 0.5)
    assert metrics["precision"] == metrics["recall"] == 1.0
    assert metrics["roc_auc"] == 1.0


def test_cluster_bootstrap_interval_brackets_estimate():
    frame = synthetic_frame()
    p = np.where(frame["category_id"] == 10, 0.4, 0.1)
    y, groups = frame["is_multiday"].to_numpy(), frame["channel_id"].to_numpy()
    lo, hi = evaluate.cluster_bootstrap_ci(
        y, p, groups, evaluate.top_fraction_precision, n_boot=200
    )
    assert lo <= evaluate.top_fraction_precision(y, p) <= hi


# --- training -----------------------------------------------------------------


@pytest.fixture(scope="module")
def trained():
    data = synthetic_frame()
    return train.train(data, "prepublish", n_boot=50, only=["prior", "category_only", "logistic"])


def test_training_selects_a_model_that_beats_the_prior(trained):
    report = trained.report
    assert report["estimator"] != "prior"
    chosen = report["comparison"][report["estimator"]]["test"]
    assert chosen["average_precision"] > report["comparison"]["prior"]["test"]["average_precision"]
    assert 0 < trained.threshold < 1
    lo, hi = report["test_intervals_95"]["roc_auc"]
    assert lo <= report["test"]["all_test"]["roc_auc"] <= hi


def test_report_renders_model_card(trained):
    card = render_model_card(trained.report)
    assert trained.name in card
    assert "**(chosen)**" in card


def test_saved_artifact_round_trips(trained, tmp_path):
    path = registry.save(trained, tmp_path)
    artifact = registry.load_artifact(path / registry.ARTIFACT_NAME)
    rows = synthetic_frame(20, seed=3)
    p = registry.predict(artifact, rows)
    assert p.shape == (20,) and ((p >= 0) & (p <= 1)).all()
    # Only raw feature columns are needed (e.g. a what-if request without an id).
    what_if = rows[artifact["features"]].head(1)
    assert registry.predict(artifact, what_if).shape == (1,)
    assert {"model.joblib", "report.json", "MODEL_CARD.md"} <= {f.name for f in path.iterdir()}


# --- scoring into Postgres ------------------------------------------------------


@pytest.mark.db
def test_score_writes_out_of_sample_predictions(warehouse, tmp_path):
    from .test_warehouse import D0, _bundle

    db.load_bundle(warehouse, _bundle())
    db.rebuild_views(warehouse)
    model = Pipeline([("model", DummyClassifier(strategy="constant", constant=1))])
    model.fit(pd.DataFrame({"x": [0, 1]}), [0, 1])
    trained_through = D0 + timedelta(days=2)
    artifact_path = tmp_path / "model.joblib"
    joblib.dump(
        {
            "model": model,
            "features": ["duration_minutes"],
            "trained_through": trained_through.isoformat(),
        },
        artifact_path,
    )
    version_id = warehouse.execute(
        "INSERT INTO ml.model_version (name, threshold) VALUES ('test', 0.5) "
        "RETURNING model_version_id"
    ).fetchone()[0]

    # Labelled-or-not feature rows: C, G (first chart D2), F (D3), E (D6).
    assert registry.score(warehouse, version_id, str(artifact_path)) == {
        "scored": 2,
        "in_sample": 0,
    }
    counts = registry.score(warehouse, version_id, str(artifact_path), include_training_period=True)
    assert counts == {"scored": 4, "in_sample": 2}
    rows = warehouse.execute(
        "SELECT video_id, in_sample FROM ml.prediction ORDER BY video_id"
    ).fetchall()
    assert rows == [("C", True), ("E", False), ("F", False), ("G", True)]
