import * as fs from "node:fs";
import * as path from "node:path";
import { env, findRepoRoot } from "@pokesearch/shared/env";

export class CachePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CachePathError";
  }
}

export function cacheRoot(): string {
  const root = process.env.RAW_CACHE_DIR || env.RAW_CACHE_DIR;
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

export function resolveCachePath(...segments: string[]): string {
  const root = cacheRoot();
  const target = path.resolve(root, ...segments);

  const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new CachePathError(`Cache path '${target}' escapes cache root '${root}'`);
  }

  let repoRoot: string | undefined;
  try {
    repoRoot = findRepoRoot();
  } catch {
    // Repo root might not be discoverable in isolated environments
  }

  if (repoRoot) {
    const normalizedRepo = path.resolve(repoRoot).endsWith(path.sep)
      ? path.resolve(repoRoot)
      : path.resolve(repoRoot) + path.sep;
    if (target === path.resolve(repoRoot) || target.startsWith(normalizedRepo)) {
      throw new CachePathError(
        `Cache path '${target}' resolves inside the repository root '${repoRoot}'`
      );
    }
  }

  return target;
}

export const ptcg = {
  setsFile: (): string => resolveCachePath("pokemon-tcg-data", "sets", "en.json"),
  cardsFile: (setId: string): string =>
    resolveCachePath("pokemon-tcg-data", "cards", "en", `${setId}.json`),
  etagsFile: (): string => resolveCachePath("pokemon-tcg-data", "etags.json"),
};

export const tcgdex = {
  setsFile: (): string => resolveCachePath("tcgdex", "sets.json"),
  setFile: (id: string): string => resolveCachePath("tcgdex", "sets", `${id}.json`),
  cardFile: (id: string): string => resolveCachePath("tcgdex", "cards", `${id}.json`),
};

export const limitless = {
  tournamentDir: (id: string): string => resolveCachePath("limitless", "tournaments", id),
  webList: (id: string): string => resolveCachePath("limitless", "web", `list_${id}.html`),
};

export const reports = {
  file: (name: string): string => resolveCachePath("reports", name),
};

export async function writeJsonAtomic(destPath: string, value: unknown): Promise<void> {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  const tmpPath = `${destPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new TypeError("Cannot serialize undefined to JSON");
  }

  try {
    await fs.promises.writeFile(tmpPath, serialized, "utf8");
    await fs.promises.rename(tmpPath, destPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // ignore unlink error
      }
    }
    throw err;
  }
}
