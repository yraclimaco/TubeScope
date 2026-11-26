"""Normalise every data source into one set of warehouse-shaped tables.

Three inputs are supported:

* the Kaggle "YouTube Trending Videos (Global)" export (one row per video per chart day),
* CSV snapshots written by the legacy Streamlit ``pull_trending.py`` script,
* live ``videos.list`` / ``channels.list`` JSON from the YouTube Data API.

Each is first mapped to a *long* frame (one row per video per snapshot, canonical column
names), then :func:`build_bundle` derives the dimension and fact tables from it.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd

from .categories import resolve_category_id
from .features import (
    char_count,
    normalize_country,
    parse_iso8601_duration,
    parse_tags,
    word_count,
)

KAGGLE = "kaggle"
YOUTUBE_API = "youtube_api"

LONG_COLUMNS = [
    "snapshot_date",
    "region",
    "captured_at",
    "chart_position",
    "video_id",
    "channel_id",
    "category_raw",
    "title",
    "description",
    "tags_raw",
    "published_at",
    "duration_raw",
    "definition",
    "licensed_content",
    "thumbnail_url",
    "views",
    "likes",
    "comments",
    "channel_title",
    "channel_custom_url",
    "channel_country",
    "channel_published_at",
    "channel_subscribers",
    "channel_total_views",
    "channel_video_count",
]

_COUNT_COLUMNS = [
    "views",
    "likes",
    "comments",
    "channel_subscribers",
    "channel_total_views",
    "channel_video_count",
]

_LEGACY_FILENAME = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:_(\d{2})-(\d{2})-(\d{2}))?$")


@dataclass(frozen=True)
class Bundle:
    """Warehouse-ready tables produced from one source load."""

    source: str
    batches: pd.DataFrame
    channels: pd.DataFrame
    videos: pd.DataFrame
    video_snapshots: pd.DataFrame
    channel_snapshots: pd.DataFrame

    def summary(self) -> dict[str, int]:
        return {
            "chart_days": len(self.batches),
            "channels": len(self.channels),
            "videos": len(self.videos),
            "video_snapshots": len(self.video_snapshots),
            "channel_snapshots": len(self.channel_snapshots),
        }


# ---------------------------------------------------------------------------
# Source-specific mappers
# ---------------------------------------------------------------------------


def kaggle_long_frame(path: Path) -> pd.DataFrame:
    raw = pd.read_csv(path, low_memory=False)
    region = raw["video_trending_country"].map(normalize_country)
    if region.isna().any():
        unknown = sorted(raw.loc[region.isna(), "video_trending_country"].astype(str).unique())
        raise ValueError(f"Unrecognised trending country values: {unknown}")

    long = pd.DataFrame(
        {
            "snapshot_date": pd.to_datetime(raw["video_trending__date"], format="%Y.%m.%d").dt.date,
            "region": region,
            "captured_at": pd.NaT,
            "chart_position": pd.NA,  # the export does not preserve chart order
            "video_id": raw["video_id"],
            "channel_id": raw["channel_id"],
            "category_raw": raw["video_category_id"],
            "title": raw["video_title"],
            "description": raw["video_description"],
            "tags_raw": raw["video_tags"],
            "published_at": raw["video_published_at"],
            "duration_raw": raw["video_duration"],
            "definition": raw["video_definition"],
            "licensed_content": raw["video_licensed_content"],
            "thumbnail_url": raw["video_default_thumbnail"],
            "views": raw["video_view_count"],
            "likes": raw["video_like_count"],
            "comments": raw["video_comment_count"],
            "channel_title": raw["channel_title"],
            "channel_custom_url": raw["channel_custom_url"],
            "channel_country": raw["channel_country"],
            "channel_published_at": raw["channel_published_at"],
            "channel_subscribers": raw["channel_subscriber_count"],
            "channel_total_views": raw["channel_view_count"],
            "channel_video_count": raw["channel_video_count"],
        }
    )
    return long[LONG_COLUMNS]


def parse_legacy_snapshot_name(path: Path) -> tuple[date, datetime | None]:
    match = _LEGACY_FILENAME.match(path.stem)
    if not match:
        raise ValueError(f"Snapshot filename must look like YYYY-MM-DD[_HH-MM-SS]: {path.name}")
    day = date.fromisoformat(match.group(1))
    if match.group(2) is None:
        return day, None
    hour, minute, second = (int(part) for part in match.groups()[1:])
    return day, datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=UTC)


def latest_snapshot_per_day(paths: Iterable[Path]) -> list[Path]:
    """Keep the last pull of each UTC day, so every day has exactly one chart."""
    chosen: dict[date, tuple[datetime, Path]] = {}
    floor = datetime.min.replace(tzinfo=UTC)
    for path in paths:
        day, captured = parse_legacy_snapshot_name(path)
        key = captured or floor
        if day not in chosen or key >= chosen[day][0]:
            chosen[day] = (key, path)
    return [chosen[day][1] for day in sorted(chosen)]


def legacy_snapshot_long_frame(path: Path, region: str = "US") -> pd.DataFrame:
    """Map a CSV written by the legacy ``pull_trending.py`` (``maxResults=50``).

    The legacy files carry no channel country, custom URL or creation date; those columns
    are left out here and filled with nulls by :func:`legacy_snapshots_bundle`.
    """
    raw = pd.read_csv(path, low_memory=False)
    day, captured = parse_legacy_snapshot_name(path)
    return pd.DataFrame(
        {
            "snapshot_date": day,
            "region": region,
            "captured_at": pd.Series(
                captured or pd.NaT, index=raw.index, dtype="datetime64[ns, UTC]"
            ),
            # Rows were written in API response order, which is the chart order.
            "chart_position": range(1, len(raw) + 1),
            "video_id": raw["id_x"],
            "channel_id": raw["snippet.channelId"],
            # The legacy script renamed snippet.categoryId to "category" (numeric id).
            "category_raw": raw["category"],
            "title": raw["title"],
            "description": raw["description"],
            "tags_raw": raw["tags"],
            "published_at": raw["snippet.publishedAt"],
            "duration_raw": raw["duration"],
            "definition": raw["contentDetails.definition"],
            "licensed_content": raw["contentDetails.licensedContent"],
            "thumbnail_url": raw.get("snippet.thumbnails.medium.url"),
            "views": raw["statistics.viewCount"],
            "likes": raw.get("statistics.likeCount"),
            "comments": raw.get("statistics.commentCount"),
            "channel_title": raw["channelTitle"],
            "channel_subscribers": raw["channel_subscriber_count"],
            "channel_total_views": raw["channel_view_count"],
            "channel_video_count": raw["channel_video_count"],
        }
    )


def api_long_frame(
    video_items: Sequence[dict],
    channel_items: Sequence[dict],
    *,
    region: str,
    captured_at: datetime,
) -> pd.DataFrame:
    """Map live ``videos.list(chart=mostPopular)`` and ``channels.list`` responses."""
    channels = {item["id"]: item for item in channel_items}
    snapshot_day = captured_at.astimezone(UTC).date()
    rows = []
    for position, item in enumerate(video_items, start=1):
        snippet = item.get("snippet", {})
        details = item.get("contentDetails", {})
        stats = item.get("statistics", {})
        channel = channels.get(snippet.get("channelId"), {})
        channel_snippet = channel.get("snippet", {})
        channel_stats = channel.get("statistics", {})
        hidden_subs = channel_stats.get("hiddenSubscriberCount", False)
        thumbnails = snippet.get("thumbnails", {})
        thumb = (thumbnails.get("medium") or thumbnails.get("default") or {}).get("url")
        rows.append(
            {
                "snapshot_date": snapshot_day,
                "region": region,
                "captured_at": captured_at,
                "chart_position": position,
                "video_id": item["id"],
                "channel_id": snippet.get("channelId"),
                "category_raw": snippet.get("categoryId"),
                "title": snippet.get("title"),
                "description": snippet.get("description"),
                "tags_raw": snippet.get("tags", []),
                "published_at": snippet.get("publishedAt"),
                "duration_raw": details.get("duration"),
                "definition": details.get("definition"),
                "licensed_content": details.get("licensedContent"),
                "thumbnail_url": thumb,
                "views": stats.get("viewCount"),
                "likes": stats.get("likeCount"),
                "comments": stats.get("commentCount"),
                "channel_title": channel_snippet.get("title"),
                "channel_custom_url": channel_snippet.get("customUrl"),
                "channel_country": channel_snippet.get("country"),
                "channel_published_at": channel_snippet.get("publishedAt"),
                "channel_subscribers": None
                if hidden_subs
                else channel_stats.get("subscriberCount"),
                "channel_total_views": channel_stats.get("viewCount"),
                "channel_video_count": channel_stats.get("videoCount"),
            }
        )
    return pd.DataFrame(rows, columns=LONG_COLUMNS)


# ---------------------------------------------------------------------------
# Long frame -> warehouse tables
# ---------------------------------------------------------------------------


def _to_utc(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True, format="ISO8601")


def _to_bool(series: pd.Series) -> pd.Series:
    mapping = {"true": True, "false": False, "1": True, "0": False}

    def convert(value: object) -> object:
        if isinstance(value, bool):
            return value
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        return mapping.get(str(value).strip().casefold())

    return series.map(convert).astype("object")


def build_bundle(long: pd.DataFrame, *, source: str, chart_size: int) -> Bundle:
    """Derive dimension and fact tables from a long frame."""
    if long.empty:
        raise ValueError("No rows to load.")
    df = long.copy()
    df["video_id"] = df["video_id"].astype(str).str.strip()
    df["channel_id"] = df["channel_id"].astype(str).str.strip()
    df["published_at"] = _to_utc(df["published_at"])
    df["channel_published_at"] = _to_utc(df["channel_published_at"])
    df["captured_at"] = _to_utc(df["captured_at"])
    df["licensed_content"] = _to_bool(df["licensed_content"])
    for column in _COUNT_COLUMNS:
        df[column] = pd.to_numeric(df[column], errors="coerce").round().astype("Int64")
    df["chart_position"] = pd.to_numeric(df["chart_position"], errors="coerce").astype("Int64")

    df["category_id"] = df["category_raw"].map(resolve_category_id).astype("Int64")
    unresolved = df.loc[df["category_id"].isna(), "category_raw"].dropna().unique()
    if len(unresolved):
        raise ValueError(f"Unrecognised category values: {sorted(map(str, unresolved))}")

    df = df.sort_values(["snapshot_date", "chart_position", "video_id"], na_position="last")
    df = df.drop_duplicates(["region", "snapshot_date", "video_id"], keep="first")

    # Batches: one chart per region per day.
    batches = (
        df.groupby(["region", "snapshot_date"], as_index=False)
        .agg(captured_at=("captured_at", "max"), row_count=("video_id", "size"))
        .assign(source=source, chart_size=chart_size)
    )

    # Videos: attributes as of the first time the video appears on a chart.
    first = df.drop_duplicates("video_id", keep="first").copy()
    tags = first["tags_raw"].map(parse_tags)
    videos = pd.DataFrame(
        {
            "video_id": first["video_id"],
            "channel_id": first["channel_id"],
            "category_id": first["category_id"],
            "title": first["title"].fillna(""),
            "description": first["description"],
            "tags": tags,
            "published_at": first["published_at"],
            "duration_sec": first["duration_raw"].map(parse_iso8601_duration).astype("Int64"),
            "definition": first["definition"],
            "licensed_content": first["licensed_content"],
            "thumbnail_url": first["thumbnail_url"],
            "title_char_count": first["title"].map(char_count),
            "description_word_count": first["description"].map(word_count),
            "tags_count": tags.map(len),
            "first_seen_date": first["snapshot_date"],
            "first_seen_source": source,
        }
    )
    if videos["published_at"].isna().any():
        bad = videos.loc[videos["published_at"].isna(), "video_id"].tolist()[:5]
        raise ValueError(f"Videos without a parseable publish time, e.g. {bad}")

    # Channels: first non-null value of each attribute.
    channels = df.groupby("channel_id", as_index=False, sort=False).agg(
        title=("channel_title", "first"),
        custom_url=("channel_custom_url", "first"),
        country=("channel_country", "first"),
        published_at=("channel_published_at", "first"),
        first_seen_date=("snapshot_date", "min"),
    )
    channels["country"] = channels["country"].map(normalize_country)

    video_snapshots = df[
        ["region", "snapshot_date", "video_id", "chart_position", "views", "likes", "comments"]
    ].copy()

    channel_snapshots = (
        df.dropna(
            subset=["channel_subscribers", "channel_total_views", "channel_video_count"],
            how="all",
        )
        .groupby(["snapshot_date", "channel_id"], as_index=False)
        .agg(
            subscribers=("channel_subscribers", "max"),
            total_views=("channel_total_views", "max"),
            video_count=("channel_video_count", "max"),
        )
    )

    return Bundle(
        source=source,
        batches=batches.reset_index(drop=True),
        channels=channels.reset_index(drop=True),
        videos=videos.reset_index(drop=True),
        video_snapshots=video_snapshots.reset_index(drop=True),
        channel_snapshots=channel_snapshots.reset_index(drop=True),
    )


def kaggle_bundle(path: Path) -> Bundle:
    long = kaggle_long_frame(path)
    # The export holds the top 200 videos per chart day.
    chart_size = int(long.groupby(["region", "snapshot_date"]).size().max())
    return build_bundle(long, source=KAGGLE, chart_size=chart_size)


def legacy_snapshots_bundle(paths: Iterable[Path], region: str = "US") -> Bundle:
    files = latest_snapshot_per_day(paths)
    if not files:
        raise ValueError("No snapshot CSVs found.")
    frames = [legacy_snapshot_long_frame(p, region) for p in files]
    long = pd.concat(frames, ignore_index=True).reindex(columns=LONG_COLUMNS)
    return build_bundle(long, source=YOUTUBE_API, chart_size=50)


def api_bundle(
    video_items: Sequence[dict],
    channel_items: Sequence[dict],
    *,
    region: str,
    captured_at: datetime,
    chart_size: int,
) -> Bundle:
    long = api_long_frame(video_items, channel_items, region=region, captured_at=captured_at)
    return build_bundle(long, source=YOUTUBE_API, chart_size=chart_size)
