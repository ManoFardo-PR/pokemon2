// S01.T10 — root eslint flat config. One config with per-directory overrides; every cross-package restriction is a
// business rule of another S01 subtask and carries that rule's BR id in its block name, its messages and the comment
// above it (BR-S01.T10-06), so deleting one is a visible act.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/** Returns a copy of `plugin` whose rule `ruleName` reports every message prefixed with `prefix`. */
function withPrefixedMessages(plugin, ruleName, prefix) {
  const rule = plugin.rules[ruleName];
  const messages = Object.fromEntries(Object.entries(rule.meta.messages).map(([id, text]) => [id, `${prefix}: ${text}`]));
  return { ...plugin, rules: { ...plugin.rules, [ruleName]: { ...rule, meta: { ...rule.meta, messages } } } };
}

/** Punctuation and separators that may appear as JSX text without going through src/strings.ts. */
const JSX_PUNCTUATION = ["·", "—", "–", "-", "|", "/", ":", ";", ",", ".", "(", ")", "…", "×", "&nbsp;", "→", "←"];

const DB_ONLY_MESSAGE = "BR-S01.T02-03: only packages/db/src/client.ts opens the database; import @pokesearch/db instead";
const SHARED_PURE_MESSAGE = "BR-S01.T05-01: @pokesearch/shared is pure; only src/env.ts may import Node built-ins";
const WEB_SERVER_ONLY_MESSAGE = "BR-S01.T08-03: apps/web imports no server-only module; use the API client";

const TEST_FILES = ["**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.mjs", "**/test/**", "packages/db/src/testing/**"];

const hooksRecommended = reactHooks.configs["recommended-latest"] ?? reactHooks.configs.recommended;

export default defineConfig([
  {
    name: "ignores",
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "engine/**", "modules/**", "**/*.gen.tsx"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    name: "base/type-aware",
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Plain JavaScript (scripts/*.mjs, config files) runs on Node and is linted without type information.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
    name: "base/js-files",
    languageOptions: { ...tseslint.configs.disableTypeChecked.languageOptions, globals: globals.node },
  },
  {
    // Tool configs live outside every tsconfig `include`, so they are linted without type information too.
    files: ["**/*.config.ts", "**/*.config.mts"],
    ...tseslint.configs.disableTypeChecked,
    name: "base/config-files",
  },
  {
    name: "base/cli-entry-points",
    files: [
      "scripts/**",
      "apps/*/src/index.ts",
      "apps/api/src/server.ts",
      "packages/*/scripts/**",
      "packages/etl/src/**",
      "packages/shared/src/env.check.ts",
      "packages/db/src/testing/index.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Tests poke at internals and mock shapes: the "unsafe any" family is off there; the rest of the rule set stays.
    name: "base/tests",
    files: TEST_FILES,
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/require-await": "off",
    },
  },

  // BR-S01.T02-03 — only the database client opens the database: `node:sqlite` / `better-sqlite3` nowhere else.
  {
    name: "restrict/db-client-only BR-S01.T02-03",
    files: ["packages/db/src/**", "apps/**", "packages/shared/**", "packages/etl/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "node:sqlite", message: DB_ONLY_MESSAGE },
            { name: "better-sqlite3", message: DB_ONLY_MESSAGE },
          ],
        },
      ],
    },
  },

  // BR-S01.T05-01 — @pokesearch/shared is pure: no `node:*`, `fs` or `path`; `src/env.ts` is the one exception.
  {
    name: "restrict/shared-is-pure BR-S01.T05-01",
    files: ["packages/shared/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "fs", message: SHARED_PURE_MESSAGE },
            { name: "path", message: SHARED_PURE_MESSAGE },
            { name: "os", message: SHARED_PURE_MESSAGE },
            { name: "better-sqlite3", message: DB_ONLY_MESSAGE },
          ],
          patterns: [{ group: ["node:*"], message: SHARED_PURE_MESSAGE }],
        },
      ],
    },
  },

  // BR-S01.T08-03 — apps/web imports no server-only module: no database, no env resolution, no `node:*`.
  {
    name: "restrict/web-no-server-modules BR-S01.T08-03",
    files: ["apps/web/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@pokesearch/db", message: WEB_SERVER_ONLY_MESSAGE },
            { name: "@pokesearch/shared/env", message: WEB_SERVER_ONLY_MESSAGE },
            { name: "better-sqlite3", message: DB_ONLY_MESSAGE },
          ],
          patterns: [
            { group: ["@pokesearch/db/*"], message: WEB_SERVER_ONLY_MESSAGE },
            { group: ["node:*"], message: WEB_SERVER_ONLY_MESSAGE },
          ],
        },
      ],
    },
  },

  // BR-S01.T08-01 — user-visible strings come from apps/web/src/strings.ts: no literal text in JSX.
  {
    name: "restrict/web-strings-from-catalog BR-S01.T08-01",
    files: ["apps/web/src/**/*.tsx"],
    plugins: { react: withPrefixedMessages(react, "jsx-no-literals", "BR-S01.T08-01") },
    settings: { react: { version: "detect" } },
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: false, ignoreProps: true, allowedStrings: JSX_PUNCTUATION }],
    },
  },
  {
    name: "web/react-hooks",
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...hooksRecommended.rules },
  },

  // The one legitimate place for each restriction, plus test files and root scripts, which may touch Node freely.
  {
    name: "restrict/exemptions",
    files: ["packages/db/src/client.ts", "packages/shared/src/env.ts", "scripts/**", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);
