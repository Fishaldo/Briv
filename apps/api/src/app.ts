import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import { sql } from "drizzle-orm";
import type { Database } from "@briv/db";
import type { Auth } from "./auth.ts";
import { allow, limitKey } from "./data/account.ts";
import { forPerson } from "./data/person.ts";
import type { Env } from "./env.ts";
import { bad, type Vars } from "./http.ts";
import { jsonLogger, safeError, type ErrorReporter, type Logger } from "./log.ts";
import type { Mailer } from "./mail.ts";
import { personFor } from "./people.ts";
import { errorRoutes } from "./routes/errors.ts";
import { meRoutes } from "./routes/me.ts";
import { moneyRoutes } from "./routes/money.ts";
import { paymentRoutes } from "./routes/payments.ts";
import type { TownResolver } from "./town.ts";

export type AppDeps = {
  db: Database;
  auth: Auth;
  env: Env;
  resolveTown: TownResolver;
  /** Sends email, such as the code to delete an account. */
  mail: Mailer;
  /** Today, for pay periods. Tests pass a fixed day. */
  today?: () => Date;
  /** Where logs go. JSON lines on stdout unless a test passes its own. */
  log?: Logger;
  /** Where server errors go besides the log, such as an error-tracking service. */
  report?: ErrorReporter;
};

/** Nothing a person sends is bigger than this. */
const MAX_BODY = 64 * 1024;

export function createApp(deps: AppDeps) {
  const { db, auth, env } = deps;
  const log = deps.log ?? jsonLogger;
  const routeDeps = { db, env, log, mail: deps.mail, report: deps.report, resolveTown: deps.resolveTown, today: deps.today ?? (() => new Date()) };
  const keys = { keys: env.sealKeys, current: env.sealKeyId };
  const person = (personId: string) => forPerson(db, keys, personId);
  const app = new Hono<{ Variables: Vars }>();

  // Every request gets an id, sent back as X-Request-Id and quoted in error messages.
  app.use("*", requestId());
  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    if (c.req.path === "/health") return;
    // The route pattern, never the full path or query, so no ids or dates land in the log.
    log("info", "request", {
      id: c.var.requestId,
      method: c.req.method,
      route: routePath(c, -1),
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: (origin) => (env.origins.includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization", "expo-origin"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );
  app.use("*", bodyLimit({ maxSize: MAX_BODY, onError: () => bad("That is too much to send at once.", 413) }));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    const context = { source: "server" as const, requestId: c.var.requestId, method: c.req.method, route: routePath(c, -1) };
    const problem = safeError(err);
    log("error", "server_error", { id: context.requestId, method: context.method, route: context.route, ...problem });
    try {
      deps.report?.(problem, context);
    } catch {
      // A reporter that fails must never turn one error into two.
    }
    // The person sees a plain message and an id to quote; never the error itself.
    return c.json({ error: "Something went wrong on our side. Try again in a moment.", requestId: context.requestId }, 500);
  });

  app.notFound((c) => c.json({ error: "There is nothing here." }, 404));

  app.get("/health", async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ ok: true });
  });

  // Better Auth counts sign-in codes by address; this also caps codes to one email address.
  app.use("/api/auth/email-otp/send-verification-otp", async (c, next) => {
    if (c.req.method === "POST") {
      const body = (await c.req.raw.clone().json().catch(() => null)) as { email?: unknown } | null;
      const email = typeof body?.email === "string" ? body.email : "";
      if (email && !(await allow(db, limitKey("code-email", email, env.secret), 5, 3600))) {
        bad("Too many codes asked for this email. Try again in an hour.", 429);
      }
    }
    await next();
  });
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  /* Everything below needs a signed-in person, and only ever sees that person's rows. */
  const me = new Hono<{ Variables: Vars }>();

  me.use("*", async (c, next) => {
    // Changes must come as JSON from a trusted origin (or the phone app, which sends none):
    // a form on another website cannot send JSON without the browser asking first.
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin && !env.origins.includes(origin)) bad("This request did not come from Briv.", 401);
      const type = c.req.header("content-type") ?? "";
      if (type && !type.startsWith("application/json")) bad("Send JSON.");
    }
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) bad("Please sign in again.", 401);
    const personId = await personFor(db, session.user.id);
    if (!personId) bad("Please sign in again.", 401);
    c.set("userId", session.user.id);
    c.set("personId", personId);
    c.set("email", session.user.email);
    await next();
  });

  me.route("/", meRoutes(routeDeps, person));
  me.route("/", paymentRoutes(routeDeps, person));
  me.route("/", moneyRoutes(routeDeps, person));
  me.route("/", errorRoutes(routeDeps));
  app.route("/me", me);
  return app;
}

export type App = ReturnType<typeof createApp>;
