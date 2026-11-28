import "server-only";
import { db } from "./db";

/**
 * Every query the site runs. The `text` is what executes AND what the "SQL" button shows,
 * so the displayed query is always the real one. Views live in db/views/ (see /sql).
 */
export interface Query<P extends unknown[] = []> {
  id: string;
  title: string;
  views: string[]; // analytics views it reads, for links into the SQL lab
  text: string;
  params?: P;
}

function define<P extends unknown[] = []>(q: Query<P>) {
  return q;
}

export async function run<T>(q: Query<unknown[]>, params: unknown[] = []): Promise<T[]> {
  return (await db().unsafe(q.text, params as never[])) as unknown as T[];
}

const CHART = 200; // top-200 chart (Kaggle history + daily pulls); top-50 legacy pulls excluded

export const overviewKpis = define({
  id: "overview-kpis",
  title: "Headline numbers",
  views: ["analytics.video_lifecycle", "analytics.snapshot_coverage", "analytics.wilson_bound"],
  text: `SELECT
  (SELECT COUNT(*) FROM core.video)::int                              AS videos,
  (SELECT COUNT(*) FROM core.channel)::int                            AS channels,
  (SELECT COUNT(*) FROM analytics.snapshot_coverage
     WHERE is_complete)::int                                          AS chart_days,
  COUNT(*) FILTER (WHERE label_observable)::int                       AS labelled,
  AVG(is_multiday::int) FILTER (WHERE label_observable)::float8       AS multiday_rate,
  analytics.wilson_bound(
    COUNT(*) FILTER (WHERE label_observable AND is_multiday),
    COUNT(*) FILTER (WHERE label_observable), false)::float8          AS rate_low,
  analytics.wilson_bound(
    COUNT(*) FILTER (WHERE label_observable AND is_multiday),
    COUNT(*) FILTER (WHERE label_observable), true)::float8           AS rate_high
FROM analytics.video_lifecycle
WHERE region = 'US' AND first_chart_size = ${CHART}`,
});

export const freshness = define({
  id: "freshness",
  title: "Data freshness",
  views: ["analytics.data_freshness"],
  text: `SELECT latest_snapshot_date::text, latest_captured_at::text, days_since_latest,
       complete_days_last_7::int, live_days_total::int
FROM analytics.data_freshness
WHERE region = 'US'`,
});

export const categoryShareOverTime = define({
  id: "category-share",
  title: "Who owns the chart, day by day",
  views: ["analytics.daily_category_share", "analytics.category_benchmarks"],
  text: `-- Top four categories by volume; everything else folds into "Other".
WITH top_categories AS (
  SELECT category
  FROM analytics.category_benchmarks
  WHERE region = 'US' AND chart_size = ${CHART}
  ORDER BY videos DESC
  LIMIT 4
)
SELECT
  snapshot_date::text AS day,
  CASE WHEN category IN (SELECT category FROM top_categories)
       THEN category ELSE 'Other' END AS category,
  SUM(share)::float8 AS share
FROM analytics.daily_category_share
WHERE region = 'US' AND chart_size = ${CHART}
GROUP BY 1, 2
ORDER BY 1, 2`,
});

export const heroPoints = define({
  id: "hero-points",
  title: "Every labelled video, by first chart day",
  views: ["analytics.video_lifecycle"],
  text: `SELECT
  (l.first_chart_date - MIN(l.first_chart_date) OVER ())::int AS day,
  COALESCE(c.name, 'Other') AS category,
  l.total_days_on_chart::int AS days,
  l.is_multiday AS stayed
FROM analytics.video_lifecycle AS l
LEFT JOIN core.category AS c USING (category_id)
WHERE l.region = 'US' AND l.first_chart_size = ${CHART} AND l.label_observable`,
});

export const categoryBenchmarks = define({
  id: "category-benchmarks",
  title: "Share of chart vs. staying power",
  views: ["analytics.category_benchmarks", "analytics.wilson_bound"],
  text: `SELECT
  category,
  videos::int,
  share_of_chart_videos::float8  AS share,
  labeled_videos::int            AS labelled,
  multiday_rate::float8          AS rate,
  multiday_rate_ci_low::float8   AS rate_low,
  multiday_rate_ci_high::float8  AS rate_high,
  multiday_lift::float8          AS lift,
  overall_multiday_rate::float8  AS overall_rate,
  duration_median_minutes::float8 AS median_minutes,
  engagement_median::float8      AS engagement_median
FROM analytics.category_benchmarks
WHERE region = 'US' AND chart_size = ${CHART} AND labeled_videos >= 30
ORDER BY multiday_rate DESC`,
});

export const durationByCategory = define({
  id: "duration-by-category",
  title: "Does length matter within a category?",
  views: ["analytics.duration_by_category"],
  text: `SELECT
  category,
  duration_bucket            AS bucket,
  duration_bucket_order      AS bucket_order,
  labeled_videos::int        AS labelled,
  multiday_rate::float8      AS rate,
  lift_within_category::float8 AS lift
FROM analytics.duration_by_category
WHERE region = 'US' AND chart_size = ${CHART}
  AND category IN ('Gaming', 'Music', 'Entertainment', 'People & Blogs')
  AND duration_bucket <> 'Unknown'
ORDER BY category, duration_bucket_order`,
});

