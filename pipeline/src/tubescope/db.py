"""Postgres access: migrations, view rebuilds and idempotent bundle loads."""

from __future__ import annotations

import logging
import math
from collections.abc import Iterable, Sequence
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

from . import config
from .sources import Bundle

log = logging.getLogger(__name__)


def connect(url: str | None = None) -> psycopg.Connection:
    """Open an autocommit connection; every multi-statement unit uses ``conn.transaction()``."""
    return psycopg.connect(url or config.database_url(), autocommit=True)


# ---------------------------------------------------------------------------
# Schema management
# ---------------------------------------------------------------------------


def migrate(conn: psycopg.Connection, migrations_dir: Path = config.MIGRATIONS_DIR) -> list[str]:
    """Apply any migration files that have not been applied yet, in filename order."""
    with conn.transaction():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                filename   text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
    applied = {row[0] for row in conn.execute("SELECT filename FROM public.schema_migrations")}
    newly_applied = []
    for path in sorted(migrations_dir.glob("*.sql")):
        if path.name in applied:
            continue
        with conn.transaction():
            conn.execute(path.read_text())
            conn.execute("INSERT INTO public.schema_migrations (filename) VALUES (%s)", [path.name])
        newly_applied.append(path.name)
        log.info("applied migration %s", path.name)
    return newly_applied


def rebuild_views(conn: psycopg.Connection, views_dir: Path = config.VIEWS_DIR) -> list[str]:
    """Drop and recreate the analytics schema from the view files, atomically.

    Some views are materialized, so this must run after every load (the CLI load commands do).
    """
    files = sorted(views_dir.glob("*.sql"))
    with conn.transaction():
        conn.execute("DROP SCHEMA IF EXISTS analytics CASCADE")
        conn.execute("CREATE SCHEMA analytics")
        for path in files:
            conn.execute(path.read_text())
        # Materialized views need statistics before the planner can use them well.
        for (name,) in conn.execute(
            "SELECT matviewname FROM pg_matviews WHERE schemaname = 'analytics'"
        ).fetchall():
            conn.execute(f'ANALYZE analytics."{name}"')
    return [path.name for path in files]


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def _py(value: object) -> object:
    """Convert pandas/numpy scalars to plain Python values psycopg can adapt."""
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, (list, tuple)):
        return list(value)
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    if isinstance(value, np.generic):
        return None if isinstance(value, np.floating) and np.isnan(value) else value.item()
    if isinstance(value, (datetime, date, str, int, float, bool)):
        return value
    return value


def _rows(frame: pd.DataFrame, columns: Sequence[str]) -> list[tuple]:
    return [tuple(_py(v) for v in row) for row in frame[list(columns)].itertuples(index=False)]


def upsert_categories(conn: psycopg.Connection, categories: Iterable[tuple[int, str]]) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO core.category (category_id, name) VALUES (%s, %s)
            ON CONFLICT (category_id) DO UPDATE SET name = EXCLUDED.name
            """,
            list(categories),
        )


def load_bundle(conn: psycopg.Connection, bundle: Bundle) -> dict[str, int]:
    """Load a bundle in one transaction.

    Chart days in the bundle replace any existing rows for the same region and day, so
    re-running a load is safe. Video and channel attributes keep their earliest observation.
    """
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO core.channel (channel_id, title, custom_url, country, published_at,
                                      first_seen_date)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (channel_id) DO UPDATE SET
                title           = COALESCE(EXCLUDED.title, core.channel.title),
                custom_url      = COALESCE(EXCLUDED.custom_url, core.channel.custom_url),
                country         = COALESCE(EXCLUDED.country, core.channel.country),
                published_at    = COALESCE(EXCLUDED.published_at, core.channel.published_at),
                first_seen_date = LEAST(EXCLUDED.first_seen_date, core.channel.first_seen_date)
            """,
            _rows(
                bundle.channels,
                ["channel_id", "title", "custom_url", "country", "published_at", "first_seen_date"],
            ),
        )

        video_columns = [
            "video_id", "channel_id", "category_id", "title", "description", "tags",
            "published_at", "duration_sec", "definition", "licensed_content", "thumbnail_url",
            "title_char_count", "description_word_count", "tags_count", "first_seen_date",
            "first_seen_source",
        ]  # fmt: skip
        assignments = ",\n".join(f"{c} = EXCLUDED.{c}" for c in video_columns if c != "video_id")
        cur.executemany(
            f"""
            INSERT INTO core.video ({", ".join(video_columns)})
            VALUES ({", ".join(["%s"] * len(video_columns))})
            ON CONFLICT (video_id) DO UPDATE SET {assignments}
            WHERE EXCLUDED.first_seen_date < core.video.first_seen_date
            """,
            _rows(bundle.videos, video_columns),
        )

        days = _rows(bundle.batches, ["region", "snapshot_date"])
        cur.executemany(
            "DELETE FROM core.snapshot_batch WHERE region = %s AND snapshot_date = %s", days
        )
        cur.executemany(
            """
            INSERT INTO core.snapshot_batch (region, snapshot_date, source, captured_at,
                                             chart_size, row_count)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            _rows(
                bundle.batches,
                ["region", "snapshot_date", "source", "captured_at", "chart_size", "row_count"],
            ),
        )
        cur.executemany(
            """
            INSERT INTO core.video_snapshot (region, snapshot_date, video_id, chart_position,
                                             views, likes, comments)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            _rows(
                bundle.video_snapshots,
                [
                    "region",
                    "snapshot_date",
                    "video_id",
                    "chart_position",
                    "views",
                    "likes",
                    "comments",
                ],
            ),
        )
        cur.executemany(
            """
            INSERT INTO core.channel_snapshot (snapshot_date, channel_id, subscribers,
                                               total_views, video_count)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (channel_id, snapshot_date) DO UPDATE SET
                subscribers = EXCLUDED.subscribers,
                total_views = EXCLUDED.total_views,
                video_count = EXCLUDED.video_count
            """,
            _rows(
                bundle.channel_snapshots,
                ["snapshot_date", "channel_id", "subscribers", "total_views", "video_count"],
            ),
        )
    return bundle.summary()
