declare module "node:sqlite" {
  export interface DatabaseSyncOptions {
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    timeout?: number;
    open?: boolean;
    [key: string]: unknown;
  }

  export interface StatementRunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    all(...params: unknown[]): unknown[];
    all(namedParams: Record<string, unknown>): unknown[];
    get(...params: unknown[]): unknown;
    get(namedParams: Record<string, unknown>): unknown;
    run(...params: unknown[]): StatementRunResult;
    run(namedParams: Record<string, unknown>): StatementRunResult;
    iterate(...params: unknown[]): IterableIterator<unknown>;
    iterate(namedParams: Record<string, unknown>): IterableIterator<unknown>;
    sourceURL?: string;
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    [key: string]: unknown;
  }

  export const constants: Record<string, number>;
}
