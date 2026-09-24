import { z } from "zod";

// Closed vocabulary, empty on purpose (S05.T03 fills it; RN-61)
export const effectIrSchema = z
  .object({
    ir: z.literal("v0").describe("IR format version tag"),
    ops: z.array(z.never()).describe("Adding an op is a deliberate act (S05.T03)"),
  })
  .strict()
  .describe("Effect intermediate representation placeholder (refined in S05.T03)");

export type EffectIr = z.infer<typeof effectIrSchema>;

export const effectIrSample: EffectIr = {
  ir: "v0",
  ops: [],
};
