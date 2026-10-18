import { z } from "zod";
import { APP_NAME, isCategory, validDate, type CategoryId, type PaySpan } from "@briv/core";

/*
 * What the phone app and the server say to each other, written once. The
 * server checks every request against these schemas; the app uses the same
 * types for what comes back, so the two cannot drift apart.
 */

/* ------------------------------------------------------------------ */
/* Plain text                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Text people type: trimmed, a length limit, and no control characters a database or log would choke on. */
export function plainText(max: number, min = 0) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !CONTROL.test(value), "Use plain text.");
}

const town = plainText(80, 2);

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export const PAYDAY_RULES = ["none", "day_of_month", "last_working_day", "last_friday"] as const;
export type PaydayRuleName = (typeof PAYDAY_RULES)[number];

export const profilePatch = z
  .object({
    name: plainText(60, 1),
    homeTown: town.nullable(),
    paydayRule: z.enum(PAYDAY_RULES),
    paydayDay: z.number().int().min(1).max(31).nullable(),
    usualTakeHome: z.number().int().min(0).max(100_000_000).nullable(),
    country: z.literal("GB"),
    onboarded: z.literal(true),
  })
  .partial()
  .strict();
export type ProfilePatch = z.infer<typeof profilePatch>;

export const locationAnswer = z
  .object({
    allowed: z.boolean(),
    precise: z.boolean().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    town: town.optional(),
  })
  .strict();
export type LocationAnswer = z.infer<typeof locationAnswer>;

export const newPlace = z.object({ town }).strict();

export const PAYMENT_SOURCES = ["typed", "receipt", "statement", "message", "voice", "email", "bank"] as const;

export const newPayment = z
  .object({
    amount: z.number().int().positive().max(100_000_000),
    spentOn: z.string().refine(validDate, "Use a real date, like 2026-10-13."),
    shopName: plainText(80).nullable().optional(),
    category: z.string().refine(isCategory, `Pick one of ${APP_NAME}'s categories.`),
    kind: plainText(40).optional(),
    note: plainText(280).optional(),
    source: z.enum(PAYMENT_SOURCES).default("typed"),
    hasReceipt: z.boolean().optional(),
    /** The person said this went to a person. Briv also decides this itself, and keeps no name either way. */
    toPerson: z.boolean().optional(),
    statement: plainText(500).optional(),
    /** Answer to "Already saved?": keep both, or replace the saved one. */
    duplicate: z
      .discriminatedUnion("choice", [
        z.object({ choice: z.literal("keep_both") }),
        z.object({ choice: z.literal("replace"), savedId: z.string().uuid() }),
      ])
      .optional(),
  })
  .strict();
export type NewPayment = z.input<typeof newPayment>;

/** Changing a saved spend. With `applyToSame`, every payment with the same statement text changes too, and future ones arrive that way. */
export const paymentChange = z
  .object({
    amount: z.number().int().positive().max(100_000_000),
    spentOn: z.string().refine(validDate, "Use a real date, like 2026-10-13."),
    shopName: plainText(80).nullable(),
    category: z.string().refine(isCategory, `Pick one of ${APP_NAME}'s categories.`),
    kind: plainText(40).nullable(),
    note: plainText(280).nullable(),
    toPerson: z.boolean(),
    applyToSame: z.boolean(),
  })
  .partial()
  .strict();
export type PaymentChange = z.input<typeof paymentChange>;

/** The most payments one statement import takes; a longer file is sent in parts. */
export const MAX_BATCH = 300;