export const publishTiming = define({
  id: "publish-timing",
  title: "When were staying videos published? (Pacific time)",
  views: ["analytics.publish_timing"],
  text: `SELECT
  publish_isodow_pt AS dow,
  publish_hour_pt   AS hour,
  labeled_videos::int AS labelled,
  multiday_rate::float8 AS rate
FROM analytics.publish_timing
WHERE region = 'US' AND chart_size = ${CHART}`,
});

export const channelLeaderboard = define({
  id: "channel-leaderboard",
  title: "Channel leaderboard",
  views: ["analytics.channel_performance"],
  text: `-- Ranked on a smoothed rate: (multi-day videos + 10 x overall rate) / (labelled + 10),
-- so a channel with one lucky video can't top the board.
SELECT
  channel_id,
  channel_title,
  primary_category,
  charted_videos::int,
  labeled_videos::int        AS labelled,
  multiday_videos::int,
  multiday_rate::float8      AS raw_rate,
  smoothed_multiday_rate::float8 AS smoothed_rate,
  avg_days_on_chart::float8  AS avg_days,
  subscribers_max_seen::float8 AS subscribers,
  staying_power_rank::int    AS rank,
  volume_rank::int
FROM analytics.channel_performance
WHERE region = 'US' AND chart_size = ${CHART} AND labeled_videos >= 3
ORDER BY staying_power_rank
LIMIT 150`,
});

export const videoSearch = define<[string]>({
  id: "video-search",
  title: "Videos",
  views: ["analytics.video_lifecycle"],
  text: `SELECT
  l.video_id,
  v.title,
  ch.title AS channel_title,
  c.name   AS category,
  v.thumbnail_url,
  l.first_chart_date::text AS first_chart_date,
  l.total_days_on_chart::int AS days,
  l.peak_views::float8 AS peak_views,
  l.label_observable,
  l.is_multiday
FROM analytics.video_lifecycle AS l
JOIN core.video   AS v  USING (video_id)
JOIN core.channel AS ch ON ch.channel_id = v.channel_id
LEFT JOIN core.category AS c ON c.category_id = v.category_id
WHERE l.region = 'US'
  AND ($1 = '' OR v.title ILIKE '%' || $1 || '%' OR ch.title ILIKE '%' || $1 || '%')
ORDER BY l.total_days_on_chart DESC, l.peak_views DESC
LIMIT 60`,
});

export const videoDetail = define<[string]>({
  id: "video-detail",
  title: "Video",
  views: ["analytics.video_features"],
  text: `SELECT
  l.video_id, v.title, v.thumbnail_url, v.published_at::text AS published_at, v.category_id::int,
  v.duration_sec::int AS duration_sec, v.description,
  ch.channel_id, ch.title AS channel_title, c.name AS category,
  ROUND(v.duration_sec / 60.0, 1)::float8 AS duration_minutes,
  l.first_chart_date::text, l.last_chart_date::text,
  l.first_streak_days::int, l.total_days_on_chart::int, l.n_streaks::int,
  l.first_chart_size::int, l.best_chart_position::int,
  l.label_observable, l.is_multiday, l.left_truncated, l.right_censored,
  l.first_day_views::float8, l.peak_views::float8, l.first_day_engagement_rate::float8 AS engagement
FROM analytics.video_lifecycle AS l
JOIN core.video   AS v  USING (video_id)
JOIN core.channel AS ch ON ch.channel_id = v.channel_id
LEFT JOIN core.category AS c ON c.category_id = v.category_id
WHERE l.region = 'US' AND l.video_id = $1`,
});

export const videoDays = define<[string]>({
  id: "video-days",
  title: "Day by day on the chart",
  views: ["analytics.video_daily_deltas"],
  text: `SELECT
  snapshot_date::text AS day,
  chart_position::int AS position,
  views::float8,
  views_gained_per_day::float8 AS views_per_day
FROM analytics.video_daily_deltas
WHERE region = 'US' AND video_id = $1
ORDER BY snapshot_date`,
});

export const videoPrediction = define<[string]>({
  id: "video-prediction",
  title: "Model prediction",
  views: [],
  text: `SELECT
  p.probability::float8, p.in_sample, m.name AS model, m.threshold::float8
FROM ml.prediction AS p
JOIN ml.model_version AS m USING (model_version_id)
WHERE p.region = 'US' AND p.video_id = $1 AND m.feature_set = 'chartday'
ORDER BY m.trained_at DESC
LIMIT 1`,
});

export const simulatorDefaults = define({
  id: "simulator-defaults",
  title: "Typical charting channel (medians)",
  views: ["analytics.video_features"],
  text: `SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY channel_subscribers)::float8  AS subscribers,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY channel_total_views)::float8  AS total_views,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY channel_video_count)::float8  AS video_count,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY channel_age_days)::float8     AS age_days,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY title_char_count)::float8     AS title_chars,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY description_word_count)::float8 AS description_words,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY tags_count)::float8           AS tags
FROM analytics.video_features
WHERE region = 'US' AND first_chart_size = ${CHART}`,
});


