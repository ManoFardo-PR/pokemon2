export interface Dialect {
  readonly name: "sqlite" | "postgres";
  jsonArrayElements(expr: string, alias: string): string;
  jsonContains(column: string, param: string): string;
  fullTextMatch(table: string, query: string): string;
  rank(weights?: Record<string, number>): string;
  upsert(table: string, columns: readonly string[], conflictTarget: readonly string[]): string;
  nowUtc(): string;
  numericOrder(column: string): string;
}
