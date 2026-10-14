import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  APP_NAME,
  CATEGORIES,
  countsAsSpending,
  isCategory,
  isKnownShop,
  isMoneySent,
  paySpan,
  payeeKind,
  projectedSpend,
  samePayment,
  spanProgress,
  summarizeSpan,
  validDate,
  type CategoryId,
  type PaySpan,
  type Tx,
} from "@briv/core";
import { authUsers, consents, payments, places, profiles, settings, type Database } from "@briv/db";
import type { Auth } from "./auth.ts";
import type { Env } from "./env.ts";
import { jsonLogger, type ErrorReporter, type Logger } from "./log.ts";
import { forgetPerson, personFor } from "./people.ts";
import { seal } from "./seal.ts";
import { inUk, type TownResolver } from "./town.ts";

type Vars = { userId: string; personId: string; requestId: string };

export type AppDeps = {
  db: Database;
  auth: Auth;
  env: Env;
  resolveTown: TownResolver;
  /** Today, for pay periods. Tests pass a fixed day. */
  today?: () => Date;
  /** Where logs go. JSON lines on stdout unless a test passes its own. */
  log?: Logger;
  /** Where server errors go besides the log, such as an error-tracking service. */
  report?: ErrorReporter;
};

const town = z.string().trim().min(2).max(80);

const profilePatch = z
  .object({
    name: z.string().trim().min(1).max(60),
    homeTown: town.nullable(),
    paydayRule: z.enum(["none", "day_of_month", "last_working_day", "last_friday"]),
    paydayDay: z.number().int().min(1).max(31).nullable(),
    usualTakeHome: z.number().int().min(0).max(100_000_000).nullable(),
    country: z.literal("GB"),
    onboarded: z.literal(true),
  })
  .partial()
  .strict();

const locationAnswer = z
  .object({
    allowed: z.boolean(),
    precise: z.boolean().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    town: town.optional(),
  })
  .strict();

const newPayment = z
  .object({
    amount: z.number().int().positive().max(100_000_000),
    spentOn: z.string().refine(validDate, "Use a real date, like 2026-10-13."),
    shopName: z.string().trim().max(80).nullable().optional(),
    category: z.string().refine(isCategory, `Pick one of ${APP_NAME}'s categories.`),
    kind: z.string().trim().max(40).optional(),
    note: z.string().trim().max(280).optional(),
    source: z.enum(["typed", "receipt", "statement", "message", "voice", "email", "bank"]).default("typed"),
    hasReceipt: z.boolean().optional(),
    toPerson: z.boolean().optional(),
    statement: z.string().max(500).optional(),
    /** Answer to "Already saved?": keep both, or replace the saved one. */
    duplicate: z
      .discriminatedUnion("choice", [
        z.object({ choice: z.literal("keep_both") }),
        z.object({ choice: z.literal("replace"), savedId: z.string().uuid() }),
      ])
      .optional(),
  })
  .strict();

function bad(message: string, status: 400 | 401 | 404 | 409 = 400): never {
  throw new HTTPException(status, { message });
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) bad(result.error.issues[0]?.message ?? "Something in the form is not right.");
  return result.data;
}

function paydayOf(profile: { paydayRule: string; paydayDay: number | null }): number | null {
  return profile.paydayRule === "day_of_month" ? profile.paydayDay : null;
}

