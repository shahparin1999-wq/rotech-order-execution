// Actual-part capture: the "as built" layer.
//
// The rules here are the ones that decide whether a wrong part quietly becomes
// the record of what was built.

import { describe, expect, it } from "vitest";
import {
  approveSubstitution,
  blocksOnMatch,
  evaluateMatch,
  installedQuantity,
  isInstalled,
  isLiveUsage,
  needsVerification,
  rejectUsage,
  requiredSpecFromDescription,
  supersessionChain,
  usageForRequirement,
  usageForUnit,
  type ComponentUsage
} from "@/domain/ledger/componentUsage";
import { buildInitialState, CUSTOMER_ACME } from "@/domain/fixtures";
import { approveUsageSubstitution, createConfiguredOrder, recordComponentUsage } from "@/domain/actions";
import { newAssemblyLine } from "@/domain/configurator";

const AT = "2026-08-07T09:00:00Z";
let seq = 0;

function usage(p: Partial<ComponentUsage> = {}): ComponentUsage {
  return {
    id: `use-${++seq}`,
    requirementId: "REQ-IMP",
    unitId: "SAMPLE1001_1.1",
    componentRole: "impeller",
    quantity: 1,
    trackingType: "HeatTracked",
    source: "Inventory",
    usageStatus: "Installed",
    matchStatus: "Matched",
    recordedBy: "e-dave",
    recordedAt: AT,
    ...p
  };
}

describe("Many usage records may hang off one requirement", () => {
  it("records two bearings against a single bearing requirement", () => {
    const records = [
      usage({ requirementId: "REQ-BRG", componentRole: "bearing", serial: "B-001", trackingType: "Serialized" }),
      usage({ requirementId: "REQ-BRG", componentRole: "bearing", serial: "B-002", trackingType: "Serialized" })
    ];
    expect(usageForRequirement(records, "REQ-BRG")).toHaveLength(2);
    expect(installedQuantity(records, "REQ-BRG")).toBe(2);
  });

  it("sums multiple lots contributing to one quantity", () => {
    const records = [
      usage({ requirementId: "REQ-FAST", quantity: 12, heatLot: "L-1", trackingType: "LotTracked" }),
      usage({ requirementId: "REQ-FAST", quantity: 8, heatLot: "L-2", trackingType: "LotTracked" })
    ];
    expect(installedQuantity(records, "REQ-FAST")).toBe(20);
  });

  it("counts only installed quantity, not allocated or issued", () => {
    const records = [
      usage({ usageStatus: "Installed", quantity: 1 }),
      usage({ usageStatus: "Issued", quantity: 1 }),
      usage({ usageStatus: "Allocated", quantity: 1 })
    ];
    expect(installedQuantity(records, "REQ-IMP")).toBe(1);
  });
});

describe("Replacement preserves history", () => {
  it("keeps the removed part and links the replacement to it", () => {
    const original = usage({ id: "use-A", heatLot: "H-111", usageStatus: "Removed" });
    const replacement = usage({ id: "use-B", heatLot: "H-222", supersedesUsageId: "use-A" });
    const records = [original, replacement];

    // Nothing was deleted.
    expect(records).toHaveLength(2);
    expect(isLiveUsage(original)).toBe(false);
    expect(isInstalled(replacement)).toBe(true);

    const chain = supersessionChain(records, "use-B");
    expect(chain.map((u) => u.heatLot)).toEqual(["H-111", "H-222"]);
  });
});

describe("Unit isolation", () => {
  it("never returns a sibling Unit's parts", () => {
    const records = [
      usage({ unitId: "SAMPLE1001_1.1", heatLot: "H-AAA" }),
      usage({ unitId: "SAMPLE1001_1.2", heatLot: "H-BBB" }),
      usage({ unitId: "SAMPLE1001_1.3", heatLot: "H-CCC" })
    ];
    const forUnit1 = usageForUnit(records, "SAMPLE1001_1.1");
    expect(forUnit1).toHaveLength(1);
    expect(forUnit1[0].heatLot).toBe("H-AAA");
    expect(forUnit1.some((u) => u.heatLot === "H-BBB" || u.heatLot === "H-CCC")).toBe(false);
  });

  it("five identical pumps produce five distinct records", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      usage({ unitId: `SAMPLE1001_1.${i + 1}`, heatLot: `H-${i + 1}` })
    );
    for (let i = 1; i <= 5; i++) {
      const forUnit = usageForUnit(records, `SAMPLE1001_1.${i}`);
      expect(forUnit).toHaveLength(1);
      expect(forUnit[0].heatLot).toBe(`H-${i}`);
    }
  });
});

