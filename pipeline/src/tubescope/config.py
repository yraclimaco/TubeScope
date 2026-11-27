"""Paths and environment settings shared by the pipeline."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"
KAGGLE_DIR = DATA_DIR / "raw" / "kaggle"
API_SNAPSHOT_DIR = DATA_DIR / "raw" / "api_snapshots"
API_ARCHIVE_DIR = DATA_DIR / "raw" / "api"
MIGRATIONS_DIR = REPO_ROOT / "db" / "migrations"
VIEWS_DIR = REPO_ROOT / "db" / "views"

DEFAULT_DATABASE_URL = "postgresql://localhost:5432/tubescope"
DEFAULT_REGION = "US"

load_dotenv(REPO_ROOT / ".env")


def database_url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


def youtube_api_key() -> str:
    key = os.getenv("YOUTUBE_API_KEY")
    if not key:
        raise RuntimeError("YOUTUBE_API_KEY is not set. Add it to .env locally or as a CI secret.")
    return key
