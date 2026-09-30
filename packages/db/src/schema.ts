export type EtlRunKind =
  | "full"
  | "delta"
  | "prices"
  | "fts"
  | "decks"
  | "decks-web"
  | "seed";

export type EtlRunStatus = "running" | "ok" | "error" | "cancelled";

export interface SchemaMigrationRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
  duration_ms: number;
}

export interface EtlRunRow {
  id: number;
  kind: EtlRunKind;
  started_at: string;
  finished_at: string | null;
  status: EtlRunStatus;
  stats_json: string;
  error: string | null;
}

export interface TableColumnDescriptor {
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: boolean;
}

export interface TableDescriptor {
  name: string;
  columns: TableColumnDescriptor[];
}

export const TABLES: Record<string, TableDescriptor> = {
  schema_migrations: {
    name: "schema_migrations",
    columns: [
      { name: "version", type: "INTEGER", notnull: false, dflt_value: null, pk: true },
      { name: "name", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "checksum", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "applied_at", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "duration_ms", type: "INTEGER", notnull: true, dflt_value: null, pk: false },
    ],
  },
  etl_runs: {
    name: "etl_runs",
    columns: [
      { name: "id", type: "INTEGER", notnull: false, dflt_value: null, pk: true },
      { name: "kind", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "started_at", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "finished_at", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "status", type: "TEXT", notnull: true, dflt_value: "'running'", pk: false },
      { name: "stats_json", type: "TEXT", notnull: true, dflt_value: "'{}'", pk: false },
      { name: "error", type: "TEXT", notnull: false, dflt_value: null, pk: false },
    ],
  },
  // S02.T05 — migration 0002_cards.sql. Every entry mirrors PRAGMA table_info of the migrated database
  // exactly (BR-S02.T05-10); cards_fts is a virtual table and has no row type, so it is not described here.
  sets: {
    name: "sets",
    columns: [
      { name: "id", type: "TEXT", notnull: false, dflt_value: null, pk: true },
      { name: "tcgdex_id", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "name", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "name_norm", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "series", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "printed_total", type: "INTEGER", notnull: false, dflt_value: null, pk: false },
      { name: "total", type: "INTEGER", notnull: false, dflt_value: null, pk: false },
      { name: "release_date", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "ptcgo_code", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "legal_unlimited", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "legal_standard", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "legal_expanded", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "symbol_url", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "logo_url", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "updated_at", type: "TEXT", notnull: true, dflt_value: null, pk: false },
    ],
  },
  cards: {
    name: "cards",
    columns: [
      { name: "id", type: "TEXT", notnull: false, dflt_value: null, pk: true },
      { name: "set_id", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "tcgdex_id", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "number", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "local_id", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "name", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "name_norm", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "supertype", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "subtypes_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "hp", type: "INTEGER", notnull: false, dflt_value: null, pk: false },
      { name: "types_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "evolves_from", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "evolves_to_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "stage", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "rules_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "flavor_text", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "regulation_mark", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "rarity", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "artist", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "national_dex_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "retreat_cost", type: "INTEGER", notnull: false, dflt_value: null, pk: false },
      { name: "retreat_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "legal_unlimited", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "legal_standard", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "legal_expanded", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "tcgdex_legal_standard", type: "INTEGER", notnull: false, dflt_value: null, pk: false },
      { name: "tcgdex_legal_expanded", type: "INTEGER", notnull: false, dflt_value: null, pk: false },
      { name: "variants_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "img_small", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "img_large", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "img_webp_high", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "img_webp_low", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "raw_ptcg_json", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "raw_tcgdex_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "release_date", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "tcgdex_updated", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "updated_at", type: "TEXT", notnull: true, dflt_value: null, pk: false },
    ],
  },
  attacks: {
    name: "attacks",
    columns: [
      { name: "id", type: "INTEGER", notnull: false, dflt_value: null, pk: true },
      { name: "card_id", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "idx", type: "INTEGER", notnull: true, dflt_value: null, pk: false },
      { name: "name", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "name_norm", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "cost_json", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "converted_cost", type: "INTEGER", notnull: false, dflt_value: null, pk: false },
      { name: "damage_text", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "damage_num", type: "INTEGER", notnull: false, dflt_value: null, pk: false },
      { name: "damage_mod", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "text", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "text_norm", type: "TEXT", notnull: false, dflt_value: null, pk: false },
    ],
  },
  abilities: {
    name: "abilities",
    columns: [
      { name: "id", type: "INTEGER", notnull: false, dflt_value: null, pk: true },
      { name: "card_id", type: "TEXT", notnull: true, dflt_value: null, pk: false },
      { name: "idx", type: "INTEGER", notnull: true, dflt_value: null, pk: false },
      { name: "name", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "name_norm", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "type", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "text", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "text_norm", type: "TEXT", notnull: false, dflt_value: null, pk: false },
    ],
  },
  weaknesses: {
    name: "weaknesses",
    columns: [
      { name: "card_id", type: "TEXT", notnull: true, dflt_value: null, pk: true },
      { name: "type", type: "TEXT", notnull: true, dflt_value: null, pk: true },
      { name: "value", type: "TEXT", notnull: false, dflt_value: null, pk: false },
    ],
  },
  resistances: {
    name: "resistances",
    columns: [
      { name: "card_id", type: "TEXT", notnull: true, dflt_value: null, pk: true },
      { name: "type", type: "TEXT", notnull: true, dflt_value: null, pk: true },
      { name: "value", type: "TEXT", notnull: false, dflt_value: null, pk: false },
    ],
  },
  price_history: {
    name: "price_history",
    columns: [
      { name: "card_id", type: "TEXT", notnull: true, dflt_value: null, pk: true },
      { name: "snapshot_date", type: "TEXT", notnull: true, dflt_value: null, pk: true },
      { name: "source", type: "TEXT", notnull: true, dflt_value: null, pk: true },
      { name: "variant", type: "TEXT", notnull: true, dflt_value: null, pk: true },
      { name: "currency", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "low", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "mid", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "high", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "market", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "direct_low", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "trend", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "avg1", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "avg7", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "avg30", type: "REAL", notnull: false, dflt_value: null, pk: false },
    ],
  },
  cards_latest_price: {
    name: "cards_latest_price",
    columns: [
      { name: "card_id", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "snapshot_date", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "source", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "variant", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "currency", type: "TEXT", notnull: false, dflt_value: null, pk: false },
      { name: "low", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "mid", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "high", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "market", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "direct_low", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "trend", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "avg1", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "avg7", type: "REAL", notnull: false, dflt_value: null, pk: false },
      { name: "avg30", type: "REAL", notnull: false, dflt_value: null, pk: false },
    ],
  },
  cards_market_usd: {
    name: "cards_market_usd",
    columns: [
      { name: "card_id", type: "TEXT", notnull: false, dflt_value: null, pk: true },
      { name: "market_usd", type: "REAL", notnull: true, dflt_value: null, pk: false },
      { name: "snapshot_date", type: "TEXT", notnull: true, dflt_value: null, pk: false },
    ],
  },
};

// S02.T05 — row types for migration 0002_cards.sql (contracts written in the RED phase; TABLES entries follow in GREEN).
// `*_json` columns are raw JSON text at the row level; parsed shapes belong to the service layer.

export type PriceSource = "tcgplayer" | "cardmarket";

export type DamageMod = "+" | "-" | "×";

export interface SetRow {
  id: string;
  tcgdex_id: string | null;
  name: string;
  name_norm: string;
  series: string | null;
  printed_total: number | null;
  total: number | null;
  release_date: string | null;
  ptcgo_code: string | null;
  legal_unlimited: string | null;
  legal_standard: string | null;
  legal_expanded: string | null;
  symbol_url: string | null;
  logo_url: string | null;
  updated_at: string;
}

export interface CardRow {
  id: string;
  set_id: string;
  tcgdex_id: string | null;
  number: string;
  local_id: string | null;
  name: string;
  name_norm: string;
  supertype: string | null;
  subtypes_json: string | null;
  hp: number | null;
  types_json: string | null;
  evolves_from: string | null;
  evolves_to_json: string | null;
  stage: string | null;
  rules_json: string | null;
  flavor_text: string | null;
  regulation_mark: string | null;
  rarity: string | null;
  artist: string | null;
  national_dex_json: string | null;
  retreat_cost: number | null;
  retreat_json: string | null;
  legal_unlimited: string | null;
  legal_standard: string | null;
  legal_expanded: string | null;
  tcgdex_legal_standard: 0 | 1 | null;
  tcgdex_legal_expanded: 0 | 1 | null;
  variants_json: string | null;
  img_small: string | null;
  img_large: string | null;
  img_webp_high: string | null;
  img_webp_low: string | null;
  raw_ptcg_json: string;
  raw_tcgdex_json: string | null;
  release_date: string | null;
  tcgdex_updated: string | null;
  updated_at: string;
}

export interface AttackRow {
  id: number;
  card_id: string;
  idx: number;
  name: string | null;
  name_norm: string | null;
  cost_json: string | null;
  converted_cost: number | null;
  damage_text: string | null;
  damage_num: number | null;
  damage_mod: DamageMod | null;
  text: string | null;
  text_norm: string | null;
}

export interface AbilityRow {
  id: number;
  card_id: string;
  idx: number;
  name: string | null;
  name_norm: string | null;
  type: string | null;
  text: string | null;
  text_norm: string | null;
}

export interface WeaknessRow {
  card_id: string;
  type: string;
  value: string | null;
}

export interface ResistanceRow {
  card_id: string;
  type: string;
  value: string | null;
}

export interface PriceHistoryRow {
  card_id: string;
  snapshot_date: string;
  source: PriceSource;
  variant: string;
  currency: string | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  direct_low: number | null;
  trend: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
}

/** One row of the `cards_latest_price` view: the latest snapshot per (card_id, source, variant). */
export type CardsLatestPriceRow = PriceHistoryRow;

export interface CardsMarketUsdRow {
  card_id: string;
  market_usd: number;
  snapshot_date: string;
}