/** Payments read from a bank statement or a screenshot, checked by the person, saved together. */
export const paymentBatch = z
  .object({
    source: z.enum(["statement", "receipt", "message"]).default("statement"),
    rows: z
      .array(
        z
          .object({
            amount: z.number().int().positive().max(100_000_000),
            spentOn: z.string().refine(validDate, "Use a real date, like 2026-10-13."),
            shopName: plainText(80).nullable(),
            category: z.string().refine(isCategory, `Pick one of ${APP_NAME}'s categories.`),
            statement: plainText(500).optional(),
            /** Saved anyway when it looks already saved: the person said keep both. */
            keepBoth: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1, "Pick at least one payment to save.")
      .max(MAX_BATCH, `Up to ${MAX_BATCH} payments at a time.`),
  })
  .strict();
export type PaymentBatch = z.input<typeof paymentBatch>;

/** This pay period's take-home, as it really came in. */
export const payConfirm = z.object({ takeHome: z.number().int().min(0).max(100_000_000) }).strict();

/** The most lines a budget holds. */
export const MAX_BUDGET_LINES = 40;

export const budgetSave = z
  .object({
    lines: z
      .array(
        z
          .object({
            name: plainText(40),
            category: z.string().refine(isCategory, `Pick one of ${APP_NAME}'s categories.`).nullable(),
            amount: z.number().int().positive().max(100_000_000),
            neverCut: z.boolean(),
          })
          .strict()
          .refine((line) => line.category !== null || line.name.length > 0, "Give your own line a name, like Perfume."),
      )
      .max(MAX_BUDGET_LINES, `Up to ${MAX_BUDGET_LINES} lines.`),
  })
  .strict();
export type BudgetSave = z.input<typeof budgetSave>;

/** Changing a regular payment: stop it, start it again, or turn its reminder off. */
export const regularChange = z
  .object({
    stopped: z.boolean(),
    remind: z.boolean(),
  })
  .partial()
  .strict();

export const deleteAccount = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.") }).strict();

/* ------------------------------------------------------------------ */
/* App errors                                                          */
/* ------------------------------------------------------------------ */

const ERROR_NAME = /^[A-Za-z]\w{0,59}$/;
/** One place in the code: "at fn (file.js:12:3)". Nothing else gets through, so no data can ride along. */
const STACK_LINE = /^at (?:[\w$.<> -]{1,80} \()?[\w.-]{1,80}:\d{1,7}:\d{1,7}\)?$/;

/** A crash in the app, as the app may send it: the kind of error and where, never what it said. */
export const appError = z
  .object({
    error: z.string().regex(ERROR_NAME, "Send the kind of error."),
    at: z
      .array(z.string().max(200))
      .max(12)
      .transform((lines) => lines.filter((line) => STACK_LINE.test(line)).slice(0, 8)),
  })
  .strict();
export type AppError = z.input<typeof appError>;

/**
 * The safe form of an error in the app. The message is left out (it can hold
 * what someone typed), and each stack line is cut down to a function name and
 * a file:line:column, with no folders or web addresses.
 */
export function appErrorOf(error: unknown): AppError {
  const name = error instanceof Error && ERROR_NAME.test(error.name) ? error.name : "Error";
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  const at: string[] = [];
  for (const raw of stack.split("\n")) {
    const line = raw.trim();
    // The file name, without its folders or a ?query the development server adds.
    const place = /([\w.-]{1,80})(?:\?[^\s()]*)?:(\d{1,7}):(\d{1,7})\)?$/.exec(line);
    if (!place) continue;
    const fn = (/^(?:at\s+)?(.*?)(?:\s+\(|@)/.exec(line)?.[1] ?? "").replace(/[^\w$.<> -]/g, "").slice(0, 80).trim();
    const where = `${place[1]}:${place[2]}:${place[3]}`;
    at.push(fn ? `at ${fn} (${where})` : `at ${where}`);
    if (at.length === 8) break;
  }
  return { error: name, at };
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

export type Me = {
  name: string;
  email: string;
  profile: {
    country: string;
    currency: string;
    homeTown: string | null;
    paydayRule: PaydayRuleName;
    paydayDay: number | null;
    usualTakeHome: number | null;
    preciseLocation: boolean;
    locationAsked: boolean;
    onboarded: boolean;
  };
  settings: { reminders: boolean; weeklyDay: number | null };
  places: { id: string; town: string }[];
};

export type Payment = {
  id: string;
  amount: number;
  currency: string;
  spentOn: string;
  shopName: string | null;
  category: CategoryId;
  kind: string | null;
  source: string;
  countsAsSpending: boolean;
  toPerson: boolean;
  hasReceipt: boolean;
  note: string | null;
};

export type Summary = {
  period: PaySpan & { day: number; days: number };
  previousPeriod: PaySpan;
  takeHome: number | null;
  spent: number;
  moved: number;
  count: number;
  byCategory: { id: CategoryId; amount: number }[];
  lastPayByCategory: { id: CategoryId; amount: number }[];
  lastPaySpent: number;
  lastPaySameDay: number;
  projected: number | null;
  /** True when the person confirmed this pay's take-home; false when it is the usual one, or unknown. */
  takeHomeConfirmed: boolean;
  safe: SafeToSpend | null;
};

export type PaymentList = {
  payments: Payment[];
  /** Totals for everything found, even past the limit: spending, and money moved kept apart. */
  totals: { spent: number; moved: number; count: number; movedCount: number };
  /** True when more were found than the list shows. */
  more: boolean;
};

export type BatchAnswer = {
  saved: number;
  /**
   * Rows that look already saved, with the saved payment, to ask about. "same-day" is the
   * same amount, shop and day; "posted-later" is a bank line a few days after a receipt,
   * alert or typed spend for the same amount at the same shop.
   */
  clashes: { index: number; saved: Payment; reason: "same-day" | "posted-later" }[];
  /** How many rows took a name or category from one of the person's own fixes. */
  fixed: number;
};

export type BillToCome = { key: string; name: string; due: string; amount: number };

export type PayInfo = {
  period: PaySpan;
  /** The take-home this pay: confirmed, or the usual one. */
  takeHome: number | null;
  confirmed: boolean;
  usual: number | null;
};

export type SafeToSpend = {
  /** Take-home, less spent so far, less bills still to come before payday. Below zero means over. */
  safe: number;
  perDay: number;
  daysLeft: number;
  bills: BillToCome[];
};

export type RegularItem = {
  key: string;
  name: string;
  amount: number;
  /** once, weekly, monthly, quarterly or yearly. */
  freq: string;
  lastPaid: string | null;
  nextDue: string | null;
  daysLeft: number | null;
  monthly: number;
  category: CategoryId;
  stopped: boolean;
  lapsed: boolean;
  paidAfterStop: boolean;
  remind: boolean;
  subscription: boolean;
  /** The latest payment went up: from, to, and when. */
  rise: { from: number; to: number; on: string } | null;
};

export type BudgetLineAnswer = {
  id: string;
  name: string;
  category: CategoryId | null;
  amount: number;
  neverCut: boolean;
  /** Spent (or, for savings, put away) on this line so far this pay. */
  spent: number;
};

export type BudgetAnswer = {
  period: PaySpan;
  takeHome: number | null;
  lines: BudgetLineAnswer[];
  planned: number;
};

export type BudgetDraft = {
  takeHome: number | null;
  lines: { name: string; category: CategoryId | null; amount: number; neverCut: boolean; usual: number; kind: "savings" | "fixed" | "flexible" }[];
  planned: number;
  spare: number;
  savings: number;
  usualSavings: number;
  fixed: number;
  trimmed: { name: string; from: number; to: number }[];
  savingsCut: boolean;
  tight: boolean;
  fixedOver: boolean;
};

/** Every refusal carries a plain message; a server error also carries an id to quote. */
export type ErrorAnswer = { error: string; requestId?: string; duplicate?: Payment };
