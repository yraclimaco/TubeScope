-- Video length vs. staying power *within* each category.
-- Pooled across categories, short videos look far stickier, largely because Music videos are
-- short and Gaming videos are long. Comparing each bucket with its own category's rate
-- separates the length effect from the category mix.
CREATE VIEW analytics.duration_by_category AS
WITH segments AS (
    SELECT
        region,
        first_chart_size AS chart_size,
        category,
        duration_bucket,
        duration_bucket_order,
        COUNT(*) AS videos,
        COUNT(*) FILTER (WHERE label_observable) AS labeled_videos,
        COUNT(*) FILTER (WHERE label_observable AND is_multiday) AS multiday_videos
    FROM analytics.video_features
    GROUP BY region, first_chart_size, category, duration_bucket, duration_bucket_order
)
SELECT
    s.*,
    ROUND(s.multiday_videos::numeric / NULLIF(s.labeled_videos, 0), 4) AS multiday_rate,
    analytics.wilson_bound(s.multiday_videos, s.labeled_videos, false) AS multiday_rate_ci_low,
    analytics.wilson_bound(s.multiday_videos, s.labeled_videos, true) AS multiday_rate_ci_high,
    ROUND(
        (SUM(s.multiday_videos) OVER category_window)::numeric
            / NULLIF(SUM(s.labeled_videos) OVER category_window, 0),
        4
    ) AS category_multiday_rate,
    ROUND(
        (s.multiday_videos::numeric / NULLIF(s.labeled_videos, 0))
            / NULLIF(
                (SUM(s.multiday_videos) OVER category_window)::numeric
                    / NULLIF(SUM(s.labeled_videos) OVER category_window, 0),
                0
            ),
        3
    ) AS lift_within_category
FROM segments AS s
WINDOW category_window AS (PARTITION BY s.region, s.chart_size, s.category);