describe("Match evaluation decides, it does not merely display", () => {
  it("passes an exact match", () => {
    const result = evaluateMatch(
      { manufacturer: "WEG", material: "316SS", partNumber: "101-AT" },
      { manufacturer: "WEG", material: "316SS", partNumber: "101-AT" }
    );
    expect(result.status).toBe("Matched");
    expect(result.differences).toEqual([]);
  });

  it("names both sides of a manufacturer mismatch", () => {
    const result = evaluateMatch({ manufacturer: "WEG" }, { manufacturer: "TECO" });
    expect(result.status).toBe("PendingReview");
    expect(result.note).toMatch(/required WEG/);
    expect(result.note).toMatch(/actual TECO/);
    expect(result.note).toMatch(/Review required/);
  });

  it("reports every difference, not just the first", () => {
    const result = evaluateMatch(
      { manufacturer: "WEG", material: "316SS" },
      { manufacturer: "TECO", material: "CD4MCU" }
    );
    expect(result.differences).toHaveLength(2);
  });

  it("tolerates formatting but not different alloys", () => {
    expect(evaluateMatch({ material: "316 SS" }, { material: "316ss" }).status).toBe("Matched");
    expect(evaluateMatch({ material: "316SS" }, { material: "CD4MCU" }).status).toBe("PendingReview");
  });

  it("cannot be contradicted where the requirement says nothing", () => {
    expect(evaluateMatch({}, { manufacturer: "TECO" }).status).toBe("Matched");
    expect(evaluateMatch({ manufacturer: "WEG" }, {}).status).toBe("Matched");
  });

  it("parses the required spec the configurator writes", () => {
    const spec = requiredSpecFromDescription("Impeller — 316SS · 101-AT-M-A-S6");
    expect(spec.material).toBe("316SS");
    expect(spec.partNumber).toBe("101-AT-M-A-S6");
  });
});

describe("An unresolved match blocks; an approved one does not", () => {
  it("blocks while pending review", () => {
    expect(blocksOnMatch(usage({ matchStatus: "PendingReview" }))).toBe(true);
  });

  it("blocks when rejected", () => {
    expect(blocksOnMatch(usage({ matchStatus: "Rejected" }))).toBe(true);
  });

  it("stops blocking once a substitution is approved, and keeps the reason", () => {
    const pending = usage({ matchStatus: "PendingReview" });
    const approved = approveSubstitution(pending, "e-priya", "Equivalent TECO motor, engineering approved");
    expect(approved.matchStatus).toBe("ApprovedSubstitution");
    expect(approved.approvedBy).toBe("e-priya");
    expect(approved.approvedReason).toMatch(/Equivalent TECO/);
    expect(blocksOnMatch(approved)).toBe(false);
  });

  it("refuses to approve or reject without a reason", () => {
    expect(() => approveSubstitution(usage(), "e-priya", "  ")).toThrow(/reason/);
    expect(() => rejectUsage(usage(), "e-priya", "")).toThrow(/reason/);
  });

  it("a removed part no longer blocks anything", () => {
    expect(blocksOnMatch(usage({ matchStatus: "Rejected", usageStatus: "Removed" }))).toBe(false);
  });
});

