import { Hono } from "hono";
import {
  CATEGORIES,
  everyOf,
  fitBudget,
  lineProgress,
  paySpan,
  projectedSpend,
  spanProgress,
  suggestBudget,
  summarizeSpan,
  usualByCategory,
  type BudgetPlan,
  type CategoryId,
} from "@briv/core";
import { budgetSave, payConfirm, regularChange, type BudgetAnswer, type BudgetDraft, type PayInfo, type Summary } from "@briv/contract";
import type { Person } from "../data/person.ts";
import { bad, parse, type Vars } from "../http.ts";
import { payNow, regularItem, regularsNow, safeNow, sameDayOf } from "../money.ts";
import type { RouteDeps } from "./deps.ts";

function draftOf(plan: BudgetPlan, takeHome: number | null): BudgetDraft {
  return {
    takeHome,
    lines: plan.lines.map((line) => ({
      name: line.name,
      category: line.category,
      amount: line.amountPence,
      neverCut: line.neverCut,
      usual: Math.round(line.usualPence),
      kind: line.kind,
    })),
    planned: plan.plannedPence,
    spare: plan.sparePence,
    savings: plan.savingsPence,
    usualSavings: Math.round(plan.usualSavingsPence),
    fixed: plan.fixedPence,
    trimmed: plan.trimmed.map((row) => ({ name: row.name, from: row.fromPence, to: row.toPence })),
    savingsCut: plan.savingsCut,
    tight: plan.tight,
    fixedOver: plan.fixedOver,
  };
}

/** Home's summary, this pay's take-home, the budget and regular payments. */
export function moneyRoutes(deps: RouteDeps, person: (personId: string) => Person) {
  const { today } = deps;
  const routes = new Hono<{ Variables: Vars }>();

  /** Home: spent so far this pay, the pace against the last pay on the same day, and what is safe to spend. */
  routes.get("/summary", async (c) => {
    const mine = person(c.var.personId);
    const now = today();
    const pay = await payNow(mine, now);
    const txs = await mine.payments.between(pay.previous.start, pay.current.end);
    const progress = spanProgress(pay.current, now);
    const thisPay = summarizeSpan(txs, pay.current);
    const lastPay = summarizeSpan(txs, pay.previous);
    const lastPaySoFar = summarizeSpan(txs, sameDayOf(pay.previous, progress.day));
    const summary: Summary & { categories: typeof CATEGORIES } = {
      period: { ...pay.current, day: progress.day, days: progress.days },
      previousPeriod: pay.previous,
      takeHome: pay.takeHome,
      takeHomeConfirmed: pay.confirmed,
      spent: thisPay.spent,
      moved: thisPay.moved,
      count: thisPay.count,
      byCategory: thisPay.byCategory,
      lastPayByCategory: lastPay.byCategory,
      lastPaySpent: lastPay.spent,
      lastPaySameDay: lastPaySoFar.spent,
      projected: projectedSpend(thisPay.spent, progress.day, progress.days),
      safe: await safeNow(mine, pay, thisPay.spent, now),
      categories: CATEGORIES,
    };
    return c.json(summary);
  });

  /** This pay's take-home: what the person confirmed, or the usual one. */
  routes.get("/pay", async (c) => {
    const pay = await payNow(person(c.var.personId), today());
    const answer: PayInfo = { period: pay.current, takeHome: pay.takeHome, confirmed: pay.confirmed, usual: pay.usual };
    return c.json(answer);
  });

  /** "Was your pay £2,400?" The answer, for this pay period only. */
  routes.put("/pay", async (c) => {
    const body = parse(payConfirm, await c.req.json().catch(() => ({})));
    const mine = person(c.var.personId);
    const pay = await payNow(mine, today());
    await mine.income.confirm(pay.current, body.takeHome);
    const answer: PayInfo = { period: pay.current, takeHome: body.takeHome, confirmed: true, usual: pay.usual };
    return c.json(answer);
  });

  /** This pay's budget, each line with what is spent on it so far. */
  routes.get("/budget", async (c) => {
    const mine = person(c.var.personId);
    const pay = await payNow(mine, today());
    const { lines } = await mine.budget.lines(pay.current.start);
    const txs = await mine.payments.between(pay.current.start, pay.current.end);
    const answer: BudgetAnswer = {
      period: pay.current,
      takeHome: pay.takeHome,
      lines: lines.map((line) => ({
        ...line,
        spent: lineProgress({ ...line, amountPence: line.amount }, txs, pay.current).spentPence,
      })),
      planned: lines.reduce((sum, line) => sum + line.amount, 0),
    };
    return c.json(answer);
  });

  /**
   * A budget for the person to check before saving. Made from their last three
   * pays, or with `fit=1`, their saved budget fitted to the take-home. Never
   * more than the take-home, savings first, rent and bills kept.
   */
  routes.get("/budget/draft", async (c) => {
    const mine = person(c.var.personId);
    const now = today();
    const pay = await payNow(mine, now);
    const lastThree = [pay.previous, paySpan(now, pay.payday, -2), paySpan(now, pay.payday, -3)];
    const txs = await mine.payments.between(lastThree[2].start, pay.previous.end);
    const takeHome = pay.takeHome ?? 0;
    let plan: BudgetPlan;
    if (c.req.query("fit") === "1") {
      const { lines } = await mine.budget.lines(pay.current.start);
      if (lines.length === 0) bad("There is no budget to fit yet. Make one first.", 404);
      const usual = usualByCategory(txs, lastThree);
      plan = fitBudget(
        lines.map((line) => ({ id: line.id, name: line.name, category: line.category, amountPence: line.amount, neverCut: line.neverCut })),
        takeHome,
        usual.savingsPence + usual.investmentsPence,
      );
    } else {
      plan = suggestBudget(txs, lastThree, takeHome);
    }
    return c.json(draftOf(plan, pay.takeHome));
  });

  /** Saves this pay's budget, as the person checked it. */
  routes.put("/budget", async (c) => {
    const body = parse(budgetSave, await c.req.json().catch(() => ({})));
    const mine = person(c.var.personId);
    const pay = await payNow(mine, today());
    await mine.budget.save(
      pay.current.start,
      body.lines.map((line) => ({ name: line.name, category: line.category as CategoryId | null, amount: line.amount, neverCut: line.neverCut })),
    );
    return c.json({ saved: body.lines.length });
  });

  /** What comes out regularly: soonest first, stopped ones last. */
  routes.get("/regulars", async (c) => {
    const pay = await payNow(person(c.var.personId), today());
    const items = (await regularsNow(person(c.var.personId), pay.today)).map(regularItem);
    return c.json({ items });
  });

  /** Mark a regular payment as stopped (cancelled), start it again, or turn its reminder off. */
  routes.patch("/regulars/:key", async (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    const body = parse(regularChange, await c.req.json().catch(() => ({})));
    const mine = person(c.var.personId);
    const pay = await payNow(mine, today());
    const found = (await regularsNow(mine, pay.today)).find((item) => item.key === key);
    if (!found) bad("That regular payment was not found.", 404);
    const every = everyOf(found.freq);
    await mine.regulars.set(
      { key: found.key, name: found.name, category: found.category, amount: found.amountPence, every: every.every, everyCount: every.count },
      body,
    );
    const item = (await regularsNow(mine, pay.today)).find((row) => row.key === key);
    return c.json({ item: item ? regularItem(item) : null });
  });

  return routes;
}
