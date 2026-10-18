import { addDays } from "./dates.ts";
import { sameShop } from "./duplicate.ts";

/*
 * The no-double-count rules. A spend can reach Briv more than once: a receipt,
 * then the same payment on the bank statement a day or two later; a credit
 * card's purchases, then the bank paying off the card. Counting both makes
 * "spent so far" and safe to spend wrong, so:
 *
 *   - a receipt and its bank line are one spend;
 *   - paying off a credit card is not new spending (the purchases were);
 *   - moving money between your own accounts or pots is not spending.
 *
 * Pay-later instalments (Klarna, Clearpay) are left as spending on purpose:
 * for most people they are the only record of the purchase, so marking them
 * "not spending" would make it vanish.
 */

/** How many days after the purchase a bank or card statement may show it. */
export const BANK_POSTING_DAYS = 3;

/** Where a payment came from, as the server stores it. */
export type PaymentOrigin = "bank" | "statement" | "receipt" | "message" | "voice" | "email" | "typed" | string;

/** True for lines read from a bank: a statement or, later, the bank feed. */
export function fromBank(origin: PaymentOrigin): boolean {
  return origin === "bank" || origin === "statement";
}

/** Money that moves but is not spent, read from a statement line. */
export type Movement = "card-repayment" | "own-transfer";

const CARD_ISSUER =
  /\b(american express|amex|barclaycard|mbna|capital one|vanquis|aqua card|marbles card|fluid card|zopa credit card|tesco bank cc|tesco credit card|sainsburys bank cc|virgin money cc|natwest credit card|halifax credit card|lloyds credit card|hsbc credit card|santander credit card|nationwide credit card|john lewis partnership card|m ?& ?s credit card|creation finance)\b/;
const CARD_REPAYMENT = /\b(credit card (re)?payment|card repayment|payment to credit card|cc payment|credit card dd)\b/;
/** Interest and fees on a card are real costs, not a repayment. */
const CARD_COST = /\b(interest|fee|fees|charge|charges|late payment)\b/;
const OWN_TRANSFER =
  /\b(pot transfer|to pot|from pot|savings pot|to savings|to my savings|own account|internal transfer|transfer to (my )?(savings|isa|account)|isa transfer|to isa|round ?up)\b/;

/**
 * Reads a statement line as money moved rather than spent: paying off a credit
 * card, or moving money to your own savings or pots. Null for everything else.
 */
export function movementOf(...parts: (string | null | undefined)[]): Movement | null {
  const text = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ");
  if (!text.trim()) return null;
  if (OWN_TRANSFER.test(text)) return "own-transfer";
  if (CARD_COST.test(text)) return null;
  if (CARD_REPAYMENT.test(text) || CARD_ISSUER.test(text)) return "card-repayment";
  return null;
}

export type CountedPayment = { merchant: string; amountPence: number; spentOn: string; origin: PaymentOrigin };

/**
 * Whether two payments look like one spend, and why:
 *   "same-day"     same amount, same shop, same day (asked about, as before);
 *   "posted-later" a bank line and a receipt, alert or typed spend with the same
 *                  amount and shop, the bank line up to three days later, because
 *                  banks often show a payment a day or two after it was made.
 * Two payments from the same kind of source on different days are never one:
 * the same coffee on Monday and Tuesday is two coffees.
 */
export function sameSpend(saved: CountedPayment, incoming: CountedPayment): "same-day" | "posted-later" | null {
  if (saved.amountPence !== incoming.amountPence || saved.amountPence <= 0) return null;
  if (!sameShop(saved.merchant, incoming.merchant)) return null;
  const savedDay = saved.spentOn.slice(0, 10);
  const incomingDay = incoming.spentOn.slice(0, 10);
  if (savedDay === incomingDay) return "same-day";
  const savedBank = fromBank(saved.origin);
  const incomingBank = fromBank(incoming.origin);
  if (savedBank === incomingBank) return null;
  const purchase = savedBank ? incomingDay : savedDay;
  const posted = savedBank ? savedDay : incomingDay;
  return posted > purchase && posted <= addDays(purchase, BANK_POSTING_DAYS) ? "posted-later" : null;
}

/** The days a saved payment could sit on and still be the same spend as one on `day`. */
export function daysToCheck(day: string): string[] {
  const out: string[] = [];
  for (let d = -BANK_POSTING_DAYS; d <= BANK_POSTING_DAYS; d++) out.push(addDays(day, d));
  return out;
}
