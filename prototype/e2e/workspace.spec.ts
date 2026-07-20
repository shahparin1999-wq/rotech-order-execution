import { expect, test } from "@playwright/test";

const ORDER = "SAMPLE1001";

test.describe("Order execution workspace", () => {
  test("header shows customer, PO, due date, facility and progress", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    await expect(page.getByRole("heading", { name: ORDER })).toBeVisible();
    await expect(page.getByText("Acme Sample Industries - Fairview")).toBeVisible();
    await expect(page.getByText("PO DEMO-0001")).toBeVisible();
    await expect(page.getByText("Due 2026-07-28")).toBeVisible();
    await expect(page.getByText("ANSI 1196 · Bare pump end")).toBeVisible();
    await expect(page.getByTestId("fraction-Complete").first()).toContainText("1/5");
    await expect(page.getByTestId("fraction-Blocked").first()).toContainText("1/5");
  });

  test("all nine tabs are present and reachable", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    const tabs = page.getByRole("navigation", { name: "Order tabs" });
    for (const tab of [
      "Overview", "Units", "Tasks", "Activity",
      "Materials", "Quality", "Documents", "Shipping", "Audit"
    ]) {
      await expect(tabs.getByRole("link", { name: tab, exact: true })).toBeVisible();
    }
  });

  test("Units tab lists exactly the five Units with mixed states", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=units`);
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByTestId(`unit-row-${ORDER}_1.${i}`)).toBeVisible();
    }
    await expect(page.locator("tbody tr")).toHaveCount(5);
    // Serial present on 1.1, pending on the rest.
    await expect(page.getByTestId(`unit-row-${ORDER}_1.1`)).toContainText("DEMO-SN-0001");
    await expect(page.getByTestId(`unit-row-${ORDER}_1.2`)).toContainText("Serial pending");
  });

  test("progress fraction drill-down returns the exact Unit set", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    await page.getByTestId("fraction-Blocked").first().click();
    await expect(page).toHaveURL(/tab=units&status=Blocked/);
    await expect(page.getByTestId("drilldown-note")).toContainText("exactly 1 Unit");
    await expect(page.getByTestId(`unit-row-${ORDER}_1.3`)).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    // Complete drill-down returns only 1.1
    await page.goto(`/orders/${ORDER}?tab=units&status=Complete`);
    await expect(page.getByTestId(`unit-row-${ORDER}_1.1`)).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });

  test("material change is Unit-scoped: 1.1 is CD4MCu, siblings stay 316SS", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=materials`);
    await expect(page.getByTestId("mc-mc-001")).toContainText("316SS → CD4MCu");
    await expect(page.getByTestId("mc-mc-001")).toContainText(`${ORDER}_1.1`);
    await expect(page.getByTestId(`material-${ORDER}_1.1`)).toContainText("CD4MCu");
    for (const i of [2, 3, 4, 5]) {
      const row = page.getByTestId(`material-${ORDER}_1.${i}`);
      await expect(row).toContainText("316SS");
      await expect(row).not.toContainText("CD4MCu");
    }
  });

  test("audit tab shows append-only events including a supersession", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=audit`);
    await expect(page.getByText("checklistResponse.superseded")).toBeVisible();
    await expect(page.getByText("label.reprinted").first()).toBeVisible();
    await expect(page.getByText(/Impeller trim corrected 12.56 -> 12.51/)).toBeVisible();
  });
});

test.describe("Views are filters, not duplicate orders", () => {
  test("Mississauga and Houston views filter the same master orders", async ({ page }) => {
    await page.goto("/views/mississauga");
    await expect(page.getByText("Orders in view (1)")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(ORDER) }).first()).toBeVisible();

    await page.goto("/views/houston");
    await expect(page.getByText("Orders in view (1)")).toBeVisible();
    await expect(page.getByRole("link", { name: /^SAMPLE1002 —/ })).toBeVisible();
    // The Mississauga order is filtered out — not duplicated into this view.
    await expect(page.getByRole("link", { name: new RegExp(`^${ORDER} —`) })).toHaveCount(0);
  });

  test("blocked work view shows only the blocked Unit", async ({ page }) => {
    await page.goto("/views/blocked");
    await expect(page.getByText("Units in view (1)")).toBeVisible();
    await expect(page.getByRole("link", { name: `${ORDER}_1.3` })).toBeVisible();
  });

  test("search finds a Unit by serial number", async ({ page }) => {
    await page.goto("/views/search");
    await page.getByTestId("search-input").fill("DEMO-SN-0001");
    await expect(page.getByTestId("search-results")).toContainText(`${ORDER}_1.1`);
  });
});
