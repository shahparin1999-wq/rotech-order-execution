// Configured order → ExecutionRequirements.
//
// This is what makes the ledger LIVE. Until now requirements existed only in
// the SAMPLE1001 test scenario, so nothing a coordinator configured produced
// real demand — and receiving would have had nothing genuine to match against.
//
// Scoping follows the rule the ledger already enforces: physical parts and
// per-pump tests are Unit-scoped, because each pump gets its own casing and its
// own hydrotest. Drawings are Line-scoped, because one approved drawing governs
// every Unit on the line and must not be duplicated N times. Shared *evidence*
// (a heat certificate covering five castings) is handled separately by
// EvidenceRecord applicability, not by copying requirements.
//
// PURE DOMAIN — no React, no localStorage.

import type { ConfiguredComponentRecord, ConfiguredLineRecord } from "../types";
import type { ExecutionRequirement, FulfillmentRecord, RequirementSource } from "./requirement";

export interface GenerateRequirementsInput {
  executionOrderId: string;
  line: ConfiguredLineRecord;
  /** Unit ids this line generated; empty for a non-unit-bearing line. */
  unitIds: string[];
  /** Departments own generated work until a person is scheduled onto it. */
  createdAt: string;
  /** Deterministic id prefix so tests are stable. */
  idPrefix?: string;
}

export interface GeneratedLedger {
  requirements: ExecutionRequirement[];
  fulfillments: FulfillmentRecord[];
}

// Which department is accountable for getting each component into the building.
// Accountable OWNER, not execution assignee — a named technician weeks ahead
// would be a fake assignment.
const OWNER_BY_COMPONENT: Record<string, string> = {
  casing: "Purchasing",
  impeller: "Purchasing",
  stuffingBoxCover: "Purchasing",
  shaftKit: "Purchasing",
  powerFrame: "Purchasing",
  seal: "Purchasing",
  sealGland: "Purchasing",
  stubShaft: "Purchasing",
  adapter: "Purchasing",
  baseplate: "Purchasing",
  motor: "Purchasing",
  coupling: "Purchasing",
  couplingGuard: "Purchasing",
  accessories: "Purchasing"
};

// A component whose scope says the customer supplies it must create receipt and
// verification work but NEVER a purchasing demand (INV-006). The configurator
// records that as free text today, so the check is deliberately literal rather
// than clever — a value it does not recognise is treated as Rotech-supplied,
// which fails safe (it creates demand rather than silently expecting nothing).
export function isCustomerSupplied(component: ConfiguredComponentRecord): boolean {
  const haystack = `${component.brand} ${component.notes} ${component.reference}`.toLowerCase();
  return /customer[- ]?(supplied|furnished)|by customer|cfe/.test(haystack);
}

function idFactory(prefix: string) {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${String(n).padStart(3, "0")}`;
  };
}

/**
 * Generates the requirement set for one configured line.
 *
 * A manually configured line is sourced "OperationalRevision" rather than
 * "CpqConfiguration": it did not come from a CPQ package, and the distinction
 * matters because it changes who may waive the requirement.
 */
export function requirementsFromConfiguredLine(input: GenerateRequirementsInput): GeneratedLedger {
  const { executionOrderId, line, unitIds, createdAt } = input;
  const nextReqId = idFactory(input.idPrefix ?? `REQ-${line.lineId}`);
  const nextFulId = idFactory(`FUL-${line.lineId}`);

  const requirements: ExecutionRequirement[] = [];
  const fulfillments: FulfillmentRecord[] = [];

  const source: RequirementSource = "OperationalRevision";
  const sourceRef = `configurator:${line.lineId}`;

  // --- Component requirements: one per in-scope row, per Unit -------------
  for (const unitId of unitIds) {
    for (const component of line.components) {
      if (!component.inScope) continue; // not in scope creates nothing (INV-007)

      const customerSupplied = isCustomerSupplied(component);
      const spec = [component.material, component.partNumber].filter(Boolean).join(" · ");

      const requirement: ExecutionRequirement = {
        id: nextReqId(),
        executionOrderId,
        lineId: line.lineId,
        unitId,
        componentId: `${unitId}-${component.key}`,
        category: "Component",
        source,
        sourceRef,
        description: spec ? `${component.label} — ${spec}` : component.label,
        mandatory: true,
        // A missing part stops its own operation and stops release, but not
        // unrelated work — that is what lets power-end build continue while an
        // impeller is still on order.
        blocksWork: true,
        blocksRelease: true,
        accountableOwnerType: "Department",
        accountableOwnerId: customerSupplied
          ? "Receiving"
          : OWNER_BY_COMPONENT[component.key] ?? "Purchasing",
        status: "Unplanned",
        fulfillmentRefs: [],
        createdAt
      };
      requirements.push(requirement);

      // A customer-supplied item gets an expectation to receive and verify, and
      // no purchase demand at all.
      if (customerSupplied) {
        const fulfillment: FulfillmentRecord = {
          id: nextFulId(),
          requirementId: requirement.id,
          kind: "Receipt",
          ref: `customer-supplied:${component.key}`,
          status: "Open",
          recordedBy: line.createdBy,
          recordedAt: createdAt
        };
        fulfillments.push(fulfillment);
        requirement.fulfillmentRefs.push(fulfillment.id);
        requirement.status = "Planned";
      }
    }
  }

  // --- Test requirements: per Unit, because each pump is tested ------------
  for (const unitId of unitIds) {
    for (const scope of line.testingRequirements ?? []) {
      requirements.push({
        id: nextReqId(),
        executionOrderId,
        lineId: line.lineId,
        unitId,
        category: "Test",
        source,
        sourceRef: `${sourceRef}:testing`,
        description: scope,
        mandatory: true,
        blocksRelease: true,
        accountableOwnerType: "Department",
        accountableOwnerId: "Quality",
        status: "Unplanned",
        fulfillmentRefs: [],
        createdAt
      });
    }
  }

  // --- Drawing requirement: Line-scoped, never duplicated per Unit --------
  if (line.buildType === "CompletePackage") {
    requirements.push({
      id: nextReqId(),
      executionOrderId,
      lineId: line.lineId,
      category: "Drawing",
      source,
      sourceRef: `${sourceRef}:packageDrawing`,
      description: "Approved package/baseplate drawing",
      mandatory: true,
      // Blocks fabrication only — not the whole Unit.
      blocksWork: true,
      accountableOwnerType: "Department",
      accountableOwnerId: "Engineering",
      status: "Unplanned",
      fulfillmentRefs: [],
      createdAt
    });
  }

  return { requirements, fulfillments };
}

/** Convenience for a whole order. */
export function requirementsFromConfiguredOrder(
  executionOrderId: string,
  lines: Array<{ line: ConfiguredLineRecord; unitIds: string[] }>,
  createdAt: string
): GeneratedLedger {
  const requirements: ExecutionRequirement[] = [];
  const fulfillments: FulfillmentRecord[] = [];
  for (const { line, unitIds } of lines) {
    const generated = requirementsFromConfiguredLine({
      executionOrderId,
      line,
      unitIds,
      createdAt
    });
    requirements.push(...generated.requirements);
    fulfillments.push(...generated.fulfillments);
  }
  return { requirements, fulfillments };
}
