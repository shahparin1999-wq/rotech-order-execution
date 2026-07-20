// Regression tests for the four defects confirmed by the independent
// implementation review of commit fd6258f.
//
//   C1  Unit QC document read order-scoped pallet data outside the frozen
//       snapshot, so any released sibling rendered another Unit's shipping
//       record.  (documents/[unitId]/page.tsx:247)
//   C2  A second pause overwrote the first handoff, destroying controlled
//       history.                                    (domain/actions.ts:113)
//   U1  placeholderTolerance was only surfaced for measurement items, so the
//       unapproved hydrotest criterion carried no warning.
//                                                 (components/Checklist.tsx:25)
//   U2  "Final (mock release)" was derived from a static Unit status, so a
//       failed final inspection still presented as released.
//                                            (documents/[unitId]/page.tsx:28)

import { describe, expect, it } from "vitest";
import { buildInitialState, ORDER_NO } from "@/domain/fixtures";
import {
  buildUnitHistorySnapshot,
  evaluateReleasePreview
} from "@/domain/documents";
import {
  addChecklistResponse,
  pauseTask,
  resumeTask,
  startTask
} from "@/domain/actions";
import { currentHandoff, placeholderItemKeys } from "@/domain/selectors";

const U = (n: number) => `${ORDER_NO}_1.${n}`;

describe("C1 - document generation is snapshot-scoped (no cross-Unit shipping)", () => {
  it("each Unit snapshot exposes only its own shipping record", () => {
    const state = buildInitialState();

    const s11 = buildUnitHistorySnapshot(state, U(1));
    expect(s11.shipping).not.toBeNull();
    expect(s11.shipping!.id).toBe("PAL-0031");
    expect(s11.shipping!.unitIds).toContain(U(1));

    const s14 = buildUnitHistorySnapshot(state, U(4));
    expect(s14.shipping).not.toBeNull();
    expect(s14.shipping!.id).toBe("PAL-0032");

    // The defect: an order-scoped lookup returns the first pallet on the
    // order for every Unit. Unit 1.4 must not resolve to Unit 1.1's pallet.
    expect(s14.shipping!.id).not.toBe("PAL-0031");
    expect(s11.shipping!.id).not.toBe("PAL-0032");
  });

  it("documents the defect: an order-scoped lookup resolves to a sibling's pallet", () => {
    const state = buildInitialState();
    const snap = buildUnitHistorySnapshot(state, U(4));
    // This is exactly what documents/[unitId]/page.tsx:247 used to do.
    const asThePageDidBefore = state.pallets.find(
      (p) => p.orderNumber === snap.order.orderNumber
    );
    // It returns Unit 1.1's pallet while rendering Unit 1.4's document.
    expect(asThePageDidBefore!.id).toBe("PAL-0031");
    expect(asThePageDidBefore!.unitIds).not.toContain(U(4));
    // The snapshot-scoped resolution disagrees, which is the whole point.
    expect(snap.shipping!.id).toBe("PAL-0032");
  });

  it("a Unit with no shipping record gets null, never a sibling's pallet", () => {
    const state = buildInitialState();
    for (const seq of [2, 3, 5]) {
      const snap = buildUnitHistorySnapshot(state, U(seq));
      expect(snap.shipping).toBeNull();
    }
  });

  it("every value in a snapshot belongs to its own Unit", () => {
    const state = buildInitialState();
    for (const seq of [1, 2, 3, 4, 5]) {
      const snap = buildUnitHistorySnapshot(state, U(seq));
      if (snap.shipping) expect(snap.shipping.unitIds).toContain(U(seq));
      for (const r of snap.responses) expect(r.unitId).toBe(U(seq));
      for (const a of snap.attachments) expect(a.unitId).toBe(U(seq));
      for (const t of snap.tasks) expect(t.unitId).toBe(U(seq));
      for (const e of snap.auditEvents) expect(e.unitId).toBe(U(seq));
    }
  });
});

