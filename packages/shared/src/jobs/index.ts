import { z } from "zod";

export const jobRequestSchema = z
  .object({
    contractVersion: z.string().describe("Must share the major with the engine's CONTRACT_VERSION"),
    jobId: z.string().min(1).describe("Unique identifier for this compute job"),
    kind: z.enum(["simulate", "measure", "optimize", "scenarios"]).describe("Kind of job operation to execute"),
    seed0: z.number().int().min(0).describe("Base seed; per-game seeds derive from it (RN-46)"),
    params: z.object({}).strict().describe("Per-kind payload; refined in S04.T12"),
  })
  .strict()
  .describe("Job request payload passed to the simulator engine (refined in S04.T12)");

export type JobRequest = z.infer<typeof jobRequestSchema>;

export const jobRequestSample: JobRequest = {
  contractVersion: "1.0.0",
  jobId: "job_01h7x8w",
  kind: "simulate",
  seed0: 42,
  params: {},
};

export const jobEventProgressSchema = z
  .object({
    type: z.literal("progress").describe("Discriminator tag for progress event"),
    jobId: z.string().describe("Job identifier"),
    done: z.number().int().describe("Number of items completed"),
    total: z.number().int().describe("Total number of items"),
  })
  .strict()
  .describe("Job progress event");

export const jobEventResultSchema = z
  .object({
    type: z.literal("result").describe("Discriminator tag for result event"),
    jobId: z.string().describe("Job identifier"),
    payload: z.object({}).strict().describe("Intermediate or final result payload"),
  })
  .strict()
  .describe("Job result event");

export const jobEventDoneSchema = z
  .object({
    type: z.literal("done").describe("Discriminator tag for done event"),
    jobId: z.string().describe("Job identifier"),
    fingerprint: z.string().describe("SHA-256 over per-game outcomes"),
  })
  .strict()
  .describe("Job completion event");

export const jobEventErrorSchema = z
  .object({
    type: z.literal("error").describe("Discriminator tag for error event"),
    jobId: z.string().describe("Job identifier"),
    code: z.string().describe("Machine-readable error code"),
    message: z.string().describe("Human-readable error explanation"),
  })
  .strict()
  .describe("Job error event");

export const jobEventSchema = z
  .discriminatedUnion("type", [
    jobEventProgressSchema,
    jobEventResultSchema,
    jobEventDoneSchema,
    jobEventErrorSchema,
  ])
  .describe("Stream event emitted by the engine over JSON Lines (refined in S04.T12)");

export type JobEvent = z.infer<typeof jobEventSchema>;

export const jobEventSample: JobEvent = {
  type: "progress",
  jobId: "job_01h7x8w",
  done: 10,
  total: 100,
};
