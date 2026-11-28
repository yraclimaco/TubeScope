-- One row per video per region: its first chart run, outcome label and first-day metrics.
--
-- Label: is_multiday = the first streak lasted more than one chart day.
-- label_observable is false when the outcome cannot be known:
--   * the first streak is left-truncated (the video may have charted before the data starts),
--   * a one-day first streak is right-censored (the next day was never observed).
-- Materialized (read by most downstream views); rebuilt after every load.
CREATE MATERIALIZED VIEW analytics.video_lifecycle AS
WITH first_streak AS (
    SELECT * FROM analytics.video_streaks WHERE streak_number = 1
),
totals AS (
    SELECT
        region,
        video_id,
        COUNT(*)::int AS n_streaks,
        SUM(streak_days)::int AS total_days_on_chart,
        MAX(streak_end) AS last_chart_date
    FROM analytics.video_streaks
    GROUP BY region, video_id
),
peak AS (
    SELECT region, video_id, MAX(views) AS peak_views, MIN(chart_position) AS best_chart_position
    FROM core.video_snapshot
    GROUP BY region, video_id
)
SELECT
    f.region,
    f.video_id,
    v.channel_id,
    v.category_id,
    b.source AS first_chart_source,
    b.chart_size AS first_chart_size,
    f.streak_start AS first_chart_date,
    t.last_chart_date,
    f.streak_days AS first_streak_days,
    t.total_days_on_chart,
    t.n_streaks,
    f.left_truncated,
    f.right_censored,
    f.streak_days > 1 AS is_multiday,
    NOT (f.left_truncated OR (f.streak_days = 1 AND f.right_censored)) AS label_observable,
    f.streak_start - (v.published_at AT TIME ZONE 'UTC')::date AS days_published_before_chart,
    s.chart_position AS first_chart_position,
    p.best_chart_position,
    s.views AS first_day_views,
    s.likes AS first_day_likes,
    s.comments AS first_day_comments,
    ROUND((s.likes + s.comments)::numeric / NULLIF(s.views, 0), 6) AS first_day_engagement_rate,
    p.peak_views,
    ROUND(p.peak_views::numeric / NULLIF(s.views, 0), 3) AS peak_to_first_views
FROM first_streak AS f
JOIN totals AS t USING (region, video_id)
JOIN peak AS p USING (region, video_id)
JOIN core.video AS v USING (video_id)
JOIN core.snapshot_batch AS b
    ON b.region = f.region AND b.snapshot_date = f.streak_start
JOIN core.video_snapshot AS s
    ON s.region = f.region AND s.video_id = f.video_id AND s.snapshot_date = f.streak_start;

CREATE UNIQUE INDEX ON analytics.video_lifecycle (region, video_id);
