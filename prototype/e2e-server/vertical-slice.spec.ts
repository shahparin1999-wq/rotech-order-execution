import { expect, test, type Page } from "@playwright/test";

// The Gate A milestone scenario, driven through the real UI against SERVER
// persistence (file adapter, or PostgreSQL when DATABASE_URL is set):
//
//   real CPQ Qty-5 handoff → import as Rotech SO → per-Unit demand and a real
//   shortage → vendor PO reference with an expected date → receive against
//   the PO line → inspect → issue + install a heat-tracked casing into ONE
//   Unit → as-built (heat number) captured on that Unit only → serial, photo
//   and a QC response captured → sibling Units untouched → state survives a
//   full page reload because it lives on the server.
//
// The full material-gate release (every component installed → assembly task
// released) is proven at domain level in tests/domain/vertical-slice-qty5.test.ts.

const FIXTURE = "sample-data/cpq-order-handoff-v2-qty5.zip";
const SO = "26SO01234";
const UNIT_14 = `${SO}_1.4`;
const UNIT_15 = `${SO}_1.5`;

async function resetServer(page: Page) {
  const response = await page.request.post("/api/admin/reset");
  expect(response.ok()).toBeTruthy();
}

async function actingAs(page: Page, employeeId: string) {
  await page.getByTestId("profile-toggle").click();
  await page.getByTestId("user-switcher").selectOption(employeeId);
}

