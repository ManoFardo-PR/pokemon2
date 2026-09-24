import { z } from "zod";
import { envSchema } from "@pokesearch/shared/env";

export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1";
}

export const apiConfigSchema = envSchema.extend({
  API_HOST: z
    .string()
    .default("127.0.0.1")
    .refine(isLoopback, {
      message: "API must bind to loopback (D-007): only 127.0.0.1 or ::1 allowed",
    }),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  MIGRATE_ON_START: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  CORS_ORIGINS: z
    .union([z.string(), z.array(z.string())])
    .default("http://127.0.0.1:5173,http://localhost:5173")
    .transform((val) => {
      if (Array.isArray(val)) {
        return val.map((o) => o.trim()).filter(Boolean);
      }
      return val
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
    }),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).default(1_000_000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;

export function loadApiConfig(
  input: Record<string, string | undefined> = process.env
): ApiConfig {
  return apiConfigSchema.parse(input);
}
