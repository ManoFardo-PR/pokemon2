-- 0002_cards.sql — canonical card facts from pokemon-tcg-data complemented by TCGdex, prices and the FTS index.
-- Owner: S02.T05 (schema), S02.T06 (rows), S02.T07 (prices), S02.T08 (FTS).
-- Postgres: *_json TEXT -> jsonb + GIN; cards_fts -> generated tsvector (A name, B attack/ability names,
--   C texts and rules, D flavor) + GIN; cards_market_usd -> materialized view; see packages/db/PORTABILITY.md.

CREATE TABLE sets (
    id              TEXT PRIMARY KEY,          -- pokemon-tcg-data set id, e.g. 'sv8'
    tcgdex_id       TEXT,                      -- resolved by S02.T04; NULL when unmatched
    name            TEXT    NOT NULL,
    name_norm       TEXT    NOT NULL,          -- norm(name), written only by the loader; BR-S02.T05-09
    series          TEXT,
    printed_total   INTEGER,
    total           INTEGER,
    release_date    TEXT,                      -- 'YYYY-MM-DD'
    ptcgo_code      TEXT,                      -- e.g. 'SSP'
    legal_unlimited TEXT,                      -- 'Legal' | 'Banned' | NULL (source wording)
    legal_standard  TEXT,
    legal_expanded  TEXT,
    symbol_url      TEXT,
    logo_url        TEXT,
    updated_at      TEXT    NOT NULL           -- 'YYYY-MM-DDTHH:MM:SSZ'
);
CREATE INDEX sets_release_date_idx ON sets (release_date DESC);
CREATE INDEX sets_name_norm_idx    ON sets (name_norm);
CREATE INDEX sets_ptcgo_code_idx   ON sets (ptcgo_code);

CREATE TABLE cards (
    id                    TEXT PRIMARY KEY,                              -- 'sv4pt5-54'
    set_id                TEXT    NOT NULL REFERENCES sets(id),
    tcgdex_id             TEXT,
    number                TEXT    NOT NULL,                              -- printed, e.g. '54', 'TG01'
    local_id              TEXT,                                          -- TCGdex localId
    name                  TEXT    NOT NULL,
    name_norm             TEXT    NOT NULL,                              -- norm(name), written only by the loader; BR-S02.T05-09
    supertype             TEXT,                                          -- 'Pokémon' | 'Trainer' | 'Energy'
    subtypes_json         TEXT,                                          -- JSON array
    hp                    INTEGER,
    types_json            TEXT,
    evolves_from          TEXT,
    evolves_to_json       TEXT,
    stage                 TEXT,                                          -- derived, see S02.T06
    rules_json            TEXT,
    flavor_text           TEXT,
    regulation_mark       TEXT,                                          -- 'G' | 'H' | 'I' | …
    rarity                TEXT,
    artist                TEXT,
    national_dex_json     TEXT,
    retreat_cost          INTEGER,
    retreat_json          TEXT,
    legal_unlimited       TEXT,
    legal_standard        TEXT,
    legal_expanded        TEXT,
    tcgdex_legal_standard INTEGER,                                       -- 0 | 1 | NULL (no TCGdex document)
    tcgdex_legal_expanded INTEGER,
    variants_json         TEXT,
    img_small             TEXT,
    img_large             TEXT,
    img_webp_high         TEXT,
    img_webp_low          TEXT,
    raw_ptcg_json         TEXT    NOT NULL,                              -- RN-01
    raw_tcgdex_json       TEXT,                                          -- RN-01; NULL when unmatched
    release_date          TEXT,                                          -- denormalized from sets, for filters
    tcgdex_updated        TEXT,
    updated_at            TEXT    NOT NULL,
    CHECK (tcgdex_legal_standard IN (0, 1)),
    CHECK (tcgdex_legal_expanded IN (0, 1)),
    CHECK (hp IS NULL OR hp >= 0),
    CHECK (retreat_cost IS NULL OR retreat_cost >= 0)
);
CREATE INDEX cards_set_id_idx          ON cards (set_id);
CREATE INDEX cards_hp_idx              ON cards (hp);
CREATE INDEX cards_supertype_idx       ON cards (supertype);
CREATE INDEX cards_regulation_mark_idx ON cards (regulation_mark);
CREATE INDEX cards_release_date_idx    ON cards (release_date);
CREATE INDEX cards_name_norm_idx       ON cards (name_norm);
-- the evolution line is walked by exact name (S04.T02); without this index it is a 20k-row scan per card
CREATE INDEX cards_name_release_idx    ON cards (name, release_date);
CREATE INDEX cards_tcgdex_id_idx       ON cards (tcgdex_id);