test.describe("Gate A vertical slice — Qty-5 CPQ order", () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
  });

  test("import → shortage → PO → receipt → install into one Unit → evidence, with siblings isolated", async ({ page }) => {
    // --- Import the real CPQ bundle as a Rotech sales order ----------------
    await page.goto("/orders");
    await expect(page.getByTestId("persistence-banner")).toContainText("SHARED OEH STATE");
    await page.getByTestId("new-work-order-button").click();
    await page.getByTestId("import-cpq-toggle").click();
    await page.getByTestId("cpq-file-input").setInputFiles(FIXTURE);
    await expect(page.getByTestId("cpq-preview-schema")).toContainText("handoff v2");
    await expect(page.getByTestId("cpq-preview-po")).toContainText("sanitized-customer-po.pdf");
    await expect(page.getByTestId("cpq-preview-line-1")).toContainText("Quantity 5");
    await expect(page.getByTestId("cpq-preview-demand-1")).toContainText("Casing");
    await page.getByTestId("cpq-order-number").fill(SO);
    await page.getByTestId("cpq-committed-date").fill("2026-10-15");
    await page.getByTestId("confirm-cpq-import").click();
    await expect(page).toHaveURL(new RegExp(`/orders/${SO}`));

    // --- Five isolated Units, a real shortage, CPQ provenance ---------------
    await page.goto(`/orders/${SO}`);
    await expect(page.locator('[data-testid^="unit-row-"]')).toHaveCount(5);
    await expect(page.getByTestId("order-cpq-reference")).toContainText("26CPQ0005");
    await expect(page.getByTestId("purchasing-panel")).toBeVisible();
    await expect(page.getByTestId("material-short-total")).toContainText("short");
    await expect(page.getByTestId("material-row-casing")).toContainText("5");

    // --- Reference a vendor PO for the casings of 1.4 and 1.5 ---------------
    await page.getByTestId("reference-po-open").click();
    await page.getByTestId("po-component").selectOption({ index: 0 });
    // Deselect every Unit but 1.4 and 1.5 by re-selecting explicitly.
    const boxes = page.locator('[data-testid^="po-req-"]');
    const count = await boxes.count();
    for (let i = 0; i < count; i++) {
      const box = boxes.nth(i);
      const label = await box.locator("xpath=..").innerText();
      const wanted = label.includes("_1.4") || label.includes("_1.5");
      if ((await box.isChecked()) !== wanted) await box.click();
    }
    await page.getByTestId("po-number").fill("4500187");
    await page.getByTestId("po-vendor").fill("RFHPL India");
    await page.getByTestId("po-expected").fill("2026-10-02");
    await page.getByTestId("po-part").fill("100-34-M-A-1F-DI");
    await page.getByTestId("po-submit").click();
    await expect(page.locator('[data-testid^="po-line-"]').first()).toContainText("4500187");
    await expect(page.getByTestId("material-row-casing")).toContainText("expected 2026-10-02");

    // --- Receive one casing against the PO line, inspect, put away ----------
    await page.goto("/inventory");
    await actingAs(page, "e-tom");
    await page.getByTestId("inventory-tab-receiving").click();
    const poOption = page.getByTestId("intake-po-line").locator("option").filter({ hasText: "4500187" });
    const poValue = await poOption.getAttribute("value");
    expect(poValue).toBeTruthy();
    await page.getByTestId("intake-po-line").selectOption(poValue!);
    await page.getByTestId("intake-heat").fill("H-IN-77821");
    await page.getByTestId("intake-submit").click();
    await actingAs(page, "e-priya");
    const inspectAccept = page.locator('[data-testid^="inspect-accept-"]').last();
    await expect(inspectAccept).toBeVisible();
    const identityId = (await inspectAccept.getAttribute("data-testid"))!.replace("inspect-accept-", "");
    await page.getByTestId(`inspect-note-${identityId}`).fill("Heat cert matches");
    const inspectVersion = await page.getByTestId("persistence-banner").getAttribute("data-version");
    await inspectAccept.click();
    await expect.poll(async () => page.getByTestId("persistence-banner").getAttribute("data-version")).not.toBe(inspectVersion);

    // --- Issue and install from the individual inventory item view ----------
    await page.getByTestId("inventory-tab-stock").click();
    const stockRow = page.getByTestId(`inventory-stock-row-${identityId}`);
    const itemHref = await stockRow.getByRole("link", { name: "View item" }).getAttribute("href");
    expect(itemHref).toBeTruthy();
    await page.goto(itemHref!);
    await actingAs(page, "e-tom");
    const putAwayVersion = await page.getByTestId("persistence-banner").getAttribute("data-version");
    await page.getByTestId(`inventory-putaway-${identityId}`).click();
    await expect.poll(async () => page.getByTestId("persistence-banner").getAttribute("data-version")).not.toBe(putAwayVersion);
    await actingAs(page, "e-alex");
    await page.getByTestId(`inventory-unit-${identityId}`).selectOption(UNIT_14);
    const issueVersion = await page.getByTestId("persistence-banner").getAttribute("data-version");
    await page.getByTestId(`inventory-issue-${identityId}`).click();
    await expect.poll(async () => page.getByTestId("persistence-banner").getAttribute("data-version")).not.toBe(issueVersion);
    await page.getByTestId(`inventory-install-${identityId}`).click();
    await expect(page.getByTestId("error-toast")).toHaveCount(0);

    // --- As-built on 1.4: heat number captured; assembly still held for the rest
    await page.goto(`/units/${UNIT_14}`);
    await page.getByTestId("summary-parts").click();
    await expect(page.getByTestId("required-vs-actual")).toContainText("H-IN-77821");
    await expect(page.getByTestId("required-vs-actual")).toContainText("Matches order");
    await page.getByTestId("parts-done").click();
    await expect(page.getByTestId("unit-waiting")).toContainText("Waiting on material");

    // --- Serial, photo and a QC response on 1.4 ------------------------------
    await page.getByTestId("unit-serial-input").fill("2609004401");
    await page.getByTestId("unit-serial-save").click();
    await expect(page.getByTestId("identity-banner")).toContainText("2609004401");
    await page.getByTestId("summary-photos").click();
    await page.getByTestId("take-photo").click();
    await page.getByTestId("capture-now").click();
    await page.getByTestId("capture-save").click();
    await page.getByTestId("photo-done").click();
    await page.getByTestId("summary-qc").click();
    const passButtons = page.locator('[data-testid^="pass-"]');
    if ((await passButtons.count()) > 0) {
      await passButtons.first().click();
    } else {
      await page.locator('[data-testid^="checklist-item-"]').first().click();
    }
    await page.getByTestId("checklist-done").click();

    // --- Sibling isolation: 1.5 has no part, no serial, no photo, no response
    await page.goto(`/units/${UNIT_15}`);
    await expect(page.getByTestId("identity-banner")).toContainText("Serial pending");
    await expect(page.getByTestId("summary-photos")).toContainText("0");
    await page.getByTestId("summary-parts").click();
    await expect(page.getByTestId("required-vs-actual")).not.toContainText("H-IN-77821");
    await page.getByTestId("parts-done").click();

    // --- The state is on the server: a fresh page sees everything -----------
    await page.reload();
    await page.goto(`/units/${UNIT_14}`);
    await expect(page.getByTestId("identity-banner")).toContainText("2609004401");
    const health = await (await page.request.get("/api/health")).json();
    expect(health.ok).toBe(true);
    expect(health.version).toBeGreaterThan(5);
  });
});
