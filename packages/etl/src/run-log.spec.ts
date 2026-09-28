import { describe, it, expect } from "vitest";
import { withTempDbAsync } from "@pokesearch/db/testing";
import {
  startRun,
  finishRun,
  withRun,
  reconcileStaleRuns,
  lastRunPerKind,
  STALE_RUN_MINUTES,
  ConcurrentRunError,
} from "./run-log.js";

type RunRow = {
  status: string;
  finished_at: string | null;
  stats_json: string;
  error: string | null;
};

describe("run-log bookkeeping", () => {
  it("withRun inserts status='running', finishes with status='ok' and duration counter (BR-S02.T01-01)", async () => {
    await withTempDbAsync(async ({ db }) => {
      let capturedId = -1;

      const result = await withRun(db, "full", async (run) => {
        capturedId = run.id;
        expect(run.kind).toBe("full");
        expect(run.startedAt).toBeDefined();

        // While running, verify row status in database
        const row = db.get<RunRow>(
          "SELECT status, finished_at FROM etl_runs WHERE id = ?",
          [run.id]
        );
        expect(row?.status).toBe("running");
        expect(row?.finished_at).toBeNull();

        run.add({ sets: 10, cards: 500 });
        return "success-result";
      });

      expect(result).toBe("success-result");

      // Verify row updated to ok with stats and finished_at
      const row = db.get<RunRow>(
        "SELECT status, finished_at, stats_json, error FROM etl_runs WHERE id = ?",
        [capturedId]
      );
      expect(row?.status).toBe("ok");
      expect(row?.finished_at).not.toBeNull();
      expect(row?.error).toBeNull();

      const stats = JSON.parse(row!.stats_json);
      expect(stats.sets).toBe(10);
      expect(stats.cards).toBe(500);
      expect(typeof stats.duration_ms).toBe("number");
      expect(stats.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  it("withRun records status='error', error message, and retains partial counters (BR-S02.T01-02)", async () => {
    await withTempDbAsync(async ({ db }) => {
      let capturedId = -1;

      await expect(
        withRun(db, "delta", async (run) => {
          capturedId = run.id;
          run.add({ sets: 5, cards: 120 });
          throw new Error("Network timeout during fetch");
        })
      ).rejects.toThrow("Network timeout during fetch");

      const row = db.get<RunRow>(
        "SELECT status, finished_at, stats_json, error FROM etl_runs WHERE id = ?",
        [capturedId]
      );
      expect(row?.status).toBe("error");
      expect(row?.finished_at).not.toBeNull();
      expect(row?.error).toContain("Network timeout during fetch");

      const stats = JSON.parse(row!.stats_json);
      expect(stats.sets).toBe(5);
      expect(stats.cards).toBe(120);
      expect(typeof stats.duration_ms).toBe("number");
      // Must never store empty "{}" when counters exist
      expect(row?.stats_json).not.toBe("{}");
    });
  });

  it("RunHandle.add throws TypeError when given nested objects or non-scalar values", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "prices");
      try {
        expect(() => {
          // @ts-expect-error deliberately passes a nested object to exercise the runtime scalar validation
          run.add({ nested: { a: 1 } });
        }).toThrow(TypeError);

        expect(() => {
          // @ts-expect-error deliberately passes an array to exercise the runtime scalar validation
          run.add({ list: [1, 2, 3] });
        }).toThrow(TypeError);

        // Valid primitives should succeed
        expect(() => {
          run.add({ price_rows: 1500, label: "usd" });
        }).not.toThrow();

        expect(run.getStats()).toMatchObject({ price_rows: 1500, label: "usd" });
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("starting a second run of the same kind throws ConcurrentRunError (BR-S02.T01-05)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run1 = startRun(db, "full");
      try {
        expect(() => startRun(db, "full")).toThrow(ConcurrentRunError);

        try {
          startRun(db, "full");
        } catch (err) {
          expect(err).toBeInstanceOf(ConcurrentRunError);
          const cre = err as ConcurrentRunError;
          expect(cre.activeRunId).toBe(run1.id);
          expect(cre.startedAt).toBe(run1.startedAt);
        }
      } finally {
        finishRun(db, run1, {});
      }
    });
  });

  it("starting runs of different kinds succeeds concurrently", async () => {
    await withTempDbAsync(async ({ db }) => {
      const runDecks = startRun(db, "decks");
      const runPrices = startRun(db, "prices");

      try {
        expect(runDecks.id).not.toBe(runPrices.id);
        expect(runDecks.kind).toBe("decks");
        expect(runPrices.kind).toBe("prices");
      } finally {
        finishRun(db, runDecks, {});
        finishRun(db, runPrices, {});
      }
    });
  });

  it("reconcileStaleRuns updates rows older than STALE_RUN_MINUTES to status='cancelled' (BR-S02.T01-06)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const now = Date.now();
      const oldStartedAt = new Date(now - (STALE_RUN_MINUTES + 10) * 60 * 1000).toISOString();
      const recentStartedAt = new Date(now - 10 * 60 * 1000).toISOString();

      // Seed an old stale running row
      db.run(
        "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}')",
        ["full", oldStartedAt]
      );
      const staleId = Number(db.get<{ id: number }>("SELECT last_insert_rowid() AS id")!.id);

      // Seed a recent active running row
      db.run(
        "INSERT INTO etl_runs (kind, started_at, status, stats_json) VALUES (?, ?, 'running', '{}')",
        ["delta", recentStartedAt]
      );
      const recentId = Number(db.get<{ id: number }>("SELECT last_insert_rowid() AS id")!.id);

      const reconciledCount = reconcileStaleRuns(db, STALE_RUN_MINUTES);
      expect(reconciledCount).toBe(1);

      // Stale row must be cancelled with finished_at set
      const staleRow = db.get<RunRow>(
        "SELECT status, finished_at FROM etl_runs WHERE id = ?",
        [staleId]
      );
      expect(staleRow?.status).toBe("cancelled");
      expect(staleRow?.finished_at).not.toBeNull();

      // Recent row must remain running
      const recentRow = db.get<RunRow>(
        "SELECT status, finished_at FROM etl_runs WHERE id = ?",
        [recentId]
      );
      expect(recentRow?.status).toBe("running");
      expect(recentRow?.finished_at).toBeNull();
    });
  });

  it("lastRunPerKind returns latest record for each distinct kind or filtered kind", async () => {
    await withTempDbAsync(async ({ db }) => {
      // Empty initially
      expect(lastRunPerKind(db)).toEqual([]);

      // Insert multiple runs across kinds
      const t1 = "2026-01-01T10:00:00.000Z";
      const t2 = "2026-01-01T11:00:00.000Z";
      const t3 = "2026-01-01T12:00:00.000Z";

      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('full', ?, ?, 'ok', '{}')",
        [t1, t1]
      );
      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('full', ?, ?, 'ok', '{}')",
        [t2, t2]
      );
      db.run(
        "INSERT INTO etl_runs (kind, started_at, finished_at, status, stats_json) VALUES ('delta', ?, ?, 'ok', '{}')",
        [t3, t3]
      );

      const allLatest = lastRunPerKind(db);
      expect(allLatest).toHaveLength(2);
      const fullLatest = allLatest.find((r) => r.kind === "full");
      const deltaLatest = allLatest.find((r) => r.kind === "delta");

      expect(fullLatest?.started_at).toBe(t2);
      expect(deltaLatest?.started_at).toBe(t3);

      // Filtered by specific kind
      const filteredFull = lastRunPerKind(db, "full");
      expect(filteredFull).toHaveLength(1);
      expect(filteredFull[0]?.started_at).toBe(t2);
    });
  });
});
