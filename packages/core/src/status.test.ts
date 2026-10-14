import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spendStatus } from "./status.ts";

describe("how this pay is going", () => {
  it("is steady when spending is in line with last pay", () => {
    assert.equal(spendStatus({ spent: 90000, takeHome: 220000, lastPaySameDay: 100000, lastPaySpent: 200000 }), "steady");
  });

  it("is steady a little ahead of last pay", () => {
    assert.equal(spendStatus({ spent: 105000, takeHome: 220000, lastPaySameDay: 100000, lastPaySpent: 200000 }), "steady");
  });

  it("asks for a look when well ahead of last pay", () => {
    assert.equal(spendStatus({ spent: 125000, takeHome: 220000, lastPaySameDay: 100000, lastPaySpent: 200000 }), "watch");
  });

  it("ignores small amounts ahead early in the pay", () => {
    assert.equal(spendStatus({ spent: 2500, takeHome: 220000, lastPaySameDay: 1000, lastPaySpent: 200000 }), "steady");
  });

  it("asks for a look close to take-home, even in a first pay", () => {
    assert.equal(spendStatus({ spent: 200000, takeHome: 220000 }), "watch");
  });

  it("is over past take-home, or when the bills to come don't fit", () => {
    assert.equal(spendStatus({ spent: 230000, takeHome: 220000 }), "over");
    assert.equal(spendStatus({ spent: 150000, takeHome: 220000, safe: -4000 }), "over");
  });

  it("is steady with nothing to compare against", () => {
    assert.equal(spendStatus({ spent: 50000, takeHome: null }), "steady");
  });
});
