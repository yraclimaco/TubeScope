-- Channel leaderboard. Raw multi-day rates for channels with one or two charted videos are
-- noise, so channels are ranked on an empirical-Bayes rate shrunk toward the overall rate
-- with a prior worth 10 videos.
CREATE VIEW analytics.channel_performance AS
WITH per_channel AS (
    SELECT
        region,
        first_chart_size AS chart_size,
        channel_id,
        MAX(channel_title) AS channel_title,
        MODE() WITHIN GROUP (ORDER BY category) AS primary_category,
        COUNT(*) AS charted_videos,
        COUNT(*) FILTER (WHERE label_observable) AS labeled_videos,
        COUNT(*) FILTER (WHERE label_observable AND is_multiday) AS multiday_videos,
        AVG(total_days_on_chart) AS avg_days_on_chart,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY first_day_engagement_rate)
            AS engagement_median,
        MAX(channel_subscribers) AS subscribers_max_seen
    FROM analytics.video_features
    GROUP BY region, first_chart_size, channel_id
),
prior AS (
    SELECT
        region,
        chart_size,
        SUM(multiday_videos)::numeric / NULLIF(SUM(labeled_videos), 0) AS rate
    FROM per_channel
    GROUP BY region, chart_size
),
scored AS (
    SELECT
        pc.*,
        ROUND(pc.multiday_videos::numeric / NULLIF(pc.labeled_videos, 0), 4) AS multiday_rate,
        ROUND((pc.multiday_videos + 10 * p.rate) / (pc.labeled_videos + 10), 4)
            AS smoothed_multiday_rate
    FROM per_channel AS pc
    JOIN prior AS p USING (region, chart_size)
)
SELECT
    region,
    chart_size,
    channel_id,
    channel_title,
    primary_category,
    charted_videos,
    labeled_videos,
    multiday_videos,
    multiday_rate,
    smoothed_multiday_rate,
    ROUND(avg_days_on_chart, 3) AS avg_days_on_chart,
    ROUND(engagement_median::numeric, 5) AS engagement_median,
    subscribers_max_seen,
    DENSE_RANK() OVER (PARTITION BY region, chart_size ORDER BY charted_videos DESC)
        AS volume_rank,
    RANK() OVER (PARTITION BY region, chart_size ORDER BY smoothed_multiday_rate DESC)
        AS staying_power_rank
FROM scored;
