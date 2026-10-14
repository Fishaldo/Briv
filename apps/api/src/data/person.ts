import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { isCategory, type CategoryId, type Tx } from "@briv/core";
import type { Me, Payment, PaydayRuleName } from "@briv/contract";
import { consents, payments, places, profiles, settings, type Database } from "@briv/db";
import { seal, unseal, type SealKeys } from "../seal.ts";

/*
 * Everything about one person, and only that person. Routes get one of these
 * for the signed-in person and never touch the tables themselves (lint stops
 * them), so a new route cannot forget to filter by person: every query here
 * already does.
 */

type PaymentRow = typeof payments.$inferSelect;
type ConsentKind = (typeof consents.$inferInsert)["kind"];

export type NewPaymentRow = {
  amount: number;
  spentOn: string;
  shopName: string | null;
  category: CategoryId;
  kind: string | null;
  note: string | null;
  source: PaymentRow["source"];
  hasReceipt: boolean;
  toPerson: boolean;
  countsAsSpending: boolean;
  statement: string | null;
};

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
  // Sealed text is bound to this person and to the field it belongs in.
  const sealed = (field: string, text: string | null) => (text ? seal(text, keys, `${personId}:${field}`) : null);
  const opened = (field: string, text: string | null) => {
    if (!text) return null;
    try {
      return unseal(text, keys, `${personId}:${field}`);
    } catch {
      return null;
    }
  };
  const mine = eq(payments.personId, personId);

  function publicPayment(row: PaymentRow): Payment {
    return {
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      spentOn: row.spentOn,
      shopName: row.shopName,
      category: (isCategory(row.category) ? row.category : "other") as CategoryId,
      kind: row.kind,
      source: row.source,
      countsAsSpending: row.countsAsSpending,
      toPerson: row.toPerson,
      hasReceipt: row.hasReceipt,
      note: opened("payment.note", row.note),
    };
  }

  function asTx(row: PaymentRow): Tx {
    return {
      id: row.id,
      merchant: row.shopName ?? "",
      description: row.shopName ?? "",
      amountPence: row.amount,
      category: (isCategory(row.category) ? row.category : "other") as CategoryId,
      spentOn: row.spentOn,
      source: "manual",
      hasReceipt: row.hasReceipt,
      note: "",
      items: [],
      rawAlert: "",
      isSample: false,
      createdAt: row.createdAt.toISOString(),
    };
  }

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

    payments: {
      async list(range: { from?: string; to?: string; limit: number }): Promise<Payment[]> {
        const rows = await db
          .select()
          .from(payments)
          .where(and(mine, range.from ? gte(payments.spentOn, range.from) : undefined, range.to ? lte(payments.spentOn, range.to) : undefined))
          .orderBy(desc(payments.spentOn), desc(payments.createdAt))
          .limit(range.limit);
        return rows.map(publicPayment);
      },

      /** Saved payments with this amount on this day, to ask before saving one twice. */
      async sameDay(amount: number, spentOn: string): Promise<{ payment: Payment; shopName: string | null }[]> {
        const rows = await db.select().from(payments).where(and(mine, eq(payments.amount, amount), eq(payments.spentOn, spentOn)));
        return rows.map((row) => ({ payment: publicPayment(row), shopName: row.shopName }));
      },

      /** Saves a payment; with `replaceId`, the saved one goes in the same step, so a failure keeps it. */
      async add(row: NewPaymentRow, replaceId?: string): Promise<Payment> {
        return db.transaction(async (tx) => {
          if (replaceId) await tx.delete(payments).where(and(eq(payments.id, replaceId), mine));
          const [saved] = await tx
            .insert(payments)
            .values({
              personId,
              amount: row.amount,
              spentOn: row.spentOn,
              shopName: row.shopName,
              category: row.category,
              kind: row.kind,
              note: sealed("payment.note", row.note),
              source: row.source,
              hasReceipt: row.hasReceipt,
              toPerson: row.toPerson,
              countsAsSpending: row.countsAsSpending,
              statementSealed: sealed("payment.statement", row.statement),
            })
            .returning();
          return publicPayment(saved);
        });
      },

      async remove(id: string): Promise<boolean> {
        const gone = await db.delete(payments).where(and(eq(payments.id, id), mine)).returning({ id: payments.id });
        return gone.length > 0;
      },

      async between(start: string, end: string): Promise<Tx[]> {
        const rows = await db.select().from(payments).where(and(mine, gte(payments.spentOn, start), lte(payments.spentOn, end)));
        return rows.map(asTx);
      },

      /** The sealed statement line, opened. For the person's own export and for tests. */
      async statementOf(id: string): Promise<string | null> {
        const [row] = await db.select({ text: payments.statementSealed }).from(payments).where(and(eq(payments.id, id), mine));
        return opened("payment.statement", row?.text ?? null);
      },
    },
  };
}

export type Person = ReturnType<typeof forPerson>;
