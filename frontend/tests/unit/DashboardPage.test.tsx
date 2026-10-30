import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "../../src/pages/DashboardPage";
import { MONTH_FROM, MONTH_TO, TRANSACTIONS } from "../fixtures";
import { installFakeApi } from "./fakeApi";
import { setNarrowScreen } from "./setup";

const STORAGE_KEY = "dashboard-filters";

async function renderDashboard() {
  const user = userEvent.setup();
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DashboardPage />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByRole("button", { name: /Export Excel/ })).toBeEnabled());
  return user;
}

// The table and the phone card list are both in the DOM (CSS shows one), so queries are scoped to the table.
const table = () => document.querySelector<HTMLTableElement>(".table-wrap table")!;
const header = () => table().querySelector("thead")!;
const bodyRows = () => Array.from(table().querySelectorAll<HTMLTableRowElement>("tbody > tr:not(.receipt-row)"));
const categoriesInTable = () => bodyRows().map((row) => row.cells[1].textContent);
const stat = (label: string) => screen.getByText(label, { selector: ".stat-card span" }).nextElementSibling!.textContent;
const savedFilters = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");

async function openColumnFilter(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(within(header()).getByRole("button", { name: new RegExp(`^${label}`) }));
  return screen.getByRole("dialog", { name: `Filter by ${label}` });
}

describe("loading", () => {
  it("asks for the current month by default and shows the EUR rows with their totals", async () => {
    const api = installFakeApi();
    await renderDashboard();

    const [request] = api.calls("GET", "/api/transactions");
    expect(request.search.get("from")).toBe(MONTH_FROM);
    expect(request.search.get("to")).toBe(MONTH_TO);

    expect(categoriesInTable()).toEqual(["Food", "Food", "Food", "Income"]);
    expect(stat("Rows")).toBe("4");
    expect(stat("Expenses")).toBe("-85.50");
    expect(stat("Income")).toBe("2000.00");
    expect(stat("Total")).toBe("1914.50");
  });

  it("shows the server's error message", async () => {
    installFakeApi({
      override: (request) =>
        request.path === "/api/transactions"
          ? new Response(JSON.stringify({ error: "Database is down" }), {
              status: 500,
              headers: { "content-type": "application/json" }
            })
          : undefined
    });
    await renderDashboard();

    expect(screen.getByText("Database is down")).toHaveClass("error-box");
    expect(within(table()).getByText("No transactions found.")).toBeInTheDocument();
  });

  it("treats rows from an older server without amountEur and tags as having none", async () => {
    const { amountEur: _eur, tags: _tags, ...legacy } = TRANSACTIONS[0];
    installFakeApi({ transactions: [legacy as (typeof TRANSACTIONS)[number]] });
    await renderDashboard();

    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].cells[5]).toHaveTextContent("-");
  });
});

