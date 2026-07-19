import { expect, test } from "@playwright/test";

test.describe("Application shell", () => {
  test("home page renders the Teams-inspired shell with mock banner", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByText("PROTOTYPE - mock data only")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Views" })).toBeVisible();
    // Grouped views
    await expect(page.getByRole("link", { name: "Mississauga" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Houston" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Blocked Work/ })).toBeVisible();
  });
});
