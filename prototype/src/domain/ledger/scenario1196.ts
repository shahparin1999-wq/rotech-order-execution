// SAMPLE1001 — the 1196 reference scenario.
//
//   Line 1  1196 3X4-13 MTR, bare pump end, quantity 2
//   Line 2  1196 3X4-13 MTR, complete package, quantity 1
//           customer-supplied motor · custom baseplate drawing
//           impeller trim required · hydrotest + material certificate
//
// This exists to PROVE the ledger contract, so it is deliberately built to
// exercise the awkward cases rather than the happy path:
//
//   - shared line-scoped work (one drawing approval, one material certificate)
//     that must not be duplicated per Unit
//   - a customer-supplied motor that must create receipt and verification work
//     and NO purchasing requirement
//   - an impeller trim that must block final assembly without blocking
//     power-end work
//   - a custom baseplate drawing that must block fabrication only
//
// Fictional data only — no customer names, no real part numbers beyond the
// catalogue-resolved codes. PURE DOMAIN: no React, no localStorage.

import type { EvidenceRecord } from "./evidence";
import type { ExecutionRequirement, FulfillmentRecord, Ledger } from "./requirement";

export const SCENARIO_ORDER_ID = "SAMPLE1001";
export const LINE_1 = "SAMPLE1001-L1"; // bare pump end, qty 2
export const LINE_2 = "SAMPLE1001-L2"; // complete package, qty 1
export const UNIT_1_1 = "SAMPLE1001_1.1";
export const UNIT_1_2 = "SAMPLE1001_1.2";
export const UNIT_2_1 = "SAMPLE1001_2.1";

const AT = "2026-07-27T12:00:00Z";

// Need-by dates, backward-planned from a committed ship date of 2026-08-30.
const NEED_BY = {
  motor: "2026-08-12",
  baseplateDrawing: "2026-08-05",
  castings: "2026-08-10",
  packaging: "2026-08-28"
};

let seq = 0;
function req(partial: Omit<ExecutionRequirement, "id" | "createdAt" | "fulfillmentRefs"> & {
  fulfillmentRefs?: string[];
}): ExecutionRequirement {
  seq += 1;
  return {
    id: `REQ-${String(seq).padStart(3, "0")}`,
    createdAt: AT,
    fulfillmentRefs: partial.fulfillmentRefs ?? [],
    ...partial
  };
}

function pumpEndRequirements(unitId: string, lineId: string): ExecutionRequirement[] {
  return [
    req({
      executionOrderId: SCENARIO_ORDER_ID,
      lineId,
      unitId,
      componentId: `${unitId}-casing`,
      category: "Component",
      source: "FamilyDefinition",
      sourceRef: "R-1196-003",
      description: "150# FF casing — 316SS/316SS",
      mandatory: true,
      blocksRelease: true,
      accountableOwnerType: "Department",
      accountableOwnerId: "Assembly",
      needBy: NEED_BY.castings,
      status: "Planned"
    }),
    req({
      executionOrderId: SCENARIO_ORDER_ID,
      lineId,
      unitId,
      componentId: `${unitId}-impeller`,
      category: "Component",
      source: "FamilyDefinition",
      sourceRef: "R-1196-004",
      description: "Impeller — maximum diameter 13 in",
      mandatory: true,
      blocksRelease: true,
      accountableOwnerType: "Department",
      accountableOwnerId: "Assembly",
      needBy: NEED_BY.castings,
      status: "Planned"
    }),
    req({
      executionOrderId: SCENARIO_ORDER_ID,
      lineId,
      unitId,
      componentId: `${unitId}-powerend`,
      category: "Component",
      source: "FamilyDefinition",
      sourceRef: "R-1196-012",
      description: "Power end with adapter (MTR, 4140/316SS sleeved shaft)",
      mandatory: true,
      blocksRelease: true,
      accountableOwnerType: "Department",
      accountableOwnerId: "Assembly",
      needBy: NEED_BY.castings,
      status: "Planned"
    }),
    // Power-end build work: deliberately NOT blocksWork, so it stays workable
    // while the trim requirement on line 2 is open (proof 5).
    req({
      executionOrderId: SCENARIO_ORDER_ID,
      lineId,
      unitId,
      category: "TaskCoverage",
      source: "FamilyDefinition",
      sourceRef: "route.powerEndBuild",
      description: "Build power end and verify free rotation",
      mandatory: true,
      accountableOwnerType: "Department",
      accountableOwnerId: "Assembly",
      status: "Planned"
    }),
    req({
      executionOrderId: SCENARIO_ORDER_ID,
      lineId,
      unitId,
      category: "Test",
      source: "OperationalRevision",
      sourceRef: "service.hydrostaticTest",
      description: "Hydrostatic test — 1.5 × MAWP, 10 min",
      mandatory: true,
      blocksRelease: true,
      accountableOwnerType: "Department",
      accountableOwnerId: "Quality",
      status: "Planned"
    }),
    req({
      executionOrderId: SCENARIO_ORDER_ID,
      lineId,
      unitId,
      category: "Measurement",
      source: "FamilyDefinition",
      sourceRef: "checklist.finalImpellerDiameter",
      description: "Final impeller diameter recorded and within tolerance",
      mandatory: true,
      blocksRelease: true,
      accountableOwnerType: "Role",
      accountableOwnerId: "Inspector",
      status: "Planned"
    })
  ];
}

