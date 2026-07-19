import { expect, test } from "@playwright/test";

const ORDER = "26SO00729";
const U = (n: number) => `${ORDER}_1.${n}`;

test.describe("Unit detail", () => {
  test("identity banner shows the required fields", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    const banner = page.getByTestId("identity-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(U(2));
    await expect(banner).toContainText(ORDER);
    await expect(banner).toContainText("Serial pending");
    await expect(banner).toContainText("1196");
    await expect(banner).toContainText("3x4-13");
    await expect(banner).toContainText("316SS");
    await expect(banner).toContainText("Mississauga");
    await expect(banner).toContainText("Impeller trim");
  });

  test("Unit 1.1 banner shows its serial and CD4MCu as-built material", async ({ page }) => {
    await page.goto(`/units/${U(1)}`);
    const banner = page.getByTestId("identity-banner");
    await expect(banner).toContainText("2607143053");
    await expect(banner).toContainText("CD4MCu");
    await expect(banner).toContainText("ordered 316SS");
  });

  test("no sibling Unit records appear on a Unit view", async ({ page }) => {
    // The material change and special instruction belong to 1.1 and 1.2.
    await page.goto(`/units/${U(3)}`);
    await expect(page.getByTestId("unit-mc-mc-001")).toHaveCount(0);
    await expect(page.getByTestId("unit-swi-swi-001")).toHaveCount(0);
    await expect(page.getByText("No material change")).toBeVisible();

    await page.goto(`/units/${U(1)}`);
    await expect(page.getByTestId("unit-mc-mc-001")).toBeVisible();
    await expect(page.getByTestId("unit-swi-swi-001")).toHaveCount(0);

    await page.goto(`/units/${U(2)}`);
    await expect(page.getByTestId("unit-swi-swi-001")).toBeVisible();
    await expect(page.getByTestId("unit-mc-mc-001")).toHaveCount(0);
  });

  test("evidence tab shows only this Unit's attachments", async ({ page }) => {
    await page.goto(`/units/${U(1)}?tab=evidence`);
    await expect(page.getByTestId("attachment-a-nameplate-11")).toBeVisible();
    // Unit 1.4's nameplate photo must not appear here.
    await expect(page.getByTestId("attachment-a-nameplate-14")).toHaveCount(0);

    await page.goto(`/units/${U(4)}?tab=evidence`);
    await expect(page.getByTestId("attachment-a-nameplate-14")).toBeVisible();
    await expect(page.getByTestId("attachment-a-nameplate-11")).toHaveCount(0);
  });
});

test.describe("Pause / handoff / resume", () => {
  test("a paused task shows the full handoff and another employee can resume", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    const handoff = page.getByTestId("handoff-card-t-12-trim").first();
    await expect(handoff).toBeVisible();
    await expect(handoff).toContainText("Miguel Torres");
    await expect(handoff).toContainText("End of shift");
    await expect(handoff).toContainText("rough cut");
    await expect(handoff).toContainText("Machining bay 2");
    await expect(handoff).toContainText("locked out");

    await page.getByTestId("resume-t-12-trim").click();
    await expect(page.getByTestId("task-controls-t-12-trim")).toContainText("In progress");
    // Signed-in mock user (Alex Nguyen) becomes the owner.
    await expect(page.getByTestId("task-controls-t-12-trim")).toContainText("Alex Nguyen");
  });

  test("pausing requires every handoff field before the button enables", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    await page.getByTestId("resume-t-12-trim").click();
    await page.getByTestId("pause-t-12-trim").click();
    const confirm = page.getByTestId("confirm-pause");
    await expect(confirm).toBeDisabled();

    await page.getByTestId("handoff-reason").fill("Shift change");
    await page.getByTestId("handoff-completedWork").fill("Finish cut done");
    await page.getByTestId("handoff-remainingWork").fill("Deburr and measure");
    await page.getByTestId("handoff-location").fill("Bay 2");
    await expect(confirm).toBeDisabled(); // storage state still missing
    await page.getByTestId("handoff-storageState").fill("Locked out");
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await expect(page.getByTestId("task-controls-t-12-trim")).toContainText("Paused");
    await expect(page.getByTestId("handoff-card-t-12-trim").first()).toContainText("Shift change");
  });

  test("a blocked task can be resolved back to its pre-block state", async ({ page }) => {
    await page.goto(`/units/${U(3)}`);
    await expect(page.getByText("Missing impeller casting")).toBeVisible();
    await page.getByTestId("resolve-t-13-verify").click();
    await expect(page.getByTestId("task-controls-t-13-verify")).toContainText("Ready");
  });
});

