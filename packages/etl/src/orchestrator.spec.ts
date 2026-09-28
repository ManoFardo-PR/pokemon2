// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { withTempDbAsync } from "@pokesearch/db/testing";
import { runLoad, NotImplementedError, defaultStepRegistry } from "./orchestrator.js";
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

  it("throws NotImplementedError when default stub steps are invoked", async () => {
    await withTempDbAsync(async ({ db }) => {
      const run = startRun(db, "full");
      try {
        await expect(runLoad(db, run, {}, defaultStepRegistry)).rejects.toThrow(
          NotImplementedError
        );
      } finally {
        finishRun(db, run, {});
      }
    });
  });
});
