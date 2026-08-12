import { expect, test } from "@playwright/test";

// Layout behaviour across desktop, tablet landscape, and tablet portrait.

const U = "SAMPLE1001_1.2";

// The second "views" column is gone: navigation is four destinations, and
// locations/departments are filters on Orders and Work rather than places to
// navigate to. These tests now guard the touch contract instead.

const PRIMARY = ["home", "orders", "work", "inventory"];

test.describe("Responsive layout", () => {
  test("one nav column with exactly four primary destinations at every size", async ({ page }) => {
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 }
    ]) {
      await page.setViewportSize(size);
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(nav).toBeVisible();
      for (const label of PRIMARY) {
        await expect(nav.getByTestId(`nav-${label}`)).toBeVisible();
      }
      // No second navigation column at any width.
      await expect(page.getByRole("complementary", { name: "Views" })).toHaveCount(0);
    }
  });

  test("no interactive target is under 44px and no field is under 16px on iPad", async ({ page }) => {
    for (const size of [
      { width: 1024, height: 768 },
      { width: 768, height: 1024 }
    ]) {
      await page.setViewportSize(size);
      await page.goto("/orders");
      const audit = await page.evaluate(() => {
        const tooSmall = [...document.querySelectorAll<HTMLElement>(
          "button, a.btn, .tab, input, select, textarea, .rail-item, .saved-view-chip"
        )]
          .map((e) => ({
            label: (e.textContent || (e as HTMLInputElement).type || e.tagName).trim().slice(0, 30),
            height: Math.round(e.getBoundingClientRect().height)
          }))
          .filter((x) => x.height > 0 && x.height < 44);
        // Under 16px, iPadOS Safari zooms the viewport on focus.
        const smallFields = [...document.querySelectorAll<HTMLElement>(
          "input:not([type=checkbox]):not([type=radio]), select, textarea"
        )].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length;
        return { tooSmall, smallFields };
      });
      expect(audit.tooSmall, `targets under 44px at ${size.width}px`).toEqual([]);
      expect(audit.smallFields, `fields under 16px at ${size.width}px`).toBe(0);
    }
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
    await page.goto("/orders/SAMPLE1001?tab=units");
    await expect(page.getByTestId("unit-row-SAMPLE1001_1.1")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
