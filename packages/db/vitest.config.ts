import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
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
