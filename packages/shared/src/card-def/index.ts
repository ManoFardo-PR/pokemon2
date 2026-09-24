import { z } from "zod";

export const cardDefSchema = z
  .object({
    id: z.string().min(1).describe("Canonical card identifier, e.g. sv1-189"),
    name: z.string().min(1).describe("Card name as recognized by engine"),
    supertype: z.enum(["Pokémon", "Trainer", "Energy"]).describe("Primary card supertype"),
    subtypes: z.array(z.string()).describe("List of subtypes, e.g. Basic, Item, Supporter"),
    rules: z.array(z.string()).describe("Card rules and effect text definitions"),
  })
  .strict()
  .describe("Card definition derived from card database for engine use (refined in S04.T02)");

export type CardDef = z.infer<typeof cardDefSchema>;

export const cardDefSample: CardDef = {
  id: "sv1-189",
  name: "Professor's Research",
  supertype: "Trainer",
  subtypes: ["Supporter"],
  rules: ["Discard your hand and draw 7 cards."],
};
