import { expect, test } from "@playwright/test";

// Runs in the "tablet" Playwright project at 1024x768 with touch enabled.

const ORDER = "26SO00729";
const U = (n: number) => `${ORDER}_1.${n}`;

test.describe("Shop-floor tablet", () => {
  test("identity banner and large controls are visible at the tablet viewport", async ({ page }) => {
    await page.goto(`/tablet/${U(2)}`);

    const banner = page.getByTestId("identity-banner");
    await expect(banner).toBeInViewport();
    await expect(banner).toContainText(U(2));
    await expect(banner).toContainText("Serial pending");

    await expect(page.getByTestId("tablet-current-op")).toHaveText("Impeller trim");

    for (const id of ["tablet-take-photo", "tablet-measure", "tablet-checklist"]) {
      const btn = page.getByTestId(id);
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      // Touch targets must be comfortably larger than the 44px minimum.
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("primary work controls are present and labelled", async ({ page }) => {
    await page.goto(`/tablet/${U(2)}`);
    // 1.2 is paused, so Resume is offered.
    await expect(page.getByRole("button", { name: /Resume Work/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Report Problem/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Take Photo/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Enter Measurement/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Complete Checklist/ })).toBeVisible();

    await page.getByRole("button", { name: /Resume Work/ }).click();
    await expect(page.getByRole("button", { name: /Complete Step/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pause \/ Handoff/ })).toBeVisible();
  });

  test("the Unit identity stays visible while a controlled action is performed", async ({ page }) => {
    await page.goto(`/tablet/${U(2)}`);
    await page.getByTestId("tablet-take-photo").click();
    await expect(page.getByTestId("capture-target-unit")).toHaveText(U(2));
    // Banner is still on screen during capture.
    await expect(page.getByTestId("identity-banner")).toBeInViewport();
  });

  test("a Unit with no serial shows Serial pending on the tablet", async ({ page }) => {
    await page.goto(`/tablet/${U(5)}`);
    await expect(page.getByTestId("identity-banner")).toContainText("Serial pending");
    await page.goto(`/tablet/${U(1)}`);
    await expect(page.getByTestId("identity-banner")).toContainText("2607143053");
  });

  test("the page does not scroll horizontally at the tablet viewport", async ({ page }) => {
    await page.goto(`/tablet/${U(2)}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
