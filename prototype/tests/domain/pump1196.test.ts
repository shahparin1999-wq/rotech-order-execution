// 1196 standard pump-end configuration & execution slice (model1196.ts +
// create1196PumpEnd/decidePowerEndAvailability/recordComponentUsage1196/
// confirmGateItem1196 in actions.ts). Covers the source-derived baseline,
// fail-closed unknown-frame/DBSE handling, the power-end availability
// branch, package scope + service selection, the confirmation gate, and
// Unit isolation (protected invariants).

import { describe, expect, it } from "vitest";
import { buildInitialState, CUSTOMER_ACME } from "@/domain/fixtures";
import {
  confirmGateItem1196,
  create1196PumpEnd,
  decidePowerEndAvailability,
  recordComponentUsage1196,
  setPackageDrawing1196,
  type Create1196PumpEndInput
} from "@/domain/actions";
import {
  componentRequirementsForScope,
  pump1196ConfigForLine,
  releaseBlockers1196,
  serviceRequirementsForLine,
  unit1196View
} from "@/domain/selectors";
import {
  frameOptionsForSize,
  materialOptionsForSize,
  powerEndBuildChildren,
  pumpSizes1196,
  pumpSizeEntry1196,
  resolveDefaultDbse,
  STANDARD_BASELINE_1196
} from "@/domain/model1196";

function baseInput(overrides: Partial<Create1196PumpEndInput> = {}): Create1196PumpEndInput {
  return {
    orderNumber: "TEST1196-01",
    customerId: CUSTOMER_ACME,
    customerPo: "PO-TEST1196",
    description: "Test 1196 pump end",
    facility: "Mississauga",
    coordinatorId: "e-sarah",
    priority: "Medium",
    dueDate: "2026-09-01",
    quantity: 1,
    size: "3X4-13",
    frame: "MTR",
    materialBuild: "316SS/316SS",
    hydraulicCondition: { kind: "MaxDiameter" },
    stuffingBoxCover: { kind: "Standard" },
    buildType: "BarePumpEnd",
    selectedServiceKeys: [],
    ...overrides
  };
}

describe("1196 standard baseline generation", () => {
  it("matches the source-derived standard baseline", () => {
    expect(STANDARD_BASELINE_1196.casing).toBe("150# FF");
    expect(STANDARD_BASELINE_1196.impellerCondition).toBe("MAX_DIAMETER");
    expect(STANDARD_BASELINE_1196.shaftMaterial).toBe("AISI_4140");
    expect(STANDARD_BASELINE_1196.sleeveMaterialRule).toBe("MATCH_CASING_MOC");
    expect(STANDARD_BASELINE_1196.stuffingBoxCover).toBe("STANDARD_BORE_MATCH_CASING_MOC");
    expect(STANDARD_BASELINE_1196.bearingsIncluded).toBe(true);
    expect(STANDARD_BASELINE_1196.sightGlassIncluded).toBe(true);
    expect(STANDARD_BASELINE_1196.labyrinthSealsIncluded).toBe(true);
  });

  it("generates casing/impeller/SBC/power-end requirements for every Unit", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput());
    const unitId = "TEST1196-01_1.1";
    const reqs = componentRequirementsForScope(state, "Unit", unitId);
    const keys = reqs.map((r) => r.key).sort();
    expect(keys).toEqual(["casing", "impeller", "powerEndAssembly", "stuffingBoxCover"]);
    expect(reqs.every((r) => r.availabilityState === "Required")).toBe(true);
  });
});

describe("Explicit overrides", () => {
  it("an explicit impeller trim is traceable and does not alter the SBC field", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({ hydraulicCondition: { kind: "Trim", trimValue: 12.5, reason: "Customer duty point" } })
    );
    const config = pump1196ConfigForLine(state, "TEST1196-01-L1")!;
    expect(config.hydraulicCondition).toEqual({ kind: "Trim", trimValue: 12.5, reason: "Customer duty point" });
    expect(config.stuffingBoxCover).toEqual({ kind: "Standard" });
  });

  it("an explicit large-bore SBC override is traceable and does not alter the impeller field", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({ stuffingBoxCover: { kind: "Override", description: "Large bore", reason: "Solids handling" } })
    );
    const config = pump1196ConfigForLine(state, "TEST1196-01-L1")!;
    expect(config.stuffingBoxCover).toEqual({ kind: "Override", description: "Large bore", reason: "Solids handling" });
    expect(config.hydraulicCondition).toEqual({ kind: "MaxDiameter" });
  });
});

