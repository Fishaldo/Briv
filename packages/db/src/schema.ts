/*
 * Briv's database, as agreed in the plan's Data model tab.
 *
 * Two sides:
 * - The private side is everything about one person. It hangs off `profiles.id`,
 *   a random number. Name and email live only in the sign-in tables, which point
 *   at the profile by that number. Nothing on the money side names anybody.
 * - The shared side (shops, offers, prices, plan results) is built once and used
 *   by everyone. It never says who shops where.
 *
 * Amounts are whole minor units (pence for GBP) and always travel with a currency.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => bigint(name, { mode: "number" });
const currency = () => char("currency", { length: 3 }).notNull().default("GBP");
const person = () =>
  uuid("person_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" });

/* ------------------------------------------------------------------ */
/* Sign-in. Managed by Better Auth. Nothing about money.               */
/* ------------------------------------------------------------------ */

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** The only link to the money side. Random, and not a foreign key on purpose. */
  personId: uuid("person_id").unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

/** How a person signs in: Apple, Google, or email. */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
);

/** Short-lived sign-in codes. */
export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);

export const authPasskeys = pgTable(
  "auth_passkeys",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    aaguid: text("aaguid"),
  },
  (t) => [index("auth_passkeys_user_idx").on(t.userId), index("auth_passkeys_credential_idx").on(t.credentialID)],
);

/** Sign-in attempts counted by address, shared by every server, so limits hold however many servers run. */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/**
 * Briv's own counters for things that must not be repeated too often, such as
 * codes sent to one email address. The key is a hash, never the address itself.
 */
export const requestLimits = pgTable("request_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/* ------------------------------------------------------------------ */
/* About the person                                                    */
/* ------------------------------------------------------------------ */

export const paydayRule = pgEnum("payday_rule", ["none", "day_of_month", "last_working_day", "last_friday"]);

export const profiles = pgTable("profiles", {
  /** The random number. Every private table points here. */
  id: uuid("id").primaryKey().defaultRandom(),
  country: char("country", { length: 2 }).notNull().default("GB"),
  currency: currency(),
  homeTown: text("home_town"),
  paydayRule: paydayRule("payday_rule").notNull().default("none"),
  /** 1 to 31, used when the rule is day_of_month. A short month uses its last day. */
  paydayDay: smallint("payday_day"),
  /** The take-home the person told us. Each period's actual pay lives in income_periods. */
  usualTakeHome: money("usual_take_home"),
  preciseLocation: boolean("precise_location").notNull().default(false),
  /** Set once the location question has been asked, whatever the answer. */
  locationAskedAt: timestamp("location_asked_at", { withTimezone: true }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const incomePeriods = pgTable(
  "income_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    takeHome: money("take_home"),
    currency: currency(),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("income_periods_person_start_idx").on(t.personId, t.startsOn)],
);

/** Extra towns the person typed. Town names only, never coordinates. */
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    town: text("town").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("places_person_town_idx").on(t.personId, sql`lower(${t.town})`)],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    platform: text("platform").notNull(),
    pushToken: text("push_token").notNull().unique(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("devices_person_idx").on(t.personId)],
);

export const consentKind = pgEnum("consent_kind", [
  "location",
  "precise_location",
  "email_access",
  "bank_connection",
  "marketing",
]);

/** Every allow and withdraw, so the person can see what they agreed to and when. */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    kind: consentKind("kind").notNull(),
    granted: boolean("granted").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_person_kind_idx").on(t.personId, t.kind, t.at)],
);

