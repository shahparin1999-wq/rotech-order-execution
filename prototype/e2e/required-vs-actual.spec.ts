// Ordered vs actually used, driven through the real screens.
//
// The unit tests prove the evaluation; this proves a technician can reach it,
// that a disagreement is stated in words rather than left as two values side
// by side, and that nothing leaks onto a sibling Unit.

import { expect, test, type Page } from "@playwright/test";

const ORDER = "RVAE2E";

async function configureTwoUnitOrder(page: Page) {
  await page.goto("/orders");
  await page.getByRole("button", { name: "Configure order" }).click();
  await page.getByTestId("configurator-order-number").fill(ORDER);
  await page.getByTestId("configurator-duedate").fill("2026-10-15");
  await page.getByTestId("line-1-quantity").fill("2");
  await page.getByTestId("configurator-submit").click();
  await expect(page).toHaveURL(/\/orders/);
}

async function casingRequirementId(page: Page): Promise<string> {
  const row = page.locator('[data-testid^="rva-"]').filter({ hasText: "Casing" }).first();
  const testId = await row.getAttribute("data-testid");
  return testId!.replace("rva-", "");
}

test.describe("Required vs actual", () => {
  test.beforeEach(async ({ page }) => {
    await configureTwoUnitOrder(page);
  });

  test("a wrong material is named, blocks, and only clears on an approval with a reason", async ({ page }) => {
    await page.goto(`/units/${ORDER}_1.1?tab=parts`);
    await expect(page.getByTestId("required-vs-actual")).toBeVisible();

    const reqId = await casingRequirementId(page);
    await expect(page.getByTestId(`rva-${reqId}`)).toContainText("Not recorded yet");

    await page.getByTestId(`record-actual-${reqId}`).click();
    await page.getByTestId(`actual-material-${reqId}`).fill("CD4MCU");
    await page.getByTestId(`actual-heat-${reqId}`).fill("H-8821");
    await page.getByTestId(`actual-save-${reqId}`).click();

    // The system states the difference; it does not merely show two values.
    const note = page.getByTestId(`match-note-${reqId}`);
    await expect(note).toContainText("required Ductile Iron");
    await expect(note).toContainText("actual CD4MCU");
    await expect(page.getByTestId(`rva-${reqId}`)).toContainText("Review required");

    // The ordered specification is untouched.
    await expect(page.getByTestId(`rva-${reqId}`)).toContainText("Casing — Ductile Iron");

    const usageApprove = page.locator('[data-testid^="approve-substitution-"]').first();
    const usageId = (await usageApprove.getAttribute("data-testid"))!.replace("approve-substitution-", "");
    await expect(usageApprove).toBeDisabled(); // no reason, no approval
    await page.getByTestId(`approve-reason-${usageId}`).fill("Upgrade approved by engineering");
    await usageApprove.click();

    await expect(page.getByTestId(`rva-${reqId}`)).toContainText("Approved substitution");
    await expect(page.getByTestId(`rva-${reqId}`)).toContainText("Upgrade approved by engineering");
    await expect(page.getByTestId(`match-note-${reqId}`)).toHaveCount(0);
  });

  test("the sibling Unit shows none of it", async ({ page }) => {
    await page.goto(`/units/${ORDER}_1.1?tab=parts`);
    const reqId = await casingRequirementId(page);
    await page.getByTestId(`record-actual-${reqId}`).click();
    await page.getByTestId(`actual-heat-${reqId}`).fill("H-ONLY-ON-UNIT-1");
    await page.getByTestId(`actual-save-${reqId}`).click();
    await expect(page.getByTestId(`rva-${reqId}`)).toContainText("H-ONLY-ON-UNIT-1");

    await page.goto(`/units/${ORDER}_1.2?tab=parts`);
    await expect(page.getByTestId("required-vs-actual")).toBeVisible();
    await expect(page.getByTestId("required-vs-actual")).not.toContainText("H-ONLY-ON-UNIT-1");
  });

  test("a manual entry is usable but flagged for verification", async ({ page }) => {
    await page.goto(`/units/${ORDER}_1.1?tab=parts`);
    const reqId = await casingRequirementId(page);
    await page.getByTestId(`record-actual-${reqId}`).click();
    await page.getByTestId(`actual-part-${reqId}`).fill("CAS-OFF-SHELF");
    await page.getByTestId(`actual-source-${reqId}`).selectOption("ManualUntracked");
    await page.getByTestId(`actual-save-${reqId}`).click();

    await expect(page.getByTestId(`rva-${reqId}`)).toContainText("needs verification");
  });

  test("the shop-floor tablet reaches the same panel", async ({ page }) => {
    await page.goto(`/tablet/${ORDER}_1.1`);
    await page.getByTestId("tablet-parts").click();
    await expect(page.getByTestId("required-vs-actual")).toContainText("Casing — Ductile Iron");
  });
});