export interface FeedVideo {
  video_id: string;
  title: string;
  channel_id: string;
  channel_title: string;
  category: string | null;
  first_chart_date: string;
  days: number;
  peak_views: number | null;
  duration_sec: number | null;
  label_observable: boolean;
  is_multiday: boolean;
}

const FEED_COLUMNS = `l.video_id,
  v.title,
  ch.channel_id,
  ch.title                    AS channel_title,
  c.name                      AS category,
  l.first_chart_date::text    AS first_chart_date,
  l.total_days_on_chart::int  AS days,
  l.peak_views::float8        AS peak_views,
  v.duration_sec::int         AS duration_sec,
  l.label_observable,
  l.is_multiday`;

const FEED_FROM = `FROM analytics.video_lifecycle AS l
JOIN core.video   AS v  USING (video_id)
JOIN core.channel AS ch ON ch.channel_id = v.channel_id
LEFT JOIN core.category AS c ON c.category_id = v.category_id`;

export const feed = define<[string, string, string, string, number]>({
  id: "feed",
  title: "Home feed",
  views: ["analytics.video_lifecycle"],
  text: `-- $1 category chip, $2 search text, $3 channel id, $4 sort, $5 page size
SELECT
  ${FEED_COLUMNS}
${FEED_FROM}
WHERE l.region = 'US'
  AND ($1 = '' OR c.name = $1)
  AND ($2 = '' OR v.title ILIKE '%' || $2 || '%' OR ch.title ILIKE '%' || $2 || '%')
  AND ($3 = '' OR ch.channel_id = $3)
ORDER BY
  CASE WHEN $4 = 'views'  THEN l.peak_views END DESC NULLS LAST,
  CASE WHEN $4 = 'recent' THEN l.first_chart_date END DESC,
  l.total_days_on_chart DESC,
  l.peak_views DESC NULLS LAST
LIMIT $5`,
});

export const categoryChips = define({
  id: "category-chips",
  title: "Topics",
  views: ["analytics.video_lifecycle"],
  text: `SELECT c.name AS category, COUNT(*)::int AS videos
FROM analytics.video_lifecycle AS l
JOIN core.video    AS v USING (video_id)
JOIN core.category AS c ON c.category_id = v.category_id
WHERE l.region = 'US'
GROUP BY c.name
HAVING COUNT(*) >= 20
ORDER BY videos DESC`,
});

export const sidebarChannels = define({
  id: "sidebar-channels",
  title: "Top channels",
  views: ["analytics.channel_performance"],
  text: `SELECT channel_id, channel_title, primary_category, labeled_videos::int AS labelled
FROM analytics.channel_performance
WHERE region = 'US' AND chart_size = ${CHART} AND labeled_videos >= 5
ORDER BY staying_power_rank
LIMIT 8`,
});

export const upNext = define<[string, string, number]>({
  id: "up-next",
  title: "Up next: same channel first, then same category",
  views: ["analytics.video_lifecycle"],
  text: `SELECT
  ${FEED_COLUMNS}
${FEED_FROM}
WHERE l.region = 'US'
  AND l.video_id <> $1
  AND (v.channel_id = $2 OR v.category_id = $3)
ORDER BY (v.channel_id = $2) DESC, l.total_days_on_chart DESC, l.peak_views DESC NULLS LAST
LIMIT 14`,
});

export const channelHeader = define<[string]>({
  id: "channel-header",
  title: "Channel summary",
  views: ["analytics.channel_performance"],
  text: `SELECT channel_id, channel_title, primary_category, charted_videos::int,
       labeled_videos::int AS labelled, multiday_videos::int,
       smoothed_multiday_rate::float8 AS smoothed_rate, avg_days_on_chart::float8 AS avg_days,
       subscribers_max_seen::float8 AS subscribers, staying_power_rank::int AS rank
FROM analytics.channel_performance
WHERE region = 'US' AND channel_id = $1
ORDER BY charted_videos DESC
LIMIT 1`,
});

export const observedDays = define<[string, string]>({
  id: "observed-days",
  title: "Which chart days were captured",
  views: ["analytics.snapshot_coverage"],
  text: `SELECT snapshot_date::text AS day
FROM analytics.snapshot_coverage
WHERE region = 'US' AND is_complete AND snapshot_date BETWEEN $1::date AND $2::date
ORDER BY snapshot_date`,
});

export const ALL_QUERIES: Query<unknown[]>[] = [
  overviewKpis, freshness, categoryShareOverTime, heroPoints, categoryBenchmarks,
  durationByCategory, publishTiming, channelLeaderboard, videoSearch, videoDetail, videoDays,
  videoPrediction, simulatorDefaults, feed, categoryChips, sidebarChannels, upNext, channelHeader, observedDays,
] as Query<unknown[]>[];
