import { expect, test } from "@playwright/test";

// 1196 standard pump-end configuration & execution slice (model1196.ts):
// create a controlled manual configuration from the New 1196 pump end
// drawer, see the generated standard baseline before confirming, prove
// quantity -> Units, Not-in-scope suppression (bare pump end), and the
// confirmation gate blocking release until confirmed.
test.describe("1196 standard pump-end configuration", () => {
  test("create a bare pump end, see generated baseline, quantity 2 -> 2 Units, gate blocks release", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("new-1196-pump-button").click();

    await page.getByTestId("new-1196-order-number").fill("E2E-1196-01");
    await page.getByTestId("new-1196-customer").selectOption({ label: "Acme Sample Industries" });
    await page.getByTestId("new-1196-po").fill("PO-E2E-1196");
    await page.getByPlaceholder("Order description").fill("E2E 1196 bare pump end");
    await page.getByTestId("new-1196-duedate").fill("2026-10-01");
    await page.getByTestId("new-1196-quantity").fill("2");
    // Size drives frame and material from the CPQ catalogue.
    await page.getByTestId("new-1196-size").selectOption("3X4-13");
    await expect(page.getByTestId("new-1196-frame")).toHaveValue("MTR");
    await expect(page.getByTestId("new-1196-material")).toHaveValue("DI/316SS");
    await expect(page.getByTestId("new-1196-full-trim")).toContainText("13 in");
    await page.getByTestId("new-1196-material").selectOption("316SS/316SS");
    // Build type left at its default (Bare pump end).

    await page.getByTestId("submit-new-1196").click();
    await expect(page).toHaveURL(/\/orders\/E2E-1196-01/);

    // Quantity 2 creates exactly 2 independent Units.
    await page.goto("/orders/E2E-1196-01");
    await expect(page.locator('[data-testid^="unit-row-"]')).toHaveCount(2);

    // The generated standard baseline is visible on the Configuration sub-tab
    // before any confirmation happens.
    await page.goto("/orders/E2E-1196-01");
    await page.getByTestId("line-details-1").click();
    await page.getByTestId("line-sheet-config").click();
    const configTable = page.getByTestId("pump1196-config-table");
    await expect(configTable).toBeVisible();
    await expect(configTable).toContainText("150# FF");
    await expect(configTable).toContainText("Maximum diameter");
    await expect(configTable).toContainText("AISI 4140");
    await expect(configTable).toContainText("1196-rules-v1");

    // Bare pump end: package components (motor/baseplate/coupling/guard) are
    // Not in scope and create no requirement rows at all.
    await page.getByTestId("line-sheet-parts1196").click();
    await expect(page.getByText("motor", { exact: false })).toHaveCount(0);
    await expect(page.getByText("baseplate", { exact: false })).toHaveCount(0);

    // Confirmation gate: nothing confirmed yet -> release blocked.
    await page.getByTestId("line-sheet-gate1196").click();
    await expect(page.getByTestId("pump1196-release-status")).toContainText("Release blocked");

    // Confirm all 8 gate items -> release no longer blocked by the gate
    // (a selected/blocking service could still hold it, but none was selected here).
    const gateKeys = [
      "identityMatchesSource",
      "baselineComplete",
      "nonstandardExplicit",
      "quantityCorrect",
      "packageScopeCorrect",
      "servicesComplete",
      "openQuestionsResolved",
      "coordinatorConfirmed"
    ];
    for (const key of gateKeys) {
      await page.getByTestId(`gate1196-confirm-${key}`).click();
    }
    await expect(page.getByTestId("pump1196-release-status")).toContainText("Ready to release");
  });

  test("an unknown frame fails closed with an inline error, not a guessed default", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("new-1196-pump-button").click();

    await page.getByTestId("new-1196-order-number").fill("E2E-1196-02");
    await page.getByTestId("new-1196-customer").selectOption({ label: "Acme Sample Industries" });
    await page.getByTestId("new-1196-po").fill("PO-E2E-1196-2");
    await page.getByPlaceholder("Order description").fill("E2E unknown frame");
    await page.getByTestId("new-1196-duedate").fill("2026-10-01");
    await page.getByTestId("new-1196-size").selectOption("3X4-13");
    await page.getByTestId("new-1196-frame").selectOption("__other__");
    await page.getByTestId("new-1196-frame-other").fill("ZZZ");

    await page.getByTestId("submit-new-1196").click();
    await expect(page.getByTestId("error-toast")).toContainText(/controlled data/i);
    // Rejected - no order was created, even though the drawer still navigates.
    await expect(page.getByText("Order not found")).toBeVisible();
  });

  test("complete package records a custom baseplate drawing and a mechanic can record usage from the Unit page", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("new-1196-pump-button").click();

    await page.getByTestId("new-1196-order-number").fill("E2E-1196-03");
    await page.getByTestId("new-1196-customer").selectOption({ label: "Acme Sample Industries" });
    await page.getByTestId("new-1196-po").fill("PO-E2E-1196-3");
    await page.getByPlaceholder("Order description").fill("E2E 1196 complete package");
    await page.getByTestId("new-1196-duedate").fill("2026-10-01");
    await page.getByTestId("new-1196-size").selectOption("3X4-13");
    await page.getByTestId("new-1196-buildtype").selectOption("CompletePackage");
    await page.getByTestId("new-1196-drawing-custom").check();
    await page.getByTestId("new-1196-drawing-reference").fill("BP-2026-114");
    await page.getByTestId("new-1196-drawing-note").fill("Extended baseplate with drip rim");
    await page.getByTestId("new-1196-drawing-attach").click();
    await expect(page.getByTestId("new-1196-drawing-filename")).toContainText("BP-2026-114");

    await page.getByTestId("submit-new-1196").click();
    await expect(page).toHaveURL(/\/orders\/E2E-1196-03/);

    // The drawing the package is built to is visible on the frozen configuration.
    await page.goto("/orders/E2E-1196-03");
    await page.getByTestId("line-details-1").click();
    await page.getByTestId("line-sheet-config").click();
    await expect(page.getByTestId("pump1196-package-drawing")).toContainText("BP-2026-114");
    await expect(page.getByTestId("pump1196-package-drawing")).toContainText("Custom baseplate");

    // A mechanic landing on the Unit (the QR-scan view) sees the drawing and
    // can record what was actually used without going through the order.
    await page.goto("/units/E2E-1196-03_1.1");
    await page.getByTestId("summary-drawings").click();
    await expect(page.getByTestId("unit-pump1196-drawing")).toContainText("BP-2026-114");
    await page.getByTestId("drawings-done").click();

    await page.getByTestId("summary-parts").click();
    const casingRow = page.locator('[data-testid^="req1196-"]').filter({ hasText: "casing" }).first();
    await expect(casingRow).toContainText("Required");
    await casingRow.getByRole("textbox").fill("CAS-3X4-13-DI");
    await casingRow.getByRole("button", { name: "Record usage" }).click();
    await expect(casingRow).toContainText("Complete");
  });
});
