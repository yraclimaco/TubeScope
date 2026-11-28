# TubeScope web

Next.js 16 (App Router) + TypeScript + Tailwind 4, reading the Postgres `analytics` views
directly from server components. Motion with GSAP (scroll reveals, page transitions, count-ups,
chart draw-ins, Flip re-ordering), Lenis smooth scrolling, and three.js (the home banner's
particle field). Everything respects `prefers-reduced-motion`.

Laid out like a video site: a top bar with search, a collapsible sidebar (pages plus the top
channels), topic chips, and a thumbnail feed where every video opens its own analytics page.

| Page | What it shows | Reads |
|---|---|---|
| `/` | Feed of charted videos with topic chips (categories), sort chips, search and per-channel views; particle banner and an insights shelf | `video_lifecycle`, `channel_performance`, `category_benchmarks` |
| `/videos/[id]` | Watch-style page: outcome, day-one prediction, chart-run calendar, views over time, Up next | `video_lifecycle`, `video_daily_deltas`, `snapshot_coverage`, `ml.prediction` |
| `/categories` | Daily category mix, share vs. staying rate with Wilson CIs, length within category, publish timing | `daily_category_share`, `category_benchmarks`, `duration_by_category`, `publish_timing` |
| `/channels` | Smoothed leaderboard with search, sort and filters | `channel_performance` |
| `/model` | Both models' held-out evaluation: baselines, calibration, importance | `ml/models/*/report.json` |
| `/simulator` | What-if form backed by the prediction API | `/api/predict` → `tubescope.api` |
| `/sql` | Every analytics view's SQL in build order, plus every query the site runs | `db/views/*.sql` |

Every chart card has a **SQL** button that shows the exact query behind it.

## Run locally

```bash
cp .env.example .env.local      # DATABASE_URL, PREDICT_API_URL
npm install
npm run dev                     # http://localhost:3000
```

The simulator needs the prediction API (from the repo root):

```bash
uv run --extra api uvicorn tubescope.api:app --port 8000
```

`npm run dev` and `npm run build` first run `scripts/sync-data.mjs`, which copies
`db/views/*.sql` and the latest model reports into `web/generated/`.

## Deploy

- **Site (Vercel):** import the repo, set the root directory to `web`, and add
  `DATABASE_URL` (the Neon connection string; a read-only role is best) and
  `PREDICT_API_URL`. Pages are static and revalidate hourly.
- **Prediction API:** any container host. `Dockerfile.api` at the repo root builds it; set
  `TUBESCOPE_CORS_ORIGINS` to the site's URL.
