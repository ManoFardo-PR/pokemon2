import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--no-warnings=ExperimentalWarning"],
      },
    },
    deps: {
      optimizer: {
        ssr: {
          include: [],
          exclude: ["node:sqlite"],
        },
      },
      moduleDirectories: ["node_modules"],
    },
  },
  ssr: {
    external: ["node:sqlite"],
  },
});
