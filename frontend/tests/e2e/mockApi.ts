import type { Page, Route } from "@playwright/test";
import type { Transaction } from "../../src/types";
import { DICTIONARIES, ITEMS, TRANSACTIONS, day, formData } from "../fixtures";

/**
 * The shared rows plus one with long unbroken words: its comment is what widens the table, which used to
 * resize the chart column (and reflow the pie legend) whenever filters showed or hid it.
 */
export const E2E_TRANSACTIONS: Transaction[] = [
  ...TRANSACTIONS,
  {
    id: 8,
    transactionDate: day(8),
    amount: "-12.00",
    amountEur: null,
    currency: "EUR",
    person: "Anna",
    category: "Gifts",
    subCategory: "Birthday",
    comment: "Supercalifragilisticexpialidocious-present-for-grandmother-with-a-very-long-description",
    itemsCount: 0,
    tags: ["family-celebrations-and-other-long-tag-names"]
  }
];

/** Answers every /api request in the page from fixtures, so no backend or database is touched. */
export async function mockApi(page: Page, transactions: Transaction[] = E2E_TRANSACTIONS) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });

    if (method === "GET" && path === "/api/transactions") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      return json(transactions.filter((t) => !from || !to || (t.transactionDate >= from && t.transactionDate <= to)));
    }
    if (method === "GET" && path === "/api/dictionaries") {
      return json(DICTIONARIES);
    }
    if (method === "GET" && path === "/api/transactions/export") {
      return route.fulfill({
        body: "xlsx",
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": 'attachment; filename="transactions-test.xlsx"'
        }
      });
    }
    const itemsMatch = path.match(/^\/api\/transactions\/(\d+)\/items$/);
    if (itemsMatch) {
      return json(ITEMS[Number(itemsMatch[1])] ?? []);
    }
    const idMatch = path.match(/^\/api\/transactions\/(\d+)$/);
    if (idMatch && method === "GET") {
      const id = Number(idMatch[1]);
      return id === 8
        ? json({ ...formData(1), id: 8, comment: transactions.find((t) => t.id === 8)?.comment ?? null })
        : json(formData(id));
    }
    return route.fulfill({ status: 404, json: { error: `Unexpected ${method} ${path} in a test` } });
  });
}
