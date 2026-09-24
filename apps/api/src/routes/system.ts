import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CONTRACT_VERSION } from "@pokesearch/shared/version";
import { errorEnvelopeSchema } from "../errors.js";

const healthResponseSchema = z.object({
  ok: z.boolean(),
  sqliteVersion: z.string(),
  databasePath: z.string(),
  schemaVersion: z.number(),
  counts: z.object({
    sets: z.number(),
    cards: z.number(),
    decks: z.number(),
  }),
});

const versionResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  contractVersion: z.string(),
  schemaVersion: z.number(),
  node: z.string(),
  commit: z.string().nullable(),
  engineBuild: z.string().nullable(),
});

function countOrZero(db: any, tableName: string): number {
  try {
    const tableExists = db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
      [tableName]
    );
    if (!tableExists) return 0;
    const row = db.get(`SELECT COUNT(*) as count FROM ${tableName}`);
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export const systemRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/health",
    {
      schema: {
        response: {
          200: healthResponseSchema,
          503: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const db = app.db;
        // Verify database is open & readable with a simple query
        const sqliteVerRow = db.get<{ version: string }>("SELECT sqlite_version() as version");
        const sqliteVersion = sqliteVerRow?.version ?? "unknown";

        let schemaVersion = 0;
        try {
          const schemaRow = db.get<{ version: number }>(
            "SELECT MAX(version) as version FROM schema_migrations"
          );
          schemaVersion = schemaRow?.version ?? 0;
        } catch {
          schemaVersion = 0;
        }

        const sets = countOrZero(db, "sets");
        const cards = countOrZero(db, "cards");
        const decks = countOrZero(db, "decks");

        let databasePath = "";
        try {
          const fileRow = db.get<{ file: string }>("PRAGMA database_list;");
          databasePath = fileRow?.file ?? "";
        } catch {
          databasePath = "";
        }

        return reply.status(200).send({
          ok: true,
          sqliteVersion,
          databasePath,
          schemaVersion,
          counts: {
            sets,
            cards,
            decks,
          },
        });
      } catch (err: any) {
        request.log.error(err, "Health check database failure");
        return reply.status(503).send({
          error: {
            code: "database_unavailable",
            message: "Database unavailable",
            requestId: request.id,
          },
        });
      }
    }
  );

  typedApp.get(
    "/api/version",
    {
      schema: {
        response: {
          200: versionResponseSchema,
          503: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const db = app.db;
        let schemaVersion = 0;
        try {
          const schemaRow = db.get<{ version: number }>(
            "SELECT MAX(version) as version FROM schema_migrations"
          );
          schemaVersion = schemaRow?.version ?? 0;
        } catch {
          schemaVersion = 0;
        }

        return reply.status(200).send({
          name: "pokesearch-api",
          version: "0.1.0",
          contractVersion: CONTRACT_VERSION,
          schemaVersion,
          node: process.version,
          commit: null,
          engineBuild: null,
        });
      } catch (err: any) {
        request.log.error(err, "Version endpoint database failure");
        return reply.status(503).send({
          error: {
            code: "database_unavailable",
            message: "Database unavailable",
            requestId: request.id,
          },
        });
      }
    }
  );
};
