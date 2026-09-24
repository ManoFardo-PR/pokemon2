import fastify, { type FastifyInstance, type FastifyBaseLogger } from "fastify";
import cors from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { Db } from "@pokesearch/db";
import { apiConfigSchema, type ApiConfig } from "./config.js";
import { AppError } from "./errors.js";
import { systemRoutes } from "./routes/system.js";
import { randomUUID } from "node:crypto";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    config: ApiConfig;
  }
}

export interface BuildAppOptions {
  db: Db;
  config?: Partial<ApiConfig>;
  logger?: FastifyBaseLogger | boolean;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const mergedConfig = apiConfigSchema.parse(opts.config ?? {});

  const app = fastify({
    logger: opts.logger ?? false,
    bodyLimit: mergedConfig.BODY_LIMIT_BYTES,
    connectionTimeout: mergedConfig.REQUEST_TIMEOUT_MS,
    genReqId: (req) => {
      const headerId = req.headers["x-request-id"];
      if (typeof headerId === "string" && headerId.trim().length > 0) {
        return headerId;
      }
      return randomUUID();
    },
  });

  app.decorate("db", opts.db);
  app.decorate("config", mergedConfig);

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: mergedConfig.CORS_ORIGINS,
    credentials: false,
  });

  // Not found handler (BR-S01.T07-04, BR-S01.T07-09)
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: "not_found",
        message: `Route ${request.method}:${request.url} not found`,
        requestId: request.id,
      },
    });
  });

  // Error handler (BR-S01.T07-04, BR-S01.T07-09)
  app.setErrorHandler((error: unknown, request, reply) => {
    const requestId = request.id;
    const err = error as Record<string, any>;
    request.log.error({ err, requestId }, err?.message || "Error");

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          requestId,
        },
      });
    }

    if (err?.validation && Array.isArray(err.validation)) {
      const details = err.validation.map((v: Record<string, any>) => ({
        path: (v.instancePath || v.params?.missingProperty || "unknown") as string,
        message: (v.message || "Invalid input") as string,
      }));
      return reply.status(400).send({
        error: {
          code: "validation_error",
          message: (err.message as string) || "Validation error",
          details,
          requestId,
        },
      });
    }

    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;

    if (statusCode === 413) {
      return reply.status(413).send({
        error: {
          code: "payload_too_large",
          message: "Payload too large",
          requestId,
        },
      });
    }

    if (statusCode >= 500) {
      return reply.status(500).send({
        error: {
          code: "internal_error",
          message: "Internal error",
          requestId,
        },
      });
    }

    return reply.status(statusCode).send({
      error: {
        code: "internal_error",
        message: (err?.message as string) || "An unexpected error occurred",
        requestId,
      },
    });
  });

  // Register system routes
  await app.register(systemRoutes);

  return app;
}
