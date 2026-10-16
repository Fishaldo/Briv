import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { waitUntil } from "@vercel/functions";
import { createDb } from "@briv/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { readEnv } from "./env.ts";
import { jsonLogger, safeError } from "./log.ts";
import { createMailer } from "./mail.ts";
import { reporterFor } from "./report.ts";
import { postcodesTown } from "./town.ts";
import { withVercelDefaults } from "./vercel-env.ts";

/*
 * The server as one Vercel Function. The same app as server.ts, without the
 * long-running process: Vercel starts it when a request comes and keeps it
 * warm, so the database connection is made once and reused between requests.
 *
 * Migrations run in the build (scripts/vercel-build.ts), never here.
 */
type Listener = (req: IncomingMessage, res: ServerResponse) => void;

function start(): Listener {
  const env = readEnv(withVercelDefaults(process.env));
  const handle = createDb(env.DATABASE_URL);
  const report = reporterFor(env);
  process.on("unhandledRejection", (reason) => {
    const problem = safeError(reason);
    jsonLogger("error", "unhandled_rejection", problem);
    report?.(problem, { source: "server" });
  });
  const mail = createMailer(env);
  const auth = createAuth(handle.db, env, mail, { runInBackground: (task) => waitUntil(task) });
  const app = createApp({ db: handle.db, auth, env, mail, report, resolveTown: postcodesTown });
  return getRequestListener(app.fetch);
}

/*
 * A setting missing in the dashboard stops the server, as it should. The log
 * names the missing settings (names only, never values), and every request
 * gets a plain "not ready" instead of a crash page.
 */
function notReady(error: unknown): Listener {
  const reason = error instanceof Error ? error.message.slice(0, 300) : "unknown";
  jsonLogger("error", "startup_failed", { reason });
  return (_req, res) => {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Briv's server is not ready yet. Try again later." }));
  };
}

let listener: Listener;
try {
  listener = start();
} catch (error) {
  listener = notReady(error);
}

export default listener;
