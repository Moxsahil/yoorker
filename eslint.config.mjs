import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/next-env.d.ts",
      "**/.turbo/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    // `declare global { namespace Express { ... } }` is the standard way to extend
    // third-party types (e.g. req.auth); real namespaces stay banned.
    rules: { "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }] },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Only services/api talks to the database (RFC-001). Clients go through the API.
    files: ["apps/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@yoorker/db", "@yoorker/db/*", "pg", "kysely"],
              message: "Only services/api may access the database. Call the API instead.",
            },
          ],
        },
      ],
    },
  },
);
