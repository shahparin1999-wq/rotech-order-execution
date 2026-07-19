import { expect, test } from "@playwright/test";

// Layout behaviour across desktop, tablet landscape, and tablet portrait.

const U = "26SO00729_1.2";

test.describe("Responsive layout", () => {
  test("desktop shows the views column without a toggle", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "Views" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Views/ })).toBeHidden();
  });

  test("tablet landscape collapses the views column and can reopen it", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/tablet/${U}`);
    await expect(page.getByRole("complementary", { name: "Views" })).toBeHidden();

    const toggle = page.getByRole("button", { name: /Views/ });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByRole("complementary", { name: "Views" })).toBeVisible();
    await toggle.click();
    await expect(page.getByRole("complementary", { name: "Views" })).toBeHidden();
  });

  test("no horizontal page scroll at tablet portrait", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`/tablet/${U}`);
    await expect(page.getByTestId("identity-banner")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("order workspace tables stay usable at tablet portrait", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/orders/26SO00729?tab=units");
    await expect(page.getByTestId("unit-row-26SO00729_1.1")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
