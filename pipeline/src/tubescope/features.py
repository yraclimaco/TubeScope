"""Row-level parsing and feature helpers.

Training and live scoring must compute features the same way, so this module is the only
place that defines them.
"""

from __future__ import annotations

import ast
import math
import re

import pycountry

_ISO_DURATION = re.compile(
    r"^P(?:(?P<days>\d+)D)?"
    r"(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+(?:\.\d+)?)S)?)?$"
)

# Names used by the Kaggle export that pycountry does not resolve on its own.
_COUNTRY_OVERRIDES = {
    "south korea": "KR",
    "north korea": "KP",
    "russia": "RU",
    "turkey": "TR",
    "vietnam": "VN",
    "taiwan": "TW",
    "iran": "IR",
    "syria": "SY",
    "laos": "LA",
    "bolivia": "BO",
    "venezuela": "VE",
    "tanzania": "TZ",
    "moldova": "MD",
    "czech republic": "CZ",
    "palestine": "PS",
    "kosovo": "XK",
}


def is_missing(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    try:
        import pandas as pd

        return value is pd.NA or value is pd.NaT
    except ImportError:  # pragma: no cover
        return False


def parse_iso8601_duration(value: object) -> int | None:
    """Convert an ISO 8601 duration such as ``PT1H2M10S`` or ``P1DT3M`` to whole seconds."""
    if is_missing(value):
        return None
    text = str(value).strip().upper()
    match = _ISO_DURATION.match(text)
    if not match or text in {"P", "PT"} or text.endswith("T"):
        return None
    parts = {name: float(amount) if amount else 0.0 for name, amount in match.groupdict().items()}
    seconds = parts["days"] * 86_400 + parts["hours"] * 3_600 + parts["minutes"] * 60
    return int(round(seconds + parts["seconds"]))


def parse_tags(value: object) -> list[str]:
    """Normalise tags from an API list, a stringified Python list, or a comma-separated string."""
    if is_missing(value):
        return []
    if isinstance(value, (list, tuple)):
        return [str(tag).strip() for tag in value if not is_missing(tag) and str(tag).strip()]
    text = str(value).strip()
    if not text:
        return []
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = ast.literal_eval(text)
        except (ValueError, SyntaxError):
            parsed = None
        if isinstance(parsed, (list, tuple)):
            return parse_tags(list(parsed))
    return [tag.strip() for tag in text.split(",") if tag.strip()]


def word_count(text: object) -> int:
    return 0 if is_missing(text) else len(str(text).split())


def char_count(text: object) -> int:
    return 0 if is_missing(text) else len(str(text))


def normalize_country(value: object) -> str | None:
    """Return an ISO 3166-1 alpha-2 code for a country code or English country name."""
    if is_missing(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) == 2 and text.isalpha():
        return text.upper()
    override = _COUNTRY_OVERRIDES.get(text.casefold())
    if override:
        return override
    try:
        return pycountry.countries.lookup(text).alpha_2
    except LookupError:
        return None
