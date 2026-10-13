import { categoryLabel, countsAsSpending, dayLabel, formatGBP, type CategoryId } from "@briv/core";
import { color } from "@/ui/theme";

/** £1,234 for big round figures, £12.50 otherwise. */
export function pounds(pence: number): string {
  if (Math.abs(pence) < 100_000) return formatGBP(pence);
  return formatGBP(Math.round(pence / 100) * 100).replace(/\.00$/, "");
}

/** Spending is green; savings, investments and transfers are blue. */
export function categoryColours(id: CategoryId) {
  return countsAsSpending(id)
    ? { tint: color.greenTint, ink: color.green }
    : { tint: color.blueTint, ink: color.blue };
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
