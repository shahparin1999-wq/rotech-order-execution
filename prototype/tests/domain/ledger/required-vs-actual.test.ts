// Ordered vs actual, as the technician sees it.
//
// What these tests protect: the ordered spec is never rewritten, sibling Units
// never bleed into each other, and a row that needs a decision is never hidden
// behind a matching one.

import { describe, expect, it } from "vitest";
import {
  isPhysicalRequirement,
  requiredVsActual,
  rowsNeedingAttention,
  unresolvedForRelease
} from "@/domain/ledger/requiredVsActual";
import type { ComponentUsage } from "@/domain/ledger/componentUsage";
import type { ExecutionRequirement } from "@/domain/ledger/requirement";

const UNIT = "SAMPLE1001_1.1";
const SIBLING = "SAMPLE1001_1.2";

let seq = 0;

function req(p: Partial<ExecutionRequirement> = {}): ExecutionRequirement {
  return {
    id: `req-${++seq}`,
    executionOrderId: "SAMPLE1001",
    unitId: UNIT,
    category: "Component",
    source: "CpqConfiguration",
    sourceRef: "test",
    description: "Impeller — 316SS · 101-AT",
    mandatory: true,
    blocksRelease: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Production",
    status: "Planned",
    fulfillmentRefs: [],
    createdAt: "2026-08-01T00:00:00Z",
    ...p
  };
}

function usage(p: Partial<ComponentUsage> = {}): ComponentUsage {
  return {
    id: `use-${++seq}`,
    requirementId: "req-1",
    unitId: UNIT,
    componentRole: "impeller",
    quantity: 1,
    trackingType: "HeatTracked",
    source: "Inventory",
    usageStatus: "Installed",
    matchStatus: "Matched",
    recordedBy: "e-dave",
    recordedAt: "2026-08-02T00:00:00Z",
    ...p
  };
}

describe("Only physical requirements get an actual-part row", () => {
  it("includes components and materials, excludes tests and drawings", () => {
    expect(isPhysicalRequirement(req({ category: "Component" }))).toBe(true);
    expect(isPhysicalRequirement(req({ category: "Material" }))).toBe(true);
    expect(isPhysicalRequirement(req({ category: "Test" }))).toBe(false);
    expect(isPhysicalRequirement(req({ category: "Drawing" }))).toBe(false);
  });

  it("skips superseded and cancelled requirements", () => {
    const rows = requiredVsActual(
      [req({ id: "a" }), req({ id: "b", status: "Superseded" }), req({ id: "c", status: "Cancelled" })],
      [],
      UNIT
    );
    expect(rows.map((r) => r.requirementId)).toEqual(["a"]);
  });
});

describe("The ordered specification is reported, never rebuilt from actuals", () => {
  it("keeps the ordered text verbatim even when a different part was fitted", () => {
    const requirement = req({ id: "r1", description: "Impeller — 316SS · 101-AT" });
    const rows = requiredVsActual(
      [requirement],
      [usage({ requirementId: "r1", material: "CD4MCU", matchStatus: "PendingReview" })],
      UNIT
    );
    expect(rows[0].orderedDescription).toBe("Impeller — 316SS · 101-AT");
    expect(rows[0].required.material).toBe("316SS");
    expect(rows[0].actual[0].material).toBe("CD4MCU");
  });
});

describe("Unit isolation", () => {
  it("never shows a sibling Unit's parts", () => {
    const rows = requiredVsActual(
      [req({ id: "r1" }), req({ id: "r2", unitId: SIBLING })],
      [
        usage({ requirementId: "r1", heatLot: "H-AAA" }),
        usage({ requirementId: "r2", unitId: SIBLING, heatLot: "H-BBB" })
      ],
      UNIT
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actual.map((u) => u.heatLot)).toEqual(["H-AAA"]);
  });

  it("ignores a usage record that names this requirement but a different Unit", () => {
    const rows = requiredVsActual(
      [req({ id: "r1" })],
      [usage({ requirementId: "r1", unitId: SIBLING, heatLot: "H-BBB" })],
      UNIT
    );
    expect(rows[0].actual).toHaveLength(0);
    expect(rows[0].matchState).toBe("NotRecorded");
  });
});

