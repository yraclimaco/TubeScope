-- Publish day x hour (US Pacific time) against chart staying power.
CREATE VIEW analytics.publish_timing AS
SELECT
    region,
    first_chart_size AS chart_size,
    publish_isodow_pt,
    (ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])[publish_isodow_pt] AS publish_day_pt,
    publish_hour_pt,
    COUNT(*) AS videos,
    COUNT(*) FILTER (WHERE label_observable) AS labeled_videos,
    COUNT(*) FILTER (WHERE label_observable AND is_multiday) AS multiday_videos,
    ROUND(
        COUNT(*) FILTER (WHERE label_observable AND is_multiday)::numeric
            / NULLIF(COUNT(*) FILTER (WHERE label_observable), 0),
        4
    ) AS multiday_rate
FROM analytics.video_features
GROUP BY region, first_chart_size, publish_isodow_pt, publish_hour_pt;
