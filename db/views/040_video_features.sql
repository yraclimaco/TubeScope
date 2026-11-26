-- Analysis- and model-ready table: everything known about a video on its first chart day,
-- plus its outcome. Channel statistics are taken from that same day, so no feature uses
-- information from after the moment a prediction would be made.
CREATE VIEW analytics.video_features AS
SELECT
    l.region,
    l.video_id,
    l.channel_id,
    ch.title AS channel_title,
    l.category_id,
    c.name AS category,
    v.title,
    v.published_at,
    l.first_chart_date,
    l.first_chart_source,
    l.first_chart_size,
    l.first_chart_position,
    -- outcome
    l.is_multiday,
    l.label_observable,
    l.first_streak_days,
    l.total_days_on_chart,
    l.right_censored,
    -- content features
    ROUND(v.duration_sec / 60.0, 3) AS duration_minutes,
    CASE
        WHEN v.duration_sec IS NULL THEN 'Unknown'
        WHEN v.duration_sec <= 60 THEN '0-1 min'
        WHEN v.duration_sec <= 180 THEN '1-3 min'
        WHEN v.duration_sec <= 300 THEN '3-5 min'
        WHEN v.duration_sec <= 600 THEN '5-10 min'
        WHEN v.duration_sec <= 1200 THEN '10-20 min'
        WHEN v.duration_sec <= 3600 THEN '20-60 min'
        ELSE '60+ min'
    END AS duration_bucket,
    CASE
        WHEN v.duration_sec IS NULL THEN 99
        WHEN v.duration_sec <= 60 THEN 1
        WHEN v.duration_sec <= 180 THEN 2
        WHEN v.duration_sec <= 300 THEN 3
        WHEN v.duration_sec <= 600 THEN 4
        WHEN v.duration_sec <= 1200 THEN 5
        WHEN v.duration_sec <= 3600 THEN 6
        ELSE 7
    END AS duration_bucket_order,
    v.title_char_count,
    v.description_word_count,
    v.tags_count,
    v.definition,
    v.licensed_content,
    -- timing features (UTC for the model, Pacific time for people)
    EXTRACT(HOUR FROM v.published_at AT TIME ZONE 'UTC')::int AS publish_hour_utc,
    EXTRACT(ISODOW FROM v.published_at AT TIME ZONE 'UTC')::int AS publish_isodow_utc,
    EXTRACT(ISODOW FROM v.published_at AT TIME ZONE 'UTC') IN (6, 7) AS is_weekend_utc,
    EXTRACT(HOUR FROM v.published_at AT TIME ZONE 'America/Los_Angeles')::int AS publish_hour_pt,
    EXTRACT(ISODOW FROM v.published_at AT TIME ZONE 'America/Los_Angeles')::int
        AS publish_isodow_pt,
    l.days_published_before_chart,
    -- channel features, as of the first chart day
    cs.subscribers AS channel_subscribers,
    cs.total_views AS channel_total_views,
    cs.video_count AS channel_video_count,
    ch.country AS channel_country,
    (l.first_chart_date - (ch.published_at AT TIME ZONE 'UTC')::date) AS channel_age_days,
    -- first-day performance (outcome-adjacent: for analysis, not model inputs)
    l.first_day_views,
    l.first_day_likes,
    l.first_day_comments,
    l.first_day_engagement_rate,
    l.peak_views,
    l.peak_to_first_views
FROM analytics.video_lifecycle AS l
JOIN core.video AS v USING (video_id)
JOIN core.channel AS ch ON ch.channel_id = l.channel_id
LEFT JOIN core.category AS c ON c.category_id = l.category_id
LEFT JOIN core.channel_snapshot AS cs
    ON cs.channel_id = l.channel_id AND cs.snapshot_date = l.first_chart_date
WHERE NOT l.left_truncated;
