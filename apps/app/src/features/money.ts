import { categoryLabel, countsAsSpending, dayLabel, formatGBP, type CategoryId } from "@briv/core";
import type { Palette } from "@/ui/theme";

/** £1,234 when there are no pence, £1,234.56 when there are: never rounded. */
export function pounds(pence: number): string {
  const text = formatGBP(pence);
  return pence % 100 === 0 ? text.replace(/\.00$/, "") : text;
}

/** Spending wears the brand; savings, investments and transfers are the "saved" blue. */
export function categoryColours(id: CategoryId, c: Palette) {
  return countsAsSpending(id) ? { tint: c.accentTint, ink: c.accent } : { tint: c.savedTint, ink: c.saved };
}

export function paymentLine(p: { category: CategoryId; spentOn: string }): string {
  return `${categoryLabel(p.category)} · ${dayLabel(p.spentOn)}`;
}

export function longDate(d = new Date()): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function initialOf(name: string | null): string {
  const letter = (name ?? "").trim().charAt(0);
  return letter ? letter.toUpperCase() : "·";
}
