# TubeScope

**Lifecycle analytics for YouTube's most-popular chart: which videos hold their place, and why.**

> **Status: TubeScope 2.0 rebuild in progress.** The original DS3 project (a Streamlit app,
> 3rd of 10 at the DS3 Showcase) is being rebuilt as a SQL-first analytics platform with a
> Next.js frontend and Tableau dashboards. Done so far: **Phase 1** (data foundation),
> **Phase 2** (model retraining and honest evaluation) and **Phase 3** (daily data pipeline). The Streamlit app remains on the upstream `streamlit-ui` branch for reference.

## What's here

| Path | Contents |
|---|---|
| `pipeline/src/tubescope/` | Python package: source normalisers, YouTube API client, Postgres loader, CLI |
| `db/migrations/` | Core warehouse schema (`core.*` facts and dimensions, `ml.*` model registry) |
| `db/views/` | Analytics layer (`analytics.*`): lifecycles, labels, benchmarks, leaderboards |
| `data/raw/kaggle/` | US chart history from the Kaggle *YouTube Trending Videos (Global)* export, 2025-09-29 → 2025-11-19 (top 200 per day) |
| `data/raw/api/` | Daily raw API pulls archived by the scheduled job (gzipped JSON) |
| `data/raw/api_snapshots/` | Live pulls from the original app, 2025-11-25 → 11-26 (top 50) |
| `.github/workflows/` | CI (lint + tests against Postgres) and the daily chart pull |
| `notebooks/` | Original research notebooks and figures |
| `pipeline/src/tubescope/ml/` | Training, evaluation, model cards and batch scoring |
| `ml/models/` | Trained models, each with `model.joblib`, `report.json` and `MODEL_CARD.md` |
| `ml/legacy/` | Original Random Forest artifacts (kept for reference, not used) |

## Quick start

Requires [uv](https://docs.astral.sh/uv/) and PostgreSQL 15+.

```bash
cp .env.example .env            # set DATABASE_URL; YOUTUBE_API_KEY only for live pulls
createdb tubescope
uv sync
uv run tubescope bootstrap      # migrate, load all raw data, build analytics views
```

Other commands: `migrate`, `views`, `load-kaggle`, `load-snapshots`, `ingest` (pulls today's
chart from the YouTube Data API), `train` (trains, evaluates and registers both models, about
4 minutes) and `score` (writes probabilities for newly charted videos to `ml.prediction`).
Run `uv run tubescope --help` for details.

Tests (the warehouse tests need a throwaway database):

```bash
createdb tubescope_test
TEST_DATABASE_URL=postgresql://localhost:5432/tubescope_test uv run pytest
uv run ruff check . && uv run ruff format --check .
```

## Daily pipeline

`.github/workflows/daily.yml` runs `tubescope daily` at 17:17 UTC every day:

1. Pulls the US top-200 most-popular chart and its channels from the YouTube Data API
   (about 10 quota units of the 10,000 free daily units; transient errors are retried).
2. Archives the raw response to `data/raw/api/US/<year>/` and commits it, so the warehouse can
   always be rebuilt with `tubescope bootstrap`.
3. Loads the day into the hosted Postgres warehouse and rebuilds the analytics views.
4. Registers any committed model in `ml/models/` that the database doesn't know yet, then
   scores newly charted videos with the latest `chartday` model.
5. Fails the run if the chart came back with under 90% of its rows. The partial day is still
   loaded and archived; the views treat it as incomplete.

Each run writes a summary to the Actions run page. `analytics.data_freshness` reports the
latest chart day and recent completeness.

### One-time setup

1. **YouTube API key.** In the Google Cloud console, enable *YouTube Data API v3* and create an
   API key restricted to that API.
2. **Hosted Postgres.** Create a free [Neon](https://neon.tech) project and copy its connection
   string (it includes `sslmode=require`).
3. **Load the history** into it once, from your machine:
   ```bash
   DATABASE_URL='<neon connection string>' uv run tubescope bootstrap
   ```
4. **Add repository secrets** (Settings → Secrets and variables → Actions): `DATABASE_URL`
   and `YOUTUBE_API_KEY`.
5. **Merge to `main`.** Scheduled workflows only run from the default branch. To test it straight
   away, open Actions → *Daily chart pull* → *Run workflow*.

The first live day can't be labelled (the day before it wasn't observed). From the second day
on, each day's new entries get a prediction, and their outcome is known the following day.

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

## Models

The question: will a video that just reached the chart still be there tomorrow? About 18% are.
Two models answer it from different points in time:

| Model | Knows | ROC AUC | Avg. precision | Top-10% precision |
|---|---|---|---|---|
| Base rate | nothing | 0.500 | 0.167 | — |
| Category only | the video's category | 0.677 | 0.325 | — |
| `prepublish` | channel size, length, metadata, publish time | 0.830 (0.793–0.858) | 0.471 (0.409–0.542) | 55.7% |
| `chartday` | the above + first-day views, engagement, days since publish | 0.900 (0.874–0.921) | 0.658 (0.590–0.723) | 72.5% |

Scores are on the last nine chart days (2025-11-10 → 11-18, 1,489 videos), which no model saw
during tuning or selection; brackets are 95% intervals from resampling whole channels. Both
chosen models are calibrated gradient boosting, picked by channel-grouped cross-validation on
the earlier period. Full details, calibration tables and limitations are in each model's
[`MODEL_CARD.md`](ml/models/).

What the evaluation shows:

- **Both models beat the category baseline by a clear margin** (average precision +0.15 for
  `prepublish`, +0.33 for `chartday`; neither interval comes near zero).
- **The original metrics roughly hold up.** At its threshold `prepublish` has 46% precision and
  68% recall, close to the original 49% / 68%. A random split flatters the same model only
  somewhat (ROC AUC 0.864 vs. 0.830 on later days).
- **It generalises to new channels**: on the 330 test videos from channels never seen in
  training, `prepublish` has ROC AUC 0.800 and `chartday` 0.843.
- **First-day views are the strongest signal**, then how quickly a video charted after publishing.
  Before publishing, video length and channel size carry most of the signal.

## Team

Originally built by the DS3 TubeScope team. See the contributors of the
[upstream repository](https://github.com/VedVar43789/TubeScope) for the original project.
