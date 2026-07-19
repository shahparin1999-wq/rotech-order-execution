// Frozen-snapshot builder for the Unit QC and Manufacturing History preview.
// The snapshot may contain only the target Unit's records (protected
// invariant: no cross-Unit query paths in document generation).

import type {
  AppState,
  Attachment,
  AuditEvent,
  ChecklistResponse,
  MaterialChange,
  RouteOperation,
  SpecialInstruction,
  Task,
  Unit
} from "./types";
import { orderByNumber } from "./selectors";

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
      customer: order.customer,
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
    documentName: `${unitId}_Unit_QC_and_Manufacturing_History.pdf`
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
    customer: order.customer,
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
