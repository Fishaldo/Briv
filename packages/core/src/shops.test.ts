import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayShopName } from "./shops.ts";

describe("shop names from a statement", () => {
  it("uses the name people know a chain by", () => {
    assert.equal(displayShopName("UBER *TRIP HELP.UBER.COM"), "Uber");
    assert.equal(displayShopName("UBER *TRIP"), "Uber");
    assert.equal(displayShopName("NETFLIX.COM"), "Netflix");
    assert.equal(displayShopName("SAINSBURYS S/MKTS 0421"), "Sainsbury’s");
  });

  it("tidies a shop it does not know", () => {
    assert.equal(displayShopName("LANDLORD LETTINGS LTD"), "Landlord Lettings");
    assert.equal(displayShopName("NAJEB HALAL CONTINENTAL  "), "Najeb Halal Continental");
    // The card machine's code before the star is not the shop.
    assert.equal(displayShopName("BLD*MYPERFECTCV.CO 4421"), "MyPerfectCV");
    assert.equal(displayShopName("SQ *CAFE NERO"), "Cafe Nero");
  });

  it("leaves a name someone typed alone", () => {
    assert.equal(displayShopName("Mama Ngozi Kitchen"), "Mama Ngozi Kitchen");
    assert.equal(displayShopName("  "), "");
  });
});