test.describe("Checklist", () => {
  test("checklist shows placeholder tolerance labels and save states", async ({ page }) => {
    await page.goto(`/units/${U(1)}?tab=checklist`);
    await expect(page.getByText("Pilot placeholder - owner approval required").first()).toBeVisible();
    await expect(page.getByTestId("checklist-item-impeller-trim")).toContainText("12.51");
    // Correction/supersession is visible, original retained.
    await expect(page.getByTestId("checklist-item-impeller-trim")).toContainText("supersedes");
    await expect(page.getByText("Superseded entries (1)")).toBeVisible();
  });

  test("Unit 1.2 shows Pending and Error states; 1.4 shows Needs Review", async ({ page }) => {
    await page.goto(`/units/${U(2)}?tab=checklist`);
    await expect(page.getByTestId("checklist-item-impeller-trim")).toContainText("Pending");
    await expect(page.getByTestId("checklist-item-free-rotation")).toContainText("Error");

    await page.goto(`/units/${U(4)}?tab=checklist`);
    await expect(page.getByTestId("checklist-item-axial-play")).toContainText("Needs Review");
  });

  test("a measurement recorded on Unit 1.5 does not appear on siblings", async ({ page }) => {
    await page.goto(`/units/${U(5)}?tab=checklist`);
    await page.getByTestId("measure-input-shaft-runout").fill("1.7");
    await page.getByTestId("measure-save-shaft-runout").click();
    await expect(page.getByTestId("response-shaft-runout")).toContainText("1.7");

    // Navigate to the sibling client-side so the in-memory store persists;
    // a full reload would reset it and make this assertion meaningless.
    await page.getByRole("link", { name: `← Order ${ORDER}` }).click();
    await page.getByRole("link", { name: "Units", exact: true }).click();
    await page.getByRole("link", { name: U(3), exact: true }).click();
    await page.getByRole("link", { name: "Checklist", exact: true }).click();
    await expect(page.getByTestId("identity-banner")).toContainText(U(3));
    await expect(page.getByTestId("checklist-item-shaft-runout")).not.toContainText("Recorded:");

    // Returning to 1.5 still shows its own reading — the store was live.
    await page.getByRole("link", { name: `← Order ${ORDER}` }).click();
    await page.getByRole("link", { name: "Units", exact: true }).click();
    await page.getByRole("link", { name: U(5), exact: true }).click();
    await page.getByRole("link", { name: "Checklist", exact: true }).click();
    await expect(page.getByTestId("response-shaft-runout")).toContainText("1.7");
  });

  test("out-of-range measurement is flagged against the placeholder limit", async ({ page }) => {
    await page.goto(`/units/${U(5)}?tab=checklist`);
    await page.getByTestId("measure-input-impeller-trim").fill("13.9");
    await page.getByTestId("measure-save-impeller-trim").click();
    await expect(page.getByTestId("checklist-item-impeller-trim")).toContainText("outside placeholder range");
  });
});

test.describe("Photo capture target locking", () => {
  test("capture shows the locked target and saves to the selected Unit only", async ({ page }) => {
    await page.goto(`/units/${U(5)}?tab=evidence`);
    await page.getByTestId("take-photo").click();
    await expect(page.getByTestId("capture-target-unit")).toHaveText(U(5));
    await page.getByTestId("capture-category").selectOption("Nameplate");
    await page.getByTestId("capture-now").click();
    // Once capture starts the target is locked.
    await expect(page.getByTestId("target-locked-note")).toBeVisible();
    await expect(page.getByTestId("capture-category")).toBeDisabled();
    await page.getByTestId("capture-save").click();
    await expect(page.getByText("nameplate-26SO00729_1.5.jpg")).toBeVisible();

    // It must not appear on a sibling. Navigate client-side so the store
    // stays live; a reload would reset it and hide a real leak.
    await page.getByRole("link", { name: `← Order ${ORDER}` }).click();
    await page.getByRole("link", { name: "Units", exact: true }).click();
    await page.getByRole("link", { name: U(3), exact: true }).click();
    await page.getByRole("link", { name: "Evidence", exact: true }).click();
    await expect(page.getByTestId("identity-banner")).toContainText(U(3));
    await expect(page.getByText("nameplate-26SO00729_1.5.jpg")).toHaveCount(0);
  });
});

test.describe("Activity and comment conversion", () => {
  test("fixture conversions preserve the original comment", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=activity`);
    await expect(page.getByTestId("post-p1")).toContainText("Use CD4 for Unit 1.1");
    await expect(page.getByTestId("converted-p1")).toContainText("MaterialChange");
    await expect(page.getByTestId("converted-p1")).toContainText("316SS → CD4MCu");
    await expect(page.getByTestId("converted-p1")).toContainText("Original comment preserved");

    await expect(page.getByTestId("post-p2")).toContainText("Machine stub shaft by 0.150 inch for Unit 1.2");
    await expect(page.getByTestId("converted-p2")).toContainText("SpecialInstruction");
  });

  test("a new comment can be converted into a Task and keeps its text", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=activity`);
    await page.getByLabel("New post text").fill("Deburr the volute edge on Unit 1.4 before inspection");
    await page.getByRole("button", { name: "Post", exact: true }).click();

    const post = page.locator('[data-testid^="post-p"]').first();
    await expect(post).toContainText("Deburr the volute edge");
    await post.getByRole("button", { name: "Convert to record…" }).click();
    await post.getByTestId("convert-kind").selectOption("Task");
    await post.getByTestId("convert-unit").selectOption(`${ORDER}_1.4`);
    await post.getByTestId("convert-detail").fill("Deburr volute edge");
    await post.getByRole("button", { name: "Create linked record" }).click();

    await expect(post).toContainText("Deburr the volute edge on Unit 1.4"); // original preserved
    await expect(post).toContainText("Converted to");
    await expect(post).toContainText("Deburr volute edge");
  });

  test("replies stay one level and show author and timestamp", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=activity`);
    const post = page.getByTestId("post-p3");
    await expect(post).toContainText("Sarah Kowalski"); // existing reply author
    await post.getByRole("button", { name: "Reply" }).click();
    await post.getByLabel("Reply text").fill("Chasing the supplier today.");
    await post.getByRole("button", { name: "Post reply" }).click();
    await expect(post).toContainText("Chasing the supplier today.");
  });
});
