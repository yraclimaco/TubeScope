"""Saving models, registering them in ``ml.model_version``, batch scoring to ``ml.prediction``."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import psycopg
from psycopg.types.json import Jsonb

from .. import config
from .card import render_model_card
from .dataset import DATE, GROUP, load_frame
from .train import TrainResult

MODELS_DIR = config.REPO_ROOT / "ml" / "models"
ARTIFACT_NAME = "model.joblib"


def save(result: TrainResult, models_dir: Path = MODELS_DIR) -> Path:
    """Write ``model.joblib``, ``report.json`` and ``MODEL_CARD.md`` to ``models_dir/<name>/``."""
    target = models_dir / result.name
    target.mkdir(parents=True, exist_ok=True)
    report = result.report
    joblib.dump(
        {
            "model": result.model,
            "name": result.name,
            "feature_set": report["feature_set"],
            "features": report["features"],
            "threshold": result.threshold,
            "trained_through": report["trained_through"],
            "sklearn_version": report["sklearn_version"],
        },
        target / ARTIFACT_NAME,
        compress=3,
    )
    (target / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    (target / "MODEL_CARD.md").write_text(render_model_card(report))
    return target


def _relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(config.REPO_ROOT))
    except ValueError:
        return str(path.resolve())


def register(conn: psycopg.Connection, result: TrainResult, artifact_dir: Path) -> int:
    version_id = register_report(conn, result.report, artifact_dir)
    if version_id is None:
        raise ValueError(f"model {result.name} is already registered")
    return version_id


def register_report(conn: psycopg.Connection, report: dict, artifact_dir: Path) -> int | None:
    """Insert a model from its training report. Returns None if the name already exists."""
    headline = {
        "test": report["test"],
        "test_intervals_95": report["test_intervals_95"],
        "data": report["data"],
        "protocol_comparison": report["protocol_comparison"],
        "baselines_test": {
            name: entry["test"] for name, entry in report["comparison"].items() if entry["baseline"]
        },
    }
    row = conn.execute(
        """
        INSERT INTO ml.model_version (name, trained_at, git_sha, threshold, metrics,
                                      artifact_uri, feature_set, estimator, trained_through)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (name) DO NOTHING
        RETURNING model_version_id
        """,
        [
            report["name"],
            report["trained_at"],
            report["git_sha"],
            round(report["threshold"], 4),
            Jsonb(headline),
            _relative(artifact_dir / ARTIFACT_NAME),
            report["feature_set"],
            report["estimator"],
            report["trained_through"],
        ],
    ).fetchone()
    return None if row is None else int(row[0])


def sync_artifacts(conn: psycopg.Connection, models_dir: Path = MODELS_DIR) -> list[str]:
    """Register every committed model directory that the database does not know yet.

    Lets a fresh database (e.g. the hosted one used by the daily job) pick up models trained
    and committed elsewhere. Returns the names newly registered.
    """
    added = []
    for report_path in sorted(models_dir.glob("*/report.json")):
        if not (report_path.parent / ARTIFACT_NAME).exists():
            continue
        report = json.loads(report_path.read_text())
        if register_report(conn, report, report_path.parent) is not None:
            added.append(report["name"])
    return added


def load_artifact(path: str | Path) -> dict:
    path = Path(path)
    if not path.is_absolute():
        path = config.REPO_ROOT / path
    return joblib.load(path)


def predict(artifact: dict, frame: pd.DataFrame) -> np.ndarray:
    """Probabilities for rows holding the artifact's raw feature columns."""
    X = frame.reindex(columns=[*artifact["features"], GROUP])
    return artifact["model"].predict_proba(X)[:, 1]


def latest_model(conn: psycopg.Connection, feature_set: str | None = None) -> tuple[int, str]:
    row = conn.execute(
        """
        SELECT model_version_id, artifact_uri FROM ml.model_version
        WHERE %(fs)s::text IS NULL OR feature_set = %(fs)s::text
        ORDER BY trained_at DESC, model_version_id DESC
        LIMIT 1
        """,
        {"fs": feature_set},
    ).fetchone()
    if row is None:
        raise LookupError("no registered model; run `tubescope train` first")
    return int(row[0]), row[1]


def score(
    conn: psycopg.Connection,
    model_version_id: int,
    artifact_uri: str,
    *,
    region: str = "US",
    since: date | None = None,
    include_training_period: bool = False,
) -> dict[str, int]:
    """Score videos and upsert their probabilities.

    By default only videos first charting after the model's training data are scored, so every
    stored prediction is out of sample. ``include_training_period`` also scores the training
    period; those rows are marked ``in_sample``.
    """
    artifact = load_artifact(artifact_uri)
    trained_through = date.fromisoformat(artifact["trained_through"])
    frame = load_frame(conn, region=region, chart_size=None, since=since)
    if not include_training_period:
        frame = frame[frame[DATE] > trained_through]
    if frame.empty:
        return {"scored": 0, "in_sample": 0}
    probabilities = predict(artifact, frame)
    in_sample = (frame[DATE] <= trained_through).to_numpy()
    rows = [
        (model_version_id, region, vid, day, round(float(p), 5), bool(flag))
        for vid, day, p, flag in zip(
            frame["video_id"], frame[DATE], probabilities, in_sample, strict=True
        )
    ]
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO ml.prediction (model_version_id, region, video_id, scored_for_date,
                                       probability, in_sample)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (model_version_id, region, video_id) DO UPDATE SET
                probability = EXCLUDED.probability,
                scored_for_date = EXCLUDED.scored_for_date,
                in_sample = EXCLUDED.in_sample,
                scored_at = now()
            """,
            rows,
        )
    return {"scored": len(rows), "in_sample": int(in_sample.sum())}
