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
};

/** Every refusal carries a plain message; a server error also carries an id to quote. */
export type ErrorAnswer = { error: string; requestId?: string; duplicate?: Payment };
