import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createDb } from "@briv/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { readEnv } from "./env.ts";
import { createMailer } from "./mail.ts";
import { postcodesTown } from "./town.ts";

const env = readEnv();
// The bundled server carries its migrations next to it.
const bundled = fileURLToPath(new URL("./migrations", import.meta.url));
const handle = createDb(env.DATABASE_URL, existsSync(bundled) ? { migrationsFolder: bundled } : {});

// Without a database server, the local one is brought up to date on start.
// Staging and live run migrations as a release step instead.
if (handle.kind === "pglite") await handle.migrate();

const auth = createAuth(handle.db, env, createMailer(env));
const app = createApp({ db: handle.db, auth, env, resolveTown: postcodesTown });

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`Briv server on http://localhost:${info.port}`);
});

const stop = async () => {
  server.close();
  await handle.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
