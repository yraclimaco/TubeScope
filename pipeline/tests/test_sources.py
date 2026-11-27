from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd
import pytest

from tubescope import sources

from .conftest import kaggle_row


def test_kaggle_bundle_maps_names_to_category_ids(write_kaggle_csv):
    path = write_kaggle_csv(
        [
            kaggle_row("v1", "2025.10.02"),
            kaggle_row("v1", "2025.10.03", video_view_count=2500.0, video_title="Edited title"),
            kaggle_row(
                "v2",
                "2025.10.02",
                video_category_id="Gaming",
                video_tags=None,
                channel_id="UC_chan_2",
                channel_country=None,
            ),
        ]
    )
    bundle = sources.kaggle_bundle(path)

    videos = bundle.videos.set_index("video_id")
    assert videos.loc["v1", "category_id"] == 10
    assert videos.loc["v2", "category_id"] == 20
    # Attributes come from the first chart day, not later edits.
    assert videos.loc["v1", "title"] == "Title v1"
    assert videos.loc["v1", "duration_sec"] == 210
    assert videos.loc["v1", "tags_count"] == 3
    assert videos.loc["v2", "tags_count"] == 0
    assert videos.loc["v1", "first_seen_date"] == date(2025, 10, 2)

    assert set(bundle.batches["region"]) == {"US"}
    assert bundle.batches["chart_size"].tolist() == [2, 2]
    assert bundle.batches["row_count"].tolist() == [2, 1]
    assert bundle.video_snapshots["chart_position"].isna().all()

    channels = bundle.channels.set_index("channel_id")
    assert channels.loc["UC_chan_1", "country"] == "US"
    assert pd.isna(channels.loc["UC_chan_2", "country"])
    assert len(bundle.channel_snapshots) == 3


def test_kaggle_bundle_rejects_unknown_category(write_kaggle_csv):
    path = write_kaggle_csv([kaggle_row("v1", "2025.10.02", video_category_id="Mystery")])
    with pytest.raises(ValueError, match="Unrecognised category"):
        sources.kaggle_bundle(path)


@pytest.mark.parametrize(
    ("name", "day", "captured"),
    [
        ("2025-11-25.csv", date(2025, 11, 25), None),
        (
            "2025-11-26_17-45-58.csv",
            date(2025, 11, 26),
            datetime(2025, 11, 26, 17, 45, 58, tzinfo=UTC),
        ),
    ],
)
def test_parse_legacy_snapshot_name(name, day, captured):
    assert sources.parse_legacy_snapshot_name(Path(name)) == (day, captured)


def test_latest_snapshot_per_day_keeps_last_pull():
    paths = [Path(p) for p in [
        "2025-11-26_01-50-32.csv", "2025-11-25.csv", "2025-11-26_17-45-58.csv",
        "2025-11-26_07-03-38.csv",
    ]]  # fmt: skip
    chosen = sources.latest_snapshot_per_day(paths)
    assert [p.name for p in chosen] == ["2025-11-25.csv", "2025-11-26_17-45-58.csv"]


def _legacy_frame(ids, category_ids):
    return pd.DataFrame(
        {
            "id_x": ids,
            "snippet.publishedAt": "2025-11-24T17:00:00Z",
            "snippet.channelId": [f"UC_{i}" for i in ids],
            "title": [f"T {i}" for i in ids],
            "description": "desc words here",
            "tags": "['x', 'y']",
            "category": category_ids,
            "duration": "PT10M",
            "contentDetails.definition": "hd",
            "contentDetails.licensedContent": True,
            "snippet.thumbnails.medium.url": "https://example.invalid/t.jpg",
            "statistics.viewCount": 5000,
            "statistics.likeCount": 100,
            "statistics.commentCount": 5,
            "channelTitle": "Chan",
            "channel_subscriber_count": 10,
            "channel_video_count": 2,
            "channel_view_count": 99,
            # The legacy script wrote this column as all -1 because of a rename bug.
            "snippet.categoryId": -1,
        }
    )


def test_legacy_snapshots_use_numeric_category_and_chart_order(tmp_path):
    _legacy_frame(["a", "b"], [10, 20]).to_csv(tmp_path / "2025-11-26_01-00-00.csv", index=False)
    _legacy_frame(["c", "a"], [24, 10]).to_csv(tmp_path / "2025-11-26_09-00-00.csv", index=False)
    bundle = sources.legacy_snapshots_bundle(sorted(tmp_path.glob("*.csv")))

    snaps = bundle.video_snapshots.set_index("video_id")
    assert list(snaps.index) == ["c", "a"]  # only the later pull of the day is kept
    assert snaps.loc["c", "chart_position"] == 1
    assert bundle.videos.set_index("video_id").loc["c", "category_id"] == 24
    assert bundle.videos["tags_count"].tolist() == [2, 2]
    assert bundle.batches["chart_size"].item() == 50
    assert bundle.batches["captured_at"].item() == pd.Timestamp("2025-11-26 09:00", tz="UTC")


def test_api_bundle_from_json():
    videos = [
        {
            "id": "vid1",
            "snippet": {
                "channelId": "UC1",
                "categoryId": "10",
                "title": "Song",
                "description": "",
                "publishedAt": "2025-11-25T14:00:00Z",
                "thumbnails": {"medium": {"url": "https://example.invalid/m.jpg"}},
            },
            "contentDetails": {"duration": "PT3M5S", "definition": "hd", "licensedContent": False},
            "statistics": {"viewCount": "1200", "commentCount": "3"},  # likes hidden
        }
    ]
    channels = [
        {
            "id": "UC1",
            "snippet": {"title": "Artist", "country": "GB", "publishedAt": "2012-05-05T00:00:00Z"},
            "statistics": {"viewCount": "900", "videoCount": "40", "hiddenSubscriberCount": True},
        }
    ]
    captured = datetime(2025, 11, 26, 3, 0, tzinfo=UTC)
    bundle = sources.api_bundle(videos, channels, region="US", captured_at=captured, chart_size=200)

    video = bundle.videos.iloc[0]
    assert video["category_id"] == 10
    assert video["duration_sec"] == 185
    assert video["tags_count"] == 0
    snap = bundle.video_snapshots.iloc[0]
    assert snap["snapshot_date"] == date(2025, 11, 26)
    assert pd.isna(snap["likes"])
    assert bundle.channels.iloc[0]["country"] == "GB"
    assert pd.isna(bundle.channel_snapshots.iloc[0]["subscribers"])
    assert bundle.batches.iloc[0]["chart_size"] == 200
