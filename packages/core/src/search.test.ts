import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSearchPeriod, matchesSearch, searchTotals, searchWords } from "./search.ts";

describe("searching your spends", () => {
  const uber = { shopName: "Uber", category: "transport" as const, kind: "taxis" };
  const tesco = { shopName: "Tesco Extra", category: "groceries" as const, items: ["Pampers nappies", "bread"], note: "for the twins" };

  it("finds every word, in any order, ignoring case", () => {
    assert.equal(matchesSearch(uber, searchWords("UBER")), true);
    assert.equal(matchesSearch(tesco, searchWords("nappies tesco")), true);
    assert.equal(matchesSearch(tesco, searchWords("tesco uber")), false);
  });

  it("looks at the category, kind, items and note too", () => {
    assert.equal(matchesSearch(tesco, searchWords("groceries")), true);
    assert.equal(matchesSearch(uber, searchWords("taxis")), true);
    assert.equal(matchesSearch(tesco, searchWords("twins")), true);
  });

  it("ignores accents and curly quotes", () => {
    assert.equal(matchesSearch({ shopName: "Café Nero", category: "dining" }, searchWords("cafe")), true);
    assert.equal(matchesSearch({ shopName: "Sainsbury's", category: "groceries" }, searchWords("sainsbury’s")), true);
  });

  it("matches everything for an empty search", () => {
    assert.deepEqual(searchWords("   "), []);
    assert.equal(matchesSearch(uber, []), true);
  });

  it("keeps money moved apart from spending in the totals", () => {
    const totals = searchTotals([
      { amount: 1200, category: "transport" },
      { amount: 800, category: "transport" },
      { amount: 5000, category: "savings" },
    ]);
    assert.deepEqual(totals, { spent: 2000, count: 2, moved: 5000, movedCount: 1 });
  });

  it("knows its periods", () => {
    assert.equal(isSearchPeriod("3m"), true);
    assert.equal(isSearchPeriod("2w"), false);
  });
});
