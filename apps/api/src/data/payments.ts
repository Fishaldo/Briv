import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { descKey, isCategory, type CategoryId, type Tx } from "@briv/core";
import type { Payment } from "@briv/contract";
import { payeeFixes, payments, type Database } from "@briv/db";
import type { Sealer } from "./sealer.ts";

/*
 * One person's payments. Every query is filtered by the person, so nothing
 * here can return someone else's row.
 */

type PaymentRow = typeof payments.$inferSelect;

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

export type PaymentUpdate = Partial<{
  amount: number;
  spentOn: string;
  shopName: string | null;
  category: CategoryId;
  kind: string | null;
  note: string | null;
  toPerson: boolean;
  countsAsSpending: boolean;
  /** Clears the statement text, as for a payment that turned out to be to a person. */
  dropStatement: boolean;
}>;

/** The key a statement line is known by for the person's own fixes: "TESCO STORES 3456" → "tesco stores". */
export function statementKeyOf(statement: string | null, shopName: string | null): string {
  return descKey(statement || shopName || "").slice(0, 80);
}

export function paymentsFor(db: Database, personId: string, sealer: Sealer) {
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
      note: sealer.open("payment.note", row.note),
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

  function values(row: NewPaymentRow) {
    return {
      personId,
      amount: row.amount,
      spentOn: row.spentOn,
      shopName: row.shopName,
      category: row.category,
      kind: row.kind,
      note: sealer.seal("payment.note", row.note),
      source: row.source,
      hasReceipt: row.hasReceipt,
      toPerson: row.toPerson,
      countsAsSpending: row.countsAsSpending,
      statementSealed: sealer.seal("payment.statement", row.statement),
    };
  }

  return {
    async list(range: { from?: string; to?: string; limit: number }): Promise<Payment[]> {
      const rows = await db
        .select()
        .from(payments)
        .where(and(mine, range.from ? gte(payments.spentOn, range.from) : undefined, range.to ? lte(payments.spentOn, range.to) : undefined))
        .orderBy(desc(payments.spentOn), desc(payments.createdAt))
        .limit(range.limit);
      return rows.map(publicPayment);
    },

    async get(id: string): Promise<Payment | null> {
      const [row] = await db.select().from(payments).where(and(eq(payments.id, id), mine));
      return row ? publicPayment(row) : null;
    },

    /** Saved payments with this amount on this day, to ask before saving one twice. */
    async sameDay(amount: number, spentOn: string): Promise<{ payment: Payment; shopName: string | null }[]> {
      const rows = await db.select().from(payments).where(and(mine, eq(payments.amount, amount), eq(payments.spentOn, spentOn)));
      return rows.map((row) => ({ payment: publicPayment(row), shopName: row.shopName }));
    },

    /** Saved payments on any of these days, for checking a whole statement at once. */
    async onDays(days: string[]): Promise<{ payment: Payment; shopName: string | null }[]> {
      if (days.length === 0) return [];
      const rows = await db.select().from(payments).where(and(mine, inArray(payments.spentOn, [...new Set(days)])));
      return rows.map((row) => ({ payment: publicPayment(row), shopName: row.shopName }));
    },

    /** Saves a payment; with `replaceId`, the saved one goes in the same step, so a failure keeps it. */
    async add(row: NewPaymentRow, replaceId?: string): Promise<Payment> {
      return db.transaction(async (tx) => {
        if (replaceId) await tx.delete(payments).where(and(eq(payments.id, replaceId), mine));
        const [saved] = await tx.insert(payments).values(values(row)).returning();
        return publicPayment(saved);
      });
    },

    /** Saves several payments in one step: all of them, or none. */
    async addMany(rows: NewPaymentRow[]): Promise<number> {
      if (rows.length === 0) return 0;
      const saved = await db.insert(payments).values(rows.map(values)).returning({ id: payments.id });
      return saved.length;
    },

    async update(id: string, change: PaymentUpdate): Promise<Payment | null> {
      const set: Partial<typeof payments.$inferInsert> = { updatedAt: new Date() };
      if (change.amount !== undefined) set.amount = change.amount;
      if (change.spentOn !== undefined) set.spentOn = change.spentOn;
      if (change.shopName !== undefined) set.shopName = change.shopName;
      if (change.category !== undefined) set.category = change.category;
      if (change.kind !== undefined) set.kind = change.kind;
      if (change.note !== undefined) set.note = sealer.seal("payment.note", change.note);
      if (change.toPerson !== undefined) set.toPerson = change.toPerson;
      if (change.countsAsSpending !== undefined) set.countsAsSpending = change.countsAsSpending;
      if (change.dropStatement) set.statementSealed = null;
      const [row] = await db.update(payments).set(set).where(and(eq(payments.id, id), mine)).returning();
      return row ? publicPayment(row) : null;
    },

    /** The statement key of a saved payment: its sealed statement line, or its shop name. */
    async keyOf(id: string): Promise<string> {
      const [row] = await db
        .select({ statement: payments.statementSealed, shopName: payments.shopName })
        .from(payments)
        .where(and(eq(payments.id, id), mine));
      if (!row) return "";
      return statementKeyOf(sealer.open("payment.statement", row.statement), row.shopName);
    },

    /** Every other payment with the same statement key, for "change the ones like this too". */
    async withKey(key: string, exceptId: string): Promise<string[]> {
      if (!key) return [];
      const rows = await db
        .select({ id: payments.id, statement: payments.statementSealed, shopName: payments.shopName, toPerson: payments.toPerson })
        .from(payments)
        .where(mine);
      return rows
        .filter((row) => row.id !== exceptId && !row.toPerson && statementKeyOf(sealer.open("payment.statement", row.statement), row.shopName) === key)
        .map((row) => row.id);
    },

    async setMany(ids: string[], set: { shopName?: string | null; category?: CategoryId; countsAsSpending?: boolean }): Promise<number> {
      if (ids.length === 0) return 0;
      const changed = await db
        .update(payments)
        .set({ ...set, updatedAt: new Date() })
        .where(and(mine, inArray(payments.id, ids)))
        .returning({ id: payments.id });
      return changed.length;
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
      return sealer.open("payment.statement", row?.text ?? null);
    },
  };
}

/** The person's own fixes: "this statement text is this shop, in this category". */
export function fixesFor(db: Database, personId: string) {
  return {
    async forKeys(keys: string[]): Promise<Map<string, { shopName: string; category: CategoryId }>> {
      const wanted = [...new Set(keys.filter(Boolean))];
      if (wanted.length === 0) return new Map();
      const rows = await db
        .select()
        .from(payeeFixes)
        .where(and(eq(payeeFixes.personId, personId), inArray(payeeFixes.statementKey, wanted)));
      return new Map(
        rows
          .filter((row) => isCategory(row.category))
          .map((row) => [row.statementKey, { shopName: row.shopName, category: row.category as CategoryId }]),
      );
    },

    async save(key: string, shopName: string, category: CategoryId) {
      if (!key) return;
      await db
        .insert(payeeFixes)
        .values({ personId, statementKey: key, shopName, category })
        .onConflictDoUpdate({ target: [payeeFixes.personId, payeeFixes.statementKey], set: { shopName, category } });
    },
  };
}
