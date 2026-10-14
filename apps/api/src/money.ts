import {
  addDays,
  billsBeforePayday,
  findRegulars,
  isFreq,
  safeToSpend,
  spanProgress,
  paySpan,
  todayISO,
  type Payday,
  type PaySpan,
  type Regular,
  type RegularSpend,
} from "@briv/core";
import type { RegularItem, SafeToSpend } from "@briv/contract";
import type { Person } from "./data/person.ts";

/*
 * The money picture for one person today: which pay period it is, what came
 * in, what goes out regularly, and what is safe to spend until payday. Shared
 * by Home, Pay, Budget and Regular payments, so they always agree.
 */

/** How long back regular payments are looked for. */
const REGULAR_LOOKBACK_DAYS = 400;

export function paydayOf(profile: { paydayRule: string; paydayDay: number | null }): Payday {
  if (profile.paydayRule === "day_of_month" && profile.paydayDay) return { rule: "day_of_month", day: profile.paydayDay };
  if (profile.paydayRule === "last_working_day") return { rule: "last_working_day" };
  if (profile.paydayRule === "last_friday") return { rule: "last_friday" };
  return null;
}

export type PayNow = {
  today: string;
  payday: Payday;
  current: PaySpan;
  previous: PaySpan;
  /** Confirmed for this pay, else the usual take-home, else unknown. */
  takeHome: number | null;
  confirmed: boolean;
  usual: number | null;
};

export async function payNow(mine: Person, now: Date): Promise<PayNow> {
  const profile = await mine.profile();
  const payday = paydayOf(profile);
  const current = paySpan(now, payday);
  const previous = paySpan(now, payday, -1);
  const income = await mine.income.of(current.start);
  const confirmed = Boolean(income?.confirmed && income.takeHome != null);
  return {
    today: todayISO(now),
    payday,
    current,
    previous,
    takeHome: confirmed ? (income?.takeHome ?? null) : profile.usualTakeHome,
    confirmed,
    usual: profile.usualTakeHome,
  };
}

/** Everything that comes out regularly, worked out from the last year of payments and the person's own changes. */
export async function regularsNow(mine: Person, today: string): Promise<Regular[]> {
  const txs = await mine.payments.between(addDays(today, -REGULAR_LOOKBACK_DAYS), today);
  // A payment to a person has no name to group by, so it is never a "regular payment" here.
  const spends: RegularSpend[] = txs
    .filter((tx) => tx.merchant.trim().length > 0)
    .map((tx) => ({ merchant: tx.merchant, amountPence: tx.amountPence, category: tx.category, spentOn: tx.spentOn }));
  const settings = (await mine.regulars.settings()).map((row) => ({
    key: row.key,
    name: row.name,
    amountPence: null,
    freq: null,
    nextDue: null,
    stopped: row.stopped,
    stoppedOn: row.stoppedOn,
    remind: row.remind,
  }));
  return findRegulars(spends, settings, today);
}

export function regularItem(item: Regular): RegularItem {
  return {
    key: item.key,
    name: item.name,
    amount: item.amountPence,
    freq: isFreq(item.freq) ? item.freq : "monthly",
    lastPaid: item.lastPaid,
    nextDue: item.nextDue,
    daysLeft: item.daysLeft,
    monthly: item.monthlyPence,
    category: item.category,
    stopped: item.stopped,
    lapsed: item.lapsed,
    paidAfterStop: item.paidAfterStop,
    remind: item.remind,
    subscription: item.subscription,
    rise: item.rise ? { from: item.rise.fromPence, to: item.rise.toPence, on: item.rise.on } : null,
  };
}

/** Take-home, less spent so far, less bills still to come before payday. Null when the take-home is not known. */
export async function safeNow(mine: Person, pay: PayNow, spent: number, now: Date): Promise<SafeToSpend | null> {
  if (pay.takeHome == null || pay.takeHome <= 0) return null;
  const progress = spanProgress(pay.current, now);
  if (progress.complete) return null;
  const bills = billsBeforePayday(await regularsNow(mine, pay.today), pay.today, pay.current.end);
  const safe = safeToSpend({ takeHomePence: pay.takeHome, spentPence: spent, bills, today: pay.today, end: pay.current.end });
  return {
    safe: safe.safePence,
    perDay: safe.perDayPence,
    daysLeft: safe.daysLeft,
    bills: bills.map((bill) => ({ key: bill.key, name: bill.name, due: bill.due, amount: bill.amountPence })),
  };
}

/** The first `day` days of a pay period. */
export function sameDayOf(span: PaySpan, day: number): PaySpan {
  const end = addDays(span.start, Math.max(day, 1) - 1);
  return { ...span, end: end < span.end ? end : span.end };
}

