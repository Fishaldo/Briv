import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appError, appErrorOf, deleteAccount, newPayment, plainText, profilePatch } from "./index.ts";

describe("requests", () => {
  it("accepts a typed spend and fills in where it came from", () => {
    const parsed = newPayment.parse({ amount: 2450, spentOn: "2026-10-01", shopName: "Tesco", category: "groceries" });
    assert.equal(parsed.source, "typed");
  });

  it("refuses a date that does not exist and a category Briv does not have", () => {
    assert.equal(newPayment.safeParse({ amount: 100, spentOn: "2026-02-30", category: "groceries" }).success, false);
    assert.equal(newPayment.safeParse({ amount: 100, spentOn: "2026-02-03", category: "crypto" }).success, false);
  });

  it("refuses control characters in typed text", () => {
    assert.equal(plainText(50).safeParse("for mum").success, true);
    assert.equal(plainText(50).safeParse("for\u0000mum").success, false);
    assert.equal(newPayment.safeParse({ amount: 100, spentOn: "2026-10-01", category: "gifts", note: "a\u0007b" }).success, false);
  });

  it("refuses fields it does not know", () => {
    assert.equal(profilePatch.safeParse({ personId: "x" }).success, false);
  });

  it("wants a six-digit code to delete an account", () => {
    assert.equal(deleteAccount.safeParse({ code: "123456" }).success, true);
    assert.equal(deleteAccount.safeParse({ code: "12345" }).success, false);
    assert.equal(deleteAccount.safeParse({}).success, false);
  });
});

describe("app errors", () => {
  it("keeps the kind and the places in the code, never the message", () => {
    const error = new TypeError("Cannot read amount of Ada Lovelace's spend £42.10");
    error.stack = [
      "TypeError: Cannot read amount of Ada Lovelace's spend £42.10",
      "    at PaymentRow (http://192.168.1.4:8081/src/features/payment-row.bundle?platform=ios:120:14)",
      "    at renderWithHooks (index.android.bundle:1:2345)",
      "    at fn (address at index.android.bundle:1:999)",
      "Row@https://briv.example/_expo/static/js/web/entry-ab12.js:2:3456",
      "    at <anonymous>",
    ].join("\n");
    const safe = appErrorOf(error);
    assert.equal(safe.error, "TypeError");
    assert.deepEqual(safe.at, [
      "at PaymentRow (payment-row.bundle:120:14)",
      "at renderWithHooks (index.android.bundle:1:2345)",
      "at fn (index.android.bundle:1:999)",
      "at Row (entry-ab12.js:2:3456)",
    ]);
    assert.ok(!JSON.stringify(safe).includes("Ada"));
    assert.ok(!JSON.stringify(safe).includes("192.168"));
    // The server checks it again.
    assert.deepEqual(appError.parse(safe).at, safe.at);
  });

  it("drops lines that are not places in the code", () => {
    const parsed = appError.parse({ error: "Error", at: ["at fn (a.js:1:2)", "Ada Lovelace, 42 Elm Road", "at x (b.js:3:4) secret"] });
    assert.deepEqual(parsed.at, ["at fn (a.js:1:2)"]);
    assert.equal(appError.safeParse({ error: "Bad name with spaces", at: [] }).success, false);
  });
});
