import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
 * Private text (the statement line, a note) is sealed with AES-256-GCM before
 * it reaches the database, on top of the database's own encryption.
 *
 * Format: v2.<key id>.<iv>.<tag>.<ciphertext>, parts base64url.
 * - The key id lets keys be rotated: new text uses the current key, older text
 *   still opens with the key it was sealed with.
 * - The text is bound to whose it is and what it is (`context`, such as
 *   "<person>:payment.note"), so a sealed value moved to another person's row,
 *   or to another column, will not open.
 * - The tag is always the full 16 bytes and the IV 12, checked on opening.
 */

export type SealKeys = { keys: Map<string, Buffer>; current: string };

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function seal(plain: string, keys: SealKeys, context: string): string {
  const key = keys.keys.get(keys.current);
  if (!key) throw new Error("No current sealing key.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v2", keys.current, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal(sealed: string, keys: SealKeys, context: string): string {
  const parts = sealed.split(".");
  let keyId: string;
  let ivText: string;
  let tagText: string;
  let bodyText: string;
  let aad: string | null = context;
  if (parts[0] === "v2" && parts.length === 5) {
    [, keyId, ivText, tagText, bodyText] = parts;
  } else if (parts[0] === "v1" && parts.length === 4) {
    // The first format: one key ("k1", or the laptop key), no context.
    [, ivText, tagText, bodyText] = parts;
    keyId = keys.keys.has("k1") ? "k1" : keys.current;
    aad = null;
  } else {
    throw new Error("Not a sealed value.");
  }
  const key = keys.keys.get(keyId);
  if (!key) throw new Error("Sealed with a key this server does not have.");
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Not a sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  if (aad !== null) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8");
}
