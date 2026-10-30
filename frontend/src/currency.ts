import type { Transaction } from "./types";

/** The transaction's amount in EUR (the base currency); null when its exchange rate is not known yet. */
export function eurAmount(transaction: Transaction): string | null {
  return transaction.currency.trim().toUpperCase() === "EUR" ? transaction.amount : transaction.amountEur;
}
