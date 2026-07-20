import { expect, test } from "@playwright/test";
import path from "node:path";

// Captures browser evidence into artifacts/preview/. Screenshots contain only
// the approved mock fixture data.

const ORDER = "26SO00729";
const U = (n: number) => `${ORDER}_1.${n}`;
const OUT = path.resolve(__dirname, "../../artifacts/preview");

const shot = (name: string) => path.join(OUT, `${name}.png`);

test.describe("Screenshot evidence", () => {
  test("desktop shell and home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await page.screenshot({ path: shot("01-teams-inspired-desktop"), fullPage: true });
  });

  test("order workspace overview", async ({ page }) => {
    await page.goto(`/orders/${ORDER}`);
    await expect(page.getByRole("heading", { name: ORDER })).toBeVisible();
    await page.screenshot({ path: shot("02-order-workspace"), fullPage: true });
  });

  test("five-Unit progress and drill-down", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=units`);
    await expect(page.getByTestId(`unit-row-${U(5)}`)).toBeVisible();
    await page.screenshot({ path: shot("03-five-unit-progress"), fullPage: true });

    await page.goto(`/orders/${ORDER}?tab=units&status=Blocked`);
    await expect(page.getByTestId("drilldown-note")).toBeVisible();
    await page.screenshot({ path: shot("04-progress-drilldown"), fullPage: true });
  });

  test("unit detail with identity banner", async ({ page }) => {
    await page.goto(`/units/${U(2)}`);
    await expect(page.getByTestId("identity-banner")).toBeVisible();
    await page.screenshot({ path: shot("05-unit-detail"), fullPage: true });
  });

  test("materials tab showing Unit-scoped change", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=materials`);
    await expect(page.getByTestId("mc-mc-001")).toBeVisible();
    await page.screenshot({ path: shot("06-material-change-isolation"), fullPage: true });
  });

  test("checklist", async ({ page }) => {
    await page.goto(`/units/${U(1)}?tab=checklist`);
    await expect(page.getByTestId("checklist")).toBeVisible();
    await page.screenshot({ path: shot("07-checklist"), fullPage: true });
  });

  test("activity and comment conversion", async ({ page }) => {
    await page.goto(`/orders/${ORDER}?tab=activity`);
    await expect(page.getByTestId("converted-p1")).toBeVisible();
    await page.screenshot({ path: shot("08-activity-comment-conversion"), fullPage: true });
  });

  test("QR scan simulation and landing", async ({ page }) => {
    await page.goto("/scan");
    await expect(page.getByRole("heading", { name: "Simulate QR Scan" })).toBeVisible();
    await page.screenshot({ path: shot("09-qr-scan-simulation"), fullPage: true });

    await page.getByTestId(`scan-Unit-${U(2)}`).click();
    await expect(page.getByTestId("scan-confirmation")).toBeVisible();
    await page.screenshot({ path: shot("10-qr-landing"), fullPage: true });
  });

  test("label previews", async ({ page }) => {
    await page.goto("/labels");
    await expect(page.getByTestId("work-order-plan")).toBeVisible();
    await page.screenshot({ path: shot("11-label-previews"), fullPage: true });
  });

  test("QC document preview", async ({ page }) => {
    await page.goto(`/documents/${U(1)}`);
    await expect(page.getByTestId("qc-document")).toBeVisible();
    await page.screenshot({ path: shot("12-qc-document-preview"), fullPage: true });
  });

  test("order completion summary preview", async ({ page }) => {
    await page.goto(`/documents/order-summary/${ORDER}`);
    await expect(page.getByTestId("order-summary-document")).toBeVisible();
    await page.screenshot({ path: shot("13-order-summary-preview"), fullPage: true });
  });

  // Evidence for the four defects fixed after the independent review.
  test("review fix - Unit 1.1 document", async ({ page }) => {
    await page.goto(`/documents/${U(1)}`);
    await expect(page.getByTestId("qc-document")).toBeVisible();
    await page.screenshot({ path: shot("18-fix-unit-1-1-document"), fullPage: true });
  });

  test("review fix - Unit 1.4 document", async ({ page }) => {
    await page.goto(`/documents/${U(4)}`);
    await expect(page.getByTestId("qc-document")).toBeVisible();
    await page.screenshot({ path: shot("19-fix-unit-1-4-document"), fullPage: true });
  });

  test("review fix - hydrotest placeholder flagged", async ({ page }) => {
    await page.goto(`/units/${U(1)}?tab=checklist`);
    await expect(page.getByTestId("placeholder-hydrotest")).toBeVisible();
    await page.screenshot({ path: shot("20-fix-placeholder-flags"), fullPage: true });
  });

  test("review fix - append-only handoff history", async ({ page }) => {
    await page.goto(`/units/${U(5)}`);
    await page.getByTestId("user-switcher").selectOption("e-miguel");
    await page.getByRole("button", { name: /Start Work/ }).click();
    await page.getByTestId("pause-t-15-intake").click();
    await page.getByTestId("handoff-reason").fill("First pause - end of shift");
    await page.getByTestId("handoff-completedWork").fill("Pick list checked");
    await page.getByTestId("handoff-remainingWork").fill("Confirm casting");
    await page.getByTestId("handoff-location").fill("Parts staging rack B");
    await page.getByTestId("handoff-storageState").fill("Parts binned");
    await page.getByTestId("confirm-pause").click();
    await page.getByTestId("user-switcher").selectOption("e-alex");
    await page.getByTestId("resume-t-15-intake").click();
    await page.getByTestId("pause-t-15-intake").click();
    await page.getByTestId("handoff-reason").fill("Second pause - waiting on crane");
    await page.getByTestId("handoff-completedWork").fill("Casting confirmed and staged");
    await page.getByTestId("handoff-remainingWork").fill("Move to assembly bay");
    await page.getByTestId("handoff-location").fill("Assembly bay 1");
    await page.getByTestId("handoff-storageState").fill("Slung and chocked");
    await page.getByTestId("confirm-pause").click();
    await page.getByTestId("handoff-history-t-15-intake").first().click();
    await page.screenshot({ path: shot("21-fix-handoff-append-only"), fullPage: true });
  });

  test("blocked work view", async ({ page }) => {
    await page.goto("/views/blocked");
    await expect(page.getByRole("heading", { name: "Blocked Work" })).toBeVisible();
    await page.screenshot({ path: shot("14-blocked-work-view"), fullPage: true });
  });
});

test.describe("Tablet screenshot evidence", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

  test("shop-floor tablet", async ({ page }) => {
    await page.goto(`/tablet/${U(2)}`);
    await expect(page.getByTestId("tablet-actions")).toBeVisible();
    await page.screenshot({ path: shot("15-shop-floor-tablet"), fullPage: true });
  });

  test("tablet pause handoff dialog", async ({ page }) => {
    await page.goto(`/tablet/${U(2)}`);
    await page.getByRole("button", { name: /Resume Work/ }).click();
    await page.getByRole("button", { name: /Pause \/ Handoff/ }).click();
    await expect(page.getByTestId("pause-dialog")).toBeVisible();
    await page.screenshot({ path: shot("16-tablet-pause-handoff"), fullPage: true });
  });

  test("tablet photo capture target lock", async ({ page }) => {
    await page.goto(`/tablet/${U(2)}`);
    await page.getByTestId("tablet-take-photo").click();
    await page.getByTestId("capture-now").click();
    await expect(page.getByTestId("target-locked-note")).toBeVisible();
    await page.screenshot({ path: shot("17-tablet-photo-target-lock"), fullPage: true });
  });
});
