import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { target: "esnext" },
  test: {
    name: "@pokesearch/etl",
    environment: "node",
    passWithNoTests: true,
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--no-warnings=ExperimentalWarning"],
      },
    },
  },
});
