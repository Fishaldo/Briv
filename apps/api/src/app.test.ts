import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { authUsers, consents, createDb, payments, profiles } from "@briv/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { readEnv } from "./env.ts";
import { unseal } from "./seal.ts";
import { townFromPostcodes } from "./town.ts";

const ORIGIN = "http://localhost:8081";
const handle = createDb("pglite:memory");
const env = readEnv({ NODE_ENV: "test", APP_ORIGINS: ORIGIN, DATABASE_URL: "pglite:memory" });
const codes = new Map<string, string>();
const auth = createAuth(handle.db, env, async ({ to, text }) => {
  codes.set(to, /\b(\d{6})\b/.exec(text)?.[1] ?? "");
});
const pointsAsked: [number, number][] = [];
const app = createApp({
  db: handle.db,
  auth,
  env,
  resolveTown: async (lat, lng) => {
    pointsAsked.push([lat, lng]);
    return "Selly Oak, Birmingham";
  },
  today: () => new Date(2026, 9, 13),
});

async function call(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.cookie) headers.Cookie = init.cookie;
  const response = await app.request(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

async function signIn(email: string): Promise<string> {
  const sent = await call("/api/auth/email-otp/send-verification-otp", { body: { email, type: "sign-in" } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const otp = codes.get(email);
  assert.ok(otp && otp.length === 6, "a six-digit code was emailed");
  const signed = await call("/api/auth/sign-in/email-otp", { body: { email, otp } });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  const cookies = signed.headers.getSetCookie().map((c) => c.split(";")[0]);
  assert.ok(cookies.length > 0, "a session cookie was set");
  return cookies.join("; ");
}

let ada = "";
let ben = "";

before(async () => {
  await handle.migrate();
  ada = await signIn("ada@example.com");
  ben = await signIn("ben@example.com");
});

after(async () => {
  await handle.close();
});

describe("server", () => {
  it("answers the health check", async () => {
    const res = await call("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it("turns away anyone not signed in", async () => {
    const res = await call("/me");
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Please sign in again.");
  });
});

describe("first sign-in", () => {
  it("starts with an empty profile in pounds, in Britain", async () => {
    const res = await call("/me", { cookie: ada });
    assert.equal(res.status, 200);
    assert.equal(res.body.email, "ada@example.com");
    assert.equal(res.body.profile.country, "GB");
    assert.equal(res.body.profile.currency, "GBP");
    assert.equal(res.body.profile.onboarded, false);
    assert.equal(res.body.profile.locationAsked, false);
  });

  it("saves About you", async () => {
    const res = await call("/me", {
      method: "PATCH",
      cookie: ada,
      body: { name: "Ada", usualTakeHome: 240000, paydayDay: 25, onboarded: true },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.name, "Ada");
    assert.equal(res.body.profile.paydayRule, "day_of_month");
    assert.equal(res.body.profile.paydayDay, 25);
    assert.equal(res.body.profile.usualTakeHome, 240000);
    assert.equal(res.body.profile.onboarded, true);
  });

  it("refuses a payday that is not a day of the month", async () => {
    const res = await call("/me", { method: "PATCH", cookie: ada, body: { paydayDay: 32 } });
    assert.equal(res.status, 400);
  });

  it("asks for location once, and keeps only the town", async () => {
    const res = await call("/me/location", {
      cookie: ada,
      body: { allowed: true, precise: true, lat: 52.4429, lng: -1.9365 },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.town, "Selly Oak, Birmingham");
    assert.equal(res.body.me.profile.homeTown, "Selly Oak, Birmingham");
    assert.equal(res.body.me.profile.locationAsked, true);
    assert.equal(res.body.me.profile.preciseLocation, true);
    const [user] = await handle.db.select().from(authUsers).where(eq(authUsers.email, "ada@example.com"));
    const given = await handle.db.select().from(consents).where(eq(consents.personId, user.personId!));
    assert.deepEqual(given.map((c) => [c.kind, c.granted]).sort(), [
      ["location", true],
      ["precise_location", true],
    ]);
  });

  it("does not look up a point outside the UK", async () => {
    const before = pointsAsked.length;
    const res = await call("/me/location", { cookie: ben, body: { allowed: true, lat: 48.85, lng: 2.35 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.town, null);
    assert.equal(pointsAsked.length, before);
  });

  it("takes a typed town instead", async () => {
    const res = await call("/me/location", { cookie: ben, body: { allowed: false, town: "Newcastle" } });
    assert.equal(res.body.me.profile.homeTown, "Newcastle");
    assert.equal(res.body.me.profile.preciseLocation, false);
  });

  it("keeps extra towns, once each", async () => {
    await call("/me/places", { cookie: ada, body: { town: "Coventry" } });
    const res = await call("/me/places", { cookie: ada, body: { town: "coventry" } });
    assert.deepEqual(
      res.body.places.map((p: { town: string }) => p.town),
      ["Coventry"],
    );
  });
});

describe("typed spends", () => {
  let tescoId = "";

  it("saves a spend", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 2450, spentOn: "2026-10-01", shopName: "Tesco", category: "groceries", statement: "TESCO STORES 2041 BIRMINGHAM" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    tescoId = res.body.payment.id;
    assert.equal(res.body.payment.countsAsSpending, true);
  });

  it("seals the statement text", async () => {
    const [row] = await handle.db.select().from(payments).where(eq(payments.id, tescoId));
    assert.ok(row.statementSealed);
    assert.ok(!row.statementSealed.includes("TESCO"));
    assert.equal(unseal(row.statementSealed, env.sealKey), "TESCO STORES 2041 BIRMINGHAM");
  });

  it("asks before saving the same amount, shop and date twice", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 2450, spentOn: "2026-10-01", shopName: "TESCO STORES 2041", category: "groceries" },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.duplicate.id, tescoId);
  });

  it("does not ask when the date is different", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 2450, spentOn: "2026-10-02", shopName: "Tesco", category: "groceries" },
    });
    assert.equal(res.status, 201);
  });

  it("keeps both when asked to", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 2450, spentOn: "2026-10-01", shopName: "Tesco", category: "groceries", duplicate: { choice: "keep_both" } },
    });
    assert.equal(res.status, 201);
  });

  it("replaces the saved one when asked to", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: {
        amount: 2450,
        spentOn: "2026-10-01",
        shopName: "Tesco",
        category: "groceries",
        hasReceipt: true,
        duplicate: { choice: "replace", savedId: tescoId },
      },
    });
    assert.equal(res.status, 201);
    const gone = await handle.db.select().from(payments).where(eq(payments.id, tescoId));
    assert.equal(gone.length, 0);
  });

  it("keeps only amount and date for a payment to a person", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 2000, spentOn: "2026-10-05", shopName: "J Smith", category: "gifts", toPerson: true, statement: "J SMITH FASTER PAYMENT" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.payment.shopName, null);
    const [row] = await handle.db.select().from(payments).where(eq(payments.id, res.body.payment.id));
    assert.equal(row.statementSealed, null);
  });

  it("files savings apart from spending", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 10000, spentOn: "2026-10-03", shopName: "Savings pot", category: "savings" },
    });
    assert.equal(res.body.payment.countsAsSpending, false);
  });

  it("refuses a category Briv does not have", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 100, spentOn: "2026-10-03", shopName: "X", category: "crypto" },
    });
    assert.equal(res.status, 400);
  });

  it("shows spent so far this pay", async () => {
    const res = await call("/me/summary", { cookie: ada });
    assert.equal(res.status, 200);
    assert.equal(res.body.period.start, "2026-09-25");
    assert.equal(res.body.period.end, "2026-10-24");
    assert.equal(res.body.period.day, 19);
    assert.equal(res.body.spent, 2450 * 3 + 2000);
    assert.equal(res.body.moved, 10000);
    assert.equal(res.body.takeHome, 240000);
  });
});

