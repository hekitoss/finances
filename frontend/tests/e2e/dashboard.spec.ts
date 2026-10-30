import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockApi } from "./mockApi";

// Real-browser checks for what jsdom cannot see: layout, scrolling and the pie's hover tooltip.

async function openDashboard(page: Page) {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Export Excel" })).toBeEnabled();
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

/** The page itself never scrolls sideways; only the table may, inside its wrapper. */
async function expectNoHorizontalPageScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const header = (page: Page) => page.locator(".table-wrap thead");
const chartCard = (page: Page) => page.locator(".chart-card");
const legend = (page: Page) => page.locator(".chart-container .recharts-legend-wrapper");

async function pickColumnFilter(page: Page, column: string, option: string) {
  await header(page).getByRole("button", { name: new RegExp(`^${column}`) }).click();
  await page.getByRole("dialog", { name: `Filter by ${column}` }).getByLabel(option, { exact: true }).click();
  await page.keyboard.press("Escape");
}

test.describe("desktop layout", () => {
  test("filtering the table does not resize the chart column or reflow the legend", async ({ page }) => {
    await openDashboard(page);
    const chartBefore = await box(chartCard(page));
    const legendBefore = await box(legend(page));

    // Hiding Gifts removes the row with the long comment, which changes the table's natural width.
    await pickColumnFilter(page, "Category", "Gifts");
    await expect(page.locator(".table-wrap tbody")).not.toContainText("Supercalifragilistic");
    expect(await box(chartCard(page))).toEqual(chartBefore);
    expect(await box(legend(page))).toEqual(legendBefore);

    await pickColumnFilter(page, "Person", "Nikita");
    expect((await box(chartCard(page))).width).toBe(chartBefore.width);
    await expectNoHorizontalPageScroll(page);
  });

  test("toggling a category from the legend does not move the legend", async ({ page }) => {
    await openDashboard(page);
    const items = legend(page).locator(".recharts-legend-item");
    await expect(items).toHaveText(["Food", "Gifts"]);
    const legendBefore = await box(legend(page));
    const chartBefore = await box(chartCard(page));

    await items.nth(1).click();
    await expect(items.nth(0).locator(".legend-inactive")).toBeVisible();
    expect(await box(legend(page))).toEqual(legendBefore);
    expect(await box(chartCard(page))).toEqual(chartBefore);

    await items.nth(0).click();
    await expect(page.locator(".legend-inactive")).toHaveCount(0);
    expect(await box(legend(page))).toEqual(legendBefore);
  });

  test("Edit rows widens the table to the page, and Done restores the two-column layout", async ({ page }) => {
    await openDashboard(page);
    const grid = page.locator(".grid-two-columns");
    const columnsBefore = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    const chartBefore = await box(chartCard(page));
    const tableCardBefore = await box(page.locator(".grid-two-columns > .card").first());
    const tableWrap = page.locator(".table-wrap");
    const tableOverflow = () => tableWrap.evaluate((element) => element.scrollWidth - element.clientWidth);
    const tableOverflowBefore = await tableOverflow();

    await page.getByRole("button", { name: "Edit rows" }).click();
    await expect(chartCard(page)).toHaveCount(0);
    expect((await box(page.locator(".grid-two-columns > .card").first())).width).toBeGreaterThan(tableCardBefore.width);

    const row = page.locator(".table-wrap tbody tr").filter({ hasText: "Supercalifragilistic" });
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("tr.edit-row").getByLabel("Comment")).toBeVisible();
    await expectNoHorizontalPageScroll(page);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("tr.edit-row")).toHaveCount(0);
    await expect(chartCard(page)).toBeVisible();

    expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).toBe(columnsBefore);
    expect(await box(chartCard(page))).toEqual(chartBefore);
    expect(await box(page.locator(".grid-two-columns > .card").first())).toEqual(tableCardBefore);
    // The table must not stay wider than before once the editor's fields are gone.
    expect(await tableOverflow()).toBe(tableOverflowBefore);
    await expectNoHorizontalPageScroll(page);
  });

  test("hovering a slice shows the subcategory breakdown", async ({ page }) => {
    await openDashboard(page);
    const tooltip = page.locator(".pie-tooltip");
    // The pie animates in (again once the data loads), so the hover is retried until the slice is in place.
    await expect(async () => {
      // Food is the largest slice and covers the left of the ring; the middle of its box is the donut's hole.
      const food = await box(page.locator(".recharts-pie-sector").first());
      const radius = food.height / 2;
      await page.mouse.move(0, 0);
      await page.mouse.move(food.x + food.width / 2 - radius * 0.86, food.y + radius, { steps: 5 });
      await expect(tooltip).toBeVisible({ timeout: 500 });
    }).toPass();
    await expect(tooltip.locator(".pie-tooltip-header")).toHaveText("Food85.50");
    await expect(tooltip.locator("li")).toHaveText(["Groceries45.5053%", "Restaurants30.0035%", "No subcategory10.0012%"]);
  });
});

test.describe("saved filters and export", () => {
  test("filters survive a reload and a visit to the add page", async ({ page }) => {
    await openDashboard(page);
    await pickColumnFilter(page, "Amount", "All");
    await pickColumnFilter(page, "Person", "Anna");
    const rows = page.locator(".table-wrap tbody tr");
    await expect(rows).toHaveCount(4);

    await page.reload();
    await expect(rows).toHaveCount(4);
    await expect(header(page).getByRole("button", { name: /^Amount/ })).toContainText("All");

    await page.getByRole("link", { name: "Add transaction" }).click();
    await expect(page).toHaveURL(/\/add$/);
    await page.goBack();
    await expect(rows).toHaveCount(4);
    await expect(header(page).getByRole("button", { name: /^Person/ })).toContainText("1");
  });

  test("Export Excel downloads the file the server names", async ({ page }) => {
    await openDashboard(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export Excel" }).click()
    ]);
    expect(download.suggestedFilename()).toBe("transactions-test.xlsx");
    expect(new URL(download.url()).protocol).toBe("blob:");
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("shows cards instead of the table, the chart first, and never scrolls sideways", async ({ page }) => {
    await openDashboard(page);

    await expect(page.locator(".table-wrap")).toBeHidden();
    await expect(page.locator(".transaction-card")).toHaveCount(5);
    await expect(page.locator(".mobile-filters")).toBeVisible();
    expect((await box(chartCard(page))).y).toBeLessThan((await box(page.locator(".transaction-cards"))).y);
    await expectNoHorizontalPageScroll(page);
  });

  test("the mobile filters work and the card editor fits the screen", async ({ page }) => {
    await openDashboard(page);
    const filters = page.locator(".mobile-filters");
    // Any page scroll closes the popover, so bring the filters to mid-screen first: clicking a button at the
    // bottom edge would leave the options off-screen.
    await filters.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await filters.getByRole("button", { name: /^Person/ }).click();
    await page.getByRole("dialog", { name: "Filter by Person" }).getByLabel("Anna", { exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".transaction-card")).toHaveCount(3);

    await page.getByRole("button", { name: "Edit rows" }).click();
    const card = page.locator(".transaction-card").filter({ hasText: "Supercalifragilistic" });
    await card.getByRole("button", { name: "Edit" }).click();
    await expect(card.getByRole("button", { name: "Save" })).toBeVisible();
    await expectNoHorizontalPageScroll(page);
    const cardBox = await box(card);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(375);
  });
});
