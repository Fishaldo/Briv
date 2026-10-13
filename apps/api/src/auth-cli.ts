/*
 * Only for the Better Auth command line, which needs an exported `auth` to read
 * the sign-in tables from: `pnpm --filter @briv/api auth:schema`.
 * Compare its output with packages/db/src/schema.ts after upgrading Better Auth.
 */
import { createDb } from "@briv/db";
import { createAuth } from "./auth.ts";
import { readEnv } from "./env.ts";

const env = readEnv({ ...process.env, DATABASE_URL: "pglite:memory" });
export const auth = createAuth(createDb("pglite:memory").db, env, async () => {});
