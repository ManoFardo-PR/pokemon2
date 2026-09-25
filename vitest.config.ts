import { defineConfig } from "vitest/config";

// S01.T10 — one vitest project per workspace member plus the root scripts/ suites (BR-S01.T10-01).
// `pnpm test` at the root runs every project; a member's own `vitest run` uses its local config.
// Pool settings are root-level in vitest: every worker is a fork that owns its temp-database template.
export default defineConfig({
  // tsconfig.base.json targets es2024, which vitest's esbuild does not know yet; transform for the current Node instead.
  esbuild: { target: "esnext" },
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--no-warnings=ExperimentalWarning"],
      },
    },
    projects: [
      "./apps/api",
      "./apps/web",
      "./apps/worker",
      "./packages/db",
      "./packages/etl",
      "./packages/shared",
      {
        esbuild: { target: "esnext" },
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/**/*.spec.{ts,mjs}"],
          // These suites spawn node processes and build a type-aware ESLint program, which takes seconds under load.
          testTimeout: 60_000,
          hookTimeout: 60_000,
          // The scripts suites open temp databases through packages/db, so they share its setup file.
          setupFiles: ["./packages/db/src/testing/vitest.setup.ts"],
          deps: {
            optimizer: {
              ssr: {
                include: [],
                exclude: ["node:sqlite"],
              },
            },
          },
        },
        ssr: {
          external: ["node:sqlite"],
        },
      },
    ],
  },
});
