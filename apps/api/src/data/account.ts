import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { authUsers, authVerifications, profiles, requestLimits, type Database } from "@briv/db";

/*
 * The sign-in side of a person: their name and email, deleting the account,
 * and counters that stop anything being asked for too often.
 */

export async function identityOf(db: Database, userId: string): Promise<{ name: string; email: string }> {
  const [user] = await db.select({ name: authUsers.name, email: authUsers.email }).from(authUsers).where(eq(authUsers.id, userId));
  return { name: user?.name ?? "", email: user?.email ?? "" };
}

export async function rename(db: Database, userId: string, name: string) {
  await db.update(authUsers).set({ name }).where(eq(authUsers.id, userId));
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

/** A counter's key: a keyed hash, so the table never holds an email or an address. */
export function limitKey(kind: string, value: string, secret: string): string {
  return `${kind}:${createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("base64url")}`;
}

/** Counts one more use. False once `max` uses fall inside `seconds`. Shared by every server. */
export async function allow(db: Database, key: string, max: number, seconds: number, now = new Date()): Promise<boolean> {
  const reset = new Date(now.getTime() + seconds * 1000);
  const [row] = await db
    .insert(requestLimits)
    .values({ key, count: 1, resetAt: reset })
    .onConflictDoUpdate({
      target: requestLimits.key,
      set: {
        count: sql`case when ${requestLimits.resetAt} <= ${now.toISOString()}::timestamptz then 1 else ${requestLimits.count} + 1 end`,
        resetAt: sql`case when ${requestLimits.resetAt} <= ${now.toISOString()}::timestamptz then ${reset.toISOString()}::timestamptz else ${requestLimits.resetAt} end`,
      },
    })
    .returning({ count: requestLimits.count });
  return (row?.count ?? 1) <= max;
}

/* ------------------------------------------------------------------ */
/* Deleting an account                                                 */
/* ------------------------------------------------------------------ */

const DELETE_MINUTES = 10;
const DELETE_TRIES = 5;

function codeHash(code: string, userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`delete-account:${userId}:${code}`).digest("base64url");
}

/** A fresh 6-digit code to confirm deleting the account. Only its keyed hash is kept. */
export async function newDeleteCode(db: Database, userId: string, secret: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const identifier = `delete-account:${userId}`;
  await db.delete(authVerifications).where(eq(authVerifications.identifier, identifier));
  await db.insert(authVerifications).values({
    id: crypto.randomUUID(),
    identifier,
    value: JSON.stringify({ hash: codeHash(code, userId, secret), tries: 0 }),
    expiresAt: new Date(Date.now() + DELETE_MINUTES * 60_000),
  });
  return code;
}

/** True when the code is right and still fresh. A few wrong tries use the code up. */
export async function checkDeleteCode(db: Database, userId: string, code: string, secret: string): Promise<boolean> {
  const identifier = `delete-account:${userId}`;
  const [row] = await db.select().from(authVerifications).where(eq(authVerifications.identifier, identifier));
  if (!row || row.expiresAt.getTime() < Date.now()) return false;
  const stored = JSON.parse(row.value) as { hash: string; tries: number };
  const given = Buffer.from(codeHash(code, userId, secret));
  const expected = Buffer.from(stored.hash);
  const right = given.length === expected.length && timingSafeEqual(given, expected);
  if (right) return true;
  if (stored.tries + 1 >= DELETE_TRIES) await db.delete(authVerifications).where(eq(authVerifications.id, row.id));
  else await db.update(authVerifications).set({ value: JSON.stringify({ ...stored, tries: stored.tries + 1 }) }).where(eq(authVerifications.id, row.id));
  return false;
}

/**
 * Removes the person for good, in one step: the profile (and with it every
 * payment, place, consent, setting and budget), then the sign-in account (and
 * with it every session and linked Apple or Google account), and any codes
 * waiting for their email.
 */
export async function deleteAccount(db: Database, account: { userId: string; personId: string; email: string }) {
  await db.transaction(async (tx) => {
    await tx.delete(profiles).where(eq(profiles.id, account.personId));
    await tx.delete(authVerifications).where(
      inArray(authVerifications.identifier, [
        `delete-account:${account.userId}`,
        `sign-in-otp-${account.email}`,
        `email-verification-otp-${account.email}`,
        `forget-password-otp-${account.email}`,
      ]),
    );
    await tx.delete(authUsers).where(eq(authUsers.id, account.userId));
  });
}
