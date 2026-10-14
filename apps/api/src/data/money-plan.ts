import { and, asc, desc, eq, lte } from "drizzle-orm";
import { isCategory, type CategoryId } from "@briv/core";
import { budgets, incomePeriods, regularPayments, type Database } from "@briv/db";

/*
 * One person's pay, budget and regular payments, as they set them. Every query
 * is filtered by the person.
 */

export type SavedBudgetLine = { id: string; name: string; category: CategoryId | null; amount: number; neverCut: boolean };

export type RegularSettingRow = {
  key: string;
  name: string;
  category: string;
  amount: number;
  stopped: boolean;
  stoppedOn: string | null;
  remind: boolean;
};

export function incomeFor(db: Database, personId: string) {
  return {
    /** What came in for the pay period starting on `start`, if the person said. */
    async of(start: string): Promise<{ takeHome: number | null; confirmed: boolean } | null> {
      const [row] = await db
        .select({ takeHome: incomePeriods.takeHome, confirmed: incomePeriods.confirmed })
        .from(incomePeriods)
        .where(and(eq(incomePeriods.personId, personId), eq(incomePeriods.startsOn, start)));
      return row ?? null;
    },

    async confirm(span: { start: string; end: string }, takeHome: number) {
      await db
        .insert(incomePeriods)
        .values({ personId, startsOn: span.start, endsOn: span.end, takeHome, confirmed: true })
        .onConflictDoUpdate({
          target: [incomePeriods.personId, incomePeriods.startsOn],
          set: { endsOn: span.end, takeHome, confirmed: true },
        });
    },
  };
}

export function budgetFor(db: Database, personId: string) {
  const mine = eq(budgets.personId, personId);
  return {
    /** The budget for the pay starting on `start`: the one saved for it, or else the latest one before it. */
    async lines(start: string): Promise<{ periodStart: string | null; lines: SavedBudgetLine[] }> {
      const [latest] = await db
        .select({ periodStart: budgets.periodStart })
        .from(budgets)
        .where(and(mine, lte(budgets.periodStart, start)))
        .orderBy(desc(budgets.periodStart))
        .limit(1);
      if (!latest) return { periodStart: null, lines: [] };
      const rows = await db
        .select()
        .from(budgets)
        .where(and(mine, eq(budgets.periodStart, latest.periodStart)))
        .orderBy(asc(budgets.position));
      return {
        periodStart: latest.periodStart,
        lines: rows.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category && isCategory(row.category) ? (row.category as CategoryId) : null,
          amount: row.amount,
          neverCut: row.neverCut,
        })),
      };
    },

    /** Replaces the budget for the pay starting on `start`, in one step. */
    async save(start: string, lines: Omit<SavedBudgetLine, "id">[]) {
      await db.transaction(async (tx) => {
        await tx.delete(budgets).where(and(mine, eq(budgets.periodStart, start)));
        if (lines.length > 0) {
          await tx.insert(budgets).values(
            lines.map((line, position) => ({
              personId,
              periodStart: start,
              name: line.name,
              category: line.category,
              amount: line.amount,
              neverCut: line.neverCut,
              position,
            })),
          );
        }
      });
    },
  };
}

export function regularsFor(db: Database, personId: string) {
  const mine = eq(regularPayments.personId, personId);
  return {
    async settings(): Promise<RegularSettingRow[]> {
      const rows = await db.select().from(regularPayments).where(mine);
      return rows.map((row) => ({
        key: row.key,
        name: row.name,
        category: row.category,
        amount: row.amount,
        stopped: row.stoppedAt !== null,
        stoppedOn: row.stoppedAt ? row.stoppedAt.toISOString().slice(0, 10) : null,
        remind: row.remind,
      }));
    },

    /** Stops, restarts or quietens a regular payment Briv found. */
    async set(found: { key: string; name: string; category: string; amount: number; every: string; everyCount: number }, change: { stopped?: boolean; remind?: boolean }) {
      const set: Partial<typeof regularPayments.$inferInsert> = {};
      if (change.stopped !== undefined) set.stoppedAt = change.stopped ? new Date() : null;
      if (change.remind !== undefined) set.remind = change.remind;
      await db
        .insert(regularPayments)
        .values({ personId, ...found, ...set })
        .onConflictDoUpdate({ target: [regularPayments.personId, regularPayments.key], set });
    },
  };
}
