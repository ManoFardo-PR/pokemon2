import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./client.js";

export class MigrationError extends Error {
  override name: string;
  version: number;
  migrationName: string;
  override cause: unknown;

  constructor(message: string, version: number, name: string, cause?: unknown) {
    super(message);
    this.name = "MigrationError";
    this.version = version;
    this.migrationName = name;
    this.cause = cause;
  }
}

export class MigrationChecksumError extends MigrationError {
  constructor(message: string, version: number, name: string, cause?: unknown) {
    super(message, version, name, cause);
    this.name = "MigrationChecksumError";
  }
}

export class MigrationValidationError extends MigrationError {
  constructor(message: string, version: number = 0, name: string = "", cause?: unknown) {
    super(message, version, name, cause);
    this.name = "MigrationValidationError";
  }
}

export class SchemaOutdatedError extends Error {
  applied: number;
  expected: number;

  constructor(applied: number, expected: number) {
    super(`Schema outdated: applied version is ${applied}, but expected ${expected}.`);
    this.name = "SchemaOutdatedError";
    this.applied = applied;
    this.expected = expected;
  }
}

export interface MigrationFile {
  version: number;
  name: string;
  path: string;
  checksum: string;
  sql: string;
  noTransaction: boolean;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
  duration_ms: number;
}

export interface MigrateResult {
  applied: AppliedMigration[];
  alreadyApplied: number;
  schemaVersion: number;
}

export interface MigrationStatus {
  applied: AppliedMigration[];
  pending: MigrationFile[];
  databasePath: string;
  schemaVersion: number;
  sqliteVersion: string;
}

export interface MigrateOptions {
  to?: number;
  dryRun?: boolean;
  dir?: string;
  allowChecksumDrift?: boolean;
}

export function defaultMigrationsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const dbSrcDir = dirname(currentFile);
  const migrationsDir = resolve(dbSrcDir, "../migrations");
  return migrationsDir;
}

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function discoverMigrations(dir?: string): MigrationFile[] {
  const migrationsDirectory = dir ? resolve(dir) : defaultMigrationsDir();
  if (!existsSync(migrationsDirectory)) {
    return [];
  }

  const entries = readdirSync(migrationsDirectory, { withFileTypes: true });
  const sqlFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".sql"));

  const migrations: MigrationFile[] = [];

  for (const file of sqlFiles) {
    const match = file.name.match(MIGRATION_FILE_PATTERN);
    if (!match || !match[1] || !match[2]) {
      throw new MigrationValidationError(
        `Migration filename '${file.name}' does not conform to NNNN_<snake_case>.sql convention.`
      );
    }

    const versionStr = match[1];
    const name = match[2];

    // Must be valid snake_case (lower letters, numbers, underscores, no consecutive underscores or camelCase)
    if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(name)) {
      throw new MigrationValidationError(
        `Migration name '${name}' in '${file.name}' is not valid snake_case.`
      );
    }

    const filePath = join(migrationsDirectory, file.name);
    const content = readFileSync(filePath, "utf-8");
    const checksum = sha256(content);
    const noTransaction = content.startsWith("-- @no-transaction");

    migrations.push({
      version: parseInt(versionStr, 10),
      name,
      path: filePath,
      checksum,
      sql: content,
      noTransaction,
    });
  }

  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}

export function currentSchemaVersion(db: Db): number {
  const tableExists = db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations';"
  );
  if (!tableExists) {
    return 0;
  }
  const row = db.get<{ max_version: number | null }>(
    "SELECT MAX(version) as max_version FROM schema_migrations;"
  );
  return row?.max_version ?? 0;
}

export function getAppliedMigrations(db: Db): AppliedMigration[] {
  const tableExists = db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations';"
  );
  if (!tableExists) {
    return [];
  }
  return db.all<AppliedMigration>(
    "SELECT version, name, checksum, applied_at, duration_ms FROM schema_migrations ORDER BY version ASC;"
  );
}

function validateMigrations(
  diskMigrations: MigrationFile[],
  appliedMigrations: AppliedMigration[],
  opts?: { allowChecksumDrift?: boolean | undefined }
): void {
  // Check sequence gap / duplicate on disk
  if (diskMigrations.length > 0) {
    const first = diskMigrations[0];
    if (!first || first.version !== 1) {
      throw new MigrationValidationError(
        `First migration version must be 1 (0001), found ${first?.version}.`,
        first?.version ?? 0,
        first?.name ?? ""
      );
    }

    for (let i = 0; i < diskMigrations.length; i++) {
      const expectedVersion = i + 1;
      const current = diskMigrations[i];
      if (!current || current.version !== expectedVersion) {
        throw new MigrationValidationError(
          `Sequence gap or duplicate detected: expected version ${expectedVersion}, got ${current?.version}.`,
          current?.version ?? 0,
          current?.name ?? ""
        );
      }
    }
  }

  // Check applied migrations are present on disk
  const diskMap = new Map<number, MigrationFile>();
  for (const m of diskMigrations) {
    diskMap.set(m.version, m);
  }

  for (const applied of appliedMigrations) {
    const onDisk = diskMap.get(applied.version);
    if (!onDisk) {
      throw new MigrationValidationError(
        `Applied migration version ${applied.version} ('${applied.name}') is missing on disk.`,
        applied.version,
        applied.name
      );
    }

    if (onDisk.checksum !== applied.checksum) {
      const isProduction = process.env.NODE_ENV === "production";
      if (!opts?.allowChecksumDrift || isProduction) {
        throw new MigrationChecksumError(
          `Checksum mismatch for migration ${applied.version} ('${applied.name}'). Applied SHA-256: ${applied.checksum}, Disk SHA-256: ${onDisk.checksum}.`,
          applied.version,
          applied.name
        );
      }
    }
  }
}

