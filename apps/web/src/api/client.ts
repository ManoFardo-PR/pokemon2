import { z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { path: string; message: string }[] | undefined;
  readonly requestId?: string | undefined;

  constructor(
    message: string,
    options: {
      status: number;
      code: string;
      details?: { path: string; message: string }[] | undefined;
      requestId?: string | undefined;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

export class ApiSchemaError extends Error {
  readonly issues: z.ZodIssue[];
  readonly path: string;

  constructor(path: string, issues: z.ZodIssue[]) {
    super(`Schema validation failed for response from ${path}`);
    this.name = "ApiSchemaError";
    this.path = path;
    this.issues = issues;
  }
}

export interface ApiFetchOptions<T> {
  schema: z.ZodType<T>;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  search?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: `/${string}`, opts: ApiFetchOptions<T>): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error(`apiFetch requires a relative path starting with '/', got: ${path}`);
  }

  let url = path;
  if (opts.search) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.search)) {
      if (value !== undefined) {
        params.append(key, String(value));
      }
    }
    const queryString = params.toString();
    if (queryString.length > 0) {
      url += `?${queryString}`;
    }
  }

  const signal = opts.signal ?? AbortSignal.timeout(15_000);
  const headers = new Headers({
    Accept: "application/json",
  });
  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const fetchInit: RequestInit = {
    method: opts.method ?? "GET",
    headers,
    signal,
  };
  if (opts.body !== undefined) {
    fetchInit.body = JSON.stringify(opts.body);
  }

  let response: Response;
  try {
    response = await fetch(url, fetchInit);
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "Network error", {
      status: 0,
      code: "network_error",
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(`HTTP ${response.status}`, {
        status: response.status,
        code: "invalid_response",
      });
    }
    throw new ApiError("Failed to parse JSON response", {
      status: response.status,
      code: "invalid_response",
    });
  }

  if (!response.ok) {
    if (
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as { error: unknown }).error === "object" &&
      (json as { error: { code?: unknown } }).error !== null
    ) {
      const errPayload = (
        json as {
          error: {
            code?: string;
            message?: string;
            details?: { path: string; message: string }[];
            requestId?: string;
          };
        }
      ).error;

      throw new ApiError(errPayload.message ?? `HTTP ${response.status}`, {
        status: response.status,
        code: errPayload.code ?? "unknown_error",
        details: errPayload.details,
        requestId: errPayload.requestId,
      });
    }

    throw new ApiError(`HTTP ${response.status}`, {
      status: response.status,
      code: "invalid_response",
    });
  }

  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiSchemaError(path, parsed.error.issues);
  }

  return parsed.data;
}

export const queryKeys = {
  health: ["health"] as const,
  version: ["version"] as const,
  cards: (q: unknown) => ["cards", q] as const,
};
