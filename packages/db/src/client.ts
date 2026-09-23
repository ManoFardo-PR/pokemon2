import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import pathModule from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";

export class TestDbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDbError";
  }
}

const esmRequire = createRequire(import.meta.url);
const nodeSqlite = esmRequire("node:sqlite") as {
  DatabaseSync: new (
    location: string,
    options?: {
      readOnly?: boolean;
      enableForeignKeyConstraints?: boolean;
      timeout?: number;
      open?: boolean;
    }
  ) => DatabaseSync;
};
const { DatabaseSync: NodeDatabaseSync } = nodeSqlite;

export type SqlValue = null | number | bigint | string | Uint8Array;
export type Params = readonly SqlValue[] | Readonly<Record<string, SqlValue>>;

export interface OpenOptions {
  readonly?: boolean;                        // default false
  create?: boolean;                          // default true (ignored when readonly)
  busyTimeoutMs?: number;                    // default 5000
  synchronous?: "OFF" | "NORMAL" | "FULL";   // default "NORMAL"
  statementCacheSize?: number;               // default 200
}

export interface Db {
  readonly path: string;
  readonly isReadonly: boolean;
  run(sql: string, params?: Params): { changes: number; lastInsertRowid: number | bigint };
  get<T>(sql: string, params?: Params): T | undefined;
  all<T>(sql: string, params?: Params): T[];
  iterate<T>(sql: string, params?: Params): IterableIterator<T>;
  exec(sql: string): void;
  transaction<T>(fn: (tx: Db) => T, mode?: "deferred" | "immediate"): T;
  pragma<T = SqlValue>(name: string, value?: SqlValue): T;
  sqliteVersion(): string;
  close(): void;
}

export const BATCH_ROWS = 1000;

export class DbError extends Error {
  readonly code?: string | undefined;
  readonly sql?: string | undefined;
  readonly params?: Params | undefined;

  constructor(
    message: string,
    options?: {
      code?: string | undefined;
      sql?: string | undefined;
      params?: Params | undefined;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "DbError";
    this.code = options?.code;
    this.sql = options?.sql;
    this.params = options?.params;
  }
}

class LruStatementCache {
  private readonly maxSize: number;
  private readonly cache = new Map<string, StatementSync>();

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize;
  }

  get(sql: string): StatementSync | undefined {
    const stmt = this.cache.get(sql);
    if (stmt) {
      this.cache.delete(sql);
      this.cache.set(sql, stmt);
    }
    return stmt;
  }

  set(sql: string, stmt: StatementSync): void {
    if (this.cache.has(sql)) {
      this.cache.delete(sql);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(sql, stmt);
  }

  clear(): void {
    this.cache.clear();
  }
}

const SQLiteErrorMap: Record<number, string> = {
  1: "SQLITE_ERROR",
  2: "SQLITE_INTERNAL",
  3: "SQLITE_PERM",
  4: "SQLITE_ABORT",
  5: "SQLITE_BUSY",
  6: "SQLITE_LOCKED",
  7: "SQLITE_NOMEM",
  8: "SQLITE_READONLY",
  9: "SQLITE_INTERRUPT",
  10: "SQLITE_IOERR",
  11: "SQLITE_CORRUPT",
  12: "SQLITE_NOTFOUND",
  13: "SQLITE_FULL",
  14: "SQLITE_CANTOPEN",
  15: "SQLITE_PROTOCOL",
  16: "SQLITE_EMPTY",
  17: "SQLITE_SCHEMA",
  18: "SQLITE_TOOBIG",
  19: "SQLITE_CONSTRAINT",
  20: "SQLITE_MISMATCH",
  21: "SQLITE_MISUSE",
  22: "SQLITE_NOLFS",
  23: "SQLITE_AUTH",
  24: "SQLITE_FORMAT",
  25: "SQLITE_RANGE",
  26: "SQLITE_NOTADB",
  27: "SQLITE_NOTICE",
  28: "SQLITE_WARNING",
};

class DatabaseAdapter implements Db {
  readonly path: string;
  readonly isReadonly: boolean;
  private readonly rawDb: DatabaseSync;
  private readonly stmtCache: LruStatementCache;
  private savepointDepth = 0;
  private isClosed = false;

  constructor(path: string, rawDb: DatabaseSync, isReadonly: boolean, cacheSize: number) {
    this.path = path;
    this.rawDb = rawDb;
    this.isReadonly = isReadonly;
    this.stmtCache = new LruStatementCache(cacheSize);
  }

