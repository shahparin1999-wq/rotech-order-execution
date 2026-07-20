import { expect, test } from "@playwright/test";

const SAMPLE = "sample-data/cpq-execution-package-v1.json";
const ORDER = "Q-DEMO-1001-R3";

test.describe("CPQ package import", () => {
  test("upload, preview, confirm → one order with two lines and three units", async ({ page }) => {
    await page.goto("/orders");

    await page.getByTestId("new-work-order-button").click();
    await page.getByTestId("import-cpq-toggle").click();

    await page.getByTestId("cpq-file-input").setInputFiles(SAMPLE);

    // Line-by-line preview.
    await expect(page.getByTestId("cpq-preview-header")).toContainText("Q-DEMO-1001");
    await expect(page.getByTestId("cpq-preview-line-1")).toContainText("Quantity 2");
    await expect(page.getByTestId("cpq-preview-line-2")).toContainText("Quantity 1");
    await expect(page.getByTestId("cpq-order-number")).toHaveValue(ORDER);

    await page.getByTestId("confirm-cpq-import").click();

    // Landed on the new order.
    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER}`));

    // Three isolated units across the two lines.
    await page.goto(`/orders/${ORDER}?tab=units`);
    await expect(page.locator('[data-testid^="unit-row-"]')).toHaveCount(3);

    // Lines tab: two line cards, frozen checksum on the imported line.
    await page.goto(`/orders/${ORDER}?tab=lines`);
    await expect(page.getByTestId("line-card-1")).toBeVisible();
    await expect(page.getByTestId("line-card-2")).toBeVisible();
    await expect(page.getByTestId("line-checksum-1")).toBeVisible();
  });
});