export function pendingMigrations(db: Db, dir?: string): MigrationFile[] {
  const disk = discoverMigrations(dir);
  const applied = getAppliedMigrations(db);
  validateMigrations(disk, applied);

  const appliedVersions = new Set(applied.map((a) => a.version));
  return disk.filter((m) => !appliedVersions.has(m.version));
}

export function migrationsHash(dir?: string): string {
  const disk = discoverMigrations(dir);
  const hasher = createHash("sha256");
  for (const m of disk) {
    hasher.update(`${m.version}:${m.name}:${m.checksum}\n`);
  }
  return hasher.digest("hex");
}

export function assertSchemaCurrent(db: Db, dir?: string): void {
  const disk = discoverMigrations(dir);
  const current = currentSchemaVersion(db);
  const last = disk[disk.length - 1];
  const expected = last ? last.version : 0;
  if (current !== expected) {
    throw new SchemaOutdatedError(current, expected);
  }
}

export function migrationStatus(db: Db, dir?: string): MigrationStatus {
  const disk = discoverMigrations(dir);
  const applied = getAppliedMigrations(db);
  validateMigrations(disk, applied);

  const appliedVersions = new Set(applied.map((a) => a.version));
  const pending = disk.filter((m) => !appliedVersions.has(m.version));
  const schemaVer = currentSchemaVersion(db);

  const sqliteVerRow = db.get<{ version: string }>("SELECT sqlite_version() as version;");
  const sqliteVersion = sqliteVerRow?.version ?? "unknown";

  const dbPath = (db as any).filename ?? "in-memory";

  return {
    applied,
    pending,
    databasePath: dbPath,
    schemaVersion: schemaVer,
    sqliteVersion,
  };
}

function ensureMigrationsTable(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT    NOT NULL,
      checksum    TEXT    NOT NULL,
      applied_at  TEXT    NOT NULL,
      duration_ms INTEGER NOT NULL
    );
  `);
}

export function migrate(db: Db, opts?: MigrateOptions): MigrateResult {
  const disk = discoverMigrations(opts?.dir);
  const appliedBefore = getAppliedMigrations(db);
  validateMigrations(disk, appliedBefore, { allowChecksumDrift: opts?.allowChecksumDrift });

  const currentVer = currentSchemaVersion(db);

  if (opts?.to !== undefined && opts.to < currentVer) {
    throw new MigrationValidationError(
      `Cannot migrate down to target version ${opts.to}; current version is ${currentVer}. Restore a backup to revert schema.`
    );
  }

  const appliedVersions = new Set(appliedBefore.map((a) => a.version));
  let candidateMigrations = disk.filter((m) => !appliedVersions.has(m.version));

  if (opts?.to !== undefined) {
    candidateMigrations = candidateMigrations.filter((m) => m.version <= opts.to!);
  }

  if (opts?.dryRun) {
    const dryRunApplied: AppliedMigration[] = candidateMigrations.map((m) => ({
      version: m.version,
      name: m.name,
      checksum: m.checksum,
      applied_at: new Date().toISOString(),
      duration_ms: 0,
    }));
    return {
      applied: dryRunApplied,
      alreadyApplied: appliedBefore.length,
      schemaVersion: currentVer,
    };
  }

  const newlyApplied: AppliedMigration[] = [];

  for (const m of candidateMigrations) {
    const startTime = performance.now();
    const appliedAt = new Date().toISOString();

    if (m.noTransaction) {
      try {
        db.exec(m.sql);
        ensureMigrationsTable(db);
        const duration = Math.round(performance.now() - startTime);
        db.run(
          `INSERT INTO schema_migrations (version, name, checksum, applied_at, duration_ms)
           VALUES (?, ?, ?, ?, ?);`,
          [m.version, m.name, m.checksum, appliedAt, duration]
        );
        newlyApplied.push({
          version: m.version,
          name: m.name,
          checksum: m.checksum,
          applied_at: appliedAt,
          duration_ms: duration,
        });
      } catch (err) {
        throw new MigrationError(
          `Migration ${m.version} ('${m.name}') failed: ${err instanceof Error ? err.message : String(err)}`,
          m.version,
          m.name,
          err
        );
      }
    } else {
      try {
        db.transaction(() => {
          db.exec(m.sql);
          ensureMigrationsTable(db);
          const duration = Math.round(performance.now() - startTime);
          db.run(
            `INSERT INTO schema_migrations (version, name, checksum, applied_at, duration_ms)
             VALUES (?, ?, ?, ?, ?);`,
            [m.version, m.name, m.checksum, appliedAt, duration]
          );
          newlyApplied.push({
            version: m.version,
            name: m.name,
            checksum: m.checksum,
            applied_at: appliedAt,
            duration_ms: duration,
          });
        }, "immediate");
      } catch (err) {
        throw new MigrationError(
          `Migration ${m.version} ('${m.name}') failed: ${err instanceof Error ? err.message : String(err)}`,
          m.version,
          m.name,
          err
        );
      }
    }
  }

  return {
    applied: newlyApplied,
    alreadyApplied: appliedBefore.length,
    schemaVersion: currentSchemaVersion(db),
  };
}
