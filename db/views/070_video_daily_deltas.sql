-- Day-over-day momentum for every video on every chart day it appeared.
CREATE VIEW analytics.video_daily_deltas AS
SELECT
    s.region,
    s.video_id,
    s.snapshot_date,
    s.snapshot_date - MIN(s.snapshot_date) OVER (PARTITION BY s.region, s.video_id)
        AS days_since_first_chart,
    s.chart_position,
    s.views,
    s.likes,
    s.comments,
    LAG(s.snapshot_date) OVER w AS previous_snapshot_date,
    s.views - LAG(s.views) OVER w AS views_gained,
    ROUND(
        (s.views - LAG(s.views) OVER w)::numeric
            / NULLIF(s.snapshot_date - LAG(s.snapshot_date) OVER w, 0),
        1
    ) AS views_gained_per_day,
    ROUND(s.views::numeric / NULLIF(LAG(s.views) OVER w, 0) - 1, 4) AS views_growth_rate,
    LAG(s.chart_position) OVER w - s.chart_position AS positions_gained
FROM core.video_snapshot AS s
WINDOW w AS (PARTITION BY s.region, s.video_id ORDER BY s.snapshot_date);
