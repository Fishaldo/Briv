/*
 * Bundles the server into one file for hosting. Packages with native parts or
 * their own data files stay outside the bundle and are installed alongside.
 */
import { cpSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: ["@electric-sql/pglite", "postgres"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});

cpSync("../../packages/db/migrations", "dist/migrations", { recursive: true });