describe("Row state is evaluated, and the worst live record wins", () => {
  it("reports NotRecorded before anything is fitted", () => {
    const rows = requiredVsActual([req({ id: "r1" })], [], UNIT);
    expect(rows[0].matchState).toBe("NotRecorded");
    expect(rows[0].needsReview).toBe(false);
  });

  it("does not hide a pending part behind a matching one", () => {
    const rows = requiredVsActual(
      [req({ id: "r1" })],
      [
        usage({ requirementId: "r1", matchStatus: "Matched" }),
        usage({ requirementId: "r1", matchStatus: "PendingReview", matchNote: "Material mismatch: required 316SS, actual CD4MCU" })
      ],
      UNIT
    );
    expect(rows[0].matchState).toBe("PendingReview");
    expect(rows[0].matchNote).toMatch(/required 316SS/);
    expect(rows[0].needsReview).toBe(true);
  });

  it("an approved substitution stops needing review but stays visible as one", () => {
    const rows = requiredVsActual(
      [req({ id: "r1" })],
      [usage({ requirementId: "r1", matchStatus: "ApprovedSubstitution" })],
      UNIT
    );
    expect(rows[0].matchState).toBe("ApprovedSubstitution");
    expect(rows[0].needsReview).toBe(false);
  });

  it("a removed part stops driving the row but is kept in history", () => {
    const rows = requiredVsActual(
      [req({ id: "r1" })],
      [
        usage({ requirementId: "r1", matchStatus: "Rejected", usageStatus: "Removed", heatLot: "H-BAD" }),
        usage({ requirementId: "r1", matchStatus: "Matched", heatLot: "H-GOOD" })
      ],
      UNIT
    );
    expect(rows[0].matchState).toBe("Matched");
    expect(rows[0].actual.map((u) => u.heatLot)).toEqual(["H-GOOD"]);
    expect(rows[0].history.map((u) => u.heatLot)).toEqual(["H-BAD"]);
  });

  it("sums installed quantity across however many records it took", () => {
    const rows = requiredVsActual(
      [req({ id: "r1" })],
      [
        usage({ requirementId: "r1", quantity: 12, heatLot: "L-1" }),
        usage({ requirementId: "r1", quantity: 8, heatLot: "L-2" })
      ],
      UNIT
    );
    expect(rows[0].installedQuantity).toBe(20);
  });

  it("flags a manual untracked part for verification", () => {
    const rows = requiredVsActual(
      [req({ id: "r1" })],
      [usage({ requirementId: "r1", source: "ManualUntracked" })],
      UNIT
    );
    expect(rows[0].needsVerification).toBe(true);
  });
});

describe("What a person has to act on", () => {
  it("lists unresolved rows worst first", () => {
    const rows = requiredVsActual(
      [req({ id: "r1" }), req({ id: "r2" }), req({ id: "r3" }), req({ id: "r4" })],
      [
        usage({ requirementId: "r1", matchStatus: "Matched" }),
        usage({ requirementId: "r2", matchStatus: "PendingReview" }),
        usage({ requirementId: "r3", matchStatus: "Rejected" })
        // r4 has nothing recorded
      ],
      UNIT
    );
    expect(rowsNeedingAttention(rows).map((r) => r.requirementId)).toEqual(["r3", "r2", "r4"]);
  });

  it("blocks release on unrecorded and unresolved mandatory rows only", () => {
    const rows = requiredVsActual(
      [
        req({ id: "r1" }),
        req({ id: "r2", blocksRelease: false }),
        req({ id: "r3" })
      ],
      [usage({ requirementId: "r3", matchStatus: "ApprovedSubstitution" })],
      UNIT
    );
    expect(unresolvedForRelease(rows).map((r) => r.requirementId)).toEqual(["r1"]);
  });
});
