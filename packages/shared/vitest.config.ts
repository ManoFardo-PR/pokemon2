import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { target: "esnext" },
  test: {
    name: "@pokesearch/shared",
    environment: "node",
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--no-warnings=ExperimentalWarning"],
      },
    },
  },
});
