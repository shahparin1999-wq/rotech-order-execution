import { expect, test } from "@playwright/test";

test.describe("Model templates (master routing)", () => {
  test("admin page shows each template's master routing and BOM", async ({ page }) => {
    await page.goto("/config/model-templates");
    await expect(page.getByRole("heading", { name: "Model templates (master routing)" })).toBeVisible();
    const pumpEnd = page.getByTestId("template-card-1196-pump-end");
    await expect(pumpEnd).toContainText("Master routing");
    await expect(pumpEnd).toContainText("Hydrotest");
    await expect(pumpEnd).toContainText("BOM skeleton");
    await expect(pumpEnd).toContainText("Impeller");
    await expect(page.getByTestId("template-card-1196-pump-package")).toContainText("Motor mounting & alignment");
  });

  test("order type supports a typed 'Other', and a template applies its master routing", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("new-work-order-button").click();

    // Default template pre-fills model + material.
    await expect(page.getByTestId("new-order-model")).toHaveValue("1196");

    // Order type "Other" reveals a free-text field.
    await page.getByTestId("new-order-type").selectOption("__other__");
    await expect(page.getByTestId("new-order-type-other")).toBeVisible();
    await page.getByTestId("new-order-type-other").fill("Field service");

    await page.getByTestId("new-order-number").fill("TMPL-E2E-1");
    await page.getByTestId("new-order-customer").selectOption({ label: "Acme Sample Industries" });
    await page.getByTestId("new-order-po").fill("PO-TMPL-1");
    await page.getByPlaceholder("Order description").fill("Template demo order");
    await page.getByTestId("new-order-duedate").fill("2026-10-01");
    await page.getByPlaceholder("e.g. 3x4-13").fill("3x4-13");

    await page.getByTestId("submit-new-work-order").click();
    await expect(page).toHaveURL(/\/orders\/TMPL-E2E-1/);

    // The line's Configuration shows the model's master routing.
    await page.goto("/orders/TMPL-E2E-1?tab=lines");
    await expect(page.getByTestId("line-template-1")).toContainText("Hydrotest");
    await expect(page.getByTestId("line-template-1")).toContainText("1196 Pump End");
  });
});
