import type { Db } from "@pokesearch/db";
import type { RunHandle } from "./run-log.js";
import { fetchAll, type FetchAllOptions, type FetchAllResult } from "./fetch-ptcg.js";

export class NotImplementedError extends Error {
  constructor(stepName: string) {
    super(`Step '${stepName}' is not implemented yet.`);
    this.name = "NotImplementedError";
  }
}

export interface LoadOptions {
  sets?: string[] | undefined;
  force?: boolean | undefined;
  skipTcgdex?: boolean | undefined;
  concurrency?: number | undefined;
  verbose?: boolean | undefined;
  /** Developer/test hook: base URL of the pokemon-tcg-data raw files (env PTCG_RAW_BASE). */
  ptcgBaseUrl?: string | undefined;
  /** Developer/test hook: retry backoff in ms per attempt (env PTCG_BACKOFF_MS). */
  backoffMs?: readonly number[] | undefined;
}

export interface PipelineStep {
  name: string;
  execute: (ctx: StepContext) => Promise<void>;
}

export interface StepContext {
  db: Db;
  run: RunHandle;
  options: LoadOptions;
}

export interface StepRegistry {
  fetchPtcg: PipelineStep;
  fetchTcgdex: PipelineStep;
  mapIds: PipelineStep;
  loadCards: PipelineStep;
  rebuildFts: PipelineStep;
  snapshotPrices: PipelineStep;
  [key: string]: PipelineStep;
}

function createStubStep(name: string): PipelineStep {
  return {
    name,
    execute: (): Promise<void> => {
      return Promise.reject(new NotImplementedError(name));
    },
  };
}

export type FetchPtcgFn = (opts?: FetchAllOptions) => Promise<FetchAllResult>;

/**
 * The real `fetch-ptcg` step (S02.T02, implementation step 7): runs `fetchAll` with the
 * CLI options and records the agreed counters in `etl_runs.stats_json`.
 * `fetchImpl` is injectable so the pipeline can be tested without the network.
 */
export function createFetchPtcgStep(fetchImpl: FetchPtcgFn = fetchAll): PipelineStep {
  return {
    name: "fetch-ptcg",
    execute: async ({ run, options }: StepContext): Promise<void> => {
      const result = await fetchImpl({
        baseUrl: options.ptcgBaseUrl,
        force: options.force,
        onlySets: options.sets,
        backoffMs: options.backoffMs,
      });
      const only = options.sets;
      const processed = only ? result.sets.filter((s) => only.includes(s.id)).length : result.sets.length;
      run.add({
        http_requests: result.requests,
        http_304: result.notModified,
        sets: processed,
        sets_changed: result.changedSetIds.length,
        missing_card_files: result.missingCardFiles.join(","),
        bytes_downloaded: result.bytes,
      });
    },
  };
}

export const defaultStepRegistry: StepRegistry = {
  fetchPtcg: createFetchPtcgStep(),
  fetchTcgdex: createStubStep("fetch-tcgdex"),
  mapIds: createStubStep("map-ids"),
  loadCards: createStubStep("load-cards"),
  rebuildFts: createStubStep("rebuild-fts"),
  snapshotPrices: createStubStep("snapshot-prices"),
};

export async function runLoad(
  db: Db,
  run: RunHandle,
  options: LoadOptions,
  registry?: Partial<StepRegistry>
): Promise<void> {
  const steps: PipelineStep[] = [];
  const fetchPtcg = registry?.fetchPtcg ?? defaultStepRegistry.fetchPtcg;
  const fetchTcgdex = registry?.fetchTcgdex ?? defaultStepRegistry.fetchTcgdex;
  const mapIds = registry?.mapIds ?? defaultStepRegistry.mapIds;
  const loadCards = registry?.loadCards ?? defaultStepRegistry.loadCards;
  const rebuildFts = registry?.rebuildFts ?? defaultStepRegistry.rebuildFts;
  const snapshotPrices = registry?.snapshotPrices ?? defaultStepRegistry.snapshotPrices;

  steps.push(fetchPtcg);

  if (!options.skipTcgdex) {
    steps.push(fetchTcgdex);
  }

  steps.push(mapIds);
  steps.push(loadCards);
  steps.push(rebuildFts);

  if (!options.skipTcgdex) {
    steps.push(snapshotPrices);
  }

  const ctx: StepContext = { db, run, options };
  for (const step of steps) {
    await step.execute(ctx);
  }
}
