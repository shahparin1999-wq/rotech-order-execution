import { expect, test } from "@playwright/test";

// Post-creation editing: add Units to a line and fill in an editable working BOM.
test.describe("Post-creation editing", () => {
  test("add units and edit the working BOM on a manually created order", async ({ page }) => {
    // Create a manual order from the default 1196 Pump End template (quantity 1).
    await page.goto("/orders");
    await page.getByTestId("new-work-order-button").click();
    await expect(page.getByTestId("new-order-model")).toHaveValue("1196");
    await page.getByTestId("new-order-number").fill("EDIT-E2E-1");
    await page.getByTestId("new-order-customer").selectOption({ label: "Acme Sample Industries" });
    await page.getByTestId("new-order-po").fill("PO-EDIT-1");
    await page.getByPlaceholder("Order description").fill("Editing demo");
    await page.getByTestId("new-order-duedate").fill("2026-10-01");
    await page.getByPlaceholder("e.g. 3x4-13").fill("3x4-13");
    await page.getByTestId("submit-new-work-order").click();
    await expect(page).toHaveURL(/\/orders\/EDIT-E2E-1/);

    // Starts with one Unit.
    await page.goto("/orders/EDIT-E2E-1?tab=units");
    await expect(page.locator('[data-testid^="unit-row-"]')).toHaveCount(1);

    // Add two more Units from the Lines tab.
    await page.goto("/orders/EDIT-E2E-1?tab=lines");
    await page.getByTestId("add-units-count-1").fill("2");
    await page.getByTestId("add-units-1").click();
    await page.goto("/orders/EDIT-E2E-1?tab=units");
    await expect(page.locator('[data-testid^="unit-row-"]')).toHaveCount(3);

    // Working BOM: seed from the template skeleton, then add a row.
    await page.goto("/orders/EDIT-E2E-1?tab=lines");
    await page.getByTestId("line-1-subtab-bom").click();
    await page.getByTestId("working-bom-seed-1").click();
    await expect(page.locator('[data-testid^="working-bom-row-"]')).toHaveCount(5); // pump-end skeleton

    await page.getByTestId("working-bom-new-desc-1").fill("Gasket kit");
    await page.getByTestId("working-bom-add-1").click();
    await expect(page.locator('[data-testid^="working-bom-row-"]')).toHaveCount(6);
    // The new row's description is an editable input value (not text content).
    await expect(page.locator('input[value="Gasket kit"]')).toHaveCount(1);
  });
});