  private wrapError(err: unknown, sql?: string, params?: Params): DbError {
    if (err instanceof DbError) {
      return err;
    }
    const message = err instanceof Error ? err.message : String(err);
    const errcode = (err as { errcode?: number }).errcode;
    let code = (err as { code?: string }).code;

    if (errcode !== undefined) {
      const SQLiteErrorMap: Record<number, string> = {
        1: "SQLITE_ERROR",
        2: "SQLITE_INTERNAL",
        3: "SQLITE_PERM",
        4: "SQLITE_ABORT",
        5: "SQLITE_BUSY",
        6: "SQLITE_LOCKED",
        7: "SQLITE_NOMEM",
        8: "SQLITE_READONLY",
        9: "SQLITE_INTERRUPT",
        10: "SQLITE_IOERR",
        11: "SQLITE_CORRUPT",
        12: "SQLITE_NOTFOUND",
        13: "SQLITE_FULL",
        14: "SQLITE_CANTOPEN",
        15: "SQLITE_PROTOCOL",
        16: "SQLITE_EMPTY",
        17: "SQLITE_SCHEMA",
        18: "SQLITE_TOOBIG",
        19: "SQLITE_CONSTRAINT",
        20: "SQLITE_MISMATCH",
        21: "SQLITE_MISUSE",
        22: "SQLITE_NOLFS",
        23: "SQLITE_AUTH",
        24: "SQLITE_FORMAT",
        25: "SQLITE_RANGE",
        26: "SQLITE_NOTADB",
        27: "SQLITE_NOTICE",
        28: "SQLITE_WARNING",
      };
      const primaryCode = errcode & 0xff;
      code = SQLiteErrorMap[primaryCode] ?? `SQLITE_${primaryCode}`;
    } else if (!code || code === "ERR_SQLITE_ERROR") {
      code = message.match(/SQLITE_[A-Z0-9_]+/)?.[0] ?? "SQLITE_ERROR";
    }

    return new DbError(message, { code, sql, params, cause: err });
  }

  private getStatement(sql: string): StatementSync {
    let stmt = this.stmtCache.get(sql);
    if (!stmt) {
      try {
        stmt = this.rawDb.prepare(sql);
        this.stmtCache.set(sql, stmt);
      } catch (err) {
        throw this.wrapError(err, sql);
      }
    }
    return stmt;
  }

  run(sql: string, params?: Params): { changes: number; lastInsertRowid: number | bigint } {
    try {
      const stmt = this.getStatement(sql);
      const res = params ? (Array.isArray(params) ? stmt.run(...params) : stmt.run(params)) : stmt.run();
      return {
        changes: Number(res.changes),
        lastInsertRowid: res.lastInsertRowid,
      };
    } catch (err) {
      throw this.wrapError(err, sql, params);
    }
  }

  get<T>(sql: string, params?: Params): T | undefined {
    try {
      const stmt = this.getStatement(sql);
      const row = params ? (Array.isArray(params) ? stmt.get(...params) : stmt.get(params)) : stmt.get();
      return (row as T) ?? undefined;
    } catch (err) {
      throw this.wrapError(err, sql, params);
    }
  }

  all<T>(sql: string, params?: Params): T[] {
    try {
      const stmt = this.getStatement(sql);
      const rows = params ? (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) : stmt.all();
      return (rows as T[]) ?? [];
    } catch (err) {
      throw this.wrapError(err, sql, params);
    }
  }

  iterate<T>(sql: string, params?: Params): IterableIterator<T> {
    try {
      const stmt = this.getStatement(sql);
      const iter = params ? (Array.isArray(params) ? stmt.iterate(...params) : stmt.iterate(params)) : stmt.iterate();
      return iter as IterableIterator<T>;
    } catch (err) {
      throw this.wrapError(err, sql, params);
    }
  }

  exec(sql: string): void {
    try {
      this.rawDb.exec(sql);
    } catch (err) {
      throw this.wrapError(err, sql);
    }
  }

