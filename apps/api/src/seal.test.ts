import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { seal, unseal } from "./seal.ts";

const k1 = randomBytes(32);
const k2 = randomBytes(32);
const one = { keys: new Map([["k1", k1]]), current: "k1" };
const both = { keys: new Map([["k2", k2], ["k1", k1]]), current: "k2" };

describe("sealing private text", () => {
  it("opens what it sealed, for the same person and field", () => {
    const sealed = seal("FPS TESCO 2041", one, "p1:payment.statement");
    assert.ok(sealed.startsWith("v2.k1."));
    assert.equal(unseal(sealed, one, "p1:payment.statement"), "FPS TESCO 2041");
  });

  it("will not open for another person or another field", () => {
    const sealed = seal("for mum", one, "p1:payment.note");
    assert.throws(() => unseal(sealed, one, "p2:payment.note"));
    assert.throws(() => unseal(sealed, one, "p1:payment.statement"));
  });

  it("refuses a shortened tag", () => {
    const sealed = seal("for mum", one, "p1:payment.note");
    const parts = sealed.split(".");
    parts[3] = Buffer.from(parts[3], "base64url").subarray(0, 4).toString("base64url");
    assert.throws(() => unseal(parts.join("."), one, "p1:payment.note"), /Not a sealed value/);
  });

  it("keeps opening old text after a new key comes in", () => {
    const old = seal("TESCO", one, "p1:payment.statement");
    const fresh = seal("TESCO", both, "p1:payment.statement");
    assert.ok(fresh.startsWith("v2.k2."));
    assert.equal(unseal(old, both, "p1:payment.statement"), "TESCO");
    assert.equal(unseal(fresh, both, "p1:payment.statement"), "TESCO");
  });

  it("still opens the first format", () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", k1, iv);
    const body = Buffer.concat([cipher.update("TESCO", "utf8"), cipher.final()]);
    const v1 = ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
    assert.equal(unseal(v1, one, "ignored"), "TESCO");
  });
});