export function createApp(deps: AppDeps) {
  const { db, auth, env, resolveTown } = deps;
  const today = deps.today ?? (() => new Date());
  const log = deps.log ?? jsonLogger;
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
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    const context = { requestId: c.var.requestId, method: c.req.method, route: routePath(c, -1) };
    log("error", "server_error", { id: context.requestId, method: context.method, route: context.route, error: err.name, stack: err.stack });
    try {
      deps.report?.(err, context);
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

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  /* Everything below needs a signed-in person, and only ever sees that person's rows. */
  const me = new Hono<{ Variables: Vars }>();

  me.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) bad("Please sign in again.", 401);
    const personId = await personFor(db, session.user.id);
    if (!personId) bad("Please sign in again.", 401);
    c.set("userId", session.user.id);
    c.set("personId", personId);
    await next();
  });

  async function readMe(userId: string, personId: string) {
    const [user] = await db
      .select({ name: authUsers.name, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, userId));
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, personId));
    const [prefs] = await db.select().from(settings).where(eq(settings.personId, personId));
    const towns = await db
      .select({ id: places.id, town: places.town })
      .from(places)
      .where(eq(places.personId, personId))
      .orderBy(asc(places.createdAt));
    return {
      name: user?.name ?? "",
      email: user?.email ?? "",
      profile: {
        country: profile.country,
        currency: profile.currency,
        homeTown: profile.homeTown,
        paydayRule: profile.paydayRule,
        paydayDay: profile.paydayDay,
        usualTakeHome: profile.usualTakeHome,
        preciseLocation: profile.preciseLocation,
        locationAsked: profile.locationAskedAt !== null,
        onboarded: profile.onboardedAt !== null,
      },
      settings: { reminders: prefs?.reminders ?? true, weeklyDay: prefs?.weeklyDay ?? null },
      places: towns,
    };
  }

  me.get("/", async (c) => c.json(await readMe(c.var.userId, c.var.personId)));

  me.patch("/", async (c) => {
    const patch = parse(profilePatch, await c.req.json().catch(() => ({})));
    if (patch.name !== undefined) {
      await db.update(authUsers).set({ name: patch.name }).where(eq(authUsers.id, c.var.userId));
    }
    const update: Partial<typeof profiles.$inferInsert> = {};
    if (patch.homeTown !== undefined) update.homeTown = patch.homeTown;
    if (patch.paydayRule !== undefined) update.paydayRule = patch.paydayRule;
    if (patch.paydayDay !== undefined) {
      update.paydayDay = patch.paydayDay;
      if (patch.paydayRule === undefined) update.paydayRule = patch.paydayDay ? "day_of_month" : "none";
    }
    if (patch.usualTakeHome !== undefined) update.usualTakeHome = patch.usualTakeHome;
    if (patch.country !== undefined) update.country = patch.country;
    if (patch.onboarded) update.onboardedAt = new Date();
    if (Object.keys(update).length > 0) await db.update(profiles).set(update).where(eq(profiles.id, c.var.personId));
    return c.json(await readMe(c.var.userId, c.var.personId));
  });

  /**
   * The location question, asked once after the first sign-in.
   * A point is turned into a town and then dropped. Only the town is kept.
   */
  me.post("/location", async (c) => {
    const answer = parse(locationAnswer, await c.req.json().catch(() => ({})));
    const personId = c.var.personId;
    let found: string | null = answer.town ?? null;
    if (answer.allowed && !found && answer.lat !== undefined && answer.lng !== undefined) {
      found = inUk(answer.lat, answer.lng) ? await resolveTown(answer.lat, answer.lng).catch(() => null) : null;
    }
    await db.insert(consents).values({ personId, kind: "location", granted: answer.allowed });
    if (answer.allowed) {
      await db.insert(consents).values({ personId, kind: "precise_location", granted: answer.precise === true });
    }
    await db
      .update(profiles)
      .set({
        locationAskedAt: new Date(),
        preciseLocation: answer.allowed && answer.precise === true,
        ...(found ? { homeTown: found } : {}),
      })
      .where(eq(profiles.id, personId));
    return c.json({ town: found, me: await readMe(c.var.userId, personId) });
  });

  /** Extra towns typed by hand, such as where you work. */
  me.post("/places", async (c) => {
    const body = parse(z.object({ town }).strict(), await c.req.json().catch(() => ({})));
    await db.insert(places).values({ personId: c.var.personId, town: body.town }).onConflictDoNothing();
    return c.json(await readMe(c.var.userId, c.var.personId));
  });

  me.delete("/places/:id", async (c) => {
    const id = parse(z.string().uuid(), c.req.param("id"));
    await db.delete(places).where(and(eq(places.id, id), eq(places.personId, c.var.personId)));
    return c.json(await readMe(c.var.userId, c.var.personId));
  });

  me.delete("/", async (c) => {
    // Deleting goes through sign-in so sessions and passkeys go too. The profile, and
    // with it every payment, is removed in the beforeDelete hook.
    const response = await auth.api.deleteUser({ body: {}, headers: c.req.raw.headers, asResponse: true });
    forgetPerson(c.var.userId);
    return response;
  });

  function toTx(row: typeof payments.$inferSelect): Tx {
    return {
      id: row.id,
      merchant: row.shopName ?? "",
      description: row.shopName ?? "",
      amountPence: row.amount,
      category: (isCategory(row.category) ? row.category : "other") as CategoryId,
      spentOn: row.spentOn,
      source: "manual",
      hasReceipt: row.hasReceipt,
      note: row.note ?? "",
      items: [],
      rawAlert: "",
      isSample: false,
      createdAt: row.createdAt.toISOString(),
    };
  }

  function publicPayment(row: typeof payments.$inferSelect) {
    return {
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      spentOn: row.spentOn,
      shopName: row.shopName,
      category: row.category,
      kind: row.kind,
      source: row.source,
      countsAsSpending: row.countsAsSpending,
      toPerson: row.toPerson,
      hasReceipt: row.hasReceipt,
      note: row.note,
    };
  }

  me.get("/payments", async (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (from && !validDate(from)) bad("Use a real start date.");
    if (to && !validDate(to)) bad("Use a real end date.");
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 500) || 500, 1), 500);
    const rows = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.personId, c.var.personId),
          from ? gte(payments.spentOn, from) : undefined,
          to ? lte(payments.spentOn, to) : undefined,
        ),
      )
      .orderBy(desc(payments.spentOn), desc(payments.createdAt))
      .limit(limit);
    return c.json({ payments: rows.map(publicPayment) });
  });

  me.post("/payments", async (c) => {
    const body = parse(newPayment, await c.req.json().catch(() => ({})));
    const personId = c.var.personId;
    const category = body.category as CategoryId;
    // Money sent to a person keeps no name, even when the app did not say so:
    // "SOMTOCHUKWU NKEMEL" filed as a gift is a person, Moonpig is a shop.
    const named = body.shopName ?? "";
    const looksSent =
      payeeKind(named, body.statement ?? "") === "person" &&
      isMoneySent({ merchant: named, description: body.statement, category, source: body.source }, isKnownShop(named));
    const toPerson = body.toPerson ?? looksSent;
    const shopName = toPerson ? null : (body.shopName ?? null);

    // Same amount, same shop, same date: ask before saving twice.
    const sameDay = await db
      .select()
      .from(payments)
      .where(and(eq(payments.personId, personId), eq(payments.amount, body.amount), eq(payments.spentOn, body.spentOn)));
    const match = sameDay.find((row) =>
      samePayment(
        { merchant: row.shopName ?? "", amountPence: row.amount, spentOn: row.spentOn },
        { merchant: shopName ?? "", amountPence: body.amount, spentOn: body.spentOn },
      ),
    );
    if (match && !body.duplicate) {
      return c.json({ error: "This looks already saved.", duplicate: publicPayment(match) }, 409);
    }
    if (body.duplicate?.choice === "replace") {
      await db.delete(payments).where(and(eq(payments.id, body.duplicate.savedId), eq(payments.personId, personId)));
    }

    const [row] = await db
      .insert(payments)
      .values({
        personId,
        amount: body.amount,
        spentOn: body.spentOn,
        shopName,
        category,
        kind: body.kind ?? null,
        note: body.note ?? null,
        source: body.source,
        hasReceipt: body.hasReceipt ?? false,
        toPerson,
        countsAsSpending: countsAsSpending(category),
        // A payment to a person keeps no statement text: it would name them.
        statementSealed: body.statement && !toPerson ? seal(body.statement, env.sealKey) : null,
      })
      .returning();
    return c.json({ payment: publicPayment(row) }, 201);
  });

  me.delete("/payments/:id", async (c) => {
    const id = parse(z.string().uuid(), c.req.param("id"));
    const gone = await db
      .delete(payments)
      .where(and(eq(payments.id, id), eq(payments.personId, c.var.personId)))
      .returning({ id: payments.id });
    if (gone.length === 0) bad("That spend was not found.", 404);
    return c.json({ ok: true });
  });

  /** Home: spent so far this pay, and the pace against the last pay period on the same day. */
  me.get("/summary", async (c) => {
    const personId = c.var.personId;
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, personId));
    const now = today();
    const payday = paydayOf(profile);
    const current = paySpan(now, payday);
    const previous = paySpan(now, payday, -1);
    const rows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.personId, personId), gte(payments.spentOn, previous.start), lte(payments.spentOn, current.end)));
    const txs = rows.map(toTx);
    const progress = spanProgress(current, now);
    const thisPay = summarizeSpan(txs, current);
    const lastPay = summarizeSpan(txs, previous);
    const sameDayLast = sameDayOf(previous, progress.day);
    const lastPaySoFar = summarizeSpan(txs, sameDayLast);
    return c.json({
      period: { ...current, day: progress.day, days: progress.days },
      previousPeriod: previous,
      takeHome: profile.usualTakeHome,
      spent: thisPay.spent,
      moved: thisPay.moved,
      count: thisPay.count,
      byCategory: thisPay.byCategory,
      lastPayByCategory: lastPay.byCategory,
      lastPaySpent: lastPay.spent,
      lastPaySameDay: lastPaySoFar.spent,
      projected: projectedSpend(thisPay.spent, progress.day, progress.days),
      categories: CATEGORIES,
    });
  });

  app.route("/me", me);
  return app;
}

/** The first `day` days of a pay period. */
function sameDayOf(span: PaySpan, day: number): PaySpan {
  const [y, m, d] = span.start.split("-").map(Number);
  const end = new Date(y, m - 1, d + Math.max(day, 1) - 1);
  const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return { ...span, end: iso < span.end ? iso : span.end };
}

export type App = ReturnType<typeof createApp>;
