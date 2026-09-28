import type { Db } from "@pokesearch/db";

export type EtlRunKind = "full" | "delta" | "prices" | "fts" | "decks" | "decks-web" | "seed";

export interface RunHandle {
  readonly id: number;
  readonly kind: EtlRunKind;
  readonly startedAt: string;
  add(patch: Record<string, number | string>): void;
  getStats(): Readonly<Record<string, number | string>>;
}

export interface EtlRunRow {
  id: number;
  kind: EtlRunKind;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error" | "cancelled";
  stats_json: string;
  error: string | null;
}

export class ConcurrentRunError extends Error {
  readonly activeRunId: number;
  readonly startedAt: string;
  constructor(kind: string, activeRunId: number, startedAt: string) {
    super(
      `Another run of kind '${kind}' is currently active (id: ${activeRunId}, started at: ${startedAt}).`
    );
    this.name = "ConcurrentRunError";
    this.activeRunId = activeRunId;
    this.startedAt = startedAt;
  }
}

export const STALE_RUN_MINUTES = 240;

if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
  try {
    const testing = await import("@pokesearch/db/testing");
    if (
      typeof (testing as { getRegisteredSchemaInitializer?: () => unknown }).getRegisteredSchemaInitializer === "function" &&
      !(testing as { getRegisteredSchemaInitializer: () => unknown }).getRegisteredSchemaInitializer()
    ) {
      const { migrate } = await import("@pokesearch/db/migrate");
      (
        testing as {
          registerSchemaInitializer: (init: { key: string; apply: (testDb: Db) => void }) => void;
        }
      ).registerSchemaInitializer({
        key: "etl_runs",
        apply: (testDb: Db) => {
          migrate(testDb);
        },
      });
    }
  } catch {
    // Ignore in non-test setups
  }
}

export function startRun(db: Db, kind: EtlRunKind): RunHandle {
  return db.transaction((tx) => {
    const active = tx.get<{ id: number; started_at: string }>(
      "SELECT id, started_at FROM etl_runs WHERE kind = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1",
      [kind]
    );

    if (active) {
      const activeStartedTime = new Date(active.started_at).getTime();
      const elapsedMs = Date.now() - activeStartedTime;
      if (elapsedMs < STALE_RUN_MINUTES * 60 * 1000) {
        throw new ConcurrentRunError(kind, active.id, active.started_at);
      }
    }

    const startedAt = new Date().toISOString();
    const result = tx.run(
      "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}')",
      [kind, startedAt]
    );
    const id = Number(result.lastInsertRowid);

    const stats: Record<string, number | string> = {};

    const handle: RunHandle = {
      id,
      kind,
      startedAt,
      add(patch: Record<string, number | string>): void {
        for (const [k, v] of Object.entries(patch)) {
          if (typeof v !== "number" && typeof v !== "string") {
            throw new TypeError(`Run stat value for '${k}' must be number or string`);
          }
          stats[k] = v;
        }
      },
      getStats(): Readonly<Record<string, number | string>> {
        return { ...stats };
      },
    };

    return handle;
  }, "immediate");
}

export function finishRun(db: Db, run: RunHandle, outcome: { error?: unknown }): void {
  const finishedAt = new Date().toISOString();
  const startTime = new Date(run.startedAt).getTime();
  const durationMs = Math.max(0, Date.now() - startTime);

  const stats = {
    ...run.getStats(),
    duration_ms: durationMs,
  };
  const statsJson = JSON.stringify(stats);

  if (outcome.error !== undefined) {
    const err = outcome.error;
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
            ? err.message
            : JSON.stringify(err);

    db.run(
      "UPDATE etl_runs SET status = 'error', finished_at = ?, stats_json = ?, error = ? WHERE id = ?",
      [finishedAt, statsJson, errorMessage, run.id]
    );
  } else {
    db.run(
      "UPDATE etl_runs SET status = 'ok', finished_at = ?, stats_json = ?, error = NULL WHERE id = ?",
      [finishedAt, statsJson, run.id]
    );
  }
}

export async function withRun<T>(
  db: Db,
  kind: EtlRunKind,
  fn: (run: RunHandle) => Promise<T>
): Promise<T> {
  const run = startRun(db, kind);
  try {
    const result = await fn(run);
    finishRun(db, run, {});
    return result;
  } catch (error) {
    finishRun(db, run, { error });
    throw error;
  }
}

export function reconcileStaleRuns(db: Db, staleMinutes: number = STALE_RUN_MINUTES): number {
  const threshold = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  const finishedAt = new Date().toISOString();

  const result = db.run(
    "UPDATE etl_runs SET status = 'cancelled', finished_at = ? WHERE status = 'running' AND started_at <= ?",
    [finishedAt, threshold]
  );
  return result.changes;
}

export function lastRunPerKind(db: Db, kind?: EtlRunKind): EtlRunRow[] {
  if (kind) {
    return db.all<EtlRunRow>(
      "SELECT * FROM etl_runs WHERE kind = ? ORDER BY started_at DESC LIMIT 1",
      [kind]
    );
  }
  return db.all<EtlRunRow>(
    "SELECT * FROM etl_runs WHERE id IN (SELECT MAX(id) FROM etl_runs GROUP BY kind) ORDER BY kind ASC"
  );
}
