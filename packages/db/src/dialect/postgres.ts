import type { Dialect } from "./types.js";

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`Postgres dialect feature "${feature}" is not yet implemented (unblocks in S08.T03).`);
    this.name = "NotImplementedError";
  }
}

export const postgresDialect: Dialect = {
  name: "postgres",

  jsonArrayElements(): string {
    throw new NotImplementedError("jsonArrayElements");
  },

  jsonContains(): string {
    throw new NotImplementedError("jsonContains");
  },

  fullTextMatch(): string {
    throw new NotImplementedError("fullTextMatch");
  },

  rank(): string {
    throw new NotImplementedError("rank");
  },

  upsert(): string {
    throw new NotImplementedError("upsert");
  },

  nowUtc(): string {
    throw new NotImplementedError("nowUtc");
  },

  numericOrder(): string {
    throw new NotImplementedError("numericOrder");
  },
};
