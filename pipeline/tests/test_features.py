import math

import pytest

from tubescope.categories import category_name, resolve_category_id
from tubescope.features import (
    char_count,
    normalize_country,
    parse_iso8601_duration,
    parse_tags,
    word_count,
)


@pytest.mark.parametrize(
    ("raw", "seconds"),
    [
        ("PT3M37S", 217),
        ("PT5H21M20S", 19_280),
        ("PT45S", 45),
        ("PT2H", 7_200),
        ("P1DT1M", 86_460),
        ("P0D", 0),
        ("pt1m", 60),
    ],
)
def test_parse_duration(raw, seconds):
    assert parse_iso8601_duration(raw) == seconds


@pytest.mark.parametrize("raw", [None, math.nan, "", "PT", "P", "3:45", "PT1H30"])
def test_parse_duration_rejects_invalid(raw):
    assert parse_iso8601_duration(raw) is None


@pytest.mark.parametrize(
    ("raw", "tags"),
    [
        (None, []),
        (math.nan, []),
        ("", []),
        ("Doja Cat,Vie, new music ,", ["Doja Cat", "Vie", "new music"]),
        ("['Lil Uzi Vert', 'Eternal Atake']", ["Lil Uzi Vert", "Eternal Atake"]),
        (["a", " b ", ""], ["a", "b"]),
        ("[not, python]", ["[not", "python]"]),
    ],
)
def test_parse_tags(raw, tags):
    assert parse_tags(raw) == tags


def test_missing_tags_count_as_zero_not_one():
    # The legacy notebook used "".split(",") which reports one tag for an empty field.
    assert len(parse_tags(math.nan)) == 0


def test_text_counts():
    assert word_count("  two   words ") == 2
    assert word_count(None) == 0
    assert char_count("héllo") == 5
    assert char_count(math.nan) == 0


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        ("United States", "US"),
        ("South Korea", "KR"),
        ("us", "US"),
        ("United Kingdom", "GB"),
        (None, None),
        ("Atlantis", None),
    ],
)
def test_normalize_country(raw, code):
    assert normalize_country(raw) == code


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (10, 10),
        ("10", 10),
        (10.0, 10),
        ("Music", 10),
        ("music", 10),
        ("Gaming", 20),
        (None, None),
        ("", None),
        ("-1", None),
        ("Unknown Category", None),
        (True, None),
    ],
)
def test_resolve_category_id(raw, expected):
    assert resolve_category_id(raw) == expected


def test_category_name():
    assert category_name(24) == "Entertainment"
    assert category_name(None) is None
