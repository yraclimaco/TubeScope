"""Prediction API for the what-if simulator.

Run locally: ``uv run --extra api uvicorn tubescope.api:app --port 8000``

It serves the latest committed ``prepublish`` model from ``ml/models``. That model only uses
what a creator knows before publishing, so every input here can be typed into a form.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from threadpoolctl import threadpool_limits

from .categories import CATEGORIES
from .ml import registry

DURATION_GRID = [0.5, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 45, 60, 90]


class VideoInput(BaseModel):
    category_id: int = Field(description="YouTube category id, e.g. 10 = Music, 20 = Gaming")
    duration_minutes: float = Field(gt=0, le=24 * 60)
    channel_subscribers: float | None = Field(default=None, ge=0)
    channel_total_views: float | None = Field(default=None, ge=0)
    channel_video_count: float | None = Field(default=None, ge=0)
    channel_age_days: float | None = Field(default=None, ge=0)
    title_char_count: int = Field(default=50, ge=0, le=100)
    description_word_count: int = Field(default=100, ge=0)
    tags_count: int = Field(default=10, ge=0, le=500)
    publish_hour_pt: int = Field(default=12, ge=0, le=23)
    publish_isodow_pt: int = Field(default=3, ge=1, le=7, description="1 = Monday")
    definition: Literal["hd", "sd"] = "hd"
    licensed_content: bool = True
    channel_country: str | None = Field(default="US", min_length=2, max_length=2)


class CurvePoint(BaseModel):
    x: float
    probability: float


class Prediction(BaseModel):
    probability: float
    threshold: float
    flagged: bool
    base_rate: float
    category_rate: float | None
    model: str
    trained_through: str
    by_duration: list[CurvePoint]
    by_hour: list[CurvePoint]


def _models_dir() -> Path:
    return Path(os.getenv("TUBESCOPE_MODELS_DIR", registry.MODELS_DIR))


@lru_cache(maxsize=1)
def _load() -> tuple[dict, dict]:
    reports = [
        json.loads(p.read_text())
        for p in _models_dir().glob("*/report.json")
        if (p.parent / registry.ARTIFACT_NAME).exists()
    ]
    reports = [r for r in reports if r["feature_set"] == "prepublish"]
    if not reports:
        raise RuntimeError(f"no prepublish model found in {_models_dir()}")
    report = max(reports, key=lambda r: r["trained_at"])
    artifact = registry.load_artifact(_models_dir() / report["name"] / registry.ARTIFACT_NAME)
    return artifact, report


def _category_rate(report: dict, category_id: int) -> float | None:
    name = CATEGORIES.get(category_id)
    for row in report.get("by_category_test", []):
        if row["category"] == name:
            return row["observed_rate"]
    return None


app = FastAPI(title="TubeScope prediction API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("TUBESCOPE_CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["POST", "GET"],
    allow_headers=["content-type"],
)


@app.get("/health")
def health() -> dict:
    _, report = _load()
    return {"status": "ok", "model": report["name"]}


@app.post("/predict", response_model=Prediction)
def predict(video: VideoInput) -> Prediction:
    artifact, report = _load()
    base = video.model_dump()
    rows = [base]
    rows += [{**base, "duration_minutes": d} for d in DURATION_GRID]
    rows += [{**base, "publish_hour_pt": h} for h in range(24)]
    with threadpool_limits(limits=1, user_api="openmp"):
        p = registry.predict(artifact, pd.DataFrame(rows))
    p = np.round(p.astype(float), 4)
    durations = p[1 : 1 + len(DURATION_GRID)]
    hours = p[1 + len(DURATION_GRID) :]
    return Prediction(
        probability=float(p[0]),
        threshold=artifact["threshold"],
        flagged=bool(p[0] >= artifact["threshold"]),
        base_rate=report["data"]["base_rate"],
        category_rate=_category_rate(report, video.category_id),
        model=report["name"],
        trained_through=report["trained_through"],
        by_duration=[
            CurvePoint(x=d, probability=float(v))
            for d, v in zip(DURATION_GRID, durations, strict=True)
        ],
        by_hour=[CurvePoint(x=h, probability=float(v)) for h, v in enumerate(hours)],
    )