  transaction<T>(fn: (tx: Db) => T, mode: "deferred" | "immediate" = "immediate"): T {
    const isTopLevel = this.savepointDepth === 0;
    this.savepointDepth++;

    if (isTopLevel) {
      const beginSql = mode === "immediate" ? "BEGIN IMMEDIATE;" : "BEGIN DEFERRED;";
      try {
        this.rawDb.exec(beginSql);
      } catch (err) {
        this.savepointDepth--;
        throw this.wrapError(err, beginSql);
      }

      try {
        const result = fn(this);
        this.rawDb.exec("COMMIT;");
        return result;
      } catch (err) {
        try {
          this.rawDb.exec("ROLLBACK;");
        } catch {
          // Ignore rollback error if already rolled back
        }
        throw err;
      } finally {
        this.savepointDepth = 0;
      }
    } else {
      const spName = `sp_${this.savepointDepth}`;
      const savepointSql = `SAVEPOINT ${spName};`;
      try {
        this.rawDb.exec(savepointSql);
      } catch (err) {
        this.savepointDepth--;
        throw this.wrapError(err, savepointSql);
      }

      try {
        const result = fn(this);
        this.rawDb.exec(`RELEASE SAVEPOINT ${spName};`);
        return result;
      } catch (err) {
        try {
          this.rawDb.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
          this.rawDb.exec(`RELEASE SAVEPOINT ${spName};`);
        } catch {
          // Ignore release/rollback errors on failure
        }
        throw err;
      } finally {
        this.savepointDepth--;
      }
    }
  }

  pragma<T = SqlValue>(name: string, value?: SqlValue): T {
    try {
      if (value !== undefined) {
        const valStr = typeof value === "string" ? `'${value}'` : String(value);
        this.rawDb.exec(`PRAGMA ${name} = ${valStr};`);
      }
      const stmt = this.rawDb.prepare(`PRAGMA ${name};`);
      const row = stmt.get() as Record<string, unknown> | undefined;
      if (!row) {
        return undefined as T;
      }
      const firstVal = Object.values(row)[0];
      return firstVal as T;
    } catch (err) {
      throw this.wrapError(err, `PRAGMA ${name}`);
    }
  }

  sqliteVersion(): string {
    const row = this.get<{ v: string }>("SELECT sqlite_version() as v;");
    return row?.v ?? "";
  }

  close(): void {
    if (this.isClosed) return;
    if (this.savepointDepth > 0) {
      try {
        this.rawDb.exec("ROLLBACK;");
      } catch {
        // Ignore error on abortive rollback during close
      }
      this.savepointDepth = 0;
    }
    this.stmtCache.clear();
    this.rawDb.close();
    this.isClosed = true;
  }
}

export function openDatabase(path: string, opts?: OpenOptions): Db {
  if (process.env.NODE_ENV === "test") {
    const envDbPath = process.env.DATABASE_PATH;
    const defaultRealDbPath = pathModule.resolve(process.cwd(), "pokesearch.db");
    const normalizedTarget = pathModule.resolve(path);

    if (envDbPath && normalizedTarget === pathModule.resolve(envDbPath)) {
      throw new TestDbError(
        `[BR-S01.T03-01] Refusing to open real database under NODE_ENV=test (DATABASE_PATH=${path})`
      );
    }
    if (normalizedTarget === defaultRealDbPath || path.endsWith("pokesearch.db")) {
      throw new TestDbError(
        `[BR-S01.T03-01] Refusing to open real database under NODE_ENV=test (${path})`
      );
    }
  }

  const isReadonly = opts?.readonly === true;
  const busyTimeoutMs = opts?.busyTimeoutMs ?? 5000;
  const synchronous = opts?.synchronous ?? "NORMAL";
  const cacheSize = opts?.statementCacheSize ?? 200;

  if (isReadonly && !existsSync(path)) {
    const err = new Error(`Cannot open database at ${path}: file does not exist.`);
    (err as { code?: string }).code = "SQLITE_CANTOPEN";
    throw new DbError(err.message, { code: "SQLITE_CANTOPEN", cause: err });
  }

  let rawDb: DatabaseSync;
  try {
    rawDb = new NodeDatabaseSync(path, {
      readOnly: isReadonly,
      enableForeignKeyConstraints: true,
      timeout: busyTimeoutMs,
    });
  } catch (err) {
    const code = (err as { code?: string }).code ?? "SQLITE_CANTOPEN";
    throw new DbError((err as Error).message, { code, cause: err });
  }

  // Apply required pragmas
  if (!isReadonly) {
    rawDb.exec("PRAGMA journal_mode = WAL;");
    rawDb.exec(`PRAGMA synchronous = ${synchronous};`);
    rawDb.exec("PRAGMA temp_store = MEMORY;");
    rawDb.exec("PRAGMA cache_size = -64000;");
  }
  rawDb.exec("PRAGMA foreign_keys = ON;");
  rawDb.exec(`PRAGMA busy_timeout = ${busyTimeoutMs};`);

  return new DatabaseAdapter(path, rawDb, isReadonly, cacheSize);
}
