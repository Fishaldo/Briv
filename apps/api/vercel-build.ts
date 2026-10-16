/*
 * The Vercel build: one project holds the website and the server.
 *
 * 1. Live only: brings the database up to date (the migrations), before the
 *    new server goes out. A failed migration fails the build, so the running
 *    version stays.
 * 2. Builds the website (the app's web version), calling its own address.
 * 3. Bundles the server into one Vercel Function, in London.
 * 4. Writes Vercel's Build Output: the files, the function, the routes and the
 *    daily job. See src/vercel-output.ts.
 *
 * Run from the repository root with `pnpm vercel-build`; Vercel does that.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { createDb, migrationsFolder } from "@briv/db";
import { FUNCTION_NAME, functionConfig, outputConfig } from "./src/vercel-output.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const output = `${root}.vercel/output`;
const fn = `${output}/functions/${FUNCTION_NAME}.func`;

function step(text: string) {
  console.log(`\n▸ ${text}`);
}

rmSync(output, { recursive: true, force: true });

// 1. The database, for live only. Previews never touch the live database.
if (process.env.VERCEL_ENV === "production") {
  step("Bringing the database up to date");
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) throw new Error("DATABASE_URL must be set for Production in Vercel's settings.");
  const handle = createDb(url);
  try {
    await handle.migrate();
  } finally {
    await handle.close();
  }
} else {
  step(`Skipping migrations (${process.env.VERCEL_ENV ?? "not on Vercel"})`);
}

// 2. The website.
step("Building the website");
execFileSync("pnpm", ["--filter", "@briv/app", "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || "same-origin" },
});
cpSync(`${root}apps/app/dist`, `${output}/static`, { recursive: true });

// 3. The server. PGlite (Postgres inside Node, for laptops and tests) stays out:
// the function always talks to a real database.
step("Bundling the server");
const noPglite: Plugin = {
  name: "no-pglite",
  setup(b) {
    b.onResolve({ filter: /^(@electric-sql\/pglite|drizzle-orm\/pglite)(\/.*)?$/ }, (args) => ({ path: args.path, namespace: "no-pglite" }));
    b.onLoad({ filter: /.*/, namespace: "no-pglite" }, () => ({
      contents: `const missing = () => { throw new Error("PGlite is not part of the Vercel build. Set DATABASE_URL to Postgres."); };
export class PGlite { constructor() { missing(); } }
export const drizzle = missing;
export const migrate = missing;`,
      loader: "js",
    }));
  },
};
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: { index: "src/vercel.ts" },
  outdir: fn,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  plugins: [noPglite],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify(functionConfig, null, 2));
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: "module" }));

// 4. Routes and the daily job.
writeFileSync(`${output}/config.json`, JSON.stringify(outputConfig, null, 2));
step(`Done: ${output} (migrations from ${migrationsFolder})`);
