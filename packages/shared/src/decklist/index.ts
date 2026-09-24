import { z } from "zod";

export const decklistLineSchema = z
  .object({
    count: z.number().int().min(1).max(60).describe("Copies of this printing"),
    name: z.string().min(1).describe("Card name as printed in the TCG Live export"),
    setCode: z.string().min(1).max(8).optional().describe("PTCGO/PTCGL set code, e.g. TWM"),
    number: z.string().min(1).max(8).optional().describe("Collector number as printed"),
    cardId: z.string().min(1).nullable().default(null).describe("Resolved cards.id, null when unresolved (RN-02)"),
  })
  .strict()
  .describe("Single decklist line entry");

export type DecklistLine = z.infer<typeof decklistLineSchema>;

export const decklistSchema = z
  .object({
    format: z.literal("standard").describe("Deck format constraint, currently standard"),
    lines: z.array(decklistLineSchema).max(120).describe("Decklist lines, up to 120 unique printings"),
    source: z.enum(["paste", "tournament", "builder"]).default("paste").describe("Source origin of the decklist"),
  })
  .strict()
  .describe("TCG Live decklist representation (refined in S03.T09)");

export type Decklist = z.infer<typeof decklistSchema>;

export const decklistSample: Decklist = {
  format: "standard",
  lines: [
    {
      count: 4,
      name: "Professor's Research",
      setCode: "SVI",
      number: "189",
      cardId: "sv1-189",
    },
  ],
  source: "paste",
};

export const validationIssueSchema = z
  .object({
    severity: z.enum(["error", "warning"]).describe("Issue severity level"),
    code: z.string().describe("Stable machine code, e.g. 'not_60_cards'"),
    message: z.string().describe("English; pt-BR copy comes from the web strings module"),
    line: z.number().int().min(0).optional().describe("Line index associated with issue if applicable"),
  })
  .strict()
  .describe("Individual deck validation issue");

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationReportSchema = z
  .object({
    ok: z.boolean().describe("False when any issue has severity 'error'"),
    total: z.number().int().min(0).describe("Sum of line counts; 60 for a legal deck (RN-10)"),
    issues: z.array(validationIssueSchema).describe("List of validation errors and warnings"),
  })
  .strict()
  .describe("Deck validation report (refined in S03.T10)");

export type ValidationReport = z.infer<typeof validationReportSchema>;

export const validationReportSample: ValidationReport = {
  ok: true,
  total: 60,
  issues: [],
};
