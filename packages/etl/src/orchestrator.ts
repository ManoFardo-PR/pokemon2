import type { Db } from "@pokesearch/db";
import type { RunHandle } from "./run-log.js";

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

export const defaultStepRegistry: StepRegistry = {
  fetchPtcg: createStubStep("fetch-ptcg"),
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
