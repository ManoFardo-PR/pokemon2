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
};
