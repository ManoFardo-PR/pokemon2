import React from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, queryKeys, ApiError } from "./client.js";

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  sqliteVersion: z.string().optional(),
  databasePath: z.string().optional(),
  schemaVersion: z.number().optional(),
  counts: z
    .object({
      sets: z.number(),
      cards: z.number(),
      decks: z.number(),
    })
    .optional(),
});

export const versionResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  contractVersion: z.string(),
  schemaVersion: z.number(),
  node: z.string(),
  commit: z.string().nullable(),
  engineBuild: z.string().nullable(),
});

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiFetch("/health", { schema: healthResponseSchema }),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useVersion() {
  return useQuery({
    queryKey: queryKeys.version,
    queryFn: () => apiFetch("/api/version", { schema: versionResponseSchema }),
    staleTime: Infinity,
    retry: 1,
  });
}
