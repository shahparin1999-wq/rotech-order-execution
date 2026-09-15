import { expect, test, type Page } from "@playwright/test";

async function actingAs(page: Page, employeeId: string) {
  await page.getByTestId("profile-toggle").click();
  await page.getByTestId("user-switcher").selectOption(employeeId);
}

test.describe("corrected inventory workflow", () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.request.post("/api/admin/reset");
    expect(response.ok()).toBeTruthy();
  });

  test("requires an OEH identity before returning shared state", async ({ page }) => {
    const anonymous = await page.request.get("/api/state");
    expect(anonymous.status()).toBe(401);

    const authenticated = await page.request.get("/api/state", {
      headers: { "x-oeh-uat-employee-id": "e-alex" }
    });
    expect(authenticated.ok()).toBeTruthy();
    const payload = await authenticated.json();
    expect(payload.state.currentUserId).toBe("e-alex");
  });

  test("replays a shipment upload with the same idempotency key", async ({ page }) => {
    const buffer = Buffer.from([
      "Supplier,PO,Facility,Expected Date,Part Number,Description,Quantity,UOM",
      "UAT Supplier,PO-UPLOAD-RETRY,Mississauga,2026-10-20,SEAL-RETRY-001,Retry seal,1,EA"
    ].join("\n"));
    const request = {
      headers: { "x-oeh-uat-employee-id": "e-jordan" },
      multipart: { file: { name: "retry.csv", mimeType: "text/csv", buffer }, idempotencyKey: "shipment-upload-retry-1" }
    };
    const first = await page.request.post("/api/oeh/v1/shipment-files", request);
    expect(first.ok()).toBeTruthy();
    const firstPayload = await first.json();
    expect(firstPayload.replayed).toBe(false);

    const retry = await page.request.post("/api/oeh/v1/shipment-files", request);
    expect(retry.ok()).toBeTruthy();
    const retryPayload = await retry.json();
    expect(retryPayload.replayed).toBe(true);
    expect(retryPayload.file.id).toBe(firstPayload.file.id);
    expect(retryPayload.parseRun.id).toBe(firstPayload.parseRun.id);
  });

  test("upload → review/edit → confirm → receive → inspect → stock view", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByTestId("inventory-stock-grid")).toBeVisible();

    // Purchasing owns the expected-shipment draft workflow.
    await actingAs(page, "e-jordan");
    await page.getByTestId("inventory-tab-incoming").click();
    const csv = [
      "Supplier,PO,Facility,Expected Date,Part Number,Description,Quantity,UOM",
      "UAT Supplier,PO-UAT-BROWSER,Mississauga,2026-10-20,SEAL-BROWSER-001,Mechanical seal browser UAT,4,EA"
    ].join("\n");
    await page.locator('input[type="file"]').setInputFiles({ name: "browser-shipment.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "Upload and parse" }).click();
    await page.getByTestId("inventory-tab-incoming").click();
    const draft = page.locator('[data-testid^="shipment-draft-"]');
    await expect(draft).toBeVisible();
    await draft.locator('input[type="number"]').fill("3");
    await draft.locator('input[type="number"]').blur();
    await draft.getByRole("button", { name: "Confirm shipment" }).click();
    await expect(page.getByText("Confirmed", { exact: true }).last()).toBeVisible();

    // Shipping owns receipt, and the receipt is explicitly matched to the
    // confirmed line so expected and received stay separate but reconcilable.
    await actingAs(page, "e-tom");
    await page.getByTestId("inventory-tab-receiving").click();
    await page.getByLabel("Facility").selectOption("Mississauga");
    await page.getByLabel("Against confirmed inbound").selectOption({ index: 1 });
    await expect(page.getByLabel("Part number")).toHaveValue("SEAL-BROWSER-001");
    await page.getByRole("button", { name: "Receive" }).click();

    // Quality owns the acceptance decision.
    await actingAs(page, "e-priya");
    await page.getByTestId("inventory-tab-receiving").click();
    const quarantine = page.locator('[data-testid^="inventory-quarantine-"]').filter({ hasText: "SEAL-BROWSER-001" });
    await expect(quarantine).toBeVisible();
    await quarantine.getByRole("button", { name: "Accept" }).click();

    await actingAs(page, "e-alex");
    await page.getByTestId("inventory-tab-stock").click();
    const row = page.locator('[data-testid^="inventory-stock-row-"]').filter({ hasText: "SEAL-BROWSER-001" });
    await expect(row).toContainText("Available");
    await expect(row).toContainText("3");
    await expect(row).toContainText("Mississauga");

    const browser = page.context().browser();
    expect(browser).not.toBeNull();
    const secondContext = await browser!.newContext();
    const secondPage = await secondContext.newPage();
    try {
      await secondPage.goto("/inventory");
      await expect(secondPage.getByTestId("inventory-stock-grid")).toBeVisible();
      const reloadedRow = secondPage.locator('[data-testid^="inventory-stock-row-"]').filter({ hasText: "SEAL-BROWSER-001" });
      await expect(reloadedRow).toContainText("Available");
      await expect(reloadedRow).toContainText("3");
    } finally {
      await secondContext.close();
    }
  });
});
