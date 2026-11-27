-- Consecutive-day chart streaks per video (gaps-and-islands).
--
-- Subtracting a per-video row number from each appearance date gives a constant value
-- across consecutive days, which identifies each streak ("island").
--
-- left_truncated: the day before the streak was not observed, so it may have started earlier.
-- right_censored: the day after the streak was not observed, so it may have continued.
CREATE VIEW analytics.video_streaks AS
WITH complete_days AS (
    SELECT region, snapshot_date
    FROM analytics.snapshot_coverage
    WHERE is_complete
),
appearances AS (
    SELECT s.region, s.video_id, s.snapshot_date
    FROM core.video_snapshot AS s
    JOIN complete_days AS d USING (region, snapshot_date)
),
islands AS (
    SELECT
        region,
        video_id,
        snapshot_date,
        snapshot_date
            - (ROW_NUMBER() OVER (PARTITION BY region, video_id ORDER BY snapshot_date))::int
            AS island_key
    FROM appearances
),
streaks AS (
    SELECT
        region,
        video_id,
        MIN(snapshot_date) AS streak_start,
        MAX(snapshot_date) AS streak_end,
        COUNT(*)::int AS streak_days
    FROM islands
    GROUP BY region, video_id, island_key
)
SELECT
    st.region,
    st.video_id,
    ROW_NUMBER() OVER (PARTITION BY st.region, st.video_id ORDER BY st.streak_start)::int
        AS streak_number,
    st.streak_start,
    st.streak_end,
    st.streak_days,
    before.snapshot_date IS NULL AS left_truncated,
    after.snapshot_date IS NULL AS right_censored
FROM streaks AS st
LEFT JOIN complete_days AS before
    ON before.region = st.region AND before.snapshot_date = st.streak_start - 1
LEFT JOIN complete_days AS after
    ON after.region = st.region AND after.snapshot_date = st.streak_end + 1;
