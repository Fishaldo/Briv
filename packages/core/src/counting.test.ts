import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daysToCheck, movementOf, sameSpend, type CountedPayment } from "./counting.ts";
import { readStatement } from "./statement.ts";

const pay = (over: Partial<CountedPayment>): CountedPayment => ({
  merchant: "Boots",
  amountPence: 2340,
  spentOn: "2026-10-12",
  origin: "receipt",
  ...over,
});

describe("one spend, caught twice", () => {
  it("still asks about the same amount, shop and day", () => {
    assert.equal(sameSpend(pay({}), pay({ merchant: "BOOTS 1234", origin: "statement" })), "same-day");
    assert.equal(sameSpend(pay({}), pay({ origin: "typed" })), "same-day");
  });

  it("sees a receipt and its bank line a day or three later as one spend", () => {
    for (const day of ["2026-10-13", "2026-10-14", "2026-10-15"]) {
      assert.equal(sameSpend(pay({}), pay({ merchant: "BOOTS UK 1234", spentOn: day, origin: "statement" })), "posted-later", day);
    }
  });

  it("works whichever came first: a statement saved, then the receipt scanned", () => {
    const line = pay({ merchant: "BOOTS 1234", spentOn: "2026-10-14", origin: "statement" });
    assert.equal(sameSpend(line, pay({ origin: "receipt" })), "posted-later");
  });

  it("matches a pasted alert or a typed spend with its bank line too", () => {
    assert.equal(sameSpend(pay({ origin: "message" }), pay({ spentOn: "2026-10-13", origin: "statement" })), "posted-later");
    assert.equal(sameSpend(pay({ origin: "typed" }), pay({ spentOn: "2026-10-13", origin: "bank" })), "posted-later");
  });

  it("never matches a bank line dated before the purchase, or more than three days after", () => {
    assert.equal(sameSpend(pay({}), pay({ spentOn: "2026-10-11", origin: "statement" })), null);
    assert.equal(sameSpend(pay({}), pay({ spentOn: "2026-10-16", origin: "statement" })), null);
  });

  it("keeps the same coffee on two days as two coffees", () => {
    assert.equal(sameSpend(pay({}), pay({ spentOn: "2026-10-13", origin: "receipt" })), null);
    assert.equal(sameSpend(pay({ origin: "statement" }), pay({ spentOn: "2026-10-13", origin: "statement" })), null);
  });

  it("needs the same amount and the same shop", () => {
    assert.equal(sameSpend(pay({}), pay({ amountPence: 2341, spentOn: "2026-10-13", origin: "statement" })), null);
    assert.equal(sameSpend(pay({}), pay({ merchant: "Superdrug", spentOn: "2026-10-13", origin: "statement" })), null);
  });

  it("checks three days either side", () => {
    assert.deepEqual(daysToCheck("2026-10-01"), [
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("money moved, not spent", () => {
  it("reads paying off a credit card as a repayment", () => {
    for (const line of [
      "AMERICAN EXPRESS DD",
      "BARCLAYCARD",
      "Capital One",
      "MBNA LIMITED",
      "Credit card payment",
      "VANQUIS BANK",
    ]) {
      assert.equal(movementOf(line), "card-repayment", line);
    }
  });

  it("reads moving money to your own pots or savings as a transfer", () => {
    for (const line of ["Pot transfer", "To Savings pot", "Transfer to ISA", "Round up", "Internal transfer"]) {
      assert.equal(movementOf(line), "own-transfer", line);
    }
  });

  it("keeps card interest and fees as real costs", () => {
    assert.equal(movementOf("AMEX INTEREST CHARGE"), null);
    assert.equal(movementOf("Barclaycard late payment fee"), null);
  });

  it("leaves shops, people and pay-later instalments alone", () => {
    for (const line of ["Tesco Stores 3456", "Boots", "FPS J SMITH", "KLARNA*ASOS", "Clearpay Zara", "Marbles Toy Shop"]) {
      assert.equal(movementOf(line), null, line);
    }
  });

  it("files them as Transfers when a statement is read, so they are not counted", () => {
    const csv = [
      "Date,Description,Amount",
      "12/10/2026,TESCO STORES 3456,-42.16",
      "13/10/2026,AMERICAN EXPRESS DD,-350.00",
      "14/10/2026,POT TRANSFER TO BILLS,-100.00",
    ].join("\n");
    const read = readStatement(csv);
    assert.deepEqual(
      read.rows.map((row) => [row.merchant, row.category]),
      [
        ["TESCO STORES 3456", "groceries"],
        ["AMERICAN EXPRESS DD", "transfers"],
        ["POT TRANSFER TO BILLS", "transfers"],
      ],
    );
  });
});
