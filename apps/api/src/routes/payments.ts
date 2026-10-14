import { Hono } from "hono";
import {
  CATEGORIES,
  countsAsSpending,
  isPaymentToPerson,
  paySpan,
  projectedSpend,
  samePayment,
  spanProgress,
  summarizeSpan,
  validDate,
  type CategoryId,
  type Payday,
  type PaySpan,
} from "@briv/core";
import { newPayment, type Summary } from "@briv/contract";
import { z } from "zod";
import type { Person } from "../data/person.ts";
import { bad, parse, type Vars } from "../http.ts";
import type { RouteDeps } from "./deps.ts";

function paydayOf(profile: { paydayRule: string; paydayDay: number | null }): Payday {
  if (profile.paydayRule === "day_of_month" && profile.paydayDay) return { rule: "day_of_month", day: profile.paydayDay };
  if (profile.paydayRule === "last_working_day") return { rule: "last_working_day" };
  if (profile.paydayRule === "last_friday") return { rule: "last_friday" };
  return null;
}

/** The first `day` days of a pay period. */
function sameDayOf(span: PaySpan, day: number): PaySpan {
  const [y, m, d] = span.start.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + Math.max(day, 1) - 1)).toISOString().slice(0, 10);
  return { ...span, end: end < span.end ? end : span.end };
}

/** Spends: list, add, remove, and Home's summary of this pay. */
export function paymentRoutes(deps: RouteDeps, person: (personId: string) => Person) {
  const { today } = deps;
  const routes = new Hono<{ Variables: Vars }>();

  routes.get("/payments", async (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (from && !validDate(from)) bad("Use a real start date.");
    if (to && !validDate(to)) bad("Use a real end date.");
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 500) || 500, 1), 500);
    return c.json({ payments: await person(c.var.personId).payments.list({ from, to, limit }) });
  });

  routes.post("/payments", async (c) => {
    const body = parse(newPayment, await c.req.json().catch(() => ({})));
    const mine = person(c.var.personId);
    const category = body.category as CategoryId;
    // A person's name is never kept, whatever the app said: "SOMTOCHUKWU NKEMEL" filed as a
    // gift, a landlord paid rent, a childminder. Moonpig and LemFi keep their names.
    const toPerson = isPaymentToPerson({ merchant: body.shopName ?? "", description: body.statement, category, toPerson: body.toPerson });
    const shopName = toPerson ? null : (body.shopName ?? null);

    // Same amount, same shop, same date: ask before saving twice.
    const sameDay = await mine.payments.sameDay(body.amount, body.spentOn);
    const match = sameDay.find((row) =>
      samePayment(
        { merchant: row.shopName ?? "", amountPence: body.amount, spentOn: body.spentOn },
        { merchant: shopName ?? "", amountPence: body.amount, spentOn: body.spentOn },
      ),
    );
    if (match && !body.duplicate) return c.json({ error: "This looks already saved.", duplicate: match.payment }, 409);

    const payment = await mine.payments.add(
      {
        amount: body.amount,
        spentOn: body.spentOn,
        shopName,
        category,
        kind: body.kind ?? null,
        note: body.note || null,
        source: body.source,
        hasReceipt: body.hasReceipt ?? false,
        toPerson,
        countsAsSpending: countsAsSpending(category),
        // A payment to a person keeps no statement text: it would name them.
        statement: toPerson ? null : body.statement || null,
      },
      body.duplicate?.choice === "replace" ? body.duplicate.savedId : undefined,
    );
    return c.json({ payment }, 201);
  });

  routes.delete("/payments/:id", async (c) => {
    const id = parse(z.string().uuid(), c.req.param("id"));
    if (!(await person(c.var.personId).payments.remove(id))) bad("That spend was not found.", 404);
    return c.json({ ok: true });
  });

  /** Home: spent so far this pay, and the pace against the last pay period on the same day. */
  routes.get("/summary", async (c) => {
    const mine = person(c.var.personId);
    const profile = await mine.profile();
    const now = today();
    const payday = paydayOf(profile);
    const current = paySpan(now, payday);
    const previous = paySpan(now, payday, -1);
    const txs = await mine.payments.between(previous.start, current.end);
    const progress = spanProgress(current, now);
    const thisPay = summarizeSpan(txs, current);
    const lastPay = summarizeSpan(txs, previous);
    const lastPaySoFar = summarizeSpan(txs, sameDayOf(previous, progress.day));
    const summary: Summary & { categories: typeof CATEGORIES } = {
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
    };
    return c.json(summary);
  });

  return routes;
}