describe("each person sees only their own", () => {
  it("shows Ben none of Ada's spends", async () => {
    const res = await call("/me/payments", { cookie: ben });
    assert.equal(res.status, 200);
    assert.equal(res.body.payments.length, 0);
  });

  it("does not let Ben delete Ada's spend", async () => {
    const adas = await call("/me/payments", { cookie: ada });
    const id = adas.body.payments[0].id;
    const res = await call(`/me/payments/${id}`, { method: "DELETE", cookie: ben });
    assert.equal(res.status, 404);
    const still = await call("/me/payments", { cookie: ada });
    assert.equal(still.body.payments.length, adas.body.payments.length);
  });

  it("does not put a name or email on the money side", async () => {
    const [user] = await handle.db.select().from(authUsers).where(eq(authUsers.email, "ada@example.com"));
    const [profile] = await handle.db.select().from(profiles).where(eq(profiles.id, user.personId!));
    assert.ok(!JSON.stringify(profile).includes("ada@example.com"));
    assert.ok(!JSON.stringify(profile).includes("Ada"));
  });
});

describe("deleting an account", () => {
  it("removes the person and every spend", async () => {
    const [user] = await handle.db.select().from(authUsers).where(eq(authUsers.email, "ada@example.com"));
    const res = await call("/me", { method: "DELETE", cookie: ada });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const left = await handle.db.select().from(payments).where(eq(payments.personId, user.personId!));
    assert.equal(left.length, 0);
    const profile = await handle.db.select().from(profiles).where(eq(profiles.id, user.personId!));
    assert.equal(profile.length, 0);
    const account = await handle.db.select().from(authUsers).where(eq(authUsers.id, user.id));
    assert.equal(account.length, 0);
    const after = await call("/me", { cookie: ada });
    assert.equal(after.status, 401);
  });
});

describe("town names", () => {
  it("reads the ward and district from postcodes.io", () => {
    assert.equal(
      townFromPostcodes({
        status: 200,
        result: [{ postcode: "B29 6", admin_ward: "Selly Oak", admin_district: "Birmingham", parish: null, region: "West Midlands", country: "England" }],
      }),
      "Selly Oak, Birmingham",
    );
  });

  it("reads other towns the same way, and nothing when there is no result", () => {
    assert.equal(
      townFromPostcodes({
        status: 200,
        result: [{ postcode: "NE1", admin_ward: "Monument", admin_district: "Newcastle upon Tyne", parish: null, region: "North East", country: "England" }],
      }),
      "Monument, Newcastle upon Tyne",
    );
    assert.equal(townFromPostcodes({ status: 200, result: null }), null);
  });
});
