"""The daily job: pull today's chart, archive it, load it, refresh views and score new videos.

Raw API responses are archived as gzipped JSON under ``data/raw/api/<region>/<year>/`` so the
warehouse can always be rebuilt from files (``tubescope bootstrap`` reloads them).
"""

from __future__ import annotations

import gzip
import json
import logging
import math
from datetime import UTC, date, datetime
from pathlib import Path

import psycopg

from . import config, db, sources
from .youtube import YouTubeClient

log = logging.getLogger(__name__)

COMPLETE_SHARE = 0.9  # must match analytics.snapshot_coverage


class IncompleteChartError(RuntimeError):
    """Today's chart was loaded but has fewer rows than a complete day needs."""


def pull(client: YouTubeClient, region: str, max_videos: int = 200) -> dict:
    captured_at = datetime.now(UTC)
    videos = client.most_popular(region, max_videos=max_videos)
    channels = client.channels(item["snippet"]["channelId"] for item in videos)
    categories = client.video_categories(region)
    return {
        "region": region,
        "captured_at": captured_at.isoformat(),
        "chart_size": max_videos,
        "videos": videos,
        "channels": channels,
        "categories": categories,
    }


def archive(payload: dict, root: Path = config.API_ARCHIVE_DIR) -> Path:
    captured_at = datetime.fromisoformat(payload["captured_at"])
    region = payload["region"]
    target = root / region / f"{captured_at:%Y}"
    target.mkdir(parents=True, exist_ok=True)
    path = target / f"{region}_{captured_at:%Y-%m-%dT%H-%M-%SZ}.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    return path


def read_archive(path: Path) -> dict:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def archived_pulls(root: Path = config.API_ARCHIVE_DIR) -> list[Path]:
    """Archive files in capture order (file names sort chronologically within a region)."""
    return sorted(root.glob("*/*/*.json.gz"), key=lambda p: p.name.split("_", 1)[-1])


def load_payload(conn: psycopg.Connection, payload: dict) -> dict:
    bundle = sources.api_bundle(
        payload["videos"],
        payload["channels"],
        region=payload["region"],
        captured_at=datetime.fromisoformat(payload["captured_at"]),
        chart_size=payload["chart_size"],
    )
    categories = [(int(c["id"]), c["snippet"]["title"]) for c in payload.get("categories", [])]
    if categories:
        db.upsert_categories(conn, categories)
    return db.load_bundle(conn, bundle)


def chart_status(conn: psycopg.Connection, region: str, day: date) -> dict:
    row = conn.execute(
        """
        SELECT row_count, chart_size FROM core.snapshot_batch
        WHERE region = %s AND snapshot_date = %s
        """,
        [region, day],
    ).fetchone()
    if row is None:
        return {"snapshot_date": day.isoformat(), "row_count": 0, "complete": False}
    row_count, chart_size = row
    return {
        "snapshot_date": day.isoformat(),
        "row_count": row_count,
        "chart_size": chart_size,
        "complete": row_count >= math.ceil(COMPLETE_SHARE * chart_size),
    }


def run(
    conn: psycopg.Connection,
    client: YouTubeClient,
    *,
    region: str = config.DEFAULT_REGION,
    max_videos: int = 200,
    archive_root: Path | None = config.API_ARCHIVE_DIR,
    models_dir: Path | None = None,
) -> dict:
    """Run the whole job. Raises IncompleteChartError after loading if the chart is short."""
    from .ml import registry

    report: dict = {"migrations_applied": db.migrate(conn)}
    payload = pull(client, region, max_videos)
    report["captured_at"] = payload["captured_at"]
    if archive_root is not None:
        report["archived_to"] = str(archive(payload, archive_root))
    report["loaded"] = load_payload(conn, payload)
    report["views_built"] = len(db.rebuild_views(conn))

    report["models_registered"] = registry.sync_artifacts(conn, models_dir or registry.MODELS_DIR)
    try:
        version_id, uri = registry.latest_model(conn, "chartday")
    except LookupError:
        report["scoring"] = "skipped: no chartday model registered"
    else:
        report["scoring"] = {
            "model_version_id": version_id,
            **registry.score(conn, version_id, uri, region=region),
        }

    day = datetime.fromisoformat(payload["captured_at"]).astimezone(UTC).date()
    report["chart"] = chart_status(conn, region, day)
    if not report["chart"]["complete"]:
        raise IncompleteChartError(
            f"{region} chart for {day} has {report['chart']['row_count']} rows; "
            f"a complete day needs {math.ceil(COMPLETE_SHARE * max_videos)}"
        )
    return report


def step_summary(report: dict) -> str:
    """Markdown for the GitHub Actions run page."""
    loaded = report.get("loaded", {})
    chart = report.get("chart", {})
    scoring = report.get("scoring")
    scored = scoring.get("scored") if isinstance(scoring, dict) else scoring
    lines = [
        "## TubeScope daily pull",
        "",
        "| | |",
        "|---|---|",
        f"| Captured | {report.get('captured_at')} |",
        f"| Chart rows | {chart.get('row_count')} of {chart.get('chart_size')} |",
        f"| Complete day | {'yes' if chart.get('complete') else 'no'} |",
        f"| Videos / channels loaded | {loaded.get('videos')} / {loaded.get('channels')} |",
        f"| New videos scored | {scored} |",
        f"| Models registered this run | {', '.join(report.get('models_registered', [])) or '-'} |",
        "",
    ]
    return "\n".join(lines)
