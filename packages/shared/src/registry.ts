import type { ZodTypeAny } from "zod";
import { searchQuerySchema, searchQuerySample } from "./search/index.js";
import {
  decklistSchema,
  decklistSample,
  validationReportSchema,
  validationReportSample,
} from "./decklist/index.js";
import { effectIrSchema, effectIrSample } from "./ir/index.js";
import {
  jobRequestSchema,
  jobRequestSample,
  jobEventSchema,
  jobEventSample,
} from "./jobs/index.js";
import { scenarioSchema, scenarioSample } from "./scenario/index.js";
import { cardDefSchema, cardDefSample } from "./card-def/index.js";

export interface ContractEntry {
  name: string;
  file: string;
  schema: ZodTypeAny;
  sample: unknown;
}

export const CONTRACTS: readonly ContractEntry[] = [
  {
    name: "SearchQuery",
    file: "search-query.json",
    schema: searchQuerySchema,
    sample: searchQuerySample,
  },
  {
    name: "Decklist",
    file: "decklist.json",
    schema: decklistSchema,
    sample: decklistSample,
  },
  {
    name: "ValidationReport",
    file: "validation-report.json",
    schema: validationReportSchema,
    sample: validationReportSample,
  },
  {
    name: "EffectIr",
    file: "effect-ir.json",
    schema: effectIrSchema,
    sample: effectIrSample,
  },
  {
    name: "JobRequest",
    file: "job-request.json",
    schema: jobRequestSchema,
    sample: jobRequestSample,
  },
  {
    name: "JobEvent",
    file: "job-event.json",
    schema: jobEventSchema,
    sample: jobEventSample,
  },
  {
    name: "Scenario",
    file: "scenario.json",
    schema: scenarioSchema,
    sample: scenarioSample,
  },
  {
    name: "CardDef",
    file: "card-def.json",
    schema: cardDefSchema,
    sample: cardDefSample,
  },
] as const;
