-- Which chart days exist, and whether each is complete enough to trust.
-- A day counts as complete when it holds at least 90% of the chart size it was pulled at.
-- Incomplete or missing days break streaks and mark neighbouring streaks as censored.
CREATE VIEW analytics.snapshot_coverage AS
SELECT
    region,
    snapshot_date,
    source,
    chart_size,
    row_count,
    captured_at,
    row_count >= CEIL(0.9 * chart_size) AS is_complete,
    LAG(snapshot_date) OVER w AS previous_snapshot_date,
    snapshot_date - LAG(snapshot_date) OVER w - 1 AS days_missing_before
FROM core.snapshot_batch
WINDOW w AS (PARTITION BY region ORDER BY snapshot_date);
