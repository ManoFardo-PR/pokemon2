import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { z } from 'zod';

export class EnvPathError extends Error {
  public readonly variable: string;
  public readonly resolvedPath: string;

  constructor(variable: string, resolvedPath: string, message: string) {
    super(message);
    this.name = 'EnvPathError';
    this.variable = variable;
    this.resolvedPath = resolvedPath;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function defaultDataDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'pokemon2');
  }
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, 'pokemon2');
}

export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return path.resolve(startDir);
}

export function assertArtifactPath(variable: string, targetPath: string, repoRoot: string): void {
  const resolved = path.resolve(targetPath);
  const normalizedResolved = resolved.toLowerCase();
  const normalizedRepoRoot = path.resolve(repoRoot).toLowerCase();

  // Check OneDrive
  if (/[\\/]onedrive([\\/]|$)/i.test(resolved) || normalizedResolved.includes('onedrive')) {
    throw new EnvPathError(
      variable,
      resolved,
      `[D-005] Artifact path for ${variable} cannot reside inside a OneDrive directory: ${resolved}`
    );
  }

  // Check repo root
  const relativeToRepo = path.relative(normalizedRepoRoot, normalizedResolved);
  const isInsideRepo = !relativeToRepo.startsWith('..') && !path.isAbsolute(relativeToRepo);
  if (isInsideRepo || normalizedResolved === normalizedRepoRoot) {
    throw new EnvPathError(
      variable,
      resolved,
      `[BR-S01.T01-01] Artifact path for ${variable} must be outside the repository: ${resolved}`
    );
  }
}

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(5173),
  SCHEDULER_ENABLED: z.enum(['0', '1']).default('0'),
  DATA_DIR: z.string().optional(),
  DATABASE_PATH: z.string().optional(),
  RAW_CACHE_DIR: z.string().optional(),
  CARGO_TARGET_DIR: z.string().optional(),
  ENGINE_BIN: z.string().optional(),
  LIMITLESS_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_MODEL: z.string().optional(),
});

export const envSchema = rawEnvSchema;

export interface AppEnv {
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  API_PORT: number;
  WEB_PORT: number;
  SCHEDULER_ENABLED: '0' | '1';
  DATA_DIR: string;
  DATABASE_PATH: string;
  RAW_CACHE_DIR: string;
  CARGO_TARGET_DIR: string;
  ENGINE_BIN: string;
  LIMITLESS_API_KEY?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined;
  LLM_BASE_URL?: string | undefined;
  LLM_MODEL?: string | undefined;
}

export type Env = AppEnv;

export interface LoadEnvOptions {
  repoRoot?: string;
}

export function loadEnv(
  input: Record<string, string | undefined> = process.env,
  options: LoadEnvOptions = {}
): Env {
  const parsed = rawEnvSchema.parse(input);
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : findRepoRoot();

  const dataDir = path.resolve(parsed.DATA_DIR || defaultDataDir());
  assertArtifactPath('DATA_DIR', dataDir, repoRoot);

  const databasePath = parsed.DATABASE_PATH
    ? path.resolve(dataDir, parsed.DATABASE_PATH)
    : path.resolve(dataDir, 'pokesearch.db');
  assertArtifactPath('DATABASE_PATH', databasePath, repoRoot);

  const rawCacheDir = parsed.RAW_CACHE_DIR
    ? path.resolve(dataDir, parsed.RAW_CACHE_DIR)
    : path.resolve(dataDir, 'raw');
  assertArtifactPath('RAW_CACHE_DIR', rawCacheDir, repoRoot);

  const cargoTargetDir = parsed.CARGO_TARGET_DIR
    ? path.resolve(dataDir, parsed.CARGO_TARGET_DIR)
    : path.resolve(dataDir, 'target');
  assertArtifactPath('CARGO_TARGET_DIR', cargoTargetDir, repoRoot);

  const defaultEngineExe = process.platform === 'win32' ? 'release/ptcg-cli.exe' : 'release/ptcg-cli';
  const engineBin = parsed.ENGINE_BIN
    ? path.resolve(dataDir, parsed.ENGINE_BIN)
    : path.resolve(cargoTargetDir, defaultEngineExe);
  assertArtifactPath('ENGINE_BIN', engineBin, repoRoot);

  return {
    NODE_ENV: parsed.NODE_ENV,
    LOG_LEVEL: parsed.LOG_LEVEL,
    API_PORT: parsed.API_PORT,
    WEB_PORT: parsed.WEB_PORT,
    SCHEDULER_ENABLED: parsed.SCHEDULER_ENABLED,
    DATA_DIR: dataDir,
    DATABASE_PATH: databasePath,
    RAW_CACHE_DIR: rawCacheDir,
    CARGO_TARGET_DIR: cargoTargetDir,
    ENGINE_BIN: engineBin,
    LIMITLESS_API_KEY: parsed.LIMITLESS_API_KEY,
    ANTHROPIC_API_KEY: parsed.ANTHROPIC_API_KEY,
    LLM_BASE_URL: parsed.LLM_BASE_URL,
    LLM_MODEL: parsed.LLM_MODEL,
  };
}

export function ensureDataDirs(currentEnv: Env): void {
  const dirs = [
    currentEnv.DATA_DIR,
    path.dirname(currentEnv.DATABASE_PATH),
    currentEnv.RAW_CACHE_DIR,
    currentEnv.CARGO_TARGET_DIR,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Memoized default environment
export const env: Env = loadEnv();