export const settings = pgTable("settings", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  reminders: boolean("reminders").notNull().default(true),
  /** 0 is Sunday. Null means no weekly check-in. */
  weeklyDay: smallint("weekly_day"),
  ownCategories: jsonb("own_categories").$type<{ id: string; label: string }[]>().notNull().default([]),
  ownKinds: jsonb("own_kinds").$type<{ id: string; label: string; category: string }[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* About money                                                         */
/* ------------------------------------------------------------------ */

export const connectionProvider = pgEnum("connection_provider", ["apple_wallet", "partner", "upload"]);

/** A connected bank or card. No account numbers, no sort codes, no passwords. */
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    provider: connectionProvider("provider").notNull(),
    bankName: text("bank_name"),
    accountType: text("account_type"),
    label: text("label"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    consentEndsAt: timestamp("consent_ends_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("connections_person_idx").on(t.personId)],
);

export const paymentSource = pgEnum("payment_source", [
  "bank",
  "receipt",
  "statement",
  "message",
  "voice",
  "email",
  "typed",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    currency: currency(),
    spentOn: date("spent_on").notNull(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    /** The shop as the person sees it. Empty for payments to people. */
    shopName: text("shop_name"),
    category: text("category").notNull(),
    /** Finer than the category: perfume, coffee, school shoes. */
    kind: text("kind"),
    source: paymentSource("source").notNull(),
    /** False for savings, investments and transfers. */
    countsAsSpending: boolean("counts_as_spending").notNull().default(true),
    /** A payment to a person keeps only amount and date. */
    toPerson: boolean("to_person").notNull().default(false),
    /** The statement line, encrypted by the server before it is stored. */
    statementSealed: text("statement_sealed"),
    hasReceipt: boolean("has_receipt").notNull().default(false),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payments_person_day_idx").on(t.personId, t.spentOn),
    index("payments_person_amount_day_idx").on(t.personId, t.amount, t.spentOn),
  ],
);

export const paymentItems = pgTable(
  "payment_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    personId: person(),
    name: text("name").notNull(),
    size: text("size"),
    quantity: numeric("quantity", { precision: 10, scale: 3 }),
    amount: money("amount").notNull(),
    currency: currency(),
    category: text("category"),
    position: smallint("position").notNull().default(0),
  },
  (t) => [index("payment_items_payment_idx").on(t.paymentId), index("payment_items_person_idx").on(t.personId)],
);

/** Payments older than 2 years are rolled up here, then deleted. */
export const monthlyTotals = pgTable(
  "monthly_totals",
  {
    personId: person(),
    month: date("month").notNull(),
    category: text("category").notNull(),
    currency: currency(),
    total: money("total").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.month, t.category, t.currency] })],
);

