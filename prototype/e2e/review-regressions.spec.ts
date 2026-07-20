import { expect, test } from "@playwright/test";

// Browser regressions for the four defects confirmed by the independent
// review of fd6258f. Every navigation after the initial load is client-side,
// so the in-memory store stays live throughout: a hard reload would reset it
// and make these assertions meaningless.

const ORDER = "26SO00729";
const U = (n: number) => `${ORDER}_1.${n}`;

// Values that exist on exactly one of the two sibling Units.
const ONLY_ON_11 = ["2607143053", "CD4MCu", "PAL-0031", "1,240 lb", "48 x 40 x 52", "12.51"];
const ONLY_ON_14 = ["PAL-0032", "1,305 lb", "52 x 44 x 55", "12.49"];

async function expectAbsent(text: string, values: string[]) {
  for (const v of values) {
    expect(text, `sibling value "${v}" leaked into this document`).not.toContain(v);
  }
}

async function expectPresent(text: string, values: string[]) {
  for (const v of values) {
    expect(text, `expected own value "${v}" to be present`).toContain(v);
  }
}

test.describe("C1 - two sibling Unit documents in one live session", () => {
  test("neither document contains any of the other Unit's data", async ({ page }) => {
    // Single hard load. Everything after this is client-side navigation.
    await page.goto(`/units/${U(1)}?tab=evidence`);

    // Create runtime evidence on Unit 1.1 so the store is demonstrably live
    // and demonstrably mutated during this session.
    await page.getByTestId("take-photo").click();
    await expect(page.getByTestId("capture-target-unit")).toHaveText(U(1));
    await page.getByTestId("capture-category").selectOption("Material marking");
    await page.getByTestId("capture-now").click();
    await page.getByTestId("capture-save").click();
    await expect(page.getByText("material-marking-26SO00729_1.1.jpg")).toBeVisible();

    // ---- Unit 1.1 document ----
    await page.getByRole("link", { name: /Unit QC history preview/ }).click();
    await expect(page).toHaveURL(new RegExp(`/documents/${ORDER}_1\\.1`));
    await expect(page.getByTestId("qc-document")).toBeVisible();
    const doc11 = (await page.getByTestId("qc-document").textContent()) ?? "";

    await expectPresent(doc11, ONLY_ON_11);
    await expectAbsent(doc11, ONLY_ON_14);
    // No sibling Unit identifier anywhere.
    for (const seq of [2, 3, 4, 5]) expect(doc11).not.toContain(U(seq));
    // Shipping resolves to this Unit's own pallet.
    await expect(page.getByTestId("doc-shipping")).toContainText("PAL-0031");

    // ---- client-side navigation to Unit 1.4's document ----
    await page.getByRole("link", { name: `← Unit ${U(1)}` }).click();
    await page.getByRole("link", { name: `← Order ${ORDER}` }).click();
    await page.getByRole("link", { name: "Documents", exact: true }).click();
    await page.getByRole("link", { name: `${U(4)}_Unit_QC_and_Manufacturing_History.pdf` }).click();
    await expect(page).toHaveURL(new RegExp(`/documents/${ORDER}_1\\.4`));

    const doc14 = (await page.getByTestId("qc-document").textContent()) ?? "";
    await expectPresent(doc14, ONLY_ON_14);
    await expectAbsent(doc14, ONLY_ON_11);
    for (const seq of [1, 2, 3, 5]) expect(doc14).not.toContain(U(seq));
    await expect(page.getByTestId("doc-shipping")).toContainText("PAL-0032");

    // ---- prove the session never reset ----
    await page.getByRole("link", { name: `← Unit ${U(4)}` }).click();
    await page.getByRole("link", { name: `← Order ${ORDER}` }).click();
    await page.getByRole("link", { name: "Units", exact: true }).click();
    await page.getByRole("link", { name: U(1), exact: true }).click();
    await page.getByRole("link", { name: "Evidence", exact: true }).click();
    await expect(page.getByText("material-marking-26SO00729_1.1.jpg")).toBeVisible();
  });

  test("a Unit with no shipment shows none rather than a sibling's pallet", async ({ page }) => {
    await page.goto(`/documents/${U(3)}`);
    await expect(page.getByTestId("doc-shipping-none")).toBeVisible();
    const doc = (await page.getByTestId("qc-document").textContent()) ?? "";
    expect(doc).not.toContain("PAL-0031");
    expect(doc).not.toContain("PAL-0032");
  });
});

