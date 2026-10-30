import type { DictionariesResponse, Transaction, TransactionFormData, TransactionItem } from "../src/types";

// Shared by the jsdom and the browser tests: a small, fixed set of rows in the current month, so the
// dashboard's default period ("this month") shows all of them.

const now = new Date();
const pad = (value: number) => String(value).padStart(2, "0");
export const CURRENT_MONTH = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
export const MONTH_FROM = `${CURRENT_MONTH}-01`;
export const MONTH_TO = `${CURRENT_MONTH}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
export const day = (dayOfMonth: number) => `${CURRENT_MONTH}-${pad(dayOfMonth)}`;

function row(partial: Partial<Transaction> & Pick<Transaction, "id" | "amount" | "currency" | "category">): Transaction {
  return {
    transactionDate: day(partial.id),
    amountEur: null,
    person: null,
    subCategory: null,
    comment: null,
    itemsCount: 0,
    tags: [],
    ...partial
  };
}

/**
 * EUR rows: expenses -85.50, income 2000.00, total 1914.50 (4 rows).
 * All currencies in EUR: expenses -108.60, income 2000.00, total 1891.40; the RSD row has no rate.
 */
export const TRANSACTIONS: Transaction[] = [
  row({ id: 1, amount: "-45.50", currency: "EUR", category: "Food", subCategory: "Groceries", person: "Anna", tags: ["trip"], comment: "Lidl", itemsCount: 2 }),
  row({ id: 2, amount: "-30.00", currency: "EUR", category: "Food", subCategory: "Restaurants", person: "Nikita" }),
  row({ id: 3, amount: "-10.00", currency: "EUR", category: "Food", person: "Anna" }),
  row({ id: 4, amount: "-20.00", currency: "USD", amountEur: "-18.50", category: "Transport", subCategory: "Taxi", person: "Nikita", tags: ["work"] }),
  row({ id: 5, amount: "2000.00", currency: "EUR", category: "Income", subCategory: "Salary", person: "Nikita" }),
  row({ id: 6, amount: "-1000.00", currency: "RSD", category: "Shopping", person: "Anna", comment: "Market" }),
  // Lower-case and padded on purpose: the currency list must still show a single "USD".
  row({ id: 7, amount: "-5.00", currency: " usd", amountEur: "-4.60", category: "Transport", subCategory: "Bus", tags: ["trip", "work"] })
];

export const DICTIONARIES: DictionariesResponse = {
  categories: [
    { id: 10, name: "Food" },
    { id: 11, name: "Transport" },
    { id: 12, name: "Income" },
    { id: 13, name: "Shopping" }
  ],
  subcategories: [
    { id: 20, name: "Groceries", categoryId: 10 },
    { id: 21, name: "Restaurants", categoryId: 10 },
    { id: 22, name: "Taxi", categoryId: 11 },
    { id: 23, name: "Bus", categoryId: 11 },
    { id: 24, name: "Salary", categoryId: 12 }
  ],
  persons: [
    { id: 30, name: "Anna" },
    { id: 31, name: "Nikita" }
  ],
  tags: [
    { id: 40, name: "trip" },
    { id: 41, name: "work" }
  ]
};

export const ITEMS: Record<number, TransactionItem[]> = {
  1: [
    { id: 100, position: 1, name: "Milk", amount: "-1.50", category: "Food", subCategory: "Groceries" },
    { id: 101, position: 2, name: "Bread", amount: "-44.00", category: null, subCategory: null }
  ]
};

/** What GET /api/transactions/:id returns for the inline editor. */
export function formData(id: number): TransactionFormData {
  const transaction = TRANSACTIONS.find((t) => t.id === id)!;
  const idByName = (items: { id: number; name: string }[], name: string | null) =>
    items.find((item) => item.name === name)?.id ?? null;
  return {
    id,
    transactionDate: transaction.transactionDate,
    amount: transaction.amount,
    currency: transaction.currency.trim().toUpperCase(),
    personId: idByName(DICTIONARIES.persons, transaction.person),
    categoryId: idByName(DICTIONARIES.categories, transaction.category)!,
    subcategoryId: idByName(DICTIONARIES.subcategories, transaction.subCategory),
    comment: transaction.comment,
    tagIds: transaction.tags.map((tag) => idByName(DICTIONARIES.tags, tag)!)
  };
}
