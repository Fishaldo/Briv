import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createDb, jobs, monthlyTotals, payments, profiles } from "@briv/db";
import { rollUpBefore, runRetention } from "./jobs/retention.ts";

// Runs on PGlite: the roll-up deletes payments, so it keeps away from the shared test database.
const handle = createDb("pglite:memory");
const db = handle.db;
let person = "";

before(async () => {
  await handle.migrate();
  const [row] = await db.insert(profiles).values({}).returning({ id: profiles.id });
  person = row.id;
  const old = (spentOn: string, amount: number, category = "groceries") =>
    db.insert(payments).values({ personId: person, amount, spentOn, category, source: "typed" });
  await old("2024-08-03", 1000);
  await old("2024-08-20", 2500);
  await old("2024-08-21", 700, "dining");
  await old("2024-10-02", 900);
  await old("2026-10-01", 1200);
});

after(async () => {
  await handle.close();
});

describe("keeping no more than needed", () => {
  it("rolls up whole months older than two years", () => {
    assert.equal(rollUpBefore("2026-10-14"), "2024-10-01");
  });

  it("turns old payments into monthly totals and deletes them", async () => {
    const result = await runRetention(db, "2026-10-14");
    assert.equal(result.rolledUp, 3);
    const totals = await db.select().from(monthlyTotals).where(eq(monthlyTotals.personId, person));
    const byKey = Object.fromEntries(totals.map((row) => [`${row.month} ${row.category}`, [row.total, row.count]]));
    assert.deepEqual(byKey["2024-08-01 groceries"], [3500, 2]);
    assert.deepEqual(byKey["2024-08-01 dining"], [700, 1]);
    const left = await db.select().from(payments).where(eq(payments.personId, person));
    assert.deepEqual(left.map((row) => row.spentOn).sort(), ["2024-10-02", "2026-10-01"]);
    const [job] = await db.select().from(jobs).where(eq(jobs.name, "retention"));
    assert.equal(job.ok, true);
  });

  it("adds to a month already rolled up rather than replacing it", async () => {
    await db.insert(payments).values({ personId: person, amount: 100, spentOn: "2024-08-30", category: "groceries", source: "typed" });
    await runRetention(db, "2026-10-14");
    const [row] = await db.select().from(monthlyTotals).where(eq(monthlyTotals.category, "groceries"));
    assert.equal(row.total, 3600);
    assert.equal(row.count, 3);
  });
});