describe("CPQ-sourced size catalogue", () => {
  it("carries every 1196 size from the CPQ family seed, with per-size frame options", () => {
    expect(pumpSizes1196()).toHaveLength(31);
    // A size whose CPQ record allows an alternate frame.
    expect(frameOptionsForSize("3X4-13")).toEqual(["MTR", "LTR"]);
    // A size restricted to a single frame.
    expect(frameOptionsForSize("1X1.5-6")).toEqual(["STR"]);
    expect(frameOptionsForSize("8X10-17")).toEqual(["XLR-17"]);
    // An unlisted size resolves to nothing rather than a guessed default.
    expect(frameOptionsForSize("9X9-99")).toBeNull();
  });

  it("offers the size's own standard MOC plus the family upgrades", () => {
    // 3X4-13 is a DI/316SS size.
    expect(materialOptionsForSize("3X4-13")).toEqual({
      default: "DI/316SS",
      options: ["DI/316SS", "316SS/316SS", "CD4MCU/CD4MCU"]
    });
    // 4X6-13 is a CS/316SS size — its standard MOC is not in the family
    // upgrade list, so it has to be unioned in rather than dropped.
    expect(materialOptionsForSize("4X6-13")).toEqual({
      default: "CS/316SS",
      options: ["CS/316SS", "DI/316SS", "316SS/316SS", "CD4MCU/CD4MCU"]
    });
  });

  it("records the size's full impeller diameter on the frozen config", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput());
    const config = pump1196ConfigForLine(state, "TEST1196-01-L1")!;
    expect(config.fullImpellerTrim).toBe(pumpSizeEntry1196("3X4-13")!.fullImpellerTrim);
    expect(config.fullImpellerTrim).toBe(13.0);
  });
});

describe("Uncontrolled size/frame/material fails closed", () => {
  it("rejects a size that is not in the CPQ catalogue", () => {
    const state = buildInitialState();
    expect(() => create1196PumpEnd(state, "e-sarah", baseInput({ size: "9X9-99" }))).toThrow(/controlled data/i);
  });

  it("rejects a frame that is real but not valid for the chosen size", () => {
    const state = buildInitialState();
    // STR is a controlled 1196 frame, but not an option for 3X4-13.
    expect(() => create1196PumpEnd(state, "e-sarah", baseInput({ frame: "STR" }))).toThrow(/not a controlled frame/i);
  });

  it("rejects a material build outside the size's controlled options", () => {
    const state = buildInitialState();
    expect(() => create1196PumpEnd(state, "e-sarah", baseInput({ materialBuild: "316SS" }))).toThrow(
      /not a controlled option/i
    );
  });

  it("rejects a Complete Package on a frame the catalogue has no spacing for", () => {
    const state = buildInitialState();
    // "ZZZ" is in no size's frameOptions and has no frameSpacing entry.
    expect(resolveDefaultDbse("ZZZ")).toBeNull();
    expect(() =>
      create1196PumpEnd(state, "e-sarah", baseInput({ frame: "ZZZ", buildType: "CompletePackage" }))
    ).toThrow(/not a controlled frame/i);
  });

  it("resolves XLR-17 DBSE from the catalogue (D-1196-008 was answerable all along)", () => {
    // The frame-spacing table carries XLR-17; the previous rejection was a gap
    // in where we looked, not a gap in the data. Release is still blocked, but
    // by the provisional-catalogue blocker rather than a missing DBSE.
    expect(resolveDefaultDbse("XLR-17")).toEqual({ value: 5.25, isDefault: true, ruleId: "R-1196-018" });
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({ size: "8X10-17", frame: "XLR-17", materialBuild: "CS/316SS", buildType: "CompletePackage" })
    );
    expect(pump1196ConfigForLine(state, "TEST1196-01-L1")!.dbse).toEqual({ value: 5.25, isDefault: true });
  });
});

describe("Quantity generates exactly N independent Units", () => {
  it("quantity 3 creates exactly 3 Units under the correct line", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput({ quantity: 3 }));
    const units = state.units.filter((u) => u.orderNumber === "TEST1196-01");
    expect(units.map((u) => u.unitId)).toEqual(["TEST1196-01_1.1", "TEST1196-01_1.2", "TEST1196-01_1.3"]);
  });
});

