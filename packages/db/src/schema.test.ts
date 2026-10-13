import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { createDb, rowsOf } from "./client.ts";
import { authUsers, consents, payments, places, profiles, settings } from "./schema.ts";

const handle = createDb("pglite:memory");
const { db } = handle;

before(async () => {
  await handle.migrate();
});

after(async () => {
  await handle.close();
});

describe("first migration", () => {
  it("creates every agreed table", async () => {
    const rows = rowsOf<{ table_name: string }>(
      await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`),
    );
    const names = rows.map((r) => r.table_name);
    for (const name of [
      "auth_users",
      "profiles",
      "income_periods",
      "places",
      "devices",
      "consents",
      "settings",
      "connections",
      "payments",
      "payment_items",
      "monthly_totals",
      "payee_fixes",
      "questions",
      "regular_payments",
      "reminders_sent",
      "budgets",
      "watches",
      "savings",
      "shops",
      "offers",
      "prices",
      "plan_results",
      "offer_clicks",
      "ai_use",
      "jobs",
    ]) {
      assert.ok(names.includes(name), `missing ${name}`);
    }
  });

  it("keeps no money column on the sign-in side, and no name or email on the money side", async () => {
    const rows = rowsOf<{ table_name: string; column_name: string }>(
      await db.execute(sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`),
    );
    for (const row of rows) {
      if (row.table_name.startsWith("auth_")) {
        assert.ok(!/amount|take_home|spent/.test(row.column_name), `${row.table_name}.${row.column_name}`);
      } else {
        assert.ok(!/^(name|email|phone)$/.test(row.column_name) || ["payment_items", "budgets", "regular_payments", "shops", "jobs"].includes(row.table_name), `${row.table_name}.${row.column_name}`);
        assert.ok(!/(^|_)(lat|lng|latitude|longitude)(_|$)/.test(row.column_name), `coordinates in ${row.table_name}`);
      }
    }
  });
});

describe("one person's data", () => {
  it("is deleted with the profile", async () => {
    const [profile] = await db.insert(profiles).values({ homeTown: "Birmingham" }).returning();
    await db.insert(settings).values({ personId: profile.id });
    await db.insert(consents).values({ personId: profile.id, kind: "location", granted: true });
    await db.insert(payments).values({
      personId: profile.id,
      amount: 2450,
      spentOn: "2026-10-01",
      shopName: "Tesco",
      category: "groceries",
      source: "typed",
    });
    await db.delete(profiles).where(eq(profiles.id, profile.id));
    const left = await db.select().from(payments).where(eq(payments.personId, profile.id));
    assert.equal(left.length, 0);
    const leftConsents = await db.select().from(consents).where(eq(consents.personId, profile.id));
    assert.equal(leftConsents.length, 0);
  });

  it("does not keep the same town twice, whatever the capitals", async () => {
    const [profile] = await db.insert(profiles).values({}).returning();
    await db.insert(places).values({ personId: profile.id, town: "Selly Oak" });
    await assert.rejects(db.insert(places).values({ personId: profile.id, town: "selly oak" }));
  });

  it("links sign-in to money only by the random number", async () => {
    const [profile] = await db.insert(profiles).values({}).returning();
    await db.insert(authUsers).values({ id: "u1", name: "Ada", email: "ada@example.com", personId: profile.id });
    const [user] = await db.select().from(authUsers).where(eq(authUsers.id, "u1"));
    assert.equal(user.personId, profile.id);
  });
});
