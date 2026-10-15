import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shopHostOf, shopLook, TILE_COLOURS } from "./deal-look.ts";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("how a deal looks", () => {
  it("keeps white text readable on every tile colour", () => {
    for (const colour of TILE_COLOURS) assert.ok(1.05 / (luminance(colour) + 0.05) >= 4.5, colour);
  });

  it("gives a shop the same tile every time, whatever the spelling", () => {
    assert.deepEqual(shopLook("TK Maxx"), shopLook("tk maxx"));
    assert.deepEqual(shopLook("Sainsbury's"), shopLook("Sainsbury’s"));
    assert.equal(shopLook("Morrisons").initial, "M");
    assert.equal(shopLook("").initial, "·");
  });

  it("reads a shop's address from a link", () => {
    assert.equal(shopHostOf("https://www.screwfix.com/p/kitchen-tap/123"), "screwfix.com");
    assert.equal(shopHostOf("not a link"), "");
    assert.equal(shopHostOf("http://localhost:3000/x"), "");
  });
});