describe("Power-end availability branch", () => {
  it("Available leaves a single allocated requirement, no children", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput());
    const unitId = "TEST1196-01_1.1";
    state = decidePowerEndAvailability(state, "e-dave", unitId, "Available");
    const reqs = componentRequirementsForScope(state, "Unit", unitId);
    const powerEnd = reqs.find((r) => r.key === "powerEndAssembly")!;
    expect(powerEnd.availabilityState).toBe("Allocated");
    expect(reqs.filter((r) => r.parentRequirementId === powerEnd.id)).toHaveLength(0);
  });

  it("BuildRequired expands the full controlled child-requirement set", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput());
    const unitId = "TEST1196-01_1.1";
    state = decidePowerEndAvailability(state, "e-dave", unitId, "BuildRequired");
    const reqs = componentRequirementsForScope(state, "Unit", unitId);
    const powerEnd = reqs.find((r) => r.key === "powerEndAssembly")!;
    expect(powerEnd.availabilityState).toBe("NeedsAssembly");
    const children = reqs.filter((r) => r.parentRequirementId === powerEnd.id);
    expect(children.map((r) => r.key).sort()).toEqual(
      ["adapter", "bearingFrame", "bearings", "frameFoot", "labyrinthSeals", "sightGlassFittings", "shaftKit"].sort()
    );
    // The two CPQ-mapped children carry real part numbers for the default
    // 4140/316SS sleeved shaft; the rest stay controlled placeholders.
    expect(children.find((r) => r.key === "shaftKit")!.catalogPartNumber).toBe("A529L-S12");
    expect(children.find((r) => r.key === "bearingFrame")!.catalogPartNumber).toBe("A530L-P412");
    expect(children.find((r) => r.key === "adapter")!.catalogPartNumber).toBeNull();
    expect(children.find((r) => r.key === "adapter")!.label).toMatch(/pilot placeholder/i);
  });

  it("resolves part numbers from the configured shaft type, not a fixed default", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput({ shaftType: "316SS SOLID SHAFT" }));
    const unitId = "TEST1196-01_1.1";
    state = decidePowerEndAvailability(state, "e-dave", unitId, "BuildRequired");
    const reqs = componentRequirementsForScope(state, "Unit", unitId);
    expect(reqs.find((r) => r.key === "shaftKit")!.catalogPartNumber).toBe("A529O-S20");
    expect(reqs.find((r) => r.key === "bearingFrame")!.catalogPartNumber).toBe("A530O-P420");
  });

  it("fails closed for a frame/shaft-type combination CPQ does not offer", () => {
    // XLR-17 has no 316SS solid-shaft entry in CPQ's part-code tables.
    expect(powerEndBuildChildren("XLR-17", "316SS SOLID SHAFT")).toBeNull();
    expect(powerEndBuildChildren("XLR-17", "4140/316SS SLEEVED SHAFT")).not.toBeNull();
  });

  it("re-deciding BuildRequired does not duplicate children", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput());
    const unitId = "TEST1196-01_1.1";
    state = decidePowerEndAvailability(state, "e-dave", unitId, "BuildRequired");
    state = decidePowerEndAvailability(state, "e-dave", unitId, "BuildRequired");
    const powerEnd = componentRequirementsForScope(state, "Unit", unitId).find((r) => r.key === "powerEndAssembly")!;
    const children = state.componentRequirements1196.filter((r) => r.parentRequirementId === powerEnd.id);
    expect(children).toHaveLength(7);
  });
});

describe("Package scope", () => {
  it("Bare pump end creates no base/motor/coupling/guard requirements", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput({ buildType: "BarePumpEnd" }));
    const reqs = componentRequirementsForScope(state, "Unit", "TEST1196-01_1.1");
    const packageKeys = reqs.filter((r) => ["motor", "baseplate", "coupling", "couplingGuard"].includes(r.key));
    expect(packageKeys).toHaveLength(0);
    const config = pump1196ConfigForLine(state, "TEST1196-01-L1")!;
    expect(config.dbse).toBeNull();
  });

  it("Complete package with a Rotech-supplied motor requires it (Required, not CustomerSupplied)", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({ buildType: "CompletePackage", packageScope: { motor: "RotechSupplied" } })
    );
    const motor = componentRequirementsForScope(state, "Unit", "TEST1196-01_1.1").find((r) => r.key === "motor")!;
    expect(motor.availabilityState).toBe("Required");
    const config = pump1196ConfigForLine(state, "TEST1196-01-L1")!;
    expect(config.dbse).toEqual({ value: 3.75, isDefault: true }); // MTR default (R-1196-017)
  });

  it("Complete package with a customer-supplied motor creates a receipt requirement, never a purchase one", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({ buildType: "CompletePackage", packageScope: { motor: "CustomerSupplied" } })
    );
    const motor = componentRequirementsForScope(state, "Unit", "TEST1196-01_1.1").find((r) => r.key === "motor")!;
    expect(motor.availabilityState).toBe("CustomerSupplied");
  });

  it("XLR frame defaults to 5.25in DBSE (R-1196-018)", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({ size: "6X8-13", frame: "XLR", materialBuild: "CS/316SS", buildType: "CompletePackage" })
    );
    const config = pump1196ConfigForLine(state, "TEST1196-01-L1")!;
    expect(config.dbse).toEqual({ value: 5.25, isDefault: true });
  });
});

