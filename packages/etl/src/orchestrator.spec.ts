import { describe, it, expect, vi } from "vitest";
import { withTempDbAsync } from "@pokesearch/db/testing";
import {
  runLoad,
  NotImplementedError,
  defaultStepRegistry,
  createFetchPtcgStep,
  type FetchPtcgFn,
} from "./orchestrator.js";
import type { FetchAllOptions } from "./fetch-ptcg.js";
import { startRun, finishRun } from "./run-log.js";

describe("pipeline orchestrator", () => {
  it("invokes steps in exact order: fetch-ptcg -> fetch-tcgdex -> map-ids -> load-cards -> rebuild-fts -> snapshot-prices (BR-S02.T01-04)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        const executedOrder: string[] = [];

        const mockRegistry = {
          fetchPtcg: {
            name: "fetch-ptcg",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-ptcg");
            }),
          },
          fetchTcgdex: {
            name: "fetch-tcgdex",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-tcgdex");
            }),
          },
          mapIds: {
            name: "map-ids",
            execute: vi.fn(async () => {
              executedOrder.push("map-ids");
            }),
          },
          loadCards: {
            name: "load-cards",
            execute: vi.fn(async () => {
              executedOrder.push("load-cards");
            }),
          },
          rebuildFts: {
            name: "rebuild-fts",
            execute: vi.fn(async () => {
              executedOrder.push("rebuild-fts");
            }),
          },
          snapshotPrices: {
            name: "snapshot-prices",
            execute: vi.fn(async () => {
              executedOrder.push("snapshot-prices");
            }),
          },
        };

        await runLoad(db, run, {}, mockRegistry);

        expect(executedOrder).toEqual([
          "fetch-ptcg",
          "fetch-tcgdex",
          "map-ids",
          "load-cards",
          "rebuild-fts",
          "snapshot-prices",
        ]);
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("skips fetch-tcgdex and snapshot-prices when skipTcgdex is true (BR-S02.T01-04)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        const executedOrder: string[] = [];

        const mockRegistry = {
          fetchPtcg: {
            name: "fetch-ptcg",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-ptcg");
            }),
          },
          fetchTcgdex: {
            name: "fetch-tcgdex",
            execute: vi.fn(async () => {
              executedOrder.push("fetch-tcgdex");
            }),
          },
          mapIds: {
            name: "map-ids",
            execute: vi.fn(async () => {
              executedOrder.push("map-ids");
            }),
          },
          loadCards: {
            name: "load-cards",
            execute: vi.fn(async () => {
              executedOrder.push("load-cards");
            }),
          },
          rebuildFts: {
            name: "rebuild-fts",
            execute: vi.fn(async () => {
              executedOrder.push("rebuild-fts");
            }),
          },
          snapshotPrices: {
            name: "snapshot-prices",
            execute: vi.fn(async () => {
              executedOrder.push("snapshot-prices");
            }),
          },
        };

        await runLoad(db, run, { skipTcgdex: true }, mockRegistry);

        expect(executedOrder).toEqual([
          "fetch-ptcg",
          "map-ids",
          "load-cards",
          "rebuild-fts",
        ]);
        expect(mockRegistry.fetchTcgdex.execute).not.toHaveBeenCalled();
        expect(mockRegistry.snapshotPrices.execute).not.toHaveBeenCalled();
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("throws NotImplementedError when a default stub step is invoked", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        // fetch-ptcg is real now; keep it off the network and let fetch-tcgdex (still a stub) throw.
        const registry = {
          ...defaultStepRegistry,
          fetchPtcg: { name: "fetch-ptcg", execute: vi.fn(async () => undefined) },
        };
        await expect(runLoad(db, run, {}, registry)).rejects.toThrow(NotImplementedError);
        expect(registry.fetchPtcg.execute).toHaveBeenCalledTimes(1);
      } finally {
        finishRun(db, run, {});
      }
    });
  });

  it("fetch-ptcg step passes the CLI options to fetchAll and records the agreed counters (S02.T02 step 7)", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        const seen: FetchAllOptions[] = [];
        const fake: FetchPtcgFn = async (opts) => {
          seen.push(opts ?? {});
          return {
            sets: [{ id: "sv1", name: "A" }, { id: "sv2", name: "B" }, { id: "sv3", name: "C" }],
            changedSetIds: ["sv1"],
            missingCardFiles: ["sv2"],
            requests: 3,
            notModified: 1,
            bytes: 1234,
          };
        };

        await runLoad(
          db,
          run,
          { sets: ["sv1", "sv2"], force: true, skipTcgdex: true, ptcgBaseUrl: "http://127.0.0.1:1", backoffMs: [0, 0, 0] },
          {
            fetchPtcg: createFetchPtcgStep(fake),
            mapIds: { name: "map-ids", execute: vi.fn(async () => undefined) },
            loadCards: { name: "load-cards", execute: vi.fn(async () => undefined) },
            rebuildFts: { name: "rebuild-fts", execute: vi.fn(async () => undefined) },
          }
        );

        expect(seen).toEqual([
          { baseUrl: "http://127.0.0.1:1", force: true, onlySets: ["sv1", "sv2"], backoffMs: [0, 0, 0] },
        ]);
        expect(run.getStats()).toEqual({
          http_requests: 3,
          http_304: 1,
          sets: 2,
          sets_changed: 1,
          missing_card_files: "sv2",
          bytes_downloaded: 1234,
        });
      } finally {
        finishRun(db, run, {});
      }
    });
  });
});
