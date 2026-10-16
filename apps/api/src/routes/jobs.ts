import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { londonToday } from "@briv/core";
import type { Database } from "@briv/db";
import { bad } from "../http.ts";
import { runRetention } from "../jobs/retention.ts";
import { safeError, type ErrorReporter, type Logger } from "../log.ts";

/*
 * Jobs a host's scheduler calls over the web, such as Vercel's daily cron.
 * Each needs the shared secret (CRON_SECRET) as a bearer token; without the
 * secret set, every call is refused. Answers say only whether it worked.
 */
export function jobRoutes(deps: { db: Database; secret?: string; log: Logger; report?: ErrorReporter; today?: () => string }) {
  const app = new Hono();
  const today = deps.today ?? londonToday;

  app.get("/retention", async (c) => {
    if (!deps.secret || !sameText(c.req.header("authorization") ?? "", `Bearer ${deps.secret}`)) bad("Not allowed.", 401);
    try {
      const result = await runRetention(deps.db, today());
      deps.log("info", "job_done", { job: "retention", ...result });
      return c.json({ ok: true });
    } catch (error) {
      const problem = safeError(error);
      deps.log("error", "job_failed", { job: "retention", ...problem });
      try {
        deps.report?.(problem, { source: "job", route: "retention" });
      } catch {
        // A reporter that fails must never turn one error into two.
      }
      return c.json({ error: "The job did not finish. It runs again tomorrow." }, 500);
    }
  });

  return app;
}

/** Compares two secrets in the same time whatever they hold. */
function sameText(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
