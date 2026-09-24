import { z } from "zod";

export const scenarioSourceSchema = z
  .object({
    kind: z.enum(["legacy_test", "rulebook", "manual"]).describe("Origin category of the test scenario"),
    ref: z.string().describe("Reference identifier or path from legacy test or manual case"),
  })
  .strict()
  .describe("Source provenance of the scenario");

export type ScenarioSource = z.infer<typeof scenarioSourceSchema>;

export const scenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/).describe("Stable id, also the file name under engine/scenarios/"),
    title: z.string().min(1).describe("Human-readable title describing the scenario"),
    source: scenarioSourceSchema.describe("Provenance information of scenario origin"),
    setup: z.object({}).strict().describe("Board setup specification (refined in S04.T13)"),
    steps: z.array(z.never()).describe("Sequence of actions executed in scenario (refined in S04.T13)"),
    expect: z.array(z.never()).describe("Assertions verified at the end of scenario (refined in S04.T13)"),
  })
  .strict()
  .describe("Deterministic scenario specification for the engine (refined in S04.T13)");

export type Scenario = z.infer<typeof scenarioSchema>;

export const scenarioSample: Scenario = {
  id: "scenario-001",
  title: "Basic Turn Setup",
  source: {
    kind: "manual",
    ref: "rulebook-2024-p12",
  },
  setup: {},
  steps: [],
  expect: [],
};