describe("currency filter", () => {
  it("offers All plus the currencies found in the rows, normalised and sorted", async () => {
    installFakeApi();
    const user = await renderDashboard();

    const popover = await openColumnFilter(user, "Amount");
    const options = within(popover).getAllByRole("radio").map((radio) => radio.closest("label")!.textContent);
    expect(options).toEqual(["All", "EUR", "RSD", "USD"]);
    expect(within(popover).getByRole("radio", { name: "EUR" })).toBeChecked();
  });

  it("switches to one other currency without mixing amounts", async () => {
    installFakeApi();
    const user = await renderDashboard();

    await user.click(within(await openColumnFilter(user, "Amount")).getByRole("radio", { name: "USD" }));

    expect(categoriesInTable()).toEqual(["Transport", "Transport"]);
    expect(stat("Expenses")).toBe("-25.00");
    expect(stat("Total")).toBe("-25.00");
    expect(within(header()).getByRole("button", { name: /Amount/ })).toHaveTextContent("USD");
    expect(savedFilters().currency).toBe("USD");
  });

  it("in All mode shows every row in EUR, keeps the original under it and leaves rows without a rate out of the totals", async () => {
    installFakeApi();
    const user = await renderDashboard();

    await user.click(within(await openColumnFilter(user, "Amount")).getByRole("radio", { name: "All" }));

    expect(bodyRows()).toHaveLength(TRANSACTIONS.length);
    expect(stat("Rows")).toBe("7");
    expect(stat("Expenses")).toBe("-108.60 EUR");
    expect(stat("Income")).toBe("2000.00 EUR");
    expect(stat("Total")).toBe("1891.40 EUR");
    expect(screen.getByText(/1 row has no EUR exchange rate yet and is not included/)).toBeInTheDocument();

    const amountOf = (id: number) => bodyRows()[TRANSACTIONS.findIndex((t) => t.id === id)].cells[4];
    expect(amountOf(1)).toHaveTextContent(/^-45\.50 EUR$/);
    expect(amountOf(4).firstChild).toHaveTextContent("-18.50 EUR");
    expect(within(amountOf(4)).getByText("-20.00 USD")).toHaveClass("amount-original");
    expect(amountOf(6).firstChild).toHaveTextContent("-1000.00 RSD");
    expect(within(amountOf(6)).getByText("no EUR rate yet")).toBeInTheDocument();
  });

  it("shows All for a saved currency the period lacks, but keeps it saved", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ range: { from: MONTH_FROM, to: MONTH_TO }, currency: "GBP" }));
    installFakeApi();
    const user = await renderDashboard();

    expect(bodyRows()).toHaveLength(TRANSACTIONS.length);
    expect(stat("Total")).toBe("1891.40 EUR");
    expect(within(await openColumnFilter(user, "Amount")).getByRole("radio", { name: "All" })).toBeChecked();
    expect(savedFilters().currency).toBe("GBP");
  });

  it("is not reset by Clear filters", async () => {
    installFakeApi();
    const user = await renderDashboard();

    await user.click(within(await openColumnFilter(user, "Amount")).getByRole("radio", { name: "All" }));
    await user.click(within(await openColumnFilter(user, "Person")).getByRole("checkbox", { name: "Anna" }));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(savedFilters().currency).toBe("All");
    expect(bodyRows()).toHaveLength(TRANSACTIONS.length);
  });
});

describe("column filters", () => {
  it("unchecking a category hides its rows, and Clear filters brings them back", async () => {
    installFakeApi();
    const user = await renderDashboard();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    const popover = await openColumnFilter(user, "Category");
    expect(within(popover).getByRole("checkbox", { name: "Food" })).toBeChecked();
    await user.click(within(popover).getByRole("checkbox", { name: "Food" }));

    expect(categoriesInTable()).toEqual(["Income"]);
    expect(stat("Expenses")).toBe("0.00");
    expect(within(header()).getByRole("button", { name: /^Category/ })).toHaveClass("is-active");
    expect(savedFilters().excludedCategories).toEqual(["Food"]);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(categoriesInTable()).toEqual(["Food", "Food", "Food", "Income"]);
    expect(savedFilters().excludedCategories).toEqual([]);
  });

  it("lists only subcategories of the checked categories, and Reset checks them all again", async () => {
    installFakeApi();
    const user = await renderDashboard();

    let popover = await openColumnFilter(user, "Subcategory");
    expect(within(popover).getAllByRole("checkbox").map((box) => box.closest("label")!.textContent)).toEqual([
      "Groceries",
      "Restaurants",
      "Salary"
    ]);
    await user.click(within(popover).getByRole("checkbox", { name: "Restaurants" }));
    // Rows without a subcategory are never hidden by this filter.
    expect(bodyRows().map((row) => row.cells[2].textContent)).toEqual(["Groceries", "-", "Salary"]);

    await user.click(within(popover).getByRole("button", { name: "Reset" }));
    expect(bodyRows()).toHaveLength(4);

    await user.keyboard("{Escape}");
    await user.click(within(await openColumnFilter(user, "Category")).getByRole("checkbox", { name: "Food" }));
    await user.keyboard("{Escape}");
    popover = await openColumnFilter(user, "Subcategory");
    expect(within(popover).getAllByRole("checkbox").map((box) => box.closest("label")!.textContent)).toEqual(["Salary"]);
  });

  it("filters by person", async () => {
    installFakeApi();
    const user = await renderDashboard();

    await user.click(within(await openColumnFilter(user, "Person")).getByRole("checkbox", { name: "Anna" }));

    expect(bodyRows().map((row) => row.cells[3].textContent)).toEqual(["Anna", "Anna"]);
    expect(within(header()).getByRole("button", { name: /^Person/ })).toHaveTextContent("1");
    expect(savedFilters().persons).toEqual(["Anna"]);
  });

  it("shows rows that have any of the selected tags", async () => {
    installFakeApi();
    const user = await renderDashboard();
    await user.click(within(await openColumnFilter(user, "Amount")).getByRole("radio", { name: "All" }));

    const popover = await openColumnFilter(user, "Tags");
    await user.click(within(popover).getByRole("checkbox", { name: "trip" }));
    expect(bodyRows().map((row) => row.cells[0].textContent)).toEqual([TRANSACTIONS[0].transactionDate, TRANSACTIONS[6].transactionDate]);

    await user.click(within(popover).getByRole("checkbox", { name: "work" }));
    expect(bodyRows()).toHaveLength(3);
    expect(savedFilters().tags).toEqual(["trip", "work"]);
  });

  it("closes the popover on Escape and on a click outside", async () => {
    installFakeApi();
    const user = await renderDashboard();

    await openColumnFilter(user, "Person");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filter by Person" })).not.toBeInTheDocument();

    await openColumnFilter(user, "Person");
    await user.click(screen.getByRole("heading", { name: "Finances Dashboard" }));
    expect(screen.queryByRole("dialog", { name: "Filter by Person" })).not.toBeInTheDocument();
  });
});

