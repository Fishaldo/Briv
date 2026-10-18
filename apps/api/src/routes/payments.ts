import { Hono } from "hono";
import {
  addDays,
  countsAsSpending,
  daysToCheck,
  isPaymentToPerson,
  isSearchPeriod,
  matchesSearch,
  sameSpend,
  searchTotals,
  searchWords,
  SEARCH_PERIODS,
  todayISO,
  validDate,
  type CategoryId,
} from "@briv/core";
import { newPayment, paymentBatch, paymentChange, type BatchAnswer, type PaymentList } from "@briv/contract";
import { z } from "zod";
import type { NewPaymentRow } from "../data/payments.ts";
import { statementKeyOf } from "../data/payments.ts";
import type { Person } from "../data/person.ts";
import { bad, parse, type Vars } from "../http.ts";
import type { RouteDeps } from "./deps.ts";

/** The most payments one list returns. */
const LIST_LIMIT = 500;
/** The most payments one search reads. Two years of daily spending is well under this. */
const SCAN_LIMIT = 5000;

/** Spends: list and search, add one, add many from a statement, change, remove. */
export function paymentRoutes(deps: RouteDeps, person: (personId: string) => Person) {
  const { today } = deps;
  const routes = new Hono<{ Variables: Vars }>();

  /**
   * The person's spends, newest first. `q` searches the shop, kind, category
   * and note; `period` (1w … all) or `from`/`to` limit the days; `category`
   * one category. Totals cover exactly what is listed.
   */
  routes.get("/payments", async (c) => {
    const period = c.req.query("period");
    if (period && !isSearchPeriod(period)) bad("Pick a period: 1w, 1m, 3m, 6m, 1y or all.");
    const days = SEARCH_PERIODS.find((p) => p.id === period)?.days ?? 0;
    const from = c.req.query("from") ?? (days > 0 ? addDays(todayISO(today()), -(days - 1)) : undefined);
    const to = c.req.query("to");
    if (from && !validDate(from)) bad("Use a real start date.");
    if (to && !validDate(to)) bad("Use a real end date.");
    const category = c.req.query("category");
    const words = searchWords(c.req.query("q") ?? "");
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? LIST_LIMIT) || LIST_LIMIT, 1), LIST_LIMIT);
    // Every payment in the range is read, then searched here: the note is sealed, so the database cannot search it.
    // Totals cover everything found, so "all time" adds up all time even when the list is cut.
    const listed = await person(c.var.personId).payments.list({ from, to, limit: SCAN_LIMIT });
    const found = listed.filter((p) => (!category || p.category === category) && matchesSearch(p, words));
    const shown = found.slice(0, limit);
    const answer: PaymentList = { payments: shown, totals: searchTotals(found), more: found.length > limit };
    return c.json(answer);
  });

  routes.get("/payments/:id", async (c) => {
    const id = parse(z.string().uuid(), c.req.param("id"));
    const payment = await person(c.var.personId).payments.get(id);
    if (!payment) bad("That spend was not found.", 404);
    return c.json({ payment });
  });

  routes.post("/payments", async (c) => {
    const body = parse(newPayment, await c.req.json().catch(() => ({})));
    const mine = person(c.var.personId);
    let category = body.category as CategoryId;
    // A person's name is never kept, whatever the app said: "SOMTOCHUKWU NKEMEL" filed as a
    // gift, a landlord paid rent, a childminder. Moonpig and LemFi keep their names.
    const toPerson = isPaymentToPerson({ merchant: body.shopName ?? "", description: body.statement, category, toPerson: body.toPerson });
    let shopName = toPerson ? null : (body.shopName ?? null);

    // The person's own fix for this statement text: "BLD*MYPERFECTCV.CO" is MyPerfectCV, in Subscriptions.
    if (!toPerson && body.statement) {
      const fix = (await mine.fixes.forKeys([statementKeyOf(body.statement, shopName)])).values().next().value;
      if (fix) {
        shopName = fix.shopName;
        category = fix.category;
      }
    }

    // Ask before saving one spend twice: same amount, shop and day, or a receipt
    // and its bank line a few days apart (the no-double-count rules in core).
    const near = await mine.payments.sameAmount(body.amount, daysToCheck(body.spentOn));
    const incoming = { merchant: shopName ?? "", amountPence: body.amount, spentOn: body.spentOn, origin: body.source };
    const match = near.find((row) =>
      sameSpend({ merchant: row.shopName ?? "", amountPence: row.payment.amount, spentOn: row.payment.spentOn, origin: row.payment.source }, incoming),
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

  /**
   * Many payments at once, from a bank statement or a screenshot the person
   * checked. Rows that look already saved come back as clashes, unless the
   * person said keep both; everything else is saved in one step.
   */
  routes.post("/payments/batch", async (c) => {
    const body = parse(paymentBatch, await c.req.json().catch(() => ({})));
    const mine = person(c.var.personId);
    const fixes = await mine.fixes.forKeys(body.rows.map((row) => statementKeyOf(row.statement ?? null, row.shopName)));
    const saved = await mine.payments.onDays(body.rows.flatMap((row) => daysToCheck(row.spentOn)));
    const clashes: BatchAnswer["clashes"] = [];
    const toSave: NewPaymentRow[] = [];
    let fixed = 0;

    body.rows.forEach((row, index) => {
      let category = row.category as CategoryId;
      const toPerson = isPaymentToPerson({ merchant: row.shopName ?? "", description: row.statement, category });
      let shopName = toPerson ? null : row.shopName;
      const fix = toPerson ? undefined : fixes.get(statementKeyOf(row.statement ?? null, row.shopName));
      if (fix) {
        shopName = fix.shopName;
        category = fix.category;
        fixed += 1;
      }
      const incoming = { merchant: shopName ?? "", amountPence: row.amount, spentOn: row.spentOn, origin: body.source };
      for (const old of row.keepBoth ? [] : saved) {
        const reason = sameSpend(
          { merchant: old.shopName ?? "", amountPence: old.payment.amount, spentOn: old.payment.spentOn, origin: old.payment.source },
          incoming,
        );
        if (reason) {
          clashes.push({ index, saved: old.payment, reason });
          return;
        }
      }
      toSave.push({
        amount: row.amount,
        spentOn: row.spentOn,
        shopName,
        category,
        kind: null,
        note: null,
        source: body.source,
        hasReceipt: body.source === "receipt",
        toPerson,
        countsAsSpending: countsAsSpending(category),
        statement: toPerson ? null : row.statement || null,
      });
    });

    const answer: BatchAnswer = { saved: await mine.payments.addMany(toSave), clashes, fixed };
    return c.json(answer, 201);
  });

  /**
   * Changes a saved spend. With `applyToSame`, every other payment with the
   * same statement text takes the new name and category, and so do future
   * ones. Changes to a payment to a person never spread: its text is gone.
   */
  routes.patch("/payments/:id", async (c) => {
    const id = parse(z.string().uuid(), c.req.param("id"));
    const body = parse(paymentChange, await c.req.json().catch(() => ({})));
    const mine = person(c.var.personId);
    const before = await mine.payments.get(id);
    if (!before) bad("That spend was not found.", 404);

    const category = (body.category ?? before.category) as CategoryId;
    const shopName = body.shopName !== undefined ? body.shopName : before.shopName;
    const toPerson =
      body.toPerson === false ? false : isPaymentToPerson({ merchant: shopName ?? "", category, toPerson: body.toPerson ?? before.toPerson });
    const key = toPerson ? "" : await mine.payments.keyOf(id);

    const payment = await mine.payments.update(id, {
      amount: body.amount,
      spentOn: body.spentOn,
      shopName: toPerson ? null : shopName,
      category: body.category as CategoryId | undefined,
      kind: body.kind,
      note: body.note,
      toPerson,
      countsAsSpending: countsAsSpending(category),
      dropStatement: toPerson && !before.toPerson,
    });

    let alsoChanged = 0;
    const renamed = body.shopName !== undefined && body.shopName !== before.shopName;
    const refiled = body.category !== undefined && body.category !== before.category;
    if (body.applyToSame && !toPerson && key && (renamed || refiled) && shopName) {
      const others = await mine.payments.withKey(key, id);
      alsoChanged = await mine.payments.setMany(others, {
        ...(renamed ? { shopName } : {}),
        ...(refiled ? { category, countsAsSpending: countsAsSpending(category) } : {}),
      });
      await mine.fixes.save(key, shopName, category);
    }
    return c.json({ payment, alsoChanged });
  });

  routes.delete("/payments/:id", async (c) => {
    const id = parse(z.string().uuid(), c.req.param("id"));
    if (!(await person(c.var.personId).payments.remove(id))) bad("That spend was not found.", 404);
    return c.json({ ok: true });
  });

  return routes;
}
