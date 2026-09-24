import { z } from "zod";

export const searchQuerySchema = z
  .object({
    text: z.string().trim().min(1).max(200).optional().describe("Free-text query; FTS5 in S02.T08"),
    page: z.number().int().min(1).default(1).describe("1-based page index"),
    pageSize: z.number().int().min(1).max(200).default(60).describe("Cards per page, up to 200"),
    sort: z
      .enum(["relevance", "name", "number", "release", "price"])
      .default("relevance")
      .describe("Sort order for search results"),
  })
  .strict()
  .describe("Search query parameters placeholder (refined in S02.T09)");

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchQuerySample: SearchQuery = {
  text: "Charizard",
  page: 1,
  pageSize: 60,
  sort: "relevance",
};
