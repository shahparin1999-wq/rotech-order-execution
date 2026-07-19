import { expect, test } from "@playwright/test";

// Criterion 6 end to end: one employee pauses with a full handoff, a
// different employee resumes and sees that handoff.

const U = "26SO00729_1.5";

test("one employee pauses with a handoff and a different employee resumes it", async ({ page }) => {
  await page.goto(`/units/${U}`);

  // Act as Miguel Torres and start the intake task.
  await page.getByTestId("user-switcher").selectOption("e-miguel");
  await page.getByRole("button", { name: /Start Work/ }).click();
  await expect(page.getByTestId("task-controls-t-15-intake")).toContainText("Miguel Torres");

  // Pause with the complete handoff record.
  await page.getByTestId("pause-t-15-intake").click();
  await page.getByTestId("handoff-reason").fill("End of shift");
  await page.getByTestId("handoff-completedWork").fill("Pick list checked against the traveller");
  await page.getByTestId("handoff-remainingWork").fill("Confirm impeller casting and release to assembly");
  await page.getByTestId("handoff-location").fill("Parts staging rack B");
  await page.getByTestId("handoff-storageState").fill("Parts binned, tagged, nothing energised");
  await page.getByTestId("handoff-blockerItem").fill("None");
  await page.getByTestId("confirm-pause").click();
  await expect(page.getByTestId("task-controls-t-15-intake")).toContainText("Paused");

  // Switch to a different employee, who sees every handoff field.
  await page.getByTestId("user-switcher").selectOption("e-alex");
  const handoff = page.getByTestId("handoff-card-t-15-intake").first();
  await expect(handoff).toContainText("Handoff from Miguel Torres");
  await expect(handoff).toContainText("End of shift");
  await expect(handoff).toContainText("Pick list checked against the traveller");
  await expect(handoff).toContainText("Confirm impeller casting and release to assembly");
  await expect(handoff).toContainText("Parts staging rack B");
  await expect(handoff).toContainText("Parts binned, tagged, nothing energised");

  // Alex resumes the same task and becomes the owner.
  await page.getByTestId("resume-t-15-intake").click();
  const controls = page.getByTestId("task-controls-t-15-intake");
  await expect(controls).toContainText("In progress");
  await expect(controls).toContainText("Alex Nguyen");

  // The audit trail records both employees. Navigate client-side: a full
  // reload would reset the in-memory prototype store.
  await page.getByRole("link", { name: "Audit", exact: true }).click();
  const audit = page.locator("table.data");
  await expect(audit).toContainText("task.paused");
  await expect(audit).toContainText("task.resumed");
  await expect(audit).toContainText("Miguel Torres");
  await expect(audit).toContainText("Alex Nguyen");
});

test("the acting employee is reflected on newly captured evidence", async ({ page }) => {
  await page.goto(`/units/${U}?tab=evidence`);
  await page.getByTestId("user-switcher").selectOption("e-priya");
  await page.getByTestId("take-photo").click();
  await expect(page.getByTestId("capture-target")).toContainText("Priya Sharma");
  await page.getByTestId("capture-now").click();
  await page.getByTestId("capture-save").click();
  await expect(page.getByText("Priya Sharma").first()).toBeVisible();
});
