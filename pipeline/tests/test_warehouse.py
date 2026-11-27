"""End-to-end checks of the load path and the analytics views against real Postgres.

Synthetic calendar (chart size 2, so a day is complete with >= 2 rows):

    D0  Z               <- incomplete day (1 row)
    D1  A B
    D2  A C G
    D3  C F
    D4  (no data)
    D5  C D
    D6  D E             <- last observed day

Expected first-streak outcomes:
    A  D1-D2  left-truncated (D0 incomplete)              -> excluded from features
    B  D1     left-truncated                              -> excluded
    C  D2-D3  multi-day, observable; a second run on D5
    F  D3     one day, but D4 unobserved                  -> label not observable
    G  D2     one day, D3 observed                        -> observable, not multi-day
    D  D5-D6  left-truncated (D4 unobserved)              -> excluded
    E  D6     one day at the end of data                  -> label not observable
    Z  only on the incomplete day                         -> no streak at all
"""

from datetime import date, timedelta

import pandas as pd
import pytest

from tubescope import db, sources

pytestmark = pytest.mark.db

D0 = date(2025, 10, 1)
CALENDAR = {
    0: ["Z"],
    1: ["A", "B"],
    2: ["A", "C", "G"],
    3: ["C", "F"],
    5: ["C", "D"],
    6: ["D", "E"],
}


def _bundle() -> sources.Bundle:
    rows = []
    for offset, video_ids in CALENDAR.items():
        day = D0 + timedelta(days=offset)
        for position, vid in enumerate(video_ids, start=1):
            rows.append(
                {
                    "snapshot_date": day,
                    "region": "US",
                    "captured_at": None,
                    "chart_position": position,
                    "video_id": vid,
                    "channel_id": "UC_music" if vid in "ACG" else "UC_games",
                    "category_raw": "Music" if vid in "ACG" else "Gaming",
                    "title": f"Video {vid}",
                    "description": "a b c",
                    "tags_raw": "x,y",
                    "published_at": "2025-09-30T20:00:00Z",
                    "duration_raw": "PT4M" if vid in "ACG" else "PT40M",
                    "definition": "hd",
                    "licensed_content": True,
                    "thumbnail_url": None,
                    "views": 1000 * (offset + 1),
                    "likes": 50,
                    "comments": 10,
                    "channel_title": "Music Co" if vid in "ACG" else "Games Co",
                    "channel_custom_url": None,
                    "channel_country": "US",
                    "channel_published_at": "2015-01-01T00:00:00Z",
                    "channel_subscribers": 1000 + offset,
                    "channel_total_views": 10_000,
                    "channel_video_count": 50,
                }
            )
    long = pd.DataFrame(rows, columns=sources.LONG_COLUMNS)
    return sources.build_bundle(long, source=sources.KAGGLE, chart_size=2)


def _query(conn, sql, params=None):
    cur = conn.execute(sql, params)
    columns = [c.name for c in cur.description]
    return pd.DataFrame(cur.fetchall(), columns=columns)


def test_coverage_flags_incomplete_and_missing_days(warehouse):
    db.load_bundle(warehouse, _bundle())
    cov = _query(warehouse, "SELECT * FROM analytics.snapshot_coverage ORDER BY snapshot_date")
    assert cov["is_complete"].tolist() == [False, True, True, True, True, True]
    assert (
        cov.loc[cov["snapshot_date"] == D0 + timedelta(days=5), "days_missing_before"].item() == 1
    )


def test_streaks_handle_gaps_truncation_and_censoring(warehouse):
    db.load_bundle(warehouse, _bundle())
    streaks = _query(
        warehouse,
        "SELECT video_id, streak_number, streak_days, left_truncated, right_censored "
        "FROM analytics.video_streaks ORDER BY video_id, streak_number",
    )
    got = {
        (r.video_id, r.streak_number): (r.streak_days, r.left_truncated, r.right_censored)
        for r in streaks.itertuples()
    }
    assert got == {
        ("A", 1): (2, True, False),
        ("B", 1): (1, True, False),
        ("C", 1): (2, False, True),
        ("C", 2): (1, True, False),
        ("D", 1): (2, True, True),
        ("E", 1): (1, False, True),
        ("F", 1): (1, False, True),
        ("G", 1): (1, False, False),
    }


def test_video_features_labels_and_point_in_time_channel_stats(warehouse):
    db.load_bundle(warehouse, _bundle())
    features = _query(
        warehouse,
        "SELECT video_id, is_multiday, label_observable, total_days_on_chart, "
        "channel_subscribers, category, duration_bucket, publish_hour_utc, publish_hour_pt "
        "FROM analytics.video_features ORDER BY video_id",
    ).set_index("video_id")

    assert list(features.index) == ["C", "E", "F", "G"]
    assert features.loc["C", "is_multiday"] and features.loc["C", "label_observable"]
    assert features.loc["C", "total_days_on_chart"] == 3
    assert not features.loc["F", "label_observable"]
    assert not features.loc["E", "label_observable"]
    assert features.loc["G", "label_observable"] and not features.loc["G", "is_multiday"]
    # Channel stats are those recorded on the video's first chart day (offset 2 for C).
    assert features.loc["C", "channel_subscribers"] == 1002
    assert features.loc["C", "category"] == "Music"
    assert features.loc["C", "duration_bucket"] == "3-5 min"
    assert features.loc["C", "publish_hour_utc"] == 20
    assert features.loc["C", "publish_hour_pt"] == 13


def test_category_benchmarks_use_only_observable_labels(warehouse):
    db.load_bundle(warehouse, _bundle())
    bench = _query(
        warehouse,
        "SELECT category, videos, labeled_videos, multiday_videos, multiday_rate, "
        "multiday_rate_ci_low, multiday_rate_ci_high FROM analytics.category_benchmarks",
    ).set_index("category")
    music = bench.loc["Music"]
    assert (music["videos"], music["labeled_videos"], music["multiday_videos"]) == (2, 2, 1)
    assert float(music["multiday_rate"]) == 0.5
    assert (
        0 < float(music["multiday_rate_ci_low"]) < 0.5 < float(music["multiday_rate_ci_high"]) < 1
    )
    gaming = bench.loc["Gaming"]
    assert gaming["labeled_videos"] == 0 and pd.isna(gaming["multiday_rate"])


def test_every_analytics_view_runs(warehouse):
    db.load_bundle(warehouse, _bundle())
    views = _query(
        warehouse,
        "SELECT table_name FROM information_schema.views WHERE table_schema = 'analytics'",
    )["table_name"]
    assert len(views) >= 9
    for name in views:
        warehouse.execute(f"SELECT * FROM analytics.{name}").fetchall()


def test_reloading_is_idempotent(warehouse):
    bundle = _bundle()
    db.load_bundle(warehouse, bundle)
    db.load_bundle(warehouse, bundle)
    counts = _query(
        warehouse,
        "SELECT (SELECT COUNT(*) FROM core.video_snapshot) AS snaps, "
        "(SELECT COUNT(*) FROM core.video) AS videos, "
        "(SELECT COUNT(*) FROM core.snapshot_batch) AS days",
    ).iloc[0]
    assert (counts["snaps"], counts["videos"], counts["days"]) == (12, 8, 6)