test.describe("C2 - handoff history is append-only in the UI", () => {
  test("a second pause keeps the first handoff visible", async ({ page }) => {
    await page.goto(`/units/${U(5)}`);

    // First handoff, recorded by Miguel.
    await page.getByTestId("user-switcher").selectOption("e-miguel");
    await page.getByRole("button", { name: /Start Work/ }).click();
    await page.getByTestId("pause-t-15-intake").click();
    await page.getByTestId("handoff-reason").fill("First pause - end of shift");
    await page.getByTestId("handoff-completedWork").fill("Pick list checked");
    await page.getByTestId("handoff-remainingWork").fill("Confirm casting");
    await page.getByTestId("handoff-location").fill("Parts staging rack B");
    await page.getByTestId("handoff-storageState").fill("Parts binned");
    await page.getByTestId("confirm-pause").click();

    const card = page.getByTestId("handoff-card-t-15-intake").first();
    await expect(card).toContainText("First pause - end of shift");

    // Second handoff, recorded by Alex.
    await page.getByTestId("user-switcher").selectOption("e-alex");
    await page.getByTestId("resume-t-15-intake").click();
    await page.getByTestId("pause-t-15-intake").click();
    await page.getByTestId("handoff-reason").fill("Second pause - waiting on crane");
    await page.getByTestId("handoff-completedWork").fill("Casting confirmed and staged");
    await page.getByTestId("handoff-remainingWork").fill("Move to assembly bay");
    await page.getByTestId("handoff-location").fill("Assembly bay 1");
    await page.getByTestId("handoff-storageState").fill("Slung and chocked");
    await page.getByTestId("confirm-pause").click();

    // The active handoff is the newest, and says what it supersedes.
    await expect(card).toContainText("Second pause - waiting on crane");
    await expect(card).toContainText("supersedes handoff");
    await expect(card).toContainText("Alex Nguyen");

    // The original record is still readable, not overwritten.
    // (The Unit overview renders the handoff card in both the task-controls
    // block and the handoff summary block, so scope to the first.)
    const history = page.getByTestId("handoff-history-t-15-intake").first();
    await expect(history).toContainText("Earlier handoffs (1)");
    await history.click(); // expand the <details>
    await expect(history).toContainText("First pause - end of shift");
    await expect(history).toContainText("Pick list checked");
    await expect(history).toContainText("Parts staging rack B");
    await expect(history).toContainText("Miguel Torres");

    // Audit retains both pause events.
    await page.getByRole("link", { name: "Audit", exact: true }).click();
    const audit = page.locator("table.data");
    await expect(audit).toContainText("supersedes");
    expect(
      (await audit.textContent())?.match(/task\.paused/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
  });
});

test.describe("U1 - unapproved placeholders are always identified", () => {
  test("the pass/fail hydrotest criterion carries its placeholder warning", async ({ page }) => {
    await page.goto(`/units/${U(1)}?tab=checklist`);
    // The defect: only measurement items showed the warning.
    await expect(page.getByTestId("placeholder-hydrotest")).toBeVisible();
    await expect(page.getByTestId("checklist-item-hydrotest")).toContainText(
      "Pilot placeholder - owner approval required"
    );
    // Measurement placeholders still shown.
    for (const key of ["impeller-trim", "shaft-runout", "axial-play", "impeller-clearance"]) {
      await expect(page.getByTestId(`placeholder-${key}`)).toBeVisible();
    }
    // Approved (non-placeholder) items are not falsely flagged.
    await expect(page.getByTestId("placeholder-verify-parts")).toHaveCount(0);
    await expect(page.getByTestId("placeholder-nameplate")).toHaveCount(0);
  });

  test("the QC document flags the hydrotest placeholder too", async ({ page }) => {
    await page.goto(`/documents/${U(1)}`);
    await expect(page.getByTestId("doc-placeholder-hydrotest")).toBeVisible();
  });
});

test.describe("U2 - release presentation follows the real quality record", () => {
  test("every preview is marked draft and uncontrolled", async ({ page }) => {
    await page.goto(`/documents/${U(1)}`);
    await expect(page.getByTestId("uncontrolled-banner")).toBeVisible();
    await expect(page.getByTestId("unapproved-rules-note")).toContainText("Not releasable");
    await expect(page.getByTestId("unapproved-rules-note")).toContainText("D-013");
    // Never a bare "Final".
    const badge = page.getByTestId("release-badge");
    await expect(badge).toContainText("Simulated release - not a controlled record");
    await expect(badge).not.toContainText("Final (mock release)");
  });

  test("failing final quality flips the document out of simulated release", async ({ page }) => {
    await page.goto(`/documents/${U(1)}`);
    await expect(page.getByTestId("release-badge")).toContainText("Simulated release");
    await expect(page.getByTestId("release-blockers")).toHaveCount(0);

    // Fail the final inspection, client-side, in the same session.
    await page.getByRole("link", { name: `← Unit ${U(1)}` }).click();
    await page.getByRole("link", { name: "Checklist", exact: true }).click();
    const item = page.getByTestId("checklist-item-final-quality");
    await item.getByRole("textbox").fill("Seal face scored on re-check.");
    await item.getByRole("button", { name: "Fail" }).click();
    await expect(item).toContainText("fail");

    // The superseded pass is retained.
    await expect(item).toContainText("Superseded entries (1)");

    await page.getByRole("link", { name: /Unit QC history preview/ }).click();
    await expect(page.getByTestId("release-badge")).toContainText("Draft - not released");
    await expect(page.getByTestId("release-blockers")).toContainText(
      "Final quality inspection failed"
    );
    await expect(page.getByTestId("doc-final-remarks")).toContainText("not release-eligible");
  });

  test("a Unit awaiting quality review is not presented as released", async ({ page }) => {
    await page.goto(`/documents/${U(4)}`);
    await expect(page.getByTestId("release-badge")).toContainText("Draft - not released");
    await expect(page.getByTestId("release-blockers")).toContainText("awaiting quality review");
  });
});
