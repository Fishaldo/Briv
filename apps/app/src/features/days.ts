import { todayISO, validDate } from "@briv/core";

/** 13/10/2026, 13/10/26 or 13/10 (this year) becomes 2026-10-13. Null when it is not a real day. */
export function readDay(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[/.\-\s](\d{1,2})(?:[/.\-\s](\d{2,4}))?$/);
  if (!m) return null;
  const year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : todayISO().slice(0, 4);
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return validDate(iso) ? iso : null;
}

/** 2026-10-13 becomes 13/10/2026, the way people in Britain write it. */
export function dayText(iso: string): string {
  return iso.split("-").reverse().join("/");
}

/** Today moved by some days, as YYYY-MM-DD in the UK. */
export function shiftDay(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return todayISO(d);
}
