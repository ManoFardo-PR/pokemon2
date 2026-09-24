-- 0001_foundation.sql — schema bookkeeping and the ETL run log.
-- Owner: S01.T04. Postgres: portable as written (TEXT/INTEGER only, ISO-8601 UTC timestamps).

CREATE TABLE schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    checksum    TEXT    NOT NULL,              -- SHA-256 of the file as applied
    applied_at  TEXT    NOT NULL,              -- 'YYYY-MM-DDTHH:MM:SSZ'
    duration_ms INTEGER NOT NULL
);

CREATE TABLE etl_runs (
    id          INTEGER PRIMARY KEY,           -- monotonic internal id
    kind        TEXT    NOT NULL,              -- full | delta | prices | fts | decks | decks-web | seed
    started_at  TEXT    NOT NULL,
    finished_at TEXT,
    status      TEXT    NOT NULL DEFAULT 'running',
    stats_json  TEXT    NOT NULL DEFAULT '{}',
    error       TEXT,
    CHECK (status IN ('running', 'ok', 'error', 'cancelled')),
    CHECK (finished_at IS NULL OR finished_at >= started_at),
    CHECK ((status = 'running') = (finished_at IS NULL))
);

CREATE INDEX etl_runs_kind_started_idx ON etl_runs (kind, started_at DESC);
CREATE INDEX etl_runs_running_idx      ON etl_runs (started_at) WHERE status = 'running';
