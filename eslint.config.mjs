import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/*
 * One lint setup for the whole repository, run by `pnpm lint` and by GitHub.
 * Rules catch real mistakes (unused code, hooks used wrongly, floating
 * promises in the server); formatting is left to the editor.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.expo/**",
      "**/web-build/**",
      "**/*.generated.ts",
      "packages/db/migrations/**",
      "apps/app/ios/**",
      "apps/app/android/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      eqeqeq: ["error", "smart"],
      "no-console": "off",
    },
  },
  {
    // Routes never touch tables: private data goes through apps/api/src/data, which is always scoped to one person.
    files: ["apps/api/src/routes/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@briv/db", message: "Use apps/api/src/data: it is always scoped to one person.", allowTypeImports: true },
            { name: "drizzle-orm", message: "Use apps/api/src/data: it is always scoped to one person.", allowTypeImports: true },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