describe("Package drawing", () => {
  it("freezes a custom baseplate drawing supplied at intake", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({
        buildType: "CompletePackage",
        packageScope: { baseplate: "RotechSupplied" },
        packageDrawing: {
          kind: "CustomBaseplate",
          reference: "BP-2026-114",
          note: "Extended baseplate with drip rim",
          attachmentId: null
        }
      })
    );
    const config = pump1196ConfigForLine(state, "TEST1196-01-L1")!;
    expect(config.packageDrawing).toEqual({
      kind: "CustomBaseplate",
      reference: "BP-2026-114",
      note: "Extended baseplate with drip rim",
      attachmentId: null
    });
  });

  it("never attaches a package drawing to a bare pump end", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({ buildType: "BarePumpEnd", packageDrawing: { kind: "StandardReference", reference: "MTR standard" } })
    );
    expect(pump1196ConfigForLine(state, "TEST1196-01-L1")!.packageDrawing).toBeNull();
    expect(() =>
      setPackageDrawing1196(state, "e-sarah", "TEST1196-01-L1", { kind: "StandardReference", reference: "MTR standard" })
    ).toThrow(/Complete Package/);
  });

  it("replacing the drawing audits the change instead of silently overwriting", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({
        buildType: "CompletePackage",
        packageDrawing: { kind: "StandardReference", reference: "MTR standard baseplate" }
      })
    );
    state = setPackageDrawing1196(state, "e-dave", "TEST1196-01-L1", {
      kind: "CustomBaseplate",
      reference: "BP-2026-114",
      note: "Customer-specified drip rim",
      attachmentId: null
    });
    expect(pump1196ConfigForLine(state, "TEST1196-01-L1")!.packageDrawing).toMatchObject({
      kind: "CustomBaseplate",
      reference: "BP-2026-114"
    });
    const event = state.auditEvents.find((e) => e.action === "pump1196.packageDrawingSet")!;
    expect(event.detail).toContain("BP-2026-114");
    expect(event.detail).toContain("MTR standard baseplate"); // the superseded reference stays traceable
  });
});

describe("Impeller trim does not gate the build (R-1196-004, D-1196-014)", () => {
  it("puts the trim step after part pull, material verification and power-end allocation", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(
      state,
      "e-sarah",
      baseInput({ hydraulicCondition: { kind: "Trim", trimValue: 12.5, reason: "Customer duty point" } })
    );
    const ops = state.routeOps
      .filter((o) => o.unitId === "TEST1196-01_1.1")
      .sort((a, b) => a.seq - b.seq)
      .map((o) => o.name);
    const trimIndex = ops.findIndex((n) => n.includes("Trim/verify impeller"));
    expect(trimIndex).toBeGreaterThan(ops.findIndex((n) => n.startsWith("Pull and tag")));
    expect(trimIndex).toBeGreaterThan(ops.findIndex((n) => n.startsWith("Verify material")));
    expect(trimIndex).toBeGreaterThan(ops.findIndex((n) => n.startsWith("Allocate or build power end")));
  });

  it("omits the trim step entirely when the impeller stays at maximum diameter", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput());
    const ops = state.routeOps.filter((o) => o.unitId === "TEST1196-01_1.1").map((o) => o.name);
    expect(ops.some((n) => n.includes("Trim/verify impeller"))).toBe(false);
  });
});

describe("Selected services", () => {
  it("a selected service creates a ServiceRequirement with open result fields and a release blocker", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput({ selectedServiceKeys: ["hydrostaticTest"] }));
    const services = serviceRequirementsForLine(state, "TEST1196-01-L1");
    expect(services).toHaveLength(1);
    expect(services[0].serviceKey).toBe("hydrostaticTest");
    expect(services[0].status).toBe("Open");
    expect(services[0].blocksRelease).toBe(true);
  });

  it("an unselected service creates no ServiceRequirement at all", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput({ selectedServiceKeys: ["hydrostaticTest"] }));
    const services = serviceRequirementsForLine(state, "TEST1196-01-L1");
    expect(services.some((s) => s.serviceKey === "performanceTest")).toBe(false);
  });
});

