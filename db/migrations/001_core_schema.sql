-- TubeScope warehouse: core tables.
--
-- Grain
--   core.snapshot_batch    one chart (region x day)
--   core.video_snapshot    one video on one chart
--   core.channel_snapshot  channel statistics on a day
--   core.video / channel   attributes as first observed
--
-- Derived logic (lifecycles, labels, benchmarks) lives in the analytics schema views,
-- so raw facts stay append-only and every metric is reproducible from SQL.

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS ml;

CREATE TABLE core.category (
    category_id smallint PRIMARY KEY,
    name        text NOT NULL
);

CREATE TABLE core.channel (
    channel_id      text PRIMARY KEY,
    title           text,
    custom_url      text,
    country         char(2),
    published_at    timestamptz,
    first_seen_date date NOT NULL
);

CREATE TABLE core.video (
    video_id               text PRIMARY KEY,
    channel_id             text NOT NULL REFERENCES core.channel,
    category_id            smallint REFERENCES core.category,
    title                  text NOT NULL,
    description            text,
    tags                   text[] NOT NULL DEFAULT '{}',
    published_at           timestamptz NOT NULL,
    duration_sec           integer CHECK (duration_sec >= 0),
    definition             text,
    licensed_content       boolean,
    thumbnail_url          text,
    title_char_count       integer NOT NULL CHECK (title_char_count >= 0),
    description_word_count integer NOT NULL CHECK (description_word_count >= 0),
    tags_count             integer NOT NULL CHECK (tags_count >= 0),
    first_seen_date        date NOT NULL,
    first_seen_source      text NOT NULL
);
CREATE INDEX video_channel_idx ON core.video (channel_id);
CREATE INDEX video_category_idx ON core.video (category_id);

CREATE TABLE core.snapshot_batch (
    region        char(2) NOT NULL,
    snapshot_date date NOT NULL,
    source        text NOT NULL CHECK (source IN ('kaggle', 'youtube_api')),
    captured_at   timestamptz,
    chart_size    smallint NOT NULL CHECK (chart_size > 0),
    row_count     integer NOT NULL CHECK (row_count >= 0),
    loaded_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (region, snapshot_date)
);

CREATE TABLE core.video_snapshot (
    region         char(2) NOT NULL,
    snapshot_date  date NOT NULL,
    video_id       text NOT NULL REFERENCES core.video,
    chart_position smallint CHECK (chart_position > 0),
    views          bigint CHECK (views >= 0),
    likes          bigint CHECK (likes >= 0),
    comments       bigint CHECK (comments >= 0),
    PRIMARY KEY (region, snapshot_date, video_id),
    FOREIGN KEY (region, snapshot_date)
        REFERENCES core.snapshot_batch (region, snapshot_date) ON DELETE CASCADE
);
CREATE INDEX video_snapshot_video_idx ON core.video_snapshot (video_id, snapshot_date);

CREATE TABLE core.channel_snapshot (
    snapshot_date date NOT NULL,
    channel_id    text NOT NULL REFERENCES core.channel,
    subscribers   bigint CHECK (subscribers >= 0),
    total_views   bigint CHECK (total_views >= 0),
    video_count   integer CHECK (video_count >= 0),
    PRIMARY KEY (channel_id, snapshot_date)
);

-- Model registry and scored predictions (populated from Phase 2).
CREATE TABLE ml.model_version (
    model_version_id serial PRIMARY KEY,
    name             text NOT NULL,
    trained_at       timestamptz NOT NULL DEFAULT now(),
    git_sha          text,
    threshold        numeric(5, 4) NOT NULL CHECK (threshold BETWEEN 0 AND 1),
    metrics          jsonb NOT NULL DEFAULT '{}',
    artifact_uri     text,
    UNIQUE (name)
);

CREATE TABLE ml.prediction (
    model_version_id integer NOT NULL REFERENCES ml.model_version ON DELETE CASCADE,
    region           char(2) NOT NULL,
    video_id         text NOT NULL REFERENCES core.video,
    scored_for_date  date NOT NULL,
    probability      numeric(6, 5) NOT NULL CHECK (probability BETWEEN 0 AND 1),
    scored_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (model_version_id, region, video_id)
);
