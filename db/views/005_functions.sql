-- Wilson score interval for a binomial proportion. Small segments (a channel with three
-- charted videos, say) get wide intervals instead of misleading 0% or 100% rates.
CREATE FUNCTION analytics.wilson_bound(successes bigint, trials bigint, upper boolean,
                                       z double precision DEFAULT 1.96)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE WHEN trials IS NULL OR trials = 0 THEN NULL ELSE ROUND((
        (successes::float8 / trials + z * z / (2 * trials))
        + CASE WHEN upper THEN 1 ELSE -1 END
          * z * sqrt((successes::float8 / trials) * (1 - successes::float8 / trials) / trials
                     + z * z / (4.0 * trials * trials))
    )::numeric / (1 + z * z / trials)::numeric, 4) END
$$;
