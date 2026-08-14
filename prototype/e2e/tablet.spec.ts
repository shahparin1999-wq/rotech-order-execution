import { expect, test } from "@playwright/test";

// Runs in the "tablet" Playwright project at 1024x768 with touch enabled.
//
// There is no separate /tablet route any more: the Unit workspace IS the
// shop-floor screen, for everyone. These tests hold it to that.

const ORDER = "SAMPLE1001";
const U = (n: number) => `${ORDER}_1.${n}`;

test.describe("Shop-floor Unit workspace", () => {
  test("identity stays visible and every control is finger-sized", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);

    const banner = page.getByTestId("identity-banner");
    await expect(banner).toBeInViewport();
    await expect(banner).toContainText(U(2));
    await expect(banner).toContainText("Serial pending");
    await expect(banner).toContainText("Impeller trim");

    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(
        "button, a.btn, .tab, input, select, textarea, .rail-item, .summary-row"
      )]
        .map((e) => ({
          label: (e.textContent || (e as HTMLInputElement).type || e.tagName).trim().slice(0, 30),
          height: Math.round(e.getBoundingClientRect().height)
        }))
        .filter((x) => x.height > 0 && x.height < 44)
    );
    expect(tooSmall).toEqual([]);
  });

  test("the work a person can start is above the reference detail", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    const doNow = await page.getByTestId("unit-do-now").boundingBox();
    const summaries = await page.getByTestId("unit-summaries").boundingBox();
    expect(doNow!.y).toBeLessThan(summaries!.y);
  });

  test("QC, photos and parts open as full sheets and exit back to the Unit", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByTestId("summary-qc").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("checklist-item-impeller-trim")).toBeVisible();
    await page.getByTestId("checklist-done").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByTestId("summary-photos").click();
    await expect(page.getByTestId("take-photo")).toBeVisible();
    await page.getByTestId("photo-done").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the Unit identity stays visible while a controlled action is performed", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    await page.getByTestId("resume-t-12-trim").click();
    await expect(page.getByTestId("identity-banner")).toBeInViewport();
    await expect(page.getByTestId("identity-banner")).toContainText(U(2));
  });

  test("a Unit with no serial says Serial pending", async ({ page }) => {
    await page.goto(`/units/${U(5)}`);
    await expect(page.getByTestId("identity-banner")).toContainText("Serial pending");

    await page.goto(`/units/${U(1)}`);
    await expect(page.getByTestId("identity-banner")).toContainText("DEMO-SN-0001");
  });

  test("the page does not scroll horizontally at the tablet viewport", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("the retired /tablet route redirects rather than dead-ending a printed label", async ({ page }) => {
    await page.goto(`/tablet/${U(2)}`);
    await expect(page).toHaveURL(new RegExp(`/units/${ORDER}_1\\.2`));
    await expect(page.getByTestId("identity-banner")).toBeVisible();
  });
});