describe("Manual entry keeps Production moving but is flagged", () => {
  it("marks an untracked manual part for verification", () => {
    expect(needsVerification(usage({ source: "ManualUntracked" }))).toBe(true);
    expect(needsVerification(usage({ source: "Inventory" }))).toBe(false);
    expect(needsVerification(usage({ source: "CustomerSupplied" }))).toBe(false);
  });

  it("a manual part that was removed no longer needs verifying", () => {
    expect(needsVerification(usage({ source: "ManualUntracked", usageStatus: "Removed" }))).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Wired into app state: recording actual use against a real configured order.
// --------------------------------------------------------------------------

describe("Recording usage against a live order", () => {
  function orderWithTwoUnits() {
    const line = { ...newAssemblyLine("l1"), quantity: 2 };
    return createConfiguredOrder(buildInitialState(), "e-sarah", {
      orderNumber: "USE-001",
      customerId: CUSTOMER_ACME,
      customerPo: "PO-USE",
      description: "Usage test",
      facility: "Mississauga",
      coordinatorId: "e-sarah",
      priority: "Medium",
      dueDate: "2026-09-30",
      lines: [line]
    });
  }

  function casingReqFor(state: ReturnType<typeof buildInitialState>, unitId: string) {
    return state.requirements.find(
      (r) => r.unitId === unitId && r.componentId?.endsWith("-casing")
    )!;
  }

  it("evaluates the match automatically and records the reason", () => {
    let state = orderWithTwoUnits();
    const req = casingReqFor(state, "USE-001_1.1");
    // The configured casing is Ductile Iron; fitting CD4MCU is a real change.
    state = recordComponentUsage(state, "e-dave", {
      requirementId: req.id,
      unitId: "USE-001_1.1",
      componentRole: "casing",
      material: "CD4MCU",
      heatLot: "H-999",
      source: "ManualUntracked"
    });
    const rec = state.componentUsages.at(-1)!;
    expect(rec.matchStatus).toBe("PendingReview");
    expect(rec.matchNote).toMatch(/required Ductile Iron/i);
    expect(rec.matchNote).toMatch(/actual CD4MCU/i);
  });

  it("never rewrites the ordered specification", () => {
    let state = orderWithTwoUnits();
    const req = casingReqFor(state, "USE-001_1.1");
    const orderedBefore = req.description;
    state = recordComponentUsage(state, "e-dave", {
      requirementId: req.id,
      unitId: "USE-001_1.1",
      componentRole: "casing",
      material: "CD4MCU"
    });
    const after = state.requirements.find((r) => r.id === req.id)!;
    expect(after.description).toBe(orderedBefore);
  });

  it("refuses to record a part against a sibling Unit's requirement", () => {
    const state = orderWithTwoUnits();
    const req = casingReqFor(state, "USE-001_1.1");
    expect(() =>
      recordComponentUsage(state, "e-dave", {
        requirementId: req.id,
        unitId: "USE-001_1.2", // wrong Unit
        componentRole: "casing"
      })
    ).toThrow(/belongs to USE-001_1\.1/);
  });

  it("keeps two Units' actual parts completely separate", () => {
    let state = orderWithTwoUnits();
    for (const [unitId, heat] of [["USE-001_1.1", "H-AAA"], ["USE-001_1.2", "H-BBB"]] as const) {
      state = recordComponentUsage(state, "e-dave", {
        requirementId: casingReqFor(state, unitId).id,
        unitId,
        componentRole: "casing",
        heatLot: heat
      });
    }
    expect(usageForUnit(state.componentUsages, "USE-001_1.1").map((u) => u.heatLot)).toEqual(["H-AAA"]);
    expect(usageForUnit(state.componentUsages, "USE-001_1.2").map((u) => u.heatLot)).toEqual(["H-BBB"]);
  });

  it("approving a substitution keeps the reason and unblocks it", () => {
    let state = orderWithTwoUnits();
    const req = casingReqFor(state, "USE-001_1.1");
    state = recordComponentUsage(state, "e-dave", {
      requirementId: req.id,
      unitId: "USE-001_1.1",
      componentRole: "casing",
      material: "CD4MCU"
    });
    const id = state.componentUsages.at(-1)!.id;
    state = approveUsageSubstitution(state, "e-priya", id, "Upgrade approved by engineering");

    const rec = state.componentUsages.find((u) => u.id === id)!;
    expect(rec.matchStatus).toBe("ApprovedSubstitution");
    expect(rec.approvedBy).toBe("e-priya");
    expect(blocksOnMatch(rec)).toBe(false);
    expect(state.auditEvents.some((e) => e.action === "usage.substitutionApproved")).toBe(true);
  });

  it("a replacement supersedes without deleting the original", () => {
    let state = orderWithTwoUnits();
    const req = casingReqFor(state, "USE-001_1.1");
    state = recordComponentUsage(state, "e-dave", {
      requirementId: req.id, unitId: "USE-001_1.1", componentRole: "casing", heatLot: "H-1"
    });
    const first = state.componentUsages.at(-1)!.id;
    state = recordComponentUsage(state, "e-dave", {
      requirementId: req.id, unitId: "USE-001_1.1", componentRole: "casing",
      heatLot: "H-2", supersedesUsageId: first
    });

    expect(usageForRequirement(state.componentUsages, req.id)).toHaveLength(2);
    expect(state.componentUsages.find((u) => u.id === first)!.usageStatus).toBe("Superseded");
    expect(state.componentUsages.at(-1)!.heatLot).toBe("H-2");
  });

  it("writes an audit entry naming the actual part", () => {
    let state = orderWithTwoUnits();
    state = recordComponentUsage(state, "e-dave", {
      requirementId: casingReqFor(state, "USE-001_1.1").id,
      unitId: "USE-001_1.1",
      componentRole: "casing",
      partNumber: "100-AT-M-A-1F-DI",
      heatLot: "H-8821"
    });
    const entry = state.auditEvents.at(-1)!;
    expect(entry.action).toBe("usage.recorded");
    expect(entry.unitId).toBe("USE-001_1.1");
    expect(entry.detail).toMatch(/100-AT-M-A-1F-DI/);
    expect(entry.detail).toMatch(/H-8821/);
  });
});
