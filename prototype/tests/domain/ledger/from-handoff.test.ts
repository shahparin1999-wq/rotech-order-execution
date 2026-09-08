import { describe, expect, it } from "vitest";
import { componentsFromHandoffLine, demandKind, requirementsFromHandoffLine, splitMaterialBuild } from "@/domain/ledger/fromHandoff";
import type { HandoffLine } from "@/domain/orderHandoffV2";
import { requiredSpecFromDescription } from "@/domain/ledger/componentUsage";

const AT = "2026-09-08T10:00:00Z";

function barePumpLine(overrides: Partial<HandoffLine> = {}): HandoffLine {
  return {
    id: "LINEAGE-1",
    lineNumber: 1,
    lineType: "pump",
    executionDisposition: "unit-bearing",
    quantity: 5,
    product: { family: "1196", model: "1196", pumpSize: "3X4-13" },
    pumpBuild: { pumpSize: "3X4-13", frameSize: "MTR", materialBuild: "DI/316SS", shaftType: "4140/316SS SLEEVED SHAFT", sbcType: "STD BORE" },
    packageBuild: {
      packageType: "pump-only",
      completePackage: false,
      motor: { selectionMode: "not-included", responsibility: "by-others" },
      baseplate: { selectionMode: "not-included", responsibility: "by-others" },
      coupling: { selectionMode: "not-included", responsibility: "by-others" },
      couplingGuard: { selectionMode: "not-included", responsibility: "by-others" }
    },
    seal: { sealOption: "ROTECH SHOP MOUNT ROTECH SEAL", sealArrangement: "Single cartridge", sealMoc: "CAR/SIC/FKM" },
    testingRequirements: ["NON-WITNESSED HYDROSTATIC TEST"],
    bom: [
      { sourceRowId: "r1", description: "Casing", partCode: "100-34-M-A-1F-DI", quantity: 1, uom: "EA", source: "configured" },
      { sourceRowId: "r2", description: "Bearing 6309", partCode: "508-M-A-AD-S", quantity: 1, uom: "EA", source: "configured" }
    ],
    ...overrides
  };
}

const UNITS = ["26SO01234_1.1", "26SO01234_1.2", "26SO01234_1.3", "26SO01234_1.4", "26SO01234_1.5"];

describe("componentsFromHandoffLine — demand comes from configuration, not the reference BOM", () => {
  it("splits a material build into casing and impeller materials", () => {
    expect(splitMaterialBuild("DI/316SS")).toEqual({ casing: "DI", impeller: "316SS" });
    expect(splitMaterialBuild("CD4MCU")).toEqual({ casing: "CD4MCU", impeller: "CD4MCU" });
    expect(splitMaterialBuild(undefined)).toEqual({});
  });

  it("derives wet end, power end and seal for a bare pump end; package parts stay out of scope", () => {
    const components = componentsFromHandoffLine(barePumpLine());
    const byKey = Object.fromEntries(components.map((c) => [c.key, c]));
    expect(byKey.casing.material).toBe("DI");
    expect(byKey.impeller.material).toBe("316SS");
    expect(byKey.stuffingBoxCover.material).toBe("DI");
    expect(byKey.shaftKit.material).toBe("4140/316SS SLEEVED SHAFT");
    expect(byKey.seal.material).toBe("CAR/SIC/FKM");
    expect(demandKind(byKey.motor)).toBe("none");
    expect(demandKind(byKey.baseplate)).toBe("none");
    expect(demandKind(byKey.casing)).toBe("purchase");
    // The 45-row technical BOM never appears as demand: no bearing component.
    expect(byKey.bearings).toBeUndefined();
  });

  it("a customer-supplied motor creates a receipt expectation and no purchase", () => {
    const line = barePumpLine({
      lineType: "pump-package",
      packageBuild: {
        packageType: "skid-package",
        completePackage: true,
        motor: { selectionMode: "customer-supplied", responsibility: "in-scope", hp: 40, frame: "324T" },
        baseplate: { selectionMode: "standard", responsibility: "in-scope" },
        coupling: { selectionMode: "standard", responsibility: "in-scope" },
        couplingGuard: { selectionMode: "standard", responsibility: "in-scope" }
      }
    });
    const components = componentsFromHandoffLine(line);
    const motor = components.find((c) => c.key === "motor")!;
    expect(motor.label).toBe("Motor 40 HP 324T");
    expect(demandKind(motor)).toBe("receipt");
    expect(demandKind(components.find((c) => c.key === "baseplate")!)).toBe("purchase");
  });
});