describe("saved filters", () => {
  it("restores every filter from localStorage", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        range: null,
        currency: "All",
        excludedCategories: ["Income"],
        excludedSubcategories: ["Taxi"],
        persons: ["Nikita"],
        tags: []
      })
    );
    const api = installFakeApi();
    await renderDashboard();

    expect([...api.calls("GET", "/api/transactions")[0].search.keys()]).toEqual([]);
    expect(screen.getByRole("button", { name: "All time" })).toBeInTheDocument();
    expect(categoriesInTable()).toEqual(["Food"]);
    expect(bodyRows()[0].cells[2]).toHaveTextContent("Restaurants");
  });

  it("keeps an unchecked category that is missing from the period unchecked", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ currency: "EUR", excludedCategories: ["Travel"] }));
    installFakeApi();
    const user = await renderDashboard();

    await user.click(within(await openColumnFilter(user, "Category")).getByRole("checkbox", { name: "Food" }));
    expect(savedFilters().excludedCategories).toEqual(["Travel", "Food"]);
  });

  it("falls back to the defaults when the saved value is broken", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const api = installFakeApi();
    await renderDashboard();

    expect(api.calls("GET", "/api/transactions")[0].search.get("from")).toBe(MONTH_FROM);
    expect(savedFilters()).toEqual({
      range: { from: MONTH_FROM, to: MONTH_TO },
      currency: "EUR",
      excludedCategories: [],
      excludedSubcategories: [],
      persons: [],
      tags: []
    });
  });

  it("ignores fields of the wrong type", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ range: { from: 1 }, currency: 5, persons: "Anna", tags: [1] }));
    installFakeApi();
    await renderDashboard();

    expect(savedFilters()).toMatchObject({ range: { from: MONTH_FROM, to: MONTH_TO }, currency: "EUR", persons: [], tags: [] });
  });

  it("reloads the rows for a period picked in the calendar and saves it", async () => {
    const api = installFakeApi();
    const user = await renderDashboard();

    await user.click(screen.getByRole("button", { name: /–/ }));
    await user.click(screen.getByRole("button", { name: "All time" }));

    await waitFor(() => expect(api.calls("GET", "/api/transactions")).toHaveLength(2));
    expect([...api.calls("GET", "/api/transactions")[1].search.keys()]).toEqual([]);
    expect(savedFilters().range).toBeNull();
  });
});