/** "This statement text is this shop, in this category." */
export const payeeFixes = pgTable(
  "payee_fixes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    statementKey: text("statement_key").notNull(),
    shopName: text("shop_name").notNull(),
    category: text("category").notNull(),
    kind: text("kind"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payee_fixes_person_key_idx").on(t.personId, t.statementKey)],
);

/** One-tap questions waiting for an answer, such as "Is there a receipt?". */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '60 days'`),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("questions_person_open_idx").on(t.personId, t.answeredAt)],
);

export const regularPayments = pgTable(
  "regular_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    name: text("name").notNull(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    amount: money("amount").notNull(),
    currency: currency(),
    /** week, month or year, with how many of them: every 4 weeks is week + 4. */
    every: text("every").notNull(),
    everyCount: smallint("every_count").notNull().default(1),
    nextOn: date("next_on"),
    remind: boolean("remind").notNull().default(true),
    isTrial: boolean("is_trial").notNull().default(false),
    trialEndsOn: date("trial_ends_on"),
    provider: text("provider"),
    contractEndsOn: date("contract_ends_on"),
    priceHistory: jsonb("price_history").$type<{ on: string; amount: number }[]>().notNull().default([]),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("regular_payments_person_idx").on(t.personId)],
);

export const remindersSent = pgTable(
  "reminders_sent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    regularId: uuid("regular_id")
      .notNull()
      .references(() => regularPayments.id, { onDelete: "cascade" }),
    dueOn: date("due_on").notNull(),
    /** Which reminder: 7 days, 3 days or 2 working days before. */
    step: smallint("step").notNull().default(7),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reminders_sent_regular_due_step_idx").on(t.regularId, t.dueOn, t.step)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    periodStart: date("period_start").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    amount: money("amount").notNull(),
    currency: currency(),
    neverCut: boolean("never_cut").notNull().default(false),
    position: smallint("position").notNull().default(0),
  },
  (t) => [index("budgets_person_period_idx").on(t.personId, t.periodStart)],
);

export const watches = pgTable(
  "watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    what: text("what").notNull(),
    priceToBeat: money("price_to_beat"),
    currency: currency(),
    town: text("town"),
    status: text("status").notNull().default("watching"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("watches_person_idx").on(t.personId)],
);

/** The offers seen for a watch. */
export const watchHits = pgTable(
  "watch_hits",
  {
    watchId: uuid("watch_id")
      .notNull()
      .references(() => watches.id, { onDelete: "cascade" }),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.watchId, t.offerId] })],
);

export const savingKind = pgEnum("saving_kind", ["offer", "switch", "budget"]);

/** Saved with Briv. */
export const savings = pgTable(
  "savings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    kind: savingKind("kind").notNull(),
    title: text("title").notNull(),
    amount: money("amount").notNull(),
    currency: currency(),
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
    paymentIds: uuid("payment_ids").array().notNull().default(sql`'{}'::uuid[]`),
    savedOn: date("saved_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("savings_person_day_idx").on(t.personId, t.savedOn)],
);

/* ------------------------------------------------------------------ */
/* Shared by everyone. Nothing here says who shops where.              */
/* ------------------------------------------------------------------ */

export const shops = pgTable("shops", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The shop's name made plain, for matching: "tesco", "pets at home". */
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  sells: text("sells").array().notNull().default(sql`'{}'::text[]`),
  isChain: boolean("is_chain").notNull().default(true),
  area: text("area"),
  website: text("website"),
  loyalty: text("loyalty"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * An offer exactly as a public page states it. Price, code and end date stay
 * empty unless that page prints them.
 */
export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Same page, same title: same offer. */
    fingerprint: text("fingerprint").notNull().unique(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    shopName: text("shop_name"),
    title: text("title").notNull(),
    url: text("url").notNull(),
    source: text("source").notNull(),
    price: money("price"),
    currency: currency(),
    code: text("code"),
    endsOn: date("ends_on"),
    smallPrint: jsonb("small_print").$type<{ check: string; ok: boolean | null }[]>().notNull().default([]),
    /** Towns it works in. Empty means it works across the UK. */
    towns: text("towns").array().notNull().default(sql`'{}'::text[]`),
    country: char("country", { length: 2 }).notNull().default("GB"),
    live: boolean("live").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("offers_shop_idx").on(t.shopId), index("offers_live_seen_idx").on(t.live, t.lastSeenAt)],
);

export const prices = pgTable(
  "prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    product: text("product").notNull(),
    sizeValue: numeric("size_value", { precision: 10, scale: 3 }),
    sizeUnit: text("size_unit"),
    price: money("price").notNull(),
    currency: currency(),
    /** Price per 100ml or 100g, when the size is known. */
    per100: money("per_100"),
    url: text("url").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prices_shop_product_idx").on(t.shopId, t.product)],
);

/** Two people asking the same thing in the same town on the same day share one search. */
export const planResults = pgTable(
  "plan_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queryKey: text("query_key").notNull(),
    town: text("town").notNull().default(""),
    day: date("day").notNull(),
    results: jsonb("results").$type<unknown[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("plan_results_query_town_day_idx").on(t.queryKey, t.town, t.day)],
);

/* ------------------------------------------------------------------ */
/* Running Briv                                                       */
/* ------------------------------------------------------------------ */

export const offerClicks = pgTable(
  "offer_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: person(),
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("offer_clicks_offer_idx").on(t.offerId, t.clickedAt)],
);

/** AI cost per person per month, for the monthly cap. Stored in millionths of a pound. */
export const aiUse = pgTable(
  "ai_use",
  {
    personId: person(),
    month: date("month").notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.personId, t.month] })],
);

export const jobs = pgTable("jobs", {
  name: text("name").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  ok: boolean("ok").notNull(),
  detail: text("detail"),
});