CREATE TABLE attacks (
    id             INTEGER PRIMARY KEY,
    card_id        TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    idx            INTEGER NOT NULL,                                     -- position on the printing, 0-based
    name           TEXT,
    name_norm      TEXT,                                                 -- norm(name), written only by the loader; BR-S02.T05-09
    cost_json      TEXT,                                                 -- JSON array of energy type names
    converted_cost INTEGER,
    damage_text    TEXT,                                                 -- '120+', '30×', 'varies'
    damage_num     INTEGER,
    damage_mod     TEXT,                                                 -- '+' | '-' | '×' | NULL
    text           TEXT,
    text_norm      TEXT,                                                 -- norm(text), written only by the loader; BR-S02.T05-09
    CHECK (idx >= 0),
    CHECK (damage_mod IS NULL OR damage_mod IN ('+', '-', '×'))
);
CREATE UNIQUE INDEX attacks_card_idx_uq    ON attacks (card_id, idx);
CREATE INDEX        attacks_card_id_idx    ON attacks (card_id);
CREATE INDEX        attacks_damage_num_idx ON attacks (damage_num);

CREATE TABLE abilities (
    id        INTEGER PRIMARY KEY,
    card_id   TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    idx       INTEGER NOT NULL,
    name      TEXT,
    name_norm TEXT,                                                      -- norm(name), written only by the loader; BR-S02.T05-09
    type      TEXT,                                                      -- 'Ability' | 'Poké-Power' | …
    text      TEXT,
    text_norm TEXT,                                                      -- norm(text), written only by the loader; BR-S02.T05-09
    CHECK (idx >= 0)
);
CREATE UNIQUE INDEX abilities_card_idx_uq ON abilities (card_id, idx);
CREATE INDEX        abilities_card_id_idx ON abilities (card_id);

CREATE TABLE weaknesses (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    type    TEXT NOT NULL,
    value   TEXT,                                                        -- '×2', '+30'
    PRIMARY KEY (card_id, type)
);
CREATE INDEX weaknesses_card_id_idx ON weaknesses (card_id);

CREATE TABLE resistances (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    type    TEXT NOT NULL,
    value   TEXT,                                                        -- '-30'
    PRIMARY KEY (card_id, type)
);
CREATE INDEX resistances_card_id_idx ON resistances (card_id);

CREATE TABLE price_history (
    card_id       TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    snapshot_date TEXT NOT NULL,                                         -- 'YYYY-MM-DD'
    source        TEXT NOT NULL,                                         -- 'tcgplayer' | 'cardmarket'
    variant       TEXT NOT NULL,                                         -- 'normal' | 'holofoil' | 'reverse-holofoil' | …
    currency      TEXT,                                                  -- 'USD' | 'EUR'
    low           REAL,
    mid           REAL,
    high          REAL,
    market        REAL,                                                  -- tcgplayer marketPrice / cardmarket avg
    direct_low    REAL,
    trend         REAL,
    avg1          REAL,
    avg7          REAL,
    avg30         REAL,
    PRIMARY KEY (card_id, snapshot_date, source, variant),
    CHECK (source IN ('tcgplayer', 'cardmarket')),
    CHECK (length(snapshot_date) = 10)
);
CREATE INDEX price_history_card_date_idx ON price_history (card_id, snapshot_date);
CREATE INDEX price_history_date_idx      ON price_history (snapshot_date);

-- Latest snapshot per (card, source, variant). Portable as written.
CREATE VIEW cards_latest_price AS
SELECT p.*
FROM price_history p
JOIN (SELECT card_id, source, variant, MAX(snapshot_date) AS snapshot_date
      FROM price_history GROUP BY card_id, source, variant) m
  ON m.card_id = p.card_id AND m.source = p.source
 AND m.variant = p.variant AND m.snapshot_date = p.snapshot_date;

-- One market price in USD per card. A maintained TABLE, not a view: every price sort and price filter
-- joins it (S02.T09), and re-aggregating price_history per query was the legacy cost.
-- @postgres: materialized view over cards_latest_price, refreshed by the same ETL step.
CREATE TABLE cards_market_usd (
    card_id       TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    market_usd    REAL NOT NULL,
    snapshot_date TEXT NOT NULL
);
CREATE INDEX cards_market_usd_price_idx ON cards_market_usd (market_usd);

-- @postgres: generated tsvector column on cards with weights A (name), B (attack_names, ability_names),
--   C (attack_text, ability_text, rules), D (flavor) + GIN index; see packages/db/PORTABILITY.md §7.
-- @sqlite-only
-- Column order is the contract with S02.T08: the ranking function takes one weight per column in declaration
-- order (0, 10.0, 6.0, 3.0, 6.0, 3.0, 2.0, 0.5), so reordering these columns silently reweights every search.
CREATE VIRTUAL TABLE cards_fts USING fts5(
    card_id UNINDEXED,
    name,
    attack_names,
    attack_text,
    ability_names,
    ability_text,
    rules,
    flavor,
    tokenize = 'unicode61 remove_diacritics 2'
);
-- @end
