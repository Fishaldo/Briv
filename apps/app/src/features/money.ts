import { categoryLabel, countsAsSpending, dayLabel, formatGBP, type CategoryId } from "@briv/core";
import { color } from "@/ui/theme";

/** £1,234 when there are no pence, £1,234.56 when there are: never rounded. */
export function pounds(pence: number): string {
  const text = formatGBP(pence);
  return pence % 100 === 0 ? text.replace(/\.00$/, "") : text;
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
