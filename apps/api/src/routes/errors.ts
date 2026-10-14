import { Hono } from "hono";
import { appError } from "@briv/contract";
import { allow, limitKey } from "../data/account.ts";
import { parse, type Vars } from "../http.ts";
import type { RouteDeps } from "./deps.ts";

/**
 * Crashes in the app, sent by its error screen. They go to the log and to
 * error monitoring next to the server's own errors. The contract lets through
 * only the kind of error and places in the code, never what it said.
 */
export function errorRoutes(deps: RouteDeps) {
  const { db, env, log, report } = deps;
  const routes = new Hono<{ Variables: Vars }>();

  routes.post("/app-errors", async (c) => {
    const problem = parse(appError, await c.req.json().catch(() => ({})));
    // A screen stuck crashing in a loop must not flood the log: 20 an hour a person, the rest are dropped.
    if (await allow(db, limitKey("app-error", c.var.personId, env.secret), 20, 3600)) {
      log("error", "app_error", { id: c.var.requestId, ...problem });
      try {
        report?.(problem, { source: "app", requestId: c.var.requestId });
      } catch {
        // Reporting is best effort.
      }
    }
    return c.json({ ok: true }, 202);
  });

  return routes;
}
