import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import joblib
import pandas as pd
import pytest
from sklearn.dummy import DummyClassifier
from sklearn.pipeline import Pipeline

from tubescope import daily
from tubescope.ml import registry
from tubescope.youtube import API_ROOT, YouTubeClient


def _video(i: int) -> dict:
    return {
        "id": f"vid{i}",
        "snippet": {
            "channelId": f"UC{i % 2}",
            "title": f"Video {i}",
            "description": "words here",
            "tags": ["a", "b"],
            "publishedAt": "2026-11-26T15:00:00Z",
            "categoryId": "10" if i % 2 else "20",
            "thumbnails": {"medium": {"url": f"https://i.ytimg.com/vi/vid{i}/mq.jpg"}},
        },
        "contentDetails": {"duration": "PT3M10S", "definition": "hd", "licensedContent": True},
        "statistics": {"viewCount": str(10_000 * (i + 1)), "likeCount": "100", "commentCount": "9"},
    }


def _channel(i: int) -> dict:
    return {
        "id": f"UC{i}",
        "snippet": {
            "title": f"Channel {i}",
            "country": "US",
            "publishedAt": "2015-01-01T00:00:00Z",
        },
        "statistics": {"subscriberCount": "5000", "viewCount": "100000", "videoCount": "40"},
    }


def mock_client(n_videos: int) -> YouTubeClient:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/videos"):
            return httpx.Response(200, json={"items": [_video(i) for i in range(n_videos)]})
        if request.url.path.endswith("/channels"):
            ids = request.url.params["id"].split(",")
            return httpx.Response(200, json={"items": [_channel(int(c[2:])) for c in ids]})
        if request.url.path.endswith("/videoCategories"):
            items = [{"id": "10", "snippet": {"title": "Music"}}]
            return httpx.Response(200, json={"items": items})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    return YouTubeClient("k", http=httpx.Client(base_url=API_ROOT, transport=transport))


def test_pull_archive_round_trip(tmp_path):
    with mock_client(3) as client:
        payload = daily.pull(client, "US", max_videos=3)
    path = daily.archive(payload, tmp_path)
    captured = datetime.fromisoformat(payload["captured_at"])
    assert path.parent == tmp_path / "US" / f"{captured:%Y}"
    assert path.name.endswith(".json.gz")
    assert daily.read_archive(path) == payload
    assert daily.archived_pulls(tmp_path) == [path]


def test_archived_pulls_sort_by_capture_time_across_years(tmp_path):
    for stamp in ["2027-01-01T17-17-00Z", "2026-12-31T17-17-00Z"]:
        folder = tmp_path / "US" / stamp[:4]
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"US_{stamp}.json.gz").touch()
    assert [p.name for p in daily.archived_pulls(tmp_path)] == [
        "US_2026-12-31T17-17-00Z.json.gz",
        "US_2027-01-01T17-17-00Z.json.gz",
    ]


def test_step_summary_renders():
    text = daily.step_summary(
        {
            "captured_at": "2026-11-27T17:17:00+00:00",
            "chart": {"row_count": 200, "chart_size": 200, "complete": True},
            "loaded": {"videos": 200, "channels": 150},
            "scoring": {"scored": 31},
            "models_registered": [],
        }
    )
    assert "| Chart rows | 200 of 200 |" in text and "| New videos scored | 31 |" in text


def _dummy_model_dir(root: Path, name: str = "chartday-dummy-1") -> Path:
    folder = root / name
    folder.mkdir(parents=True)
    model = Pipeline([("model", DummyClassifier(strategy="prior"))])
    model.fit(pd.DataFrame({"x": [0, 1]}), [0, 1])
    joblib.dump(
        {"model": model, "features": ["duration_minutes"], "trained_through": "2000-01-01"},
        folder / registry.ARTIFACT_NAME,
    )
    report = {
        "name": name,
        "trained_at": datetime(2026, 1, 1, tzinfo=UTC).isoformat(),
        "git_sha": None,
        "threshold": 0.5,
        "feature_set": "chartday",
        "estimator": "dummy",
        "trained_through": "2000-01-01",
        "test": {},
        "test_intervals_95": {},
        "data": {},
        "protocol_comparison": {},
        "comparison": {},
    }
    (folder / "report.json").write_text(json.dumps(report))
    return folder


@pytest.mark.db
def test_sync_artifacts_is_idempotent(warehouse, tmp_path):
    _dummy_model_dir(tmp_path)
    assert registry.sync_artifacts(warehouse, tmp_path) == ["chartday-dummy-1"]
    assert registry.sync_artifacts(warehouse, tmp_path) == []
    assert registry.latest_model(warehouse, "chartday")[1].endswith("model.joblib")


@pytest.mark.db
def test_daily_run_loads_archives_and_scores(warehouse, tmp_path):
    models = tmp_path / "models"
    _dummy_model_dir(models)
    with mock_client(3) as client:
        report = daily.run(
            warehouse, client, max_videos=3, archive_root=tmp_path / "raw", models_dir=models
        )
    assert report["chart"]["complete"] and report["chart"]["row_count"] == 3
    assert report["loaded"]["videos"] == 3
    assert report["models_registered"] == ["chartday-dummy-1"]
    # One day of live data: every video is left-truncated, so nothing is scorable yet.
    assert report["scoring"]["scored"] == 0
    assert Path(report["archived_to"]).exists()
    source, chart_size = warehouse.execute(
        "SELECT source, chart_size FROM core.snapshot_batch"
    ).fetchone()
    assert (source, chart_size) == ("youtube_api", 3)
    freshness = warehouse.execute(
        "SELECT live_days_total, complete_days_total FROM analytics.data_freshness"
    ).fetchone()
    assert freshness == (1, 1)


@pytest.mark.db
def test_daily_run_flags_a_short_chart_after_loading_it(warehouse, tmp_path):
    with mock_client(3) as client, pytest.raises(daily.IncompleteChartError):
        daily.run(
            warehouse, client, max_videos=10, archive_root=tmp_path, models_dir=tmp_path / "m"
        )
    assert warehouse.execute("SELECT row_count FROM core.snapshot_batch").fetchone() == (3,)
    assert len(daily.archived_pulls(tmp_path)) == 1
