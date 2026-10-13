import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { authUsers, profiles, settings, type Database } from "@briv/db";

const known = new Map<string, string>();

/**
 * The person number for a signed-in account. Every account gets one, with an
 * empty profile, when it is made. An account without one is given one here.
 */
export async function personFor(db: Database, userId: string): Promise<string | null> {
  const cached = known.get(userId);
  if (cached) return cached;
  const [row] = await db.select({ personId: authUsers.personId }).from(authUsers).where(eq(authUsers.id, userId));
  if (!row) return null;
  let personId = row.personId;
  if (personId) {
    await db.insert(profiles).values({ id: personId }).onConflictDoNothing();
  } else {
    personId = randomUUID();
    await db.insert(profiles).values({ id: personId });
    await db.update(authUsers).set({ personId }).where(eq(authUsers.id, userId));
  }
  await db.insert(settings).values({ personId }).onConflictDoNothing();
  if (known.size > 5000) known.clear();
  known.set(userId, personId);
  return personId;
}

export function forgetPerson(userId: string) {
  known.delete(userId);
}
