import { expect, test } from "@playwright/test";

// Browser-level proof for the team-demo readiness changes: calculated status
// actually moves the badge, the error toast replaces window.alert, the
// duplicate handoff card is gone, and per-device persistence survives a real
// reload (unlike every other spec in this suite, a reload is exactly what
// this file is testing, not something to avoid).

const ORDER = "SAMPLE1001";
const U = (n: number) => `${ORDER}_1.${n}`;

test.describe("Calculated status moves visibly", () => {
  test("resolving Unit 1.3's blocker moves its status badge from Blocked to In assembly", async ({ page }) => {
    await page.goto(`/units/${U(3)}`);
    const banner = page.getByTestId("identity-banner");
    await expect(banner).toContainText("Blocked");

    await page.getByTestId("resolve-t-13-verify").click();

    await expect(banner).not.toContainText("Blocked");
    await expect(banner).toContainText("In assembly");

    // The order workspace's Units tab reflects the same recomputed status,
    // not a stale cached one.
    await page.getByRole("link", { name: `← Order ${ORDER}` }).click();
    await page.getByRole("link", { name: "Units", exact: true }).click();
    await expect(page.getByTestId(`unit-row-${U(3)}`)).toContainText("In assembly");
    await expect(page.getByTestId(`unit-row-${U(3)}`)).not.toContainText("Blocked");
  });
});

test.describe("Error toast replaces window.alert", () => {
  test("a rejected domain action shows a dismissible inline toast, not a native dialog", async ({ page }) => {
    let dialogFired = false;
    page.on("dialog", () => {
      dialogFired = true;
    });

    // A genuinely UI-reachable domain rejection: converting an order-level
    // comment (no Unit target) to a Task throws "Conversion requires an
    // explicit Unit target" - this used to surface via window.alert.
    // (convertPost falls back to the source post's own unitId when none is
    // chosen, so the post itself must be order-level - "Whole order" is the
    // composer's default target.)
    await page.goto(`/orders/${ORDER}?tab=activity`);
    await expect(page.getByTestId("error-toast")).toHaveCount(0);

    await page.getByLabel("New post text").fill("Order-level note with no Unit target");
    await page.getByRole("button", { name: "Post", exact: true }).click();

    const post = page.locator('[data-testid^="post-"]').first();
    await expect(post).toContainText("Order-level note with no Unit target");
    await post.getByRole("button", { name: "Convert to record…" }).click();
    await post.getByTestId("convert-kind").selectOption("Task");
    await post.getByRole("button", { name: "Create linked record" }).click();

    const toast = page.getByTestId("error-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute("role", "alert");
    await expect(toast).toContainText("explicit Unit target");
    expect(dialogFired).toBe(false); // no native window.alert fired

    await toast.getByRole("button", { name: "Dismiss" }).click();
    await expect(toast).toHaveCount(0);
  });
});

test.describe("No duplicate handoff card for a paused task", () => {
  test("Unit 1.2's paused task shows exactly one handoff card", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    await expect(page.getByTestId("handoff-card-t-12-trim")).toHaveCount(1);
  });
});

test.describe("Reset to sample data", () => {
  test("clears local progress and restores the seeded fixtures", async ({ page }) => {
    page.on("dialog", (d) => d.accept());

    await page.goto(`/units/${U(3)}`);
    await page.getByTestId("resolve-t-13-verify").click();
    await expect(page.getByTestId("identity-banner")).toContainText("In assembly");

    await page.getByTestId("reset-to-fixtures").click();

    await page.goto(`/units/${U(3)}`);
    await expect(page.getByTestId("identity-banner")).toContainText("Blocked");
  });
});

test.describe("Per-device persistence survives a real reload", () => {
  test("progress made on this device is still there after a hard refresh", async ({ page }) => {
    await page.goto(`/units/${U(3)}`);
    await expect(page.getByTestId("identity-banner")).toContainText("Blocked");
    await page.getByTestId("resolve-t-13-verify").click();
    await expect(page.getByTestId("identity-banner")).toContainText("In assembly");

    // This is the one place in the suite where a real reload is the point:
    // proving state survives it, not proving isolation despite avoiding it.
    await page.reload();

    await expect(page.getByTestId("identity-banner")).toContainText("In assembly");
    await expect(page.getByTestId("identity-banner")).not.toContainText("Blocked");
  });

  test("a fresh browser context (a different device) does not see another session's progress", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto(`/units/${U(3)}`);
    await pageA.getByTestId("resolve-t-13-verify").click();
    await expect(pageA.getByTestId("identity-banner")).toContainText("In assembly");
    await contextA.close();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto(`/units/${U(3)}`);
    // A brand-new context has no localStorage from contextA - independent,
    // unsynced session, exactly as documented.
    await expect(pageB.getByTestId("identity-banner")).toContainText("Blocked");
    await contextB.close();
  });
});
