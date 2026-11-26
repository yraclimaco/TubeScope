import os

import pandas as pd
import pytest

from tubescope import db

KAGGLE_COLUMNS = [
    "video_id", "video_published_at", "video_trending__date", "video_trending_country",
    "channel_id", "video_title", "video_description", "video_default_thumbnail",
    "video_category_id", "video_tags", "video_duration", "video_dimension", "video_definition",
    "video_licensed_content", "video_view_count", "video_like_count", "video_comment_count",
    "channel_title", "channel_description", "channel_custom_url", "channel_published_at",
    "channel_country", "channel_view_count", "channel_subscriber_count",
    "channel_have_hidden_subscribers", "channel_video_count", "channel_localized_title",
    "channel_localized_description",
]  # fmt: skip


def kaggle_row(video_id, trending_date, **overrides):
    row = {
        "video_id": video_id,
        "video_published_at": "2025-10-01T15:30:00Z",
        "video_trending__date": trending_date,
        "video_trending_country": "United States",
        "channel_id": "UC_chan_1",
        "video_title": f"Title {video_id}",
        "video_description": "one two three",
        "video_default_thumbnail": f"https://i.ytimg.com/vi/{video_id}/default.jpg",
        "video_category_id": "Music",
        "video_tags": "a,b,c",
        "video_duration": "PT3M30S",
        "video_dimension": "2d",
        "video_definition": "hd",
        "video_licensed_content": True,
        "video_view_count": 1000.0,
        "video_like_count": 90.0,
        "video_comment_count": 10.0,
        "channel_title": "Channel One",
        "channel_description": "",
        "channel_custom_url": "@one",
        "channel_published_at": "2015-01-01T00:00:00Z",
        "channel_country": "United States",
        "channel_view_count": 5_000_000.0,
        "channel_subscriber_count": 100_000.0,
        "channel_have_hidden_subscribers": False,
        "channel_video_count": 300.0,
        "channel_localized_title": "Channel One",
        "channel_localized_description": "",
    }
    row.update(overrides)
    return row


@pytest.fixture
def write_kaggle_csv(tmp_path):
    def _write(rows):
        path = tmp_path / "kaggle.csv"
        pd.DataFrame(rows, columns=KAGGLE_COLUMNS).to_csv(path, index=False)
        return path

    return _write


@pytest.fixture
def warehouse():
    """A freshly migrated test database. Skipped unless TEST_DATABASE_URL is set."""
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set")
    conn = db.connect(url)
    conn.execute("DROP SCHEMA IF EXISTS analytics, ml, core CASCADE")
    conn.execute("DROP TABLE IF EXISTS public.schema_migrations")
    db.migrate(conn)
    db.rebuild_views(conn)
    yield conn
    conn.close()
