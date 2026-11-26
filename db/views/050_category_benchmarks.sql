-- Category benchmarks: share of the chart vs. staying power.
-- Grouped by chart size because "stayed on a top-200 chart" and "stayed on a top-50 chart"
-- are different outcomes and should not be pooled.
CREATE VIEW analytics.category_benchmarks AS
WITH by_category AS (
    SELECT
        region,
        first_chart_size AS chart_size,
        category_id,
        category,
        COUNT(*) AS videos,
        COUNT(*) FILTER (WHERE label_observable) AS labeled_videos,
        COUNT(*) FILTER (WHERE label_observable AND is_multiday) AS multiday_videos,
        AVG(total_days_on_chart) AS avg_days_on_chart,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY first_day_engagement_rate) AS engagement_p25,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY first_day_engagement_rate) AS engagement_median,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY first_day_engagement_rate) AS engagement_p75,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_minutes) AS duration_median_minutes,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY channel_subscribers) AS channel_subscribers_median
    FROM analytics.video_features
    GROUP BY region, first_chart_size, category_id, category
),
overall AS (
    SELECT
        region,
        chart_size,
        SUM(videos) AS all_videos,
        SUM(multiday_videos)::numeric / NULLIF(SUM(labeled_videos), 0) AS overall_multiday_rate
    FROM by_category
    GROUP BY region, chart_size
)
SELECT
    b.region,
    b.chart_size,
    b.category_id,
    b.category,
    b.videos,
    ROUND(b.videos / o.all_videos, 4) AS share_of_chart_videos,
    b.labeled_videos,
    b.multiday_videos,
    ROUND(b.multiday_videos::numeric / NULLIF(b.labeled_videos, 0), 4) AS multiday_rate,
    analytics.wilson_bound(b.multiday_videos, b.labeled_videos, false) AS multiday_rate_ci_low,
    analytics.wilson_bound(b.multiday_videos, b.labeled_videos, true) AS multiday_rate_ci_high,
    ROUND(o.overall_multiday_rate, 4) AS overall_multiday_rate,
    ROUND(
        b.multiday_videos::numeric / NULLIF(b.labeled_videos, 0) / NULLIF(o.overall_multiday_rate, 0),
        3
    ) AS multiday_lift,
    ROUND(b.avg_days_on_chart, 3) AS avg_days_on_chart,
    ROUND(b.engagement_p25::numeric, 5) AS engagement_p25,
    ROUND(b.engagement_median::numeric, 5) AS engagement_median,
    ROUND(b.engagement_p75::numeric, 5) AS engagement_p75,
    ROUND(b.duration_median_minutes::numeric, 2) AS duration_median_minutes,
    ROUND(b.channel_subscribers_median::numeric) AS channel_subscribers_median,
    RANK() OVER (
        PARTITION BY b.region, b.chart_size
        ORDER BY b.multiday_videos::numeric / NULLIF(b.labeled_videos, 0) DESC NULLS LAST
    ) AS multiday_rate_rank
FROM by_category AS b
JOIN overall AS o USING (region, chart_size);
