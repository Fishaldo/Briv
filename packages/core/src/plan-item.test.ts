import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { itemQuery, keyWords, planKindFor, planQueries } from "./plan-item.ts";

describe("Plan, from what was typed", () => {
  it("knows which What an item is", () => {
    assert.equal(planKindFor("Kitchen Tap"), "diy");
    assert.equal(planKindFor("mono block mixer tap"), "diy");
    assert.equal(planKindFor("Latest iPhone"), "tech");
    assert.equal(planKindFor("Nintendo Switch"), "tech");
    assert.equal(planKindFor("light switch"), "diy");
    assert.equal(planKindFor("dining table"), "furniture");
    assert.equal(planKindFor("washing machine"), "furniture");
    assert.equal(planKindFor("kids trainers"), "fashion");
    assert.equal(planKindFor("shower gel"), "personal");
    assert.equal(planKindFor("bedding"), "household");
    assert.equal(planKindFor("a plumber"), "repairs");
    assert.equal(planKindFor("something nice"), null);
    assert.equal(planKindFor(""), null);
  });

  it("cuts a long description to the words that matter", () => {
    assert.deepEqual(keyWords("Mono block mixer for high and low water pressure systems with flexible connectors (Screw fix) - russ approved"), [
      "monobloc",
      "mixer",
      "high",
      "low",
      "water",
      "pressure",
      "flexible",
      "connectors",
      "russ",
    ]);
    assert.equal(itemQuery("The best cheap Kitchen Tap"), "kitchen tap");
  });

  it("searches for the item at the shop first, then with its details, and never the broad category", () => {
    const queries = planQueries({
      item: "Kitchen tap",
      details: "Mono block mixer for high and low water pressure systems with flexible connectors",
      shop: "Screwfix",
      town: "South Ockendon",
      category: "diy",
    });
    assert.deepEqual(queries, [
      "Screwfix kitchen tap",
      "kitchen tap monobloc mixer",
      "South Ockendon kitchen tap",
      "kitchen tap",
      "Screwfix",
    ]);
    assert.ok(!queries.some((query) => /\bdiy\b/.test(query)));
  });

  it("uses the What and its extra searches when no item is given", () => {
    const queries = planQueries({ item: "", town: "Leeds", answers: "click and collect", category: "supermarket", extra: ["tesco", "asda", "aldi"] });
    assert.deepEqual(queries, ["Leeds supermarket click and collect", "supermarket click and collect", "Leeds supermarket", "supermarket", "tesco", "asda"]);
  });
});
