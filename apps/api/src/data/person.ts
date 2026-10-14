import { and, asc, eq } from "drizzle-orm";
import type { Me, PaydayRuleName } from "@briv/contract";
import { consents, places, profiles, settings, type Database } from "@briv/db";
import type { SealKeys } from "../seal.ts";
import { budgetFor, incomeFor, regularsFor } from "./money-plan.ts";
import { fixesFor, paymentsFor } from "./payments.ts";
import { sealerFor } from "./sealer.ts";

/*
 * Everything about one person, and only that person. Routes get one of these
 * for the signed-in person and never touch the tables themselves (lint stops
 * them), so a new route cannot forget to filter by person: every query here
 * already does.
 */

type ConsentKind = (typeof consents.$inferInsert)["kind"];

export type { NewPaymentRow } from "./payments.ts";

export type ProfileUpdate = Partial<{
  homeTown: string | null;
  paydayRule: PaydayRuleName;
  paydayDay: number | null;
  usualTakeHome: number | null;
  country: string;
  onboarded: boolean;
  locationAsked: boolean;
  preciseLocation: boolean;
}>;

export function forPerson(db: Database, keys: SealKeys, personId: string) {
  const sealer = sealerFor(keys, personId);

  return {
    personId,

    async profile() {
      const [row] = await db.select().from(profiles).where(eq(profiles.id, personId));
      return row;
    },

    async me(identity: { name: string; email: string }): Promise<Me> {
      const [profile] = await db.select().from(profiles).where(eq(profiles.id, personId));
      const [prefs] = await db.select().from(settings).where(eq(settings.personId, personId));
      const towns = await db
        .select({ id: places.id, town: places.town })
        .from(places)
        .where(eq(places.personId, personId))
        .orderBy(asc(places.createdAt));
      return {
        name: identity.name,
        email: identity.email,
        profile: {
          country: profile.country,
          currency: profile.currency,
          homeTown: profile.homeTown,
          paydayRule: profile.paydayRule,
          paydayDay: profile.paydayDay,
          usualTakeHome: profile.usualTakeHome,
          preciseLocation: profile.preciseLocation,
          locationAsked: profile.locationAskedAt !== null,
          onboarded: profile.onboardedAt !== null,
        },
        settings: { reminders: prefs?.reminders ?? true, weeklyDay: prefs?.weeklyDay ?? null },
        places: towns,
      };
    },

    async updateProfile(change: ProfileUpdate) {
      const update: Partial<typeof profiles.$inferInsert> = {};
      if (change.homeTown !== undefined) update.homeTown = change.homeTown;
      if (change.paydayRule !== undefined) update.paydayRule = change.paydayRule;
      if (change.paydayDay !== undefined) update.paydayDay = change.paydayDay;
      if (change.usualTakeHome !== undefined) update.usualTakeHome = change.usualTakeHome;
      if (change.country !== undefined) update.country = change.country;
      if (change.onboarded) update.onboardedAt = new Date();
      if (change.locationAsked) update.locationAskedAt = new Date();
      if (change.preciseLocation !== undefined) update.preciseLocation = change.preciseLocation;
      if (Object.keys(update).length > 0) await db.update(profiles).set(update).where(eq(profiles.id, personId));
    },

    async recordConsent(kind: ConsentKind, granted: boolean) {
      await db.insert(consents).values({ personId, kind, granted });
    },

    async consents() {
      return db.select().from(consents).where(eq(consents.personId, personId));
    },

    async addPlace(town: string) {
      await db.insert(places).values({ personId, town }).onConflictDoNothing();
    },

    async removePlace(id: string) {
      await db.delete(places).where(and(eq(places.id, id), eq(places.personId, personId)));
    },

    payments: paymentsFor(db, personId, sealer),
    fixes: fixesFor(db, personId),
    income: incomeFor(db, personId),
    budget: budgetFor(db, personId),
    regulars: regularsFor(db, personId),
  };
}

export type Person = ReturnType<typeof forPerson>;