describe("edit rows mode", () => {
  it("hides the chart, adds the Action column and loads the dictionaries once", async () => {
    const api = installFakeApi();
    const user = await renderDashboard();
    const toggle = screen.getByRole("button", { name: "Edit rows" });
    const grid = document.querySelector(".grid-two-columns")!;

    expect(screen.getByRole("heading", { name: "Category distribution" })).toBeInTheDocument();
    expect(api.calls("GET", "/api/dictionaries")).toHaveLength(0);

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(grid).toHaveClass("grid-editing");
    expect(screen.queryByRole("heading", { name: "Category distribution" })).not.toBeInTheDocument();
    expect(within(header()).getByText("Action")).toBeInTheDocument();
    expect(within(bodyRows()[0]).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    await waitFor(() => expect(api.calls("GET", "/api/dictionaries")).toHaveLength(1));

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(grid).not.toHaveClass("grid-editing");
    expect(grid.className).toBe("grid-two-columns");
    expect(screen.getByRole("heading", { name: "Category distribution" })).toBeInTheDocument();
    expect(within(header()).queryByText("Action")).not.toBeInTheDocument();
    expect(header().querySelectorAll("th")).toHaveLength(7);

    await user.click(toggle);
    expect(api.calls("GET", "/api/dictionaries")).toHaveLength(1);
  });

  it("edits a row in place and saves it", async () => {
    const api = installFakeApi();
    const user = await renderDashboard();
    await user.click(screen.getByRole("button", { name: "Edit rows" }));
    await user.click(within(bodyRows()[0]).getByRole("button", { name: "Edit" }));

    const editRow = await waitFor(() => {
      const row = table().querySelector<HTMLTableRowElement>("tr.edit-row");
      expect(within(row!).getByLabelText("Amount")).toBeInTheDocument();
      return row!;
    });
    expect(editRow.cells).toHaveLength(8);
    expect(within(editRow).getByLabelText("Amount")).toHaveValue("-45.50");
    await waitFor(() => expect(within(editRow).getByLabelText("Category")).toHaveDisplayValue("Food"));
    expect(within(editRow).getByLabelText("Subcategory")).toHaveDisplayValue("Groceries");
    expect(within(editRow).getByLabelText("Comment")).toHaveValue("Lidl");

    const amount = within(editRow).getByLabelText("Amount");
    await user.clear(amount);
    await user.type(amount, "-12,3x4");
    expect(amount).toHaveValue("-12.34");
    await user.selectOptions(within(editRow).getByLabelText("Person"), "Nikita");
    await user.click(within(editRow).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.calls("PUT", "/api/transactions/1")).toHaveLength(1));
    expect(api.calls("PUT", "/api/transactions/1")[0].body).toEqual({
      transactionDate: TRANSACTIONS[0].transactionDate,
      amount: "-12.34",
      currency: "EUR",
      personId: 31,
      categoryId: 10,
      subcategoryId: 20,
      comment: "Lidl",
      tagIds: [40]
    });
    await waitFor(() => expect(table().querySelector("tr.edit-row")).toBeNull());
    expect(api.calls("GET", "/api/transactions")).toHaveLength(2);
  });

  it("Cancel and Done both close the editor and restore the normal row", async () => {
    installFakeApi();
    const user = await renderDashboard();
    await user.click(screen.getByRole("button", { name: "Edit rows" }));

    await user.click(within(bodyRows()[1]).getByRole("button", { name: "Edit" }));
    await user.click(await within(table()).findByRole("button", { name: "Cancel" }));
    expect(table().querySelector("tr.edit-row")).toBeNull();

    await user.click(within(bodyRows()[1]).getByRole("button", { name: "Edit" }));
    await within(table()).findByRole("button", { name: "Save" });
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(table().querySelector("tr.edit-row")).toBeNull();
    expect(bodyRows().every((row) => row.cells.length === 7)).toBe(true);
  });

  it("deletes a row after confirmation only", async () => {
    const api = installFakeApi();
    const user = await renderDashboard();
    await user.click(screen.getByRole("button", { name: "Edit rows" }));

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(within(bodyRows()[0]).getByRole("button", { name: "Delete" }));
    expect(api.calls("DELETE", "/api/transactions/1")).toHaveLength(0);
    expect(bodyRows()).toHaveLength(4);

    await user.click(within(bodyRows()[0]).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(api.calls("DELETE", "/api/transactions/1")).toHaveLength(1);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("on a phone opens the editor in the card instead of the table", async () => {
    setNarrowScreen(true);
    installFakeApi();
    const user = await renderDashboard();
    await user.click(screen.getByRole("button", { name: "Edit rows" }));

    const card = document.querySelectorAll<HTMLElement>(".transaction-card")[0];
    await user.click(within(card).getByRole("button", { name: "Edit" }));

    expect(card).toHaveClass("transaction-card-editing");
    expect(within(card).getByRole("button", { name: "Close" })).toHaveAttribute("aria-pressed", "true");
    expect(await within(card).findByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(table().querySelector("tr.edit-row")).toBeNull();
  });
});

describe("receipt items", () => {
  it("loads the items on first expand and caches them", async () => {
    const api = installFakeApi();
    const user = await renderDashboard();

    const toggle = within(bodyRows()[0]).getByRole("button", { name: /2 items/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const receipt = await within(table()).findByText("Milk");
    expect(receipt.closest("tr")).toHaveTextContent("Food / Groceries");
    expect(within(table()).getByText("Bread").closest("tr")).toHaveTextContent("-44.00 EUR");

    await user.click(toggle);
    await user.click(toggle);
    expect(api.calls("GET", "/api/transactions/1/items")).toHaveLength(1);
  });
});

describe("Excel export", () => {
  it("downloads the file for the selected period under the server's file name", async () => {
    const api = installFakeApi();
    const user = await renderDashboard();
    URL.createObjectURL = vi.fn(() => "blob:report");
    URL.revokeObjectURL = vi.fn();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    await user.click(screen.getByRole("button", { name: "Export Excel" }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    const [request] = api.calls("GET", "/api/transactions/export");
    expect(request.search.get("from")).toBe(MONTH_FROM);
    expect(request.search.get("to")).toBe(MONTH_TO);
    expect(clicked[0].download).toBe("report.xlsx");
    expect(clicked[0].href).toBe("blob:report");
    expect(clicked[0].isConnected).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("shows Exporting… while waiting and the error when it fails", async () => {
    let respond!: (response: Response) => void;
    installFakeApi({
      override: (request) =>
        request.path === "/api/transactions/export" ? new Promise<Response>((resolve) => (respond = resolve)) : undefined
    });
    const user = await renderDashboard();

    await user.click(screen.getByRole("button", { name: "Export Excel" }));
    expect(screen.getByRole("button", { name: "Exporting..." })).toBeDisabled();

    respond(new Response("boom", { status: 502 }));
    expect(await screen.findByText("Failed to export transactions: HTTP 502")).toHaveClass("error-box");
    expect(screen.getByRole("button", { name: "Export Excel" })).toBeEnabled();
  });
});

describe("category chart", () => {
  const legendItems = () => Array.from(document.querySelectorAll<HTMLElement>(".recharts-legend-item"));

  it("leaves income out and lists every category in the legend", async () => {
    installFakeApi();
    await renderDashboard();

    expect(legendItems().map((item) => item.textContent)).toEqual(["Food"]);
    expect(document.querySelectorAll(".recharts-pie-sector")).toHaveLength(1);
  });

  it("first click keeps only that category; hidden ones stay in the legend, struck out", async () => {
    installFakeApi();
    const user = await renderDashboard();
    await user.click(within(await openColumnFilter(user, "Amount")).getByRole("radio", { name: "All" }));
    await user.keyboard("{Escape}");

    expect(legendItems().map((item) => item.textContent)).toEqual(["Food", "Transport"]);

    await user.click(legendItems()[1]);
    expect(categoriesInTable()).toEqual(["Transport", "Transport"]);
    expect(within(legendItems()[0]).getByText("Food")).toHaveClass("legend-inactive");
    expect(document.querySelectorAll(".recharts-pie-sector")).toHaveLength(1);
    // Shopping (no rate) and Income are excluded too, as the click keeps only Transport.
    expect(savedFilters().excludedCategories.sort()).toEqual(["Food", "Income", "Shopping"]);

    await user.click(legendItems()[0]);
    expect(categoriesInTable()).toEqual(["Food", "Food", "Food", "Transport", "Transport"]);
    expect(within(legendItems()[0]).getByText("Food")).not.toHaveClass("legend-inactive");

    // Unchecking the last checked categories goes back to everything checked.
    await user.click(legendItems()[0]);
    await user.click(legendItems()[1]);
    expect(bodyRows()).toHaveLength(TRANSACTIONS.length);
  });

  it("shows the subcategory breakdown with shares in the tooltip", async () => {
    installFakeApi();
    const user = await renderDashboard();

    await user.hover(document.querySelector(".recharts-pie-sector path, .recharts-pie-sector")!);

    const tooltip = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".pie-tooltip");
      expect(element).not.toBeNull();
      return element!;
    });
    expect(tooltip.querySelector(".pie-tooltip-header")).toHaveTextContent("Food85.50");
    const lines = Array.from(tooltip.querySelectorAll("li")).map((li) => li.textContent);
    expect(lines).toEqual(["Groceries45.5053%", "Restaurants30.0035%", "No subcategory10.0012%"]);
    expect(tooltip.querySelector("li:last-child")).toHaveClass("pie-tooltip-muted");
  });

  it("shows No data when there is nothing to draw", async () => {
    installFakeApi({ transactions: [] });
    await renderDashboard();

    expect(screen.getByText("No data for chart.")).toBeInTheDocument();
  });
});
