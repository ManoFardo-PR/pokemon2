import { loadApiConfig } from "./config.js";
import { openDatabase, migrate, assertSchemaCurrent, SchemaOutdatedError } from "@pokesearch/db";
import { buildApp } from "./app.js";

export async function startServer() {
  const config = loadApiConfig(process.env);
  const dbPath = config.DATABASE_PATH || "";

  let db;
  try {
    // openDatabase with create: false per spec to avoid silently creating empty database
    db = openDatabase(dbPath, { create: false });
  } catch (_err: unknown) {
    console.error(
      `database not found at ${dbPath}; run "pnpm db:migrate"`
    );
    process.exit(2);
  }

  try {
    if (config.MIGRATE_ON_START) {
      migrate(db);
    }
    assertSchemaCurrent(db);
  } catch (err: unknown) {
    if (err instanceof SchemaOutdatedError) {
      console.error(
        `Database schema outdated: applied=${err.applied}, expected=${err.expected}. Run "pnpm db:migrate".`
      );
    } else {
      console.error("Schema assertion failed:", (err as any)?.message);
    }
    db.close();
    process.exit(2);
  }

  const app = await buildApp({
    db,
    config,
    logger: true,
  });

  try {
    const address = await app.listen({
      host: config.API_HOST,
      port: config.API_PORT,
    });

    const schemaRow = db.get<{ version: number }>(
      "SELECT MAX(version) as version FROM schema_migrations"
    );
    const sqliteVerRow = db.get<{ version: string }>(
      "SELECT sqlite_version() as version"
    );

    app.log.info(
      {
        databasePath: config.DATABASE_PATH,
        sqliteVersion: sqliteVerRow?.version ?? "unknown",
        schemaVersion: schemaRow?.version ?? 0,
        address,
      },
      "API server started"
    );

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        process.exit(130);
      }
      shuttingDown = true;
      app.log.info({ signal }, "Gracefully shutting down API server");
      try {
        await app.close();
      } catch (err) {
        app.log.error(err, "Error closing Fastify app");
      }
      try {
        db.close();
      } catch (err) {
        console.error("Error closing database", err);
      }
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err: any) {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${config.API_PORT} is already in use. Please specify a different API_PORT.`
      );
      try {
        db.close();
      } catch {
        // ignore
      }
      process.exit(3);
    }
    console.error("Failed to start server:", err);
    try {
      db.close();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

// Auto-start if invoked directly as script
if (
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  process.argv[1]?.endsWith("server.ts") ||
  process.argv[1]?.endsWith("server.js")
) {
  startServer().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}
