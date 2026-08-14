import { expect, test } from "@playwright/test";

const ORDER = "SAMPLE1001";

test.describe("Order workspace", () => {
  test("identity, progress and the exception summary are on the landing view", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    await expect(page.getByRole("heading", { name: ORDER })).toBeVisible();
    await expect(page.getByText("Acme Sample Industries - Fairview")).toBeVisible();
    await expect(page.getByText("PO DEMO-0001")).toBeVisible();
    await expect(page.getByText("Due 2026-07-28")).toBeVisible();
    await expect(page.getByTestId("order-progress")).toContainText("1 of 5 Units complete");
    await expect(page.getByTestId("order-progress")).toContainText("1 blocked");
  });

  test("exceptions come first — Attention sits above Lines and Units", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    const attention = page.getByTestId("order-attention");
    await expect(attention).toBeVisible();
    // The blocked Unit's problem is surfaced without anyone typing a remark.
    await expect(attention).toContainText("Impeller casting not received");

    const attentionBox = await attention.boundingBox();
    const linesBox = await page.getByTestId("line-group-1").boundingBox();
    expect(attentionBox!.y).toBeLessThan(linesBox!.y);
  });

  test("Units are grouped under their line, whole row tappable", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    const group = page.getByTestId("line-group-1");
    await expect(group).toContainText("1196 3x4-13");
    for (let i = 1; i <= 5; i++) {
      await expect(group.getByTestId(`unit-row-${ORDER}_1.${i}`)).toBeVisible();
    }
    await expect(page.getByTestId(`unit-row-${ORDER}_1.1`)).toContainText("DEMO-SN-0001");
    await expect(page.getByTestId(`unit-row-${ORDER}_1.3`)).toContainText("Missing impeller casting");

    await page.getByTestId(`unit-row-${ORDER}_1.2`).click();
    await expect(page).toHaveURL(new RegExp(`/units/${ORDER}_1\.2`));
  });

  test("Actions, Shipments and Activity are counts, not expanded lists", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    const counts = page.getByTestId("order-counts");
    await expect(counts.getByTestId("count-actions")).toBeVisible();
    await expect(counts.getByTestId("count-shipments")).toBeVisible();
    await expect(counts.getByTestId("count-activity")).toBeVisible();
    // Detail on demand: no activity post body is rendered on the landing view.
    await expect(page.locator('[data-testid^="post-"]')).toHaveCount(0);
  });

  test("line technical detail opens on demand in a sheet, not as a permanent tab strip", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    await expect(page.getByTestId("line-sheet-config")).toHaveCount(0);

    await page.getByTestId("line-details-1").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("line-sheet-bom")).toBeVisible();

    await page.getByTestId("line-sheet-done").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("material change stays Unit-scoped: 1.1 is CD4MCu, siblings stay 316SS", async ({ page }) => {
    await page.goto(`/units/${ORDER}_1.1`);
    await expect(page.getByTestId("identity-banner")).toContainText("CD4MCu");
    for (const i of [2, 3, 4, 5]) {
      await page.goto(`/units/${ORDER}_1.${i}`);
      await expect(page.getByTestId("identity-banner")).not.toContainText("CD4MCu");
    }
  });

  test("audit shows append-only events including a supersession", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=audit`);
    await expect(page.getByText("checklistResponse.superseded")).toBeVisible();
    await expect(page.getByText("label.reprinted").first()).toBeVisible();
    await expect(page.getByText(/Impeller trim corrected 12.56 -> 12.51/)).toBeVisible();
  });
});

test.describe("Views are filters, not duplicate orders", () => {
  test("Mississauga and Houston views filter the same master orders", async ({ page }) => {
    await page.goto("/views/mississauga");
    // Mississauga also carries the 1196 rules-driven demo order (DEMO1196STD-1).
    await expect(page.getByText("Orders in view (2)")).toBeVisible();
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
