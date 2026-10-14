import { lt, sql } from "drizzle-orm";
import { addMonths } from "@briv/core";
import { authVerifications, jobs, payments, requestLimits, type Database } from "@briv/db";

/*
 * Keeping no more than we need, as the Data model promises:
 * - payments older than two years (whole months) become one total per month
 *   and category, then the payments themselves are deleted;
 * - spent codes and old counters are cleared.
 * Run once a day by the host's scheduler: `node dist/jobs.js retention`.
 */

/** The first day of the month two years before `today`: payments before it are rolled up. */
export function rollUpBefore(today: string): string {
  const at = addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), -24);
  return `${at.year}-${String(at.month).padStart(2, "0")}-01`;
}

export async function runRetention(db: Database, today: string, now = new Date()): Promise<{ rolledUp: number }> {
  const before = rollUpBefore(today);
  const rolledUp = await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into monthly_totals (person_id, month, category, currency, total, count)
      select person_id, date_trunc('month', spent_on)::date, category, currency, sum(amount)::bigint, count(*)::int
      from payments
      where spent_on < ${before}
      group by 1, 2, 3, 4
      on conflict (person_id, month, category, currency) do update
        set total = monthly_totals.total + excluded.total, count = monthly_totals.count + excluded.count`);
    const gone = await tx.delete(payments).where(lt(payments.spentOn, before)).returning({ id: payments.id });
    await tx.delete(authVerifications).where(lt(authVerifications.expiresAt, now));
    await tx.delete(requestLimits).where(lt(requestLimits.resetAt, new Date(now.getTime() - 86_400_000)));
    return gone.length;
  });
  await db
    .insert(jobs)
    .values({ name: "retention", lastRunAt: now, ok: true, detail: `${rolledUp} payments rolled up` })
    .onConflictDoUpdate({ target: jobs.name, set: { lastRunAt: now, ok: true, detail: `${rolledUp} payments rolled up` } });
  return { rolledUp };
}
