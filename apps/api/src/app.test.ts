import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { authRateLimits, authSessions, authUsers, consents, payments, profiles } from "@briv/db";
import { createApp } from "./app.ts";
import { readEnv } from "./env.ts";
import { memoryLogger } from "./log.ts";
import { unseal } from "./seal.ts";
import { townFromPostcodes } from "./town.ts";
import { startTestApp, TEST_ORIGIN } from "./test-app.ts";

const pointsAsked: [number, number][] = [];
const { app, handle, env, keys, codes, call, signIn, auth, mail } = startTestApp({
  resolveTown: async (lat, lng) => {
    pointsAsked.push([lat, lng]);
    return "Selly Oak, Birmingham";
  },
});
const ORIGIN = TEST_ORIGIN;

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
    assert.equal(unseal(row.statementSealed, keys, `${row.personId}:payment.statement`), "TESCO STORES 2041 BIRMINGHAM");
  });

  it("seals a note too, and gives it back to its owner", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 1500, spentOn: "2026-08-02", shopName: "Card Factory", category: "gifts", note: "for mum's birthday" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.payment.note, "for mum's birthday");
    const [row] = await handle.db.select().from(payments).where(eq(payments.id, res.body.payment.id));
    assert.ok(row.note && !row.note.includes("mum"));
  });

  it("refuses control characters in a note", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 100, spentOn: "2026-08-02", shopName: "Boots", category: "health", note: "a\u0000b" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Use plain text.");
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

  it("keeps no name when a gift went to a person, even if the app did not say so", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 13200, spentOn: "2026-08-06", shopName: "SOMTOCHUKWU NKEMEL", category: "gifts", statement: "FPS SOMTOCHUKWU NKEMEL" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.payment.toPerson, true);
    assert.equal(res.body.payment.shopName, null);
    const [row] = await handle.db.select().from(payments).where(eq(payments.id, res.body.payment.id));
    assert.equal(row.statementSealed, null);
  });

  it("keeps no name for anyone paid, whatever the category or what the app said", async () => {
    for (const body of [
      { amount: 5000, shopName: "Chidi", category: "sent" },
      { amount: 5100, shopName: "Jisoo Park", category: "sent" },
      { amount: 90000, shopName: "John Smith", category: "housing", statement: "JOHN SMITH RENT" },
      { amount: 12000, shopName: "Sarah Jones", category: "kids" },
      { amount: 2500, shopName: "Ngozi Okafor", category: "gifts", toPerson: false },
    ]) {
      const res = await call("/me/payments", { cookie: ada, body: { spentOn: "2026-07-06", ...body } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.payment.shopName, null, body.shopName);
      assert.equal(res.body.payment.toPerson, true, body.shopName);
      const [row] = await handle.db.select().from(payments).where(eq(payments.id, res.body.payment.id));
      assert.equal(row.statementSealed, null, body.shopName);
    }
  });

  it("keeps the shop's name for a gift bought in a shop", async () => {
    const res = await call("/me/payments", {
      cookie: ada,
      body: { amount: 450, spentOn: "2026-08-06", shopName: "Moonpig", category: "gifts" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.payment.toPerson, false);
    assert.equal(res.body.payment.shopName, "Moonpig");
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
    // Payday the 25th falls on a Sunday in October 2026, so pay comes on Friday the 23rd.
    assert.equal(res.body.period.end, "2026-10-22");
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
  it("needs the code emailed to the person", async () => {
    const without = await call("/me", { method: "DELETE", cookie: ada, body: {} });
    assert.equal(without.status, 400);
    const sent = await call("/me/delete-code", { cookie: ada, body: {} });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const wrong = codes.get("ada@example.com") === "000000" ? "111111" : "000000";
    const refused = await call("/me", { method: "DELETE", cookie: ada, body: { code: wrong } });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /not right/);
  });

  it("works however long ago the person signed in", async () => {
    // Better Auth's own delete needed a session under a day old; most people could not delete.
    const [user] = await handle.db.select().from(authUsers).where(eq(authUsers.email, "ada@example.com"));
    await handle.db
      .update(authSessions)
      .set({ createdAt: new Date(Date.now() - 40 * 86_400_000) })
      .where(eq(authSessions.userId, user.id));
    await call("/me/delete-code", { cookie: ada, body: {} });
    const res = await call("/me", { method: "DELETE", cookie: ada, body: { code: codes.get("ada@example.com") } });
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

describe("when something goes wrong", () => {
  it("gives every answer a request id", async () => {
    const res = await call("/health");
    assert.match(res.headers.get("x-request-id") ?? "", /^[\w-]{8,}$/);
  });

  it("answers an unknown address in plain words", async () => {
    const res = await call("/nothing-here");
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "There is nothing here.");
  });

  it("hides the error from the person, logs it with the route, and quotes an id", async () => {
    const cy = await signIn("cy@example.com");
    const log = memoryLogger();
    const reported: string[] = [];
    const problems: unknown[] = [];
    // The session store failing mid-request, as a database outage would.
    const failing = {
      ...auth,
      api: {
        ...auth.api,
        getSession: async () => {
          throw new Error("connection to sessions refused at 52.44,-1.93");
        },
      },
    } as unknown as typeof auth;
    const broken = createApp({
      db: handle.db,
      auth: failing,
      env,
      mail,
      resolveTown: async () => null,
      log,
      report: (problem, context) => {
        problems.push(problem);
        reported.push(context.route ?? "");
      },
    });
    const response = await broken.request("/me/location", {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: cy, "Content-Type": "application/json" },
      body: JSON.stringify({ allowed: true, precise: true, lat: 52.4429, lng: -1.9365 }),
    });
    const body = (await response.json()) as { error: string; requestId: string };
    assert.equal(response.status, 500);
    assert.equal(body.error, "Something went wrong on our side. Try again in a moment.");
    assert.equal(body.requestId, response.headers.get("x-request-id"));
    assert.ok(!JSON.stringify(body).includes("sessions"));
    // Nothing the error said, or the point it was about, is in any log line.
    assert.ok(!JSON.stringify(log.lines).includes("52.44"));
    assert.ok(!JSON.stringify(log.lines).includes("refused"));
    const line = log.lines.find((row) => row.event === "server_error");
    assert.ok(line);
    assert.equal(line.fields.route, "/me/location");
    assert.equal(line.fields.id, body.requestId);
    assert.deepEqual(reported, ["/me/location"]);
    // What goes to error monitoring is the same safe form: the kind of error, never what it said.
    assert.ok(!JSON.stringify(problems).includes("refused"));
    assert.equal((problems[0] as { error: string }).error, "Error");
    // The request line names the route, never the full path or what was sent.
    const request = log.lines.find((row) => row.event === "request");
    assert.equal(request?.fields.status, 500);
    assert.ok(!JSON.stringify(log.lines.map((row) => row.fields.route)).includes("52.44"));
  });

  it("takes crashes from the app, keeping only the kind and the places in the code", async () => {
    const log = memoryLogger();
    const reported: unknown[] = [];
    const watched = createApp({ db: handle.db, auth, env, mail, resolveTown: async () => null, log, report: (problem) => reported.push(problem) });
    const send = (body: unknown) =>
      watched.request("/me/app-errors", {
        method: "POST",
        headers: { Origin: ORIGIN, Cookie: ben, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const res = await send({ error: "TypeError", at: ["at PaymentRow (payment-row.bundle:120:14)", "Ben Smith owes £20"] });
    assert.equal(res.status, 202);
    const line = log.lines.find((row) => row.event === "app_error");
    assert.deepEqual(line?.fields.at, ["at PaymentRow (payment-row.bundle:120:14)"]);
    assert.deepEqual(reported, [{ error: "TypeError", at: ["at PaymentRow (payment-row.bundle:120:14)"] }]);
    assert.ok(!JSON.stringify(log.lines).includes("Ben Smith"));

    // A message is not accepted at all.
    assert.equal((await send({ error: "TypeError", at: [], message: "Ben Smith" })).status, 400);
    // A screen crashing in a loop cannot flood the log.
    for (let i = 0; i < 25; i++) await send({ error: "TypeError", at: [] });
    assert.equal(log.lines.filter((row) => row.event === "app_error").length, 20);
  });
});

describe("limits and guards", () => {
  it("caps codes to one email address, however many addresses ask", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json", "x-test-client-ip": `198.51.100.${i}` },
        body: JSON.stringify({ email: "target@example.com", type: "sign-in" }),
      });
      statuses.push(res.status);
    }
    assert.equal(statuses.filter((status) => status === 429).length, 2, statuses.join(","));
    // Sign-in limits are counted in the database, so every server shares them.
    const counted = await handle.db.select().from(authRateLimits);
    assert.ok(counted.length > 0);
  });

  it("refuses a change from another website", async () => {
    const res = await call("/me", { method: "PATCH", cookie: ben, body: { name: "Mallory" }, origin: "https://evil.example" });
    assert.equal(res.status, 401);
  });

  it("refuses a body that is far too big", async () => {
    const res = await call("/me/payments", { cookie: ben, body: { amount: 1, spentOn: "2026-10-01", category: "other", note: "x".repeat(70_000) } });
    assert.equal(res.status, 413);
  });
});

describe("settings", () => {
  it("runs as live unless told otherwise, and live will not start half set up", () => {
    assert.throws(() => readEnv({}), /Live needs/);
    assert.throws(() => readEnv({ NODE_ENV: "staging", DATABASE_URL: "postgres://x" }), /Live needs/);
    const live = readEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://db.example/briv",
      BETTER_AUTH_URL: "https://api.example.co.uk",
      BETTER_AUTH_SECRET: "x".repeat(40),
      APP_ORIGINS: "https://example.co.uk",
      MAIL_FROM: "Briv <codes@example.co.uk>",
      RESEND_API_KEY: "re_x",
      CLIENT_IP_HEADER: "fly-client-ip",
      SEAL_KEYS: `k1:${Buffer.alloc(32, 1).toString("base64")}`,
    });
    assert.equal(live.live, true);
    assert.equal(live.sealKeyId, "k1");
  });

  it("needs the sealing keys in live", () => {
    assert.throws(
      () =>
        readEnv({
          NODE_ENV: "production",
          DATABASE_URL: "postgres://db.example/briv",
          BETTER_AUTH_URL: "https://api.example.co.uk",
          BETTER_AUTH_SECRET: "x".repeat(40),
          APP_ORIGINS: "https://example.co.uk",
          MAIL_FROM: "Briv <codes@example.co.uk>",
          RESEND_API_KEY: "re_x",
          CLIENT_IP_HEADER: "fly-client-ip",
        }),
      /SEAL_KEYS/,
    );
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