describe("Pump1196LineConfig immutability", () => {
  it("mutating the input after creation never affects the stored config", () => {
    let state = buildInitialState();
    const input = baseInput({ selectedServiceKeys: ["hydrostaticTest"] });
    state = create1196PumpEnd(state, "e-sarah", input);
    input.selectedServiceKeys.push("performanceTest"); // mutate the caller's array after the fact
    const config = pump1196ConfigForLine(state, "TEST1196-01-L1")!;
    expect(config.selectedServiceKeys).toEqual(["hydrostaticTest"]);
  });
});

describe("Unit isolation (protected invariant)", () => {
  it("component usage recorded on one Unit never appears on a sibling", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput({ quantity: 2 }));
    const unit1 = "TEST1196-01_1.1";
    const unit2 = "TEST1196-01_1.2";
    const req1 = componentRequirementsForScope(state, "Unit", unit1).find((r) => r.key === "casing")!;
    state = recordComponentUsage1196(state, "e-dave", req1.id, { partNumber: "CAS-UNIT1" });

    const unit1Casing = componentRequirementsForScope(state, "Unit", unit1).find((r) => r.key === "casing")!;
    const unit2Casing = componentRequirementsForScope(state, "Unit", unit2).find((r) => r.key === "casing")!;
    expect(unit1Casing.availabilityState).toBe("Complete");
    expect(unit2Casing.availabilityState).toBe("Required"); // untouched
    expect(state.componentUsages1196.filter((u) => u.unitId === unit2)).toHaveLength(0);

    const view1 = unit1196View(state, unit1)!;
    const view2 = unit1196View(state, unit2)!;
    expect(view1.requirements.some((r) => r.id === req1.id)).toBe(true);
    expect(view2.requirements.some((r) => r.id === req1.id)).toBe(false);
  });
});

describe("Confirmation gate / release blockers", () => {
  it("reports every gate item unresolved before any confirmation", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput());
    const blockers = releaseBlockers1196(state, "TEST1196-01-L1");
    expect(blockers.blocked).toBe(true);
    expect(blockers.unresolvedGateItems).toHaveLength(8);
  });

  it("confirming all 8 gate items and completing blocking services clears the blockers", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput({ selectedServiceKeys: ["hydrostaticTest"] }));
    const lineId = "TEST1196-01-L1";
    const gateKeys = [
      "identityMatchesSource",
      "baselineComplete",
      "nonstandardExplicit",
      "quantityCorrect",
      "packageScopeCorrect",
      "servicesComplete",
      "openQuestionsResolved",
      "coordinatorConfirmed"
    ];
    for (const key of gateKeys) {
      state = confirmGateItem1196(state, "e-sarah", lineId, key, null);
    }
    // Gate confirmed, but the selected service is still Open - still blocked.
    expect(releaseBlockers1196(state, lineId).blocked).toBe(true);
    state = {
      ...state,
      serviceRequirements1196: state.serviceRequirements1196.map((s) => ({ ...s, status: "Complete" as const }))
    };
    const blockers = releaseBlockers1196(state, lineId);
    expect(blockers.unresolvedGateItems).toHaveLength(0);
    expect(blockers.openBlockingServices).toHaveLength(0);
    expect(blockers.blocked).toBe(false);
  });

  it("a later confirmation of the same gate key supersedes the prior one (append-only)", () => {
    let state = buildInitialState();
    state = create1196PumpEnd(state, "e-sarah", baseInput());
    const lineId = "TEST1196-01-L1";
    state = confirmGateItem1196(state, "e-sarah", lineId, "identityMatchesSource", "first pass");
    const firstId = state.confirmationRecords1196.find((c) => c.note === "first pass")!.id;
    state = confirmGateItem1196(state, "e-dave", lineId, "identityMatchesSource", "re-confirmed");
    const second = state.confirmationRecords1196.find((c) => c.note === "re-confirmed")!;
    expect(second.supersedesId).toBe(firstId);
    // Both records remain in the append-only ledger.
    expect(
      state.confirmationRecords1196.filter((c) => c.scopeId === lineId && c.gateKey === "identityMatchesSource")
    ).toHaveLength(2);
  });
});
