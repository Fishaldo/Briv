import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
 * Statement text (and later email and phone) is sealed with AES-256-GCM before
 * it reaches the database, on top of the database's own encryption.
 * Format: v1.<iv>.<tag>.<ciphertext>, each part base64url.
 */

export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal(sealed: string, key: Buffer): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || body === undefined) throw new Error("Not a sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
