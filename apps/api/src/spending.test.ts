import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { payments } from "@briv/db";
import { startTestApp } from "./test-app.ts";

/*
 * Phase 2, the spending core, through the server: search with totals,
 * statements saved in one go, changing a spend (and the ones like it), this
 * pay's take-home, regular payments, safe to spend and the budget.
 *
 * Today is Tuesday 13 October 2026; payday is the 25th, so this pay runs
 * 25 Sep to 24 Oct and the last one 25 Aug to 24 Sep.
 */

const t = startTestApp({ today: new Date(2026, 9, 13) });
let ada = "";
let ben = "";

async function spend(body: Record<string, unknown>, cookie = ada) {
  const res = await t.call("/me/payments", { cookie, body: { category: "groceries", ...body } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.payment;
}

before(async () => {
  await t.handle.migrate();
  ada = await t.signIn("ada@example.com");
  ben = await t.signIn("ben@example.com");
  const res = await t.call("/me", { method: "PATCH", cookie: ada, body: { name: "Ada", usualTakeHome: 240000, paydayDay: 25, onboarded: true } });
  assert.equal(res.status, 200);
});

after(async () => {
  await t.handle.close();
});

describe("search with totals", () => {
  before(async () => {
    await spend({ amount: 1480, spentOn: "2026-10-12", shopName: "Uber", category: "transport", kind: "taxis" });
    await spend({ amount: 960, spentOn: "2026-09-20", shopName: "Uber", category: "transport" });
    await spend({ amount: 4216, spentOn: "2026-10-10", shopName: "Tesco Extra", note: "nappies and bread" });
    await spend({ amount: 10000, spentOn: "2026-10-01", shopName: "Chase", category: "savings" });
  });

  it("finds every payment with the words, and adds them up", async () => {
    const res = await t.call("/me/payments?q=uber", { cookie: ada });
    assert.equal(res.status, 200);
    assert.equal(res.body.payments.length, 2);
    assert.deepEqual(res.body.totals, { spent: 2440, count: 2, moved: 0, movedCount: 0 });
  });

  it("searches the sealed note too", async () => {
    const res = await t.call("/me/payments?q=nappies", { cookie: ada });
    assert.deepEqual(
      res.body.payments.map((p: { shopName: string }) => p.shopName),
      ["Tesco Extra"],
    );
  });

  it("limits to a period", async () => {
    const res = await t.call("/me/payments?q=uber&period=1w", { cookie: ada });
    assert.equal(res.body.payments.length, 1);
    assert.equal(res.body.totals.spent, 1480);
  });

  it("keeps money moved apart from spending", async () => {
    const res = await t.call("/me/payments?period=1m", { cookie: ada });
    assert.equal(res.body.totals.moved, 10000);
    assert.equal(res.body.totals.spent, 1480 + 960 + 4216);
  });

  it("filters by category and refuses an unknown period", async () => {
    const res = await t.call("/me/payments?category=transport", { cookie: ada });
    assert.equal(res.body.payments.length, 2);
    const wrong = await t.call("/me/payments?period=2w", { cookie: ada });
    assert.equal(wrong.status, 400);
  });

  it("never shows one person's spends to another", async () => {
    const res = await t.call("/me/payments?q=uber", { cookie: ben });
    assert.equal(res.body.payments.length, 0);
  });
});

describe("a bank statement, saved in one go", () => {
  it("saves the rows and sends back the ones that look already saved", async () => {
    const res = await t.call("/me/payments/batch", {
      cookie: ada,
      body: {
        rows: [
          { amount: 1480, spentOn: "2026-10-12", shopName: "UBER *TRIP", category: "transport", statement: "UBER *TRIP HELP.UBER.COM" },
          { amount: 2299, spentOn: "2026-10-05", shopName: "BLD*MYPERFECTCV.CO", category: "other", statement: "BLD*MYPERFECTCV.CO 4421" },
          { amount: 2299, spentOn: "2026-09-05", shopName: "BLD*MYPERFECTCV.CO", category: "other", statement: "BLD*MYPERFECTCV.CO 9902" },
          { amount: 13200, spentOn: "2026-10-03", shopName: "SOMTOCHUKWU NKEMEL", category: "gifts", statement: "FPS SOMTOCHUKWU NKEMEL" },
        ],
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.saved, 3);
    assert.equal(res.body.clashes.length, 1);
    assert.equal(res.body.clashes[0].index, 0);
    assert.equal(res.body.clashes[0].saved.shopName, "Uber");
  });

  it("keeps no name and no statement text for a payment to a person", async () => {
    const list = await t.call("/me/payments?category=gifts", { cookie: ada });
    const gift = list.body.payments.find((p: { amount: number }) => p.amount === 13200);
    assert.equal(gift.toPerson, true);
    assert.equal(gift.shopName, null);
    const [row] = await t.handle.db.select().from(payments).where(eq(payments.id, gift.id));
    assert.equal(row.statementSealed, null);
  });

  it("saves a clash when the person says keep both", async () => {
    const res = await t.call("/me/payments/batch", {
      cookie: ada,
      body: { rows: [{ amount: 1480, spentOn: "2026-10-12", shopName: "UBER *TRIP", category: "transport", keepBoth: true }] },
    });
    assert.equal(res.body.saved, 1);
    assert.equal(res.body.clashes.length, 0);
  });

  it("refuses an empty or oversized import", async () => {
    const empty = await t.call("/me/payments/batch", { cookie: ada, body: { rows: [] } });
    assert.equal(empty.status, 400);
  });
});

describe("changing a spend", () => {
  let cvId = "";

  before(async () => {
    const list = await t.call("/me/payments?q=myperfectcv", { cookie: ada });
    cvId = list.body.payments.find((p: { spentOn: string }) => p.spentOn === "2026-10-05").id;
  });

  it("renames it, files it, and does the same for every payment like it", async () => {
    const res = await t.call(`/me/payments/${cvId}`, {
      method: "PATCH",
      cookie: ada,
      body: { shopName: "MyPerfectCV", category: "subscriptions", applyToSame: true },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.payment.shopName, "MyPerfectCV");
    assert.equal(res.body.alsoChanged, 1);
    const list = await t.call("/me/payments?q=myperfectcv", { cookie: ada });
    assert.ok(list.body.payments.every((p: { category: string }) => p.category === "subscriptions"));
  });

  it("files future payments with the same statement text the same way", async () => {
    const res = await t.call("/me/payments/batch", {
      cookie: ada,
      body: { rows: [{ amount: 2299, spentOn: "2026-08-05", shopName: "BLD*MYPERFECTCV.CO", category: "other", statement: "BLD*MYPERFECTCV.CO 1188" }] },
    });
    assert.equal(res.body.fixed, 1);
    const list = await t.call("/me/payments?q=myperfectcv&period=all", { cookie: ada });
    assert.equal(list.body.payments.length, 3);
  });

  it("changes the amount, day and note", async () => {
    const res = await t.call(`/me/payments/${cvId}`, {
      method: "PATCH",
      cookie: ada,
      body: { amount: 2499, spentOn: "2026-10-06", note: "price went up" },
    });
    assert.equal(res.body.payment.amount, 2499);
    assert.equal(res.body.payment.spentOn, "2026-10-06");
    assert.equal(res.body.payment.note, "price went up");
  });

  it("drops the name and statement when a spend turns out to be to a person", async () => {
    const saved = await spend({ amount: 5000, spentOn: "2026-10-02", shopName: "Corner Shop", statement: "CORNER SHOP 12" });
    const res = await t.call(`/me/payments/${saved.id}`, {
      method: "PATCH",
      cookie: ada,
      body: { toPerson: true, category: "sent" },
    });
    assert.equal(res.body.payment.toPerson, true);
    assert.equal(res.body.payment.shopName, null);
    const [row] = await t.handle.db.select().from(payments).where(eq(payments.id, saved.id));
    assert.equal(row.statementSealed, null);
  });

  it("will not let another person change it", async () => {
    const res = await t.call(`/me/payments/${cvId}`, { method: "PATCH", cookie: ben, body: { amount: 1 } });
    assert.equal(res.status, 404);
  });
});

describe("pay, regular payments and safe to spend", () => {
  before(async () => {
    for (const day of ["2026-07-02", "2026-08-02", "2026-09-02", "2026-10-02"]) {
      await spend({ amount: 1099, spentOn: day, shopName: "Netflix", category: "subscriptions" });
    }
    for (const day of ["2026-08-18", "2026-09-18"]) {
      await spend({ amount: 2000, spentOn: day, shopName: "Vodafone", category: "bills" });
    }
  });

  it("uses the usual take-home until this pay's is confirmed", async () => {
    const res = await t.call("/me/pay", { cookie: ada });
    assert.equal(res.body.takeHome, 240000);
    assert.equal(res.body.confirmed, false);
    assert.equal(res.body.period.start, "2026-09-25");
  });

  it("keeps this pay's real take-home", async () => {
    const res = await t.call("/me/pay", { method: "PUT", cookie: ada, body: { takeHome: 231000 } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const summary = await t.call("/me/summary", { cookie: ada });
    assert.equal(summary.body.takeHome, 231000);
    assert.equal(summary.body.takeHomeConfirmed, true);
  });

  it("finds what comes out regularly, soonest first", async () => {
    const res = await t.call("/me/regulars", { cookie: ada });
    const names = res.body.items.map((item: { name: string }) => item.name);
    assert.ok(names.includes("Netflix"), names.join(", "));
    assert.ok(names.includes("Vodafone"), names.join(", "));
    const vodafone = res.body.items.find((item: { name: string }) => item.name === "Vodafone");
    assert.equal(vodafone.nextDue, "2026-10-18");
    assert.equal(vodafone.freq, "monthly");
  });

  it("takes bills still to come off what is safe to spend", async () => {
    const res = await t.call("/me/summary", { cookie: ada });
    const safe = res.body.safe;
    assert.ok(safe, "safe to spend is shown");
    assert.deepEqual(
      safe.bills.map((bill: { name: string; due: string }) => [bill.name, bill.due]),
      [["Vodafone", "2026-10-18"]],
    );
    assert.equal(safe.safe, 231000 - res.body.spent - 2000);
    // Sunday 25 October is not a working day, so pay comes on Friday the 23rd and this pay ends on the 22nd.
    assert.equal(safe.daysLeft, 10);
  });

  it("leaves out a regular payment the person stopped", async () => {
    const res = await t.call(`/me/regulars/${encodeURIComponent("p:vodafone")}`, { method: "PATCH", cookie: ada, body: { stopped: true } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.item.stopped, true);
    const summary = await t.call("/me/summary", { cookie: ada });
    assert.deepEqual(summary.body.safe.bills, []);
  });

  it("knows nothing of another person's regular payments", async () => {
    const res = await t.call("/me/regulars", { cookie: ben });
    assert.deepEqual(res.body.items, []);
    const stop = await t.call(`/me/regulars/${encodeURIComponent("p:vodafone")}`, { method: "PATCH", cookie: ben, body: { stopped: true } });
    assert.equal(stop.status, 404);
  });
});

describe("the budget", () => {
  before(async () => {
    // The last three pays: rent, food, eating out and clothes, well over the take-home.
    for (const [start, mid] of [
      ["2026-06-25", "2026-07-05"],
      ["2026-07-25", "2026-08-05"],
      ["2026-08-25", "2026-09-05"],
    ]) {
      await spend({ amount: 120000, spentOn: start, shopName: "Landlord Lettings", category: "housing" });
      await spend({ amount: 60000, spentOn: mid, shopName: "ASDA" });
      await spend({ amount: 50000, spentOn: mid, shopName: "Nandos", category: "dining" });
      await spend({ amount: 30000, spentOn: mid, shopName: "Primark", category: "fashion" });
    }
  });

  it("drafts a budget no bigger than the take-home, with savings first", async () => {
    const res = await t.call("/me/budget/draft", { cookie: ada });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.takeHome, 231000);
    assert.ok(res.body.planned <= 231000, String(res.body.planned));
    assert.equal(res.body.lines[0].category, "savings");
    assert.ok(res.body.savings > 0);
    const rent = res.body.lines.find((line: { category: string }) => line.category === "housing");
    assert.equal(rent.amount, 120000);
    assert.equal(rent.neverCut, true);
    assert.ok(res.body.trimmed.length > 0);
  });

  it("saves it, and shows what is spent on each line this pay", async () => {
    const draft = await t.call("/me/budget/draft", { cookie: ada });
    const lines = draft.body.lines.map((line: { name: string; category: string; amount: number; neverCut: boolean }) => ({
      name: line.name,
      category: line.category,
      amount: line.amount,
      neverCut: line.neverCut,
    }));
    const saved = await t.call("/me/budget", { method: "PUT", cookie: ada, body: { lines } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const res = await t.call("/me/budget", { cookie: ada });
    assert.equal(res.body.lines.length, lines.length);
    const food = res.body.lines.find((line: { category: string }) => line.category === "groceries");
    // This pay: Tesco £42.16 on 10 Oct.
    assert.equal(food.spent, 4216);
    assert.equal(res.body.planned, draft.body.planned);
  });

  it("fits a saved budget that has grown past the take-home", async () => {
    await t.call("/me/budget", {
      method: "PUT",
      cookie: ada,
      body: {
        lines: [
          { name: "", category: "housing", amount: 120000, neverCut: true },
          { name: "", category: "dining", amount: 90000, neverCut: false },
          { name: "Perfume", category: null, amount: 40000, neverCut: false },
        ],
      },
    });
    const res = await t.call("/me/budget/draft?fit=1", { cookie: ada });
    assert.ok(res.body.planned <= 231000);
    assert.ok(res.body.lines.some((line: { name: string }) => line.name === "Perfume"));
  });

  it("refuses an own line with no name", async () => {
    const res = await t.call("/me/budget", { method: "PUT", cookie: ada, body: { lines: [{ name: "", category: null, amount: 100, neverCut: false }] } });
    assert.equal(res.status, 400);
  });

  it("keeps each person's budget to themselves", async () => {
    const res = await t.call("/me/budget", { cookie: ben });
    assert.deepEqual(res.body.lines, []);
  });
});
