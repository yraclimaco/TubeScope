"""YouTube video categories.

The Kaggle export stores category *names*, while the YouTube Data API returns numeric
*ids*. The original Streamlit app fed ids into an encoder fitted on names, which silently
zeroed every category feature. Everything downstream now uses the numeric id, resolved here.
"""

from __future__ import annotations

import math

# Assignable categories returned by videoCategories.list for the US region.
CATEGORIES: dict[int, str] = {
    1: "Film & Animation",
    2: "Autos & Vehicles",
    10: "Music",
    15: "Pets & Animals",
    17: "Sports",
    18: "Short Movies",
    19: "Travel & Events",
    20: "Gaming",
    21: "Videoblogging",
    22: "People & Blogs",
    23: "Comedy",
    24: "Entertainment",
    25: "News & Politics",
    26: "Howto & Style",
    27: "Education",
    28: "Science & Technology",
    29: "Nonprofits & Activism",
}

_NAME_TO_ID = {name.casefold(): cid for cid, name in CATEGORIES.items()}


def resolve_category_id(value: object) -> int | None:
    """Return the numeric category id for an id, a numeric string, or a category name."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    text = str(value).strip()
    if not text:
        return None
    if text.lstrip("-").isdigit():
        number = int(text)
        return number if number > 0 else None
    return _NAME_TO_ID.get(text.casefold())


def category_name(category_id: int | None) -> str | None:
    return CATEGORIES.get(category_id) if category_id is not None else None
