import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { APP_NAME } from "@briv/core";
import { createDb } from "@briv/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { readEnv } from "./env.ts";
import { jsonLogger, safeError } from "./log.ts";
import { createMailer } from "./mail.ts";
import { reporterFor } from "./report.ts";
import { postcodesTown } from "./town.ts";

const env = readEnv();
// The bundled server carries its migrations next to it.
const bundled = fileURLToPath(new URL("./migrations", import.meta.url));
const handle = createDb(env.DATABASE_URL, existsSync(bundled) ? { migrationsFolder: bundled } : {});

// Without a database server, the local one is brought up to date on start.
// Staging and live run migrations as a release step instead.
if (handle.kind === "pglite") await handle.migrate();

const report = reporterFor(env);
// Errors outside a request are logged and reported the same safe way as those inside one.
process.on("unhandledRejection", (reason) => {
  const problem = safeError(reason);
  jsonLogger("error", "unhandled_rejection", problem);
  report?.(problem, { source: "server" });
});
process.on("uncaughtException", (error) => {
  const problem = safeError(error);
  jsonLogger("error", "crash", problem);
  report?.(problem, { source: "server" });
  // The process is in an unknown state: give the report a moment to leave, then stop. The host restarts it.
  setTimeout(() => process.exit(1), 2000);
});

const mail = createMailer(env);
const auth = createAuth(handle.db, env, mail);
const app = createApp({ db: handle.db, auth, env, mail, report, resolveTown: postcodesTown });

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`${APP_NAME} server on http://localhost:${info.port}`);
});

const stop = async () => {
  server.close();
  await handle.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
