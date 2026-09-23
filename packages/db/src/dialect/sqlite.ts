import type { Dialect } from "./types.js";

export const sqliteDialect: Dialect = {
  name: "sqlite",

  jsonArrayElements(expr: string, alias: string): string {
    return `json_each(${expr}) AS ${alias}`;
  },

  jsonContains(column: string, param: string): string {
    return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ${param})`;
  },

  fullTextMatch(table: string, query: string): string {
    return `${table} MATCH ${query}`;
  },

  rank(weights?: Record<string, number>): string {
    if (weights) {
      const weightArgs = Object.values(weights).join(", ");
      return `bm25(${weightArgs})`;
    }
    return "bm25()";
  },

  upsert(table: string, columns: readonly string[], conflictTarget: readonly string[]): string {
    const colList = columns.join(", ");
    const valList = columns.map(() => "?").join(", ");
    const targetList = conflictTarget.join(", ");
    const updateCols = columns.filter((c) => !conflictTarget.includes(c));

    if (updateCols.length === 0) {
      return `INSERT INTO ${table} (${colList}) VALUES (${valList}) ON CONFLICT (${targetList}) DO NOTHING;`;
    }

    const setClauses = updateCols.map((c) => `${c} = excluded.${c}`).join(", ");
    return `INSERT INTO ${table} (${colList}) VALUES (${valList}) ON CONFLICT (${targetList}) DO UPDATE SET ${setClauses};`;
  },

  nowUtc(): string {
    return "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  },

  numericOrder(column: string): string {
    return `CAST(${column} AS INTEGER)`;
  },
};
