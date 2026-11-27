-- Pipeline health per region: how recent the data is and how complete the last weeks are.
-- Drives the "last updated" badge and lets the daily job's gaps show up in the app.
CREATE VIEW analytics.data_freshness AS
SELECT
    region,
    MAX(snapshot_date) AS latest_snapshot_date,
    MAX(captured_at) AS latest_captured_at,
    CURRENT_DATE - MAX(snapshot_date) AS days_since_latest,
    COUNT(*) FILTER (WHERE is_complete) AS complete_days_total,
    COUNT(*) FILTER (WHERE is_complete AND snapshot_date > CURRENT_DATE - 7)
        AS complete_days_last_7,
    COUNT(*) FILTER (WHERE is_complete AND snapshot_date > CURRENT_DATE - 30)
        AS complete_days_last_30,
    MIN(snapshot_date) FILTER (WHERE source = 'youtube_api') AS first_live_snapshot_date,
    COUNT(*) FILTER (WHERE source = 'youtube_api') AS live_days_total
FROM analytics.snapshot_coverage
GROUP BY region;
