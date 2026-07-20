// Frozen-snapshot builder for the Unit QC and Manufacturing History preview.
// The snapshot may contain only the target Unit's records (protected
// invariant: no cross-Unit query paths in document generation).

import type {
  AppState,
  Attachment,
  AuditEvent,
  ChecklistResponse,
  MaterialChange,
  PalletRecord,
  RouteOperation,
  SpecialInstruction,
  Task,
  Unit
} from "./types";
import { currentResponses, customerName, orderByNumber } from "./selectors";

export interface UnitHistorySnapshot {
  unit: Unit;
  order: {
    orderNumber: string;
    customer: string;
    customerPo: string;
    dueDate: string;
    productFamily: string;
    orderType: string;
    facility: string;
  };
  orderedSpecification: { material: string; model: string; size: string };
  approvedChanges: MaterialChange[];
  specialInstructions: SpecialInstruction[];
  asBuiltSpecification: { material: string; serial: string | null };
  route: RouteOperation[];
  tasks: Task[];
  responses: ChecklistResponse[];
  attachments: Attachment[];
  auditEvents: AuditEvent[];
  // Resolved through the pallet's explicit Unit list, never by order number.
  // A Unit with no shipment of its own gets null rather than a sibling's.
  shipping: PalletRecord | null;
  documentName: string;
}

export function buildUnitHistorySnapshot(
  state: AppState,
  unitId: string
): UnitHistorySnapshot {
  const unit = state.units.find((u) => u.unitId === unitId);
  if (!unit) throw new Error(`Unknown unit ${unitId}`);
  const order = orderByNumber(state, unit.orderNumber);
  if (!order) throw new Error(`Unknown order ${unit.orderNumber}`);

  return {
    unit,
    order: {
      orderNumber: order.orderNumber,
      customer: customerName(state, order.customerId),
      customerPo: order.customerPo,
      dueDate: order.dueDate,
      productFamily: order.productFamily,
      orderType: order.orderType,
      facility: order.facility
    },
    orderedSpecification: {
      material: unit.orderedMaterial,
      model: unit.model,
      size: unit.size
    },
    approvedChanges: state.materialChanges.filter(
      (m) => m.unitId === unitId && m.status === "Approved"
    ),
    specialInstructions: state.specialInstructions.filter((s) => s.unitId === unitId),
    asBuiltSpecification: { material: unit.asBuiltMaterial, serial: unit.serial },
    route: state.routeOps
      .filter((op) => op.unitId === unitId)
      .sort((a, b) => a.seq - b.seq),
    tasks: state.tasks.filter((t) => t.unitId === unitId),
    responses: state.responses.filter((r) => r.unitId === unitId),
    attachments: state.attachments.filter((a) => a.unitId === unitId),
    auditEvents: state.auditEvents.filter((e) => e.unitId === unitId),
    shipping: state.pallets.find((p) => p.unitIds.includes(unitId)) ?? null,
    documentName: `${unitId}_Unit_QC_and_Manufacturing_History.pdf`
  };
}

export interface ReleasePreview {
  /** The current final-quality response is an explicit pass. */
  qualityPassed: boolean;
  /** Nothing in this Unit's own quality record blocks a release. */
  releaseEligible: boolean;
  /**
   * Always false in the prototype. The 1196 route, tolerances and evidence
   * rules (decision D-013) are unapproved, so no preview may ever present as
   * a controlled quality record.
   */
  controlled: boolean;
  label: string;
  blockers: string[];
}

// Derives release presentation from the Unit's actual quality record rather
// than from a stored status value, so a failed or outstanding inspection can
// never appear as released.
export function evaluateReleasePreview(
  state: AppState,
  snapshot: UnitHistorySnapshot
): ReleasePreview {
  const current = currentResponses(state, snapshot.unit.unitId);
  const finalQuality = current.get("final-quality");
  const qualityPassed = finalQuality?.value === "pass" && finalQuality.state === "Saved";

  const blockers: string[] = [];
  if (!finalQuality) {
    blockers.push("Final quality inspection has not been recorded.");
  } else if (finalQuality.value === "fail") {
    blockers.push("Final quality inspection failed.");
  } else if (!qualityPassed) {
    blockers.push("Final quality inspection is outstanding.");
  }

  const failed = [...current.values()].filter((r) => r.value === "fail");
  if (failed.length > 0) {
    blockers.push(`${failed.length} checklist item(s) recorded as fail.`);
  }
  const needsReview = [...current.values()].filter((r) => r.state === "NeedsReview");
  if (needsReview.length > 0) {
    blockers.push(`${needsReview.length} response(s) awaiting quality review.`);
  }
  const errored = [...current.values()].filter((r) => r.state === "Error");
  if (errored.length > 0) {
    blockers.push(`${errored.length} response(s) failed to save.`);
  }
  const pending = [...current.values()].filter((r) => r.state === "Pending");
  if (pending.length > 0) {
    blockers.push(`${pending.length} response(s) not yet confirmed saved.`);
  }

  const releaseEligible = blockers.length === 0;
  return {
    qualityPassed,
    releaseEligible,
    controlled: false,
    label: releaseEligible
      ? "Simulated release - not a controlled record"
      : "Draft - not released",
    blockers
  };
}

export interface OrderSummarySnapshot {
  orderNumber: string;
  customer: string;
  customerPo: string;
  units: Array<{
    unitId: string;
    serial: string | null;
    status: Unit["status"];
    asBuiltMaterial: string;
    documentName: string;
  }>;
}

export function buildOrderSummarySnapshot(
  state: AppState,
  orderNumber: string
): OrderSummarySnapshot {
  const order = orderByNumber(state, orderNumber);
  if (!order) throw new Error(`Unknown order ${orderNumber}`);
  return {
    orderNumber,
    customer: customerName(state, order.customerId),
    customerPo: order.customerPo,
    units: state.units
      .filter((u) => u.orderNumber === orderNumber)
      .sort((a, b) => a.lineNumber - b.lineNumber || a.sequence - b.sequence)
      .map((u) => ({
        unitId: u.unitId,
        serial: u.serial,
        status: u.status,
        asBuiltMaterial: u.asBuiltMaterial,
        documentName: `${u.unitId}_Unit_QC_and_Manufacturing_History.pdf`
      }))
  };
}
