import { expect, test } from "@playwright/test";

test.describe("Application shell", () => {
  test("home page renders the shell with four primary destinations and the mock banner", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByText("PROTOTYPE - mock data only")).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
    for (const label of ["home", "orders", "work", "inventory"]) {
      await expect(nav.getByTestId(`nav-${label}`)).toBeVisible();
    }
    // Search, Scan and Profile are utilities, not primary destinations.
    await expect(nav.getByRole("link", { name: "Search", exact: true })).toBeVisible();
    await expect(nav.getByTestId("profile-toggle")).toBeVisible();
  });

  test("the identity switcher and reset live behind Profile, not in a second nav column", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("user-switcher")).toHaveCount(0);
    await page.getByTestId("profile-toggle").click();
    await expect(page.getByTestId("user-switcher")).toBeVisible();
    await expect(page.getByTestId("reset-to-fixtures")).toBeVisible();
  });
});
