import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  loadEnv,
  assertArtifactPath,
  defaultDataDir,
  ensureDataDirs,
  EnvPathError,
  envSchema,
} from './env.ts';

describe('packages/shared/src/env.ts - RED phase', () => {
  const fakeRepoRoot = path.resolve(os.tmpdir(), 'mock-repo-root');
  const safeDataDir = path.resolve(os.tmpdir(), 'mock-safe-data-dir');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('defaultDataDir', () => {
    it('returns Windows AppData Local pokemon2 path on win32', () => {
      const originalLocalAppData = process.env.LOCALAPPDATA;
      try {
        process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';
        const resolved = defaultDataDir('win32');
        expect(resolved).toBe(path.join('C:\\Users\\Test\\AppData\\Local', 'pokemon2'));
      } finally {
        if (originalLocalAppData !== undefined) {
          process.env.LOCALAPPDATA = originalLocalAppData;
        } else {
          delete process.env.LOCALAPPDATA;
        }
      }
    });

    it('returns XDG or .local share path on non-win32 platforms', () => {
      const originalXdg = process.env.XDG_DATA_HOME;
      try {
        process.env.XDG_DATA_HOME = '/home/test/.local/share';
        const resolved = defaultDataDir('linux');
        expect(resolved).toBe(path.join('/home/test/.local/share', 'pokemon2'));
      } finally {
        if (originalXdg !== undefined) {
          process.env.XDG_DATA_HOME = originalXdg;
        } else {
          delete process.env.XDG_DATA_HOME;
        }
      }
    });
  });

  describe('assertArtifactPath (BR-S01.T01-01)', () => {
    it('throws EnvPathError if resolved path is inside repository root', () => {
      const insideRepo = path.join(fakeRepoRoot, 'data', 'pokesearch.db');

      expect(() => {
        assertArtifactPath('DATABASE_PATH', insideRepo, fakeRepoRoot);
      }).toThrow(EnvPathError);

      try {
        assertArtifactPath('DATABASE_PATH', insideRepo, fakeRepoRoot);
      } catch (err) {
        expect(err).toBeInstanceOf(EnvPathError);
        const envErr = err as EnvPathError;
        expect(envErr.variable).toBe('DATABASE_PATH');
        expect(envErr.resolvedPath).toBe(insideRepo);
      }
    });

    it('throws EnvPathError if resolved path contains OneDrive segment (case-insensitive)', () => {
      const oneDrivePath = 'C:\\Users\\Test\\OneDrive\\pokemon2\\pokesearch.db';

      expect(() => {
        assertArtifactPath('DATABASE_PATH', oneDrivePath, fakeRepoRoot);
      }).toThrow(EnvPathError);

      try {
        assertArtifactPath('DATABASE_PATH', oneDrivePath, fakeRepoRoot);
      } catch (err) {
        expect(err).toBeInstanceOf(EnvPathError);
        const envErr = err as EnvPathError;
        expect(envErr.variable).toBe('DATABASE_PATH');
        expect(envErr.message).toMatch(/OneDrive/i);
      }
    });

    it('passes for valid path outside repo and outside OneDrive', () => {
      const validPath = path.join(safeDataDir, 'pokesearch.db');
      expect(() => {
        assertArtifactPath('DATABASE_PATH', validPath, fakeRepoRoot);
      }).not.toThrow();
    });
  });

  describe('loadEnv', () => {
    it('1. defaults resolve outside the repo', () => {
      const loaded = loadEnv(
        {
          DATA_DIR: safeDataDir,
        },
        { repoRoot: fakeRepoRoot }
      );

      expect(loaded.DATA_DIR).toBe(safeDataDir);
      expect(loaded.DATABASE_PATH.startsWith(fakeRepoRoot)).toBe(false);
      expect(loaded.RAW_CACHE_DIR.startsWith(fakeRepoRoot)).toBe(false);
      expect(loaded.CARGO_TARGET_DIR.startsWith(fakeRepoRoot)).toBe(false);
      expect(loaded.ENGINE_BIN.startsWith(fakeRepoRoot)).toBe(false);
    });

    it('2. rejects DATA_DIR inside the repo', () => {
      const insideDir = path.join(fakeRepoRoot, 'subfolder');

      expect(() => {
        loadEnv(
          {
            DATA_DIR: insideDir,
          },
          { repoRoot: fakeRepoRoot }
        );
      }).toThrow(EnvPathError);

      try {
        loadEnv({ DATA_DIR: insideDir }, { repoRoot: fakeRepoRoot });
      } catch (err) {
        expect(err).toBeInstanceOf(EnvPathError);
        const envErr = err as EnvPathError;
        expect(envErr.variable).toBe('DATA_DIR');
      }
    });

    it('3. rejects DATABASE_PATH inside OneDrive', () => {
      const oneDriveDb = 'C:\\Users\\User\\OneDrive\\data.db';

      expect(() => {
        loadEnv(
          {
            DATA_DIR: safeDataDir,
            DATABASE_PATH: oneDriveDb,
          },
          { repoRoot: fakeRepoRoot }
        );
      }).toThrow(EnvPathError);

      try {
        loadEnv(
          {
            DATA_DIR: safeDataDir,
            DATABASE_PATH: oneDriveDb,
          },
          { repoRoot: fakeRepoRoot }
        );
      } catch (err) {
        expect(err).toBeInstanceOf(EnvPathError);
        const envErr = err as EnvPathError;
        expect(envErr.variable).toBe('DATABASE_PATH');
      }
    });

    it('4. resolves relative DATABASE_PATH against DATA_DIR', () => {
      const customDataDir = path.resolve('C:\\External\\Data');
      const loaded = loadEnv(
        {
          DATA_DIR: customDataDir,
          DATABASE_PATH: 'custom.db',
        },
        { repoRoot: fakeRepoRoot }
      );

      expect(loaded.DATABASE_PATH).toBe(path.resolve(customDataDir, 'custom.db'));
    });

    it('validates schema values and defaults for ports and enums', () => {
      const loaded = loadEnv(
        {
          DATA_DIR: safeDataDir,
        },
        { repoRoot: fakeRepoRoot }
      );

      expect(loaded.API_PORT).toBe(8000);
      expect(loaded.WEB_PORT).toBe(5173);
      expect(loaded.SCHEDULER_ENABLED).toBe('0');
      expect(loaded.LOG_LEVEL).toBe('info');
      expect(loaded.NODE_ENV).toBe('development');
    });

    it('throws validation error when port is out of range', () => {
      expect(() => {
        loadEnv(
          {
            DATA_DIR: safeDataDir,
            API_PORT: '999999',
          },
          { repoRoot: fakeRepoRoot }
        );
      }).toThrow();
    });
  });

  describe('ensureDataDirs', () => {
    it('is exported as a function that can be called with valid env', () => {
      expect(typeof ensureDataDirs).toBe('function');
    });
  });
});