export interface Scenario {
  ledger: Ledger;
  evidence: EvidenceRecord[];
  unitLineIds: Record<string, string>;
}

export function buildScenario1196(): Scenario {
  seq = 0;
  const requirements: ExecutionRequirement[] = [];

  // --- Line 1: two bare pump ends, fully isolated from each other ----------
  requirements.push(...pumpEndRequirements(UNIT_1_1, LINE_1));
  requirements.push(...pumpEndRequirements(UNIT_1_2, LINE_1));

  // Shared line-scoped material certificate requirement. ONE requirement
  // covering both Units — not duplicated per Unit (proof 3).
  const materialCert = req({
    executionOrderId: SCENARIO_ORDER_ID,
    lineId: LINE_1,
    category: "Certificate",
    source: "OperationalRevision",
    sourceRef: "service.materialReports",
    description: "EN 10204 3.1 material certificate for the casting heat",
    mandatory: true,
    blocksRelease: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Quality",
    needBy: NEED_BY.castings,
    status: "Planned"
  });
  requirements.push(materialCert);

  // --- Line 2: complete package -------------------------------------------
  requirements.push(...pumpEndRequirements(UNIT_2_1, LINE_2));

  // Impeller trim. blocksWork = true: it gates final assembly, and the
  // power-end build above is deliberately not gated by it (proof 5).
  const trim = req({
    executionOrderId: SCENARIO_ORDER_ID,
    lineId: LINE_2,
    unitId: UNIT_2_1,
    componentId: `${UNIT_2_1}-impeller`,
    category: "TaskCoverage",
    source: "OperationalRevision",
    sourceRef: "route.trimImpeller",
    description: "Trim impeller to 12.49 in and rebalance",
    mandatory: true,
    blocksWork: true,
    blocksRelease: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Machining",
    status: "Planned"
  });
  requirements.push(trim);

  // Custom baseplate drawing — line-scoped shared engineering work. Blocks
  // fabrication only, so it must NOT carry blocksRelease on the pump end
  // (proof 7). One approval, not one per Unit.
  const drawing = req({
    executionOrderId: SCENARIO_ORDER_ID,
    lineId: LINE_2,
    category: "Drawing",
    source: "OperationalRevision",
    sourceRef: "packageDrawing.customBaseplate",
    description: "Custom baseplate drawing BP-2026-114 approved for fabrication",
    mandatory: true,
    blocksWork: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Engineering",
    needBy: NEED_BY.baseplateDrawing,
    status: "Planned"
  });
  requirements.push(drawing);

  const baseplate = req({
    executionOrderId: SCENARIO_ORDER_ID,
    lineId: LINE_2,
    unitId: UNIT_2_1,
    componentId: `${UNIT_2_1}-baseplate`,
    category: "Component",
    source: "FamilyDefinition",
    sourceRef: "package.baseplate",
    description: "Fabricated baseplate per BP-2026-114",
    mandatory: true,
    blocksRelease: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Fabrication",
    needBy: NEED_BY.castings,
    status: "Planned"
  });
  requirements.push(baseplate);

  // Customer-supplied motor. Receipt + verification requirements, and NO
  // purchasing requirement anywhere (proof 6).
  const motorReceipt = req({
    executionOrderId: SCENARIO_ORDER_ID,
    lineId: LINE_2,
    unitId: UNIT_2_1,
    componentId: `${UNIT_2_1}-motor`,
    category: "Component",
    source: "CpqConfiguration",
    sourceRef: "packageScope.motor=CustomerSupplied",
    description: "Customer-supplied motor received (25 HP, 1800 RPM, 460 V, 284JM)",
    mandatory: true,
    blocksRelease: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Receiving",
    needBy: NEED_BY.motor,
    status: "Planned"
  });
  const motorVerify = req({
    executionOrderId: SCENARIO_ORDER_ID,
    lineId: LINE_2,
    unitId: UNIT_2_1,
    componentId: `${UNIT_2_1}-motor`,
    category: "Inspection",
    source: "FamilyDefinition",
    sourceRef: "R-1196-022",
    description: "Verify motor nameplate: HP, RPM, voltage, frame; record serial",
    mandatory: true,
    blocksRelease: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Quality",
    status: "Planned"
  });
  const motorEvidence = req({
    executionOrderId: SCENARIO_ORDER_ID,
    lineId: LINE_2,
    unitId: UNIT_2_1,
    componentId: `${UNIT_2_1}-motor`,
    category: "Evidence",
    source: "FamilyDefinition",
    sourceRef: "evidence.motorNameplate",
    description: "Motor nameplate photograph",
    mandatory: true,
    blocksRelease: true,
    accountableOwnerType: "Role",
    accountableOwnerId: "Technician",
    status: "Planned"
  });
  requirements.push(motorReceipt, motorVerify, motorEvidence);

  requirements.push(
    req({
      executionOrderId: SCENARIO_ORDER_ID,
      lineId: LINE_2,
      unitId: UNIT_2_1,
      category: "Packaging",
      source: "FamilyDefinition",
      sourceRef: "route.packagingShipping",
      description: "Crate and record packaging photographs",
      mandatory: true,
      accountableOwnerType: "Department",
      accountableOwnerId: "Shipping",
      needBy: NEED_BY.packaging,
      status: "Unplanned"
    })
  );

  // --- Fulfilment paths ----------------------------------------------------
  // Deliberately partial: enough that most requirements have a live path, but
  // the packaging requirement above has none, so the coverage rules have
  // something real to find.
  const fulfillments: FulfillmentRecord[] = [];
  let fSeq = 0;
  const addFulfillment = (
    requirementId: string,
    kind: FulfillmentRecord["kind"],
    ref: string,
    status: FulfillmentRecord["status"] = "Open",
    quantity?: number
  ) => {
    fSeq += 1;
    const record: FulfillmentRecord = {
      id: `FUL-${String(fSeq).padStart(3, "0")}`,
      requirementId,
      kind,
      ref,
      quantity,
      status,
      recordedBy: "e-sarah",
      recordedAt: AT
    };
    fulfillments.push(record);
    const target = requirements.find((r) => r.id === requirementId);
    if (target) target.fulfillmentRefs = [...target.fulfillmentRefs, record.id];
    return record;
  };

  for (const r of requirements) {
    if (r.category === "Component" && r.componentId?.endsWith("-motor")) {
      // Customer-supplied: an expectation and a receipt task — never a
      // PurchaseRequirement or PoReference.
      addFulfillment(r.id, "Task", `TASK-expect-${r.id}`);
      continue;
    }
    if (r.category === "Component") {
      addFulfillment(r.id, "Reservation", `RES-${r.id}`);
      continue;
    }
    if (r.category === "TaskCoverage" || r.category === "Drawing") {
      addFulfillment(r.id, "Task", `TASK-${r.id}`);
      continue;
    }
    if (r.category === "Inspection") {
      addFulfillment(r.id, "Checkpoint", `CHK-${r.id}`);
      continue;
    }
    if (r.category === "Measurement") {
      addFulfillment(r.id, "Checkpoint", `MEAS-${r.id}`);
      continue;
    }
    if (r.category === "Test") {
      addFulfillment(r.id, "TestResult", `TEST-${r.id}`);
      continue;
    }
    if (r.category === "Certificate" || r.category === "Evidence") {
      addFulfillment(r.id, "Evidence", `EVID-${r.id}`);
      continue;
    }
    // Packaging intentionally left with no fulfilment path.
  }

  // --- Evidence ------------------------------------------------------------
  // One material certificate covering BOTH line-1 casings: stored once,
  // referenced by each Unit, never copied (proofs 3 and the isolation rule).
  const evidence: EvidenceRecord[] = [
    {
      id: "MC-204",
      evidenceType: "MaterialCertificate",
      attachmentId: "att-mc-204",
      checksum: "a".repeat(64),
      scopeType: "Line",
      scopeId: LINE_1,
      applicableUnitIds: [UNIT_1_1, UNIT_1_2],
      applicableComponentIds: [`${UNIT_1_1}-casing`, `${UNIT_1_2}-casing`],
      createdBy: "e-priya",
      createdAt: AT,
      validationStatus: "Accepted"
    },
    {
      id: "PH-882",
      evidenceType: "NameplatePhoto",
      attachmentId: "att-ph-882",
      checksum: "b".repeat(64),
      scopeType: "Unit",
      scopeId: UNIT_2_1,
      applicableUnitIds: [UNIT_2_1],
      applicableComponentIds: [`${UNIT_2_1}-motor`],
      createdBy: "e-alex",
      createdAt: AT,
      validationStatus: "Pending"
    }
  ];

  return {
    ledger: { requirements, fulfillments },
    evidence,
    unitLineIds: {
      [UNIT_1_1]: LINE_1,
      [UNIT_1_2]: LINE_1,
      [UNIT_2_1]: LINE_2
    }
  };
}

// Requirement ids that carry a source disposition, for the coverage context.
// Everything except the packaging requirement, which is the deliberate gap.
export function dispositionedRequirementIds(scenario: Scenario): string[] {
  return scenario.ledger.requirements
    .filter((r) => r.category === "Component" || r.category === "Material")
    .map((r) => r.id);
}
