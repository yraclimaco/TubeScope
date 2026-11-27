-- Daily category mix of the chart with a 7-day rolling share.
-- A dense day x category grid keeps days where a category had zero videos, so rolling
-- averages are not biased upward by missing rows.
CREATE VIEW analytics.daily_category_share AS
WITH days AS (
    SELECT region, snapshot_date, source, chart_size, row_count
    FROM analytics.snapshot_coverage
    WHERE is_complete
),
categories AS (
    SELECT DISTINCT v.category_id, c.name AS category
    FROM core.video AS v
    JOIN core.category AS c USING (category_id)
),
counts AS (
    SELECT
        s.region,
        s.snapshot_date,
        v.category_id,
        COUNT(*) AS videos,
        COUNT(*) FILTER (WHERE s.snapshot_date = first_day.first_date) AS new_videos
    FROM core.video_snapshot AS s
    JOIN core.video AS v USING (video_id)
    JOIN (
        SELECT region, video_id, MIN(snapshot_date) AS first_date
        FROM core.video_snapshot
        GROUP BY region, video_id
    ) AS first_day USING (region, video_id)
    GROUP BY s.region, s.snapshot_date, v.category_id
)
SELECT
    d.region,
    d.snapshot_date,
    d.source,
    d.chart_size,
    c.category_id,
    c.category,
    COALESCE(n.videos, 0) AS videos,
    COALESCE(n.new_videos, 0) AS new_videos,
    d.row_count AS chart_videos,
    ROUND(COALESCE(n.videos, 0)::numeric / d.row_count, 4) AS share,
    ROUND(AVG(COALESCE(n.videos, 0)::numeric / d.row_count) OVER (
        PARTITION BY d.region, d.chart_size, c.category_id
        ORDER BY d.snapshot_date
        RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
    ), 4) AS share_7d_avg
FROM days AS d
CROSS JOIN categories AS c
LEFT JOIN counts AS n
    ON n.region = d.region AND n.snapshot_date = d.snapshot_date AND n.category_id = c.category_id;
