import { expect, test } from "@playwright/test";

const ORDER = "SAMPLE1001";
const U = (n: number) => `${ORDER}_1.${n}`;

test.describe("QR scan simulation", () => {
  test("all six scannable record types are offered", async ({ page }) => {
    await page.goto("/scan");
    for (const t of ["Order QR", "Unit QR", "Component QR", "MaterialLot QR", "Transfer QR", "Pallet QR"]) {
      await expect(page.getByRole("heading", { name: t })).toBeVisible();
    }
  });

  test("scanning the Unit 1.2 QR opens Unit 1.2 with next operation and actions", async ({ page }) => {
    await page.goto("/scan");
    await page.getByTestId(`scan-Unit-${U(2)}`).click();

    await expect(page.getByTestId("scan-confirmation")).toBeVisible();
    await expect(page.getByTestId("scan-target")).toHaveText(U(2));
    await expect(page.getByTestId("identity-banner")).toContainText(U(2));
    await expect(page.getByTestId("scan-next-op")).toHaveText("Impeller trim");

    for (const action of ["Take Photo", "Add Component", "Complete Checklist", "Report Problem"]) {
      await expect(page.getByRole("link", { name: new RegExp(action) })).toBeVisible();
    }

    await page.getByTestId("scan-open-unit").click();
    await expect(page).toHaveURL(new RegExp(`/tablet/${ORDER}_1\\.2`));
  });

  test("an unknown reference fails safely without disclosing details", async ({ page }) => {
    await page.goto("/r/UNKNOWNREF99");
    await expect(page.getByRole("heading", { name: "Reference not recognised" })).toBeVisible();
    await expect(page.getByText("No order or customer details are disclosed")).toBeVisible();
    await expect(page.getByText("Acme Sample")).toHaveCount(0);
  });
});

test.describe("Label previews", () => {
  test("all seven label profiles render with QR and human-readable identifier", async ({ page }) => {
    await page.goto("/labels");
    await expect(page.getByTestId("work-order-plan")).toBeVisible();
    for (const id of ["label-unit", "label-package", "label-component", "label-lot", "label-transfer", "label-pallet"]) {
      const label = page.getByTestId(id);
      await expect(label).toBeVisible();
      await expect(label).toContainText("Human-readable reference:");
      await expect(label.getByRole("img", { name: /QR code/ })).toBeVisible();
    }
    // Master plan carries the order QR and the Unit summary.
    await expect(page.getByTestId("work-order-plan")).toContainText("Acme Sample Industries - Fairview");
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByTestId("work-order-plan")).toContainText(U(i));
    }
  });

  test("reprinting a label adds a print event without creating a new Unit", async ({ page }) => {
    await page.goto("/labels");
    const countCell = page.getByTestId(`print-count-${U(2)}`);
    const before = Number(await countCell.textContent());
    await page.getByTestId("reprint-label-unit").click();
    await expect(countCell).toHaveText(String(before + 1));
    await expect(page.getByText(`Unit count remains 7`)).toBeVisible();

    // The Unit list still has exactly five Units for this order.
    await page.goto(`/orders/${ORDER}?tab=units`);
    await expect(page.locator("tbody tr")).toHaveCount(5);
  });
});

test.describe("Document previews", () => {
  test("Unit 1.1 QC history contains only that Unit's records", async ({ page }) => {
    await page.goto(`/documents/${U(1)}`);
    const doc = page.getByTestId("qc-document");
    await expect(doc).toBeVisible();
    await expect(page.getByTestId("doc-cover")).toContainText(
      "SAMPLE1001_1.1_Unit_QC_and_Manufacturing_History.pdf"
    );
    await expect(page.getByTestId("doc-cover")).toContainText("DEMO-SN-0001");
    await expect(page.getByTestId("doc-asbuilt")).toHaveText("CD4MCu");
    await expect(page.getByTestId("doc-change-mc-001")).toContainText("316SS → CD4MCu");

    // No sibling Unit ID may appear anywhere in the document.
    const text = (await doc.textContent()) ?? "";
    for (const i of [2, 3, 4, 5]) {
      expect(text).not.toContain(U(i));
    }
  });

  test("the document outline contains every required section", async ({ page }) => {
    await page.goto(`/documents/${U(1)}`);
    for (const heading of [
      "1. Ordered specification",
      "2. Approved changes",
      "3. Final as-built specification",
      "4. Route history",
      "5. Checklist results",
      "6. Measurements",
      "7. Inspection",
      "8. Rework",
      "9. Sign-offs",
      "10. Selected photos",
      "11. Nameplate",
      "12. Packaging",
      "13. Shipping",
      "14. Final remarks"
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  test("a sibling Unit document shows no approved change and stays 316SS", async ({ page }) => {
    await page.goto(`/documents/${U(3)}`);
    await expect(page.getByTestId("doc-asbuilt")).toHaveText("316SS");
    await expect(page.getByText("No approved changes")).toBeVisible();
    await expect(page.getByTestId("qc-document")).not.toContainText("CD4MCu");
  });

  test("order completion summary lists all five Units", async ({ page }) => {
    await page.goto(`/documents/order-summary/${ORDER}`);
    const table = page.getByTestId("summary-units");
    for (let i = 1; i <= 5; i++) {
      await expect(table).toContainText(U(i));
    }
    await expect(table.locator("tbody tr")).toHaveCount(5);
    await expect(page.getByText("1 of 5 Units complete")).toBeVisible();
  });
});