describe("C2 - pausing twice preserves both handoffs (append-only)", () => {
  it("a second pause supersedes rather than overwrites the first handoff", () => {
    let state = buildInitialState();

    state = startTask(state, "t-15-intake", "e-miguel", "2026-07-18T12:00:00Z");
    state = pauseTask(
      state,
      "t-15-intake",
      "e-miguel",
      {
        reason: "First pause - end of shift",
        completedWork: "Pick list checked",
        remainingWork: "Confirm casting",
        location: "Parts staging rack B",
        storageState: "Parts binned"
      },
      "2026-07-18T15:00:00Z"
    );
    state = resumeTask(state, "t-15-intake", "e-alex", "2026-07-19T09:00:00Z");
    state = pauseTask(
      state,
      "t-15-intake",
      "e-alex",
      {
        reason: "Second pause - waiting on crane",
        completedWork: "Casting confirmed and staged",
        remainingWork: "Move to assembly bay",
        location: "Assembly bay 1",
        storageState: "Slung and chocked"
      },
      "2026-07-19T11:30:00Z"
    );

    const task = state.tasks.find((t) => t.id === "t-15-intake")!;

    // Both records survive, in order.
    expect(task.handoffs).toHaveLength(2);
    const [first, second] = task.handoffs;

    // The original controlled record is intact - not overwritten.
    expect(first.reason).toBe("First pause - end of shift");
    expect(first.completedWork).toBe("Pick list checked");
    expect(first.remainingWork).toBe("Confirm casting");
    expect(first.location).toBe("Parts staging rack B");
    expect(first.storageState).toBe("Parts binned");
    expect(first.byId).toBe("e-miguel");
    expect(first.at).toBe("2026-07-18T15:00:00Z");
    expect(first.supersedesId).toBeNull();

    // The superseding record carries reason, actor, timestamp and linkage.
    expect(second.reason).toBe("Second pause - waiting on crane");
    expect(second.byId).toBe("e-alex");
    expect(second.at).toBe("2026-07-19T11:30:00Z");
    expect(second.supersedesId).toBe(first.id);
    expect(second.id).not.toBe(first.id);

    // The active handoff is the newest one.
    expect(currentHandoff(task)!.id).toBe(second.id);

    // Audit retains both pauses and links the superseding event.
    const pauseEvents = state.auditEvents.filter(
      (e) => e.targetId === "t-15-intake" && e.action === "task.paused"
    );
    expect(pauseEvents).toHaveLength(2);
    expect(pauseEvents[0].supersedesEventId).toBeNull();
    expect(pauseEvents[1].supersedesEventId).toBe(pauseEvents[0].id);
  });

  it("the fixture handoff is still readable through the current-handoff helper", () => {
    const state = buildInitialState();
    const task = state.tasks.find((t) => t.id === "t-12-trim")!;
    expect(task.handoffs).toHaveLength(1);
    const h = currentHandoff(task)!;
    expect(h.reason).toBe("End of shift");
    expect(h.byId).toBe("e-miguel");
    expect(h.supersedesId).toBeNull();
  });
});

describe("U1 - every unapproved placeholder is identifiable", () => {
  it("placeholder items include the non-measurement hydrotest criterion", () => {
    const state = buildInitialState();
    const keys = placeholderItemKeys(state);
    expect(keys).toContain("hydrotest");
    expect(keys).toContain("impeller-trim");
    expect(keys).toContain("shaft-runout");
    expect(keys).toContain("axial-play");
    expect(keys).toContain("impeller-clearance");
  });

  it("the flag is independent of response type", () => {
    const state = buildInitialState();
    const hydro = state.checklistDefs.find((d) => d.key === "hydrotest")!;
    expect(hydro.responseType).not.toBe("measurement");
    expect(hydro.placeholderTolerance).toBe(true);
    expect(placeholderItemKeys(state)).toContain(hydro.key);
  });
});

describe("U2 - release preview reflects real quality state", () => {
  it("a Unit whose final inspection passed is release-eligible but never controlled", () => {
    const state = buildInitialState();
    const snap = buildUnitHistorySnapshot(state, U(1));
    const preview = evaluateReleasePreview(state, snap);
    expect(preview.qualityPassed).toBe(true);
    expect(preview.releaseEligible).toBe(true);
    // Engineering rules (D-013) are unapproved, so the document is never a
    // controlled record and never claims a real release.
    expect(preview.controlled).toBe(false);
    expect(preview.label).toMatch(/simulated/i);
    expect(preview.label).not.toMatch(/^final$/i);
  });

  it("failing final quality removes release eligibility", () => {
    let state = buildInitialState();
    state = addChecklistResponse(
      state,
      U(1),
      "e-priya",
      {
        itemKey: "final-quality",
        value: "fail",
        note: "Seal face scored on re-check.",
        supersedesId: "r-11-final"
      },
      "2026-07-19T10:00:00Z"
    );
    const snap = buildUnitHistorySnapshot(state, U(1));
    const preview = evaluateReleasePreview(state, snap);
    expect(preview.qualityPassed).toBe(false);
    expect(preview.releaseEligible).toBe(false);
    expect(preview.blockers.join(" ")).toMatch(/final quality/i);

    // The original passing response is retained, not deleted.
    const original = state.responses.find((r) => r.id === "r-11-final")!;
    expect(original.value).toBe("pass");
  });

  it("a Unit still in production is not release-eligible", () => {
    const state = buildInitialState();
    for (const seq of [2, 3, 4, 5]) {
      const snap = buildUnitHistorySnapshot(state, U(seq));
      const preview = evaluateReleasePreview(state, snap);
      expect(preview.releaseEligible).toBe(false);
      expect(preview.controlled).toBe(false);
    }
  });

  it("an outstanding NeedsReview response blocks release eligibility", () => {
    const state = buildInitialState();
    // Unit 1.4 has an axial-play reading flagged NeedsReview in the fixture.
    const snap = buildUnitHistorySnapshot(state, U(4));
    const preview = evaluateReleasePreview(state, snap);
    expect(preview.releaseEligible).toBe(false);
    expect(preview.blockers.join(" ")).toMatch(/review/i);
  });
});
