# TubeScope

**Lifecycle analytics for YouTube's most-popular chart: which videos hold their place, and why.**

> **Status: TubeScope 2.0 rebuild in progress.** The original DS3 project (a Streamlit app,
> 3rd of 10 at the DS3 Showcase) is being rebuilt as a SQL-first analytics platform with a
> Next.js frontend and Tableau dashboards. This branch contains **Phase 1: the data
> foundation**. The Streamlit app remains on the upstream `streamlit-ui` branch for reference.

## What's here

| Path | Contents |
|---|---|
| `pipeline/src/tubescope/` | Python package: source normalisers, YouTube API client, Postgres loader, CLI |
| `db/migrations/` | Core warehouse schema (`core.*` facts and dimensions, `ml.*` model registry) |
| `db/views/` | Analytics layer (`analytics.*`): lifecycles, labels, benchmarks, leaderboards |
| `data/raw/kaggle/` | US chart history from the Kaggle *YouTube Trending Videos (Global)* export, 2025-09-29 → 2025-11-19 (top 200 per day) |
| `data/raw/api_snapshots/` | Live pulls from the original app, 2025-11-25 → 11-26 (top 50) |
| `notebooks/` | Original research notebooks and figures |
| `ml/legacy/` | Original Random Forest artifacts (to be retrained in Phase 2) |

## Quick start

Requires [uv](https://docs.astral.sh/uv/) and PostgreSQL 15+.

```bash
cp .env.example .env            # set DATABASE_URL; YOUTUBE_API_KEY only for live pulls
createdb tubescope
uv sync
uv run tubescope bootstrap      # migrate, load all raw data, build analytics views
```

Other commands: `migrate`, `views`, `load-kaggle`, `load-snapshots`, `ingest` (pulls today's
chart from the YouTube Data API). Run `uv run tubescope --help` for details.

Tests (the warehouse tests need a throwaway database):

```bash
createdb tubescope_test
TEST_DATABASE_URL=postgresql://localhost:5432/tubescope_test uv run pytest
uv run ruff check . && uv run ruff format --check .
```

## Data model

```
core.snapshot_batch   one chart: region x day, with chart size and row count
core.video_snapshot   one video on one chart: position, views, likes, comments
core.channel_snapshot channel subscribers / views / uploads on a day
core.video, core.channel, core.category   attributes as first observed
```

Key analytics views:

- `analytics.video_streaks`: consecutive-day chart runs (gaps-and-islands), with
  left-truncation and right-censoring flags derived from chart coverage.
- `analytics.video_lifecycle` / `analytics.video_features`: one row per video with its
  outcome (`is_multiday`), whether that outcome is observable, and point-in-time features.
- `analytics.category_benchmarks`: share of chart vs. multi-day rate with Wilson intervals.
- `analytics.duration_by_category`: length effects measured *within* each category.
- `analytics.channel_performance`: leaderboard ranked on an empirical-Bayes smoothed rate.
- `analytics.daily_category_share`, `analytics.video_daily_deltas`, `analytics.publish_timing`.

## Fixes carried over from the original project

- **Category feature at inference.** The original encoder was fitted on category names, but the
  live app passed numeric ids, so every live prediction ignored category. Categories are now
  resolved to numeric ids for every source.
- **Censored labels.** Videos on the last day of data, or before a missing day, were labelled
  "one day" without the next day ever being observed. They are now flagged and excluded from
  labelled analyses (the corrected multi-day rate is 17.9%, vs. 17.0% before).
- **Missing tags** were counted as one tag; they now count as zero.
- **Chart sizes differ** between sources (top 200 vs. top 50), so benchmarks are grouped by
  chart size instead of pooled.

The original model metrics (68% recall, 49% precision) used a random split that lets the same
channel appear in train and test; they are being re-evaluated in Phase 2.

## Team

Originally built by the DS3 TubeScope team. See the contributors of the
[upstream repository](https://github.com/VedVar43789/TubeScope) for the original project.