describe("requirementsFromHandoffLine — Qty 5 → per-Unit demand", () => {
  it("creates one Component requirement per in-scope component per Unit, plus tests per Unit", () => {
    const { requirements, fulfillments, skipped } = requirementsFromHandoffLine({
      executionOrderId: "26SO01234",
      lineId: "26SO01234-L1",
      lineNumber: 1,
      line: barePumpLine(),
      unitIds: UNITS,
      snapshotId: "cfgsnap-1",
      createdAt: AT,
      needBy: "2026-10-15"
    });
    const components = requirements.filter((r) => r.category === "Component");
    const tests = requirements.filter((r) => r.category === "Test");
    // casing, impeller, SBC, shaft kit, power frame, seal = 6 per Unit
    expect(components).toHaveLength(6 * 5);
    expect(tests).toHaveLength(5);
    expect(fulfillments).toHaveLength(0);
    expect(new Set(components.map((r) => r.unitId))).toEqual(new Set(UNITS));
    const casing14 = components.find((r) => r.unitId === "26SO01234_1.4" && r.componentId?.endsWith("-casing"))!;
    expect(casing14.description).toBe("Casing 3X4-13 MTR — DI");
    expect(requiredSpecFromDescription(casing14.description)).toMatchObject({ material: "DI" });
    expect(requiredSpecFromDescription(casing14.description).partNumber).toBeUndefined();
    expect(casing14.source).toBe("CpqConfiguration");
    expect(casing14.sourceRef).toBe("cfgsnap:cfgsnap-1#pumpBuild.materialBuild");
    expect(casing14.status).toBe("Unplanned");
    expect(casing14.blocksWork).toBe(true);
    expect(casing14.blocksRelease).toBe(true);
    expect(casing14.needBy).toBe("2026-10-15");
    expect(casing14.accountableOwnerId).toBe("Purchasing");
    // Every id is unique and stable.
    expect(new Set(requirements.map((r) => r.id)).size).toBe(requirements.length);
    expect(requirements[0].id).toBe("REQ-26SO01234-L1-001");
    expect(skipped.map((s) => s.componentKey).sort()).toEqual(["baseplate", "coupling", "couplingGuard", "motor"]);
  });

  it("a complete package adds one line-scoped drawing requirement, never five", () => {
    const line = barePumpLine({
      lineType: "pump-package",
      packageBuild: { packageType: "skid-package", completePackage: true, motor: { selectionMode: "standard", responsibility: "in-scope" } }
    });
    const { requirements } = requirementsFromHandoffLine({
      executionOrderId: "26SO01234",
      lineId: "26SO01234-L1",
      lineNumber: 1,
      line,
      unitIds: UNITS,
      snapshotId: "cfgsnap-1",
      createdAt: AT
    });
    const drawings = requirements.filter((r) => r.category === "Drawing");
    expect(drawings).toHaveLength(1);
    expect(drawings[0].unitId).toBeUndefined();
    expect(drawings[0].lineId).toBe("26SO01234-L1");
    expect(drawings[0].blocksWork).toBe(true);
    expect(drawings[0].blocksRelease).toBeUndefined();
  });

  it("customer-supplied components get an open Receipt expectation and start Planned", () => {
    const line = barePumpLine({
      packageBuild: { completePackage: true, motor: { selectionMode: "customer-supplied", responsibility: "in-scope" } }
    });
    const { requirements, fulfillments } = requirementsFromHandoffLine({
      executionOrderId: "26SO01234",
      lineId: "26SO01234-L1",
      lineNumber: 1,
      line,
      unitIds: ["26SO01234_1.1"],
      snapshotId: "cfgsnap-1",
      createdAt: AT
    });
    const motor = requirements.find((r) => r.componentId?.endsWith("-motor"))!;
    expect(motor.status).toBe("Planned");
    expect(motor.accountableOwnerId).toBe("Receiving");
    expect(fulfillments).toHaveLength(1);
    expect(fulfillments[0]).toMatchObject({ kind: "Receipt", status: "Open", requirementId: motor.id });
  });

  it("non-unit-bearing lines generate nothing (loose scope is handled by fulfilment content later)", () => {
    const { requirements } = requirementsFromHandoffLine({
      executionOrderId: "26SO01234",
      lineId: "26SO01234-L2",
      lineNumber: 2,
      line: barePumpLine({ lineType: "spare", executionDisposition: "line-level-scope", quantity: 2 }),
      unitIds: [],
      snapshotId: "cfgsnap-2",
      createdAt: AT
    });
    expect(requirements).toHaveLength(0);
  });
});
