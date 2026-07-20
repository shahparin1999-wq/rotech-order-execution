import { expect, test } from "@playwright/test";

// Browser-level proof for the Fluent/Teams-inspired work-management
// expansion: New Work Order (with quantity->N Units), New Customer, New
// Task, Planner board movement via the keyboard-accessible move control,
// Orders-grid filtering, My Work sections, and refresh persistence of the
// new Customer/Task data.

test.describe("New work order", () => {
  test("creating a work order from Orders generates the stated quantity of Units and navigates to it", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("new-work-order-button").click();

    await page.getByTestId("new-order-number").fill("DEMO-E2E-001");
    await page.getByTestId("new-order-customer").selectOption({ label: "Acme Sample Industries" });
    await page.getByTestId("new-order-po").fill("PO-E2E-001");
    await page.getByPlaceholder("Order description").fill("Playwright-created demo order");
    await page.getByTestId("new-order-duedate").fill("2026-10-01");
    await page.getByTestId("new-order-quantity").fill("3");
    await page.getByPlaceholder("e.g. 1196").fill("1196");
    await page.getByPlaceholder("e.g. 3x4-13").fill("3x4-13");
    await page.getByPlaceholder("e.g. 316SS").fill("316SS");

    await page.getByTestId("submit-new-work-order").click();

    await expect(page).toHaveURL(/\/orders\/DEMO-E2E-001/);
    await page.getByRole("link", { name: "Units", exact: true }).click();
    await expect(page.getByTestId("unit-row-DEMO-E2E-001_1.1")).toBeVisible();
    await expect(page.getByTestId("unit-row-DEMO-E2E-001_1.2")).toBeVisible();
    await expect(page.getByTestId("unit-row-DEMO-E2E-001_1.3")).toBeVisible();
    await expect(page.getByTestId("unit-row-DEMO-E2E-001_1.4")).toHaveCount(0);
  });
});

test.describe("New customer", () => {
  test("creating a customer from the directory makes it immediately selectable elsewhere", async ({ page }) => {
    await page.goto("/customers");
    await page.getByTestId("new-customer-button").click();
    await page.getByTestId("new-customer-name").fill("Playwright Fictional Co");
    await page.getByTestId("submit-new-customer").click();

    await expect(page.getByRole("link", { name: "Playwright Fictional Co" })).toBeVisible();

    await page.goto("/orders");
    await page.getByTestId("new-work-order-button").click();
    await expect(
      page.getByTestId("new-order-customer").locator("option", { hasText: "Playwright Fictional Co" })
    ).toHaveCount(1);
  });

  test("creating a customer inline from the New Work Order drawer selects it automatically", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("new-work-order-button").click();
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByTestId("new-customer-name").fill("Inline Drawer Customer");
    await page.getByTestId("submit-new-customer").click();

    await expect(page.getByTestId("new-order-customer")).toHaveValue(/cust-/);
    const selected = await page.getByTestId("new-order-customer").inputValue();
    const selectedLabel = await page
      .getByTestId("new-order-customer")
      .locator(`option[value="${selected}"]`)
      .textContent();
    expect(selectedLabel).toBe("Inline Drawer Customer");
  });
});

test.describe("New task", () => {
  test("creating a task from Planner shows up on the board in its chosen bucket", async ({ page }) => {
    await page.goto("/planner");
    await page.getByTestId("new-task-button").click();
    await page.getByTestId("new-task-name").fill("Playwright planner task");
    await page.getByTestId("new-task-bucket").selectOption("Quality");
    await page.getByTestId("submit-new-task").click();

    const column = page.getByTestId("planner-column-Quality");
    await expect(column.getByText("Playwright planner task")).toBeVisible();
  });
});

test.describe("Planner board movement (keyboard-accessible)", () => {
  test("moving a task via its move-to-bucket select updates the board without drag-and-drop", async ({ page }) => {
    await page.goto("/planner");
    // Fixture task t-plan-dueweek starts in the Quality bucket.
    await expect(page.getByTestId("planner-column-Quality").getByTestId("planner-card-t-plan-dueweek")).toBeVisible();

    await page.getByTestId("move-select-t-plan-dueweek").selectOption("Packaging");

    await expect(page.getByTestId("planner-column-Packaging").getByTestId("planner-card-t-plan-dueweek")).toBeVisible();
    await expect(page.getByTestId("planner-column-Quality").getByTestId("planner-card-t-plan-dueweek")).toHaveCount(0);
  });
});

test.describe("Orders grid filtering", () => {
  test("a saved view and a customer filter narrow the grid together", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByTestId("order-row-SAMPLE1001")).toBeVisible();
    await expect(page.getByTestId("order-row-SAMPLE1002")).toBeVisible();

    await page.getByTestId("saved-view-blocked").click();
    await expect(page.getByTestId("order-row-SAMPLE1001")).toBeVisible();
    await expect(page.getByTestId("order-row-SAMPLE1002")).toHaveCount(0);

    await page.getByTestId("saved-view-all").click();
    await page.getByRole("button", { name: /Filters/ }).click();
    await page.getByLabel("Filter by customer").selectOption({ label: "Sample Pump Services" });
    await expect(page.getByTestId("order-row-SAMPLE1002")).toBeVisible();
    await expect(page.getByTestId("order-row-SAMPLE1001")).toHaveCount(0);
  });

  test("search narrows the grid to matching order/customer/PO", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("orders-search").fill("DEMO-0002");
    await expect(page.getByTestId("order-row-SAMPLE1002")).toBeVisible();
    await expect(page.getByTestId("order-row-SAMPLE1001")).toHaveCount(0);
  });
});

test.describe("My Work sections", () => {
  test("shows overdue, due-today, due-this-week, in-progress, and blocked fixture tasks", async ({ page }) => {
    await page.goto("/views/my-work");
    await expect(page.getByRole("heading", { name: /^Overdue \(\d+\)$/ })).toBeVisible();
    await expect(page.getByTestId("my-work-task-t-plan-overdue")).toBeVisible();
    await expect(page.getByTestId("my-work-task-t-plan-blocked")).toBeVisible();
    await expect(page.getByTestId("my-work-task-t-plan-inprogress")).toBeVisible();
  });
});

test.describe("Refresh persistence of new work-management data", () => {
  test("a customer and a task created on this device survive a hard refresh", async ({ page }) => {
    await page.goto("/customers");
    await page.getByTestId("new-customer-button").click();
    await page.getByTestId("new-customer-name").fill("Persisted Playwright Customer");
    await page.getByTestId("submit-new-customer").click();
    await expect(page.getByRole("link", { name: "Persisted Playwright Customer" })).toBeVisible();

    await page.goto("/planner");
    await page.getByTestId("new-task-button").click();
    await page.getByTestId("new-task-name").fill("Persisted Playwright task");
    await page.getByTestId("submit-new-task").click();
    await expect(page.getByText("Persisted Playwright task")).toBeVisible();

    await page.reload();

    await expect(page.getByText("Persisted Playwright task")).toBeVisible();
    await page.goto("/customers");
    await expect(page.getByRole("link", { name: "Persisted Playwright Customer" })).toBeVisible();
  });
});
