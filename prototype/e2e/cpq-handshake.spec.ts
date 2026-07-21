import { expect, test } from "@playwright/test";

// Uploads CPQ's real sanitized transfer bundle (DEFLATE-compressed ZIP) through
// the browser import flow: unzip -> verify envelope -> preview -> confirm.
const BUNDLE = "sample-data/cpq-handshake-bundle.zip";

test.describe("CPQ real handshake bundle (browser)", () => {
  test("imports 26CPQ0003 -> 2 lines (pump + pump-package), 3 units, PO verified", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("new-work-order-button").click();
    await page.getByTestId("import-cpq-toggle").click();
    await page.getByTestId("cpq-file-input").setInputFiles(BUNDLE);

    await expect(page.getByTestId("cpq-preview-po")).toContainText("sanitized-accepted-po.pdf");
    await expect(page.getByTestId("cpq-preview-line-1")).toContainText("Quantity 2");
    await expect(page.getByTestId("cpq-preview-line-4")).toContainText("Quantity 1");
    await expect(page.getByTestId("cpq-order-number")).toHaveValue("26CPQ0003-R3");

    await page.getByTestId("confirm-cpq-import").click();
    await expect(page).toHaveURL(/\/orders\/26CPQ0003-R3/);

    await page.goto("/orders/26CPQ0003-R3?tab=units");
    await expect(page.locator('[data-testid^="unit-row-"]')).toHaveCount(3);

    await page.goto("/orders/26CPQ0003-R3?tab=lines");
    await expect(page.getByTestId("line-card-1")).toBeVisible();
    await expect(page.getByTestId("line-card-4")).toBeVisible();
  });
});
