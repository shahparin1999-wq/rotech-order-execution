// Inventory intake and outtake, wired into app state.
//
// The pure rules live in domain/inventory/*. This module is the thin layer that
// applies them to AppState and writes the audit trail — every function here
// appends movements rather than editing a quantity, so the history of how stock
// got where it is can never be lost.

import type { AppState, AuditEvent, Task } from "./types";
import { recomputeUnitProjection } from "./projections";
import { evaluateMatch, requiredSpecFromDescription, type ComponentUsage } from "./ledger/componentUsage";
import {
  advanceRequirement,
  appendFulfillment,
  materialGateClear,
  MATERIAL_GATE_REASON,
  openReceiptFulfillmentsForRef,
  requirementForInstall
} from "./ledger/requirementFlow";
import {
  locationLabel,
  missingTrackingFields,
  permitsDirectAcceptance,
  categoryFor,
  trackingPolicyFor,
  type InventoryCategory,
  type InventoryIdentity,
  type TrackingPolicy
} from "./inventory/identity";
import {
  activeUnitAllocation,
  available,
  currentLocation,
  onHand,
  qualityState,
  validateMovement,
  type InventoryMovement,
  type MovementType
} from "./inventory/movement";
import type { InventoryReceipt, InventoryReceiptLine, ReceiptKind } from "./inventory/receipt";
import { checkIssueToUnit } from "./inventory/issue";
import { buildPutAwayJob } from "./inventory/internalJobs";
import { mockPublicRef } from "./ids";

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function takeId(state: AppState, prefix: string): [string, AppState] {
  const id = `${prefix}-${state.nextId}`;
  return [id, { ...state, nextId: state.nextId + 1 }];
}

function audit(state: AppState, ev: Omit<AuditEvent, "id">): AppState {
  const [id, s] = takeId(state, "ae");
  return { ...s, auditEvents: [...s.auditEvents, { id, ...ev }] };
}

function appendMovement(
  state: AppState,
  movement: Omit<InventoryMovement, "id">
): AppState {
  const [id, s] = takeId(state, "mv");
  const full: InventoryMovement = { id, ...movement };
  const validation = validateMovement(full);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return { ...s, inventoryMovements: [...s.inventoryMovements, full] };
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export interface ReceiveInput {
  kind: ReceiptKind;
  poNumber?: string;
  poLine?: string;
  vendor?: string;
  packingSlip?: string;
  facility: string;
  partNumber: string;
  description: string;
  material?: string;
  quantity: number;
  uom?: string;
  /** Defaults from the component role when not given. */
  trackingPolicy?: TrackingPolicy;
  componentKey?: string;
  /** Defaults from the component role when not given. */
  category?: InventoryCategory;
  /** Category-specific attributes (size/frame/family for a casting, hp/frame for a motor…). */
  attributes?: Record<string, string>;
  serialNumber?: string;
  lotNumber?: string;
  heatNumber?: string;
  certificateRef?: string;
  /** The requirement a person explicitly confirmed this satisfies. */
  matchedRequirementId?: string;
  /** The referenced vendor PO line this delivery is booked against. */
  vendorPoLineId?: string;
  notes?: string;
}

/**
 * Receives goods. Everything lands in QUARANTINE unless its tracking policy
 * permits direct acceptance (INV-002) — the dock is not acceptance, and this
 * is the gate that stops unverified material reaching assembly.
 */
export function receiveInventory(
  state: AppState,
  actorId: string,
  input: ReceiveInput,
  at?: string
): AppState {
  const ts = nowIso(at);
  const policy = input.trackingPolicy ?? trackingPolicyFor(input.componentKey ?? "");

  if (!input.partNumber.trim()) throw new Error("A part number is required to receive");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Received quantity must be greater than zero");
  }

  // The policy's traceability field is not optional — a heat-tracked casting
  // with no heat number is not receivable.
  const missing = missingTrackingFields(policy, input);
  if (missing.length) {
    throw new Error(`${policy} parts require a ${missing.join(", ")} number before they can be received`);
  }

  let s = state;
  const [receiptId, s1] = takeId(s, "rcv");
  s = s1;
  const [lineId, s2] = takeId(s, "rcvl");
  s = s2;
  const [identityId, s3] = takeId(s, "inv");
  s = s3;

  const receipt: InventoryReceipt = {
    id: receiptId,
    kind: input.kind,
    poNumber: input.poNumber?.trim() || undefined,
    poLine: input.poLine?.trim() || undefined,
    vendor: input.vendor?.trim() || undefined,
    packingSlip: input.packingSlip?.trim() || undefined,
    facility: input.facility,
    receivedBy: actorId,
    receivedAt: ts,
    notes: input.notes?.trim() || undefined
  };

  const line: InventoryReceiptLine = {
    id: lineId,
    receiptId,
    partNumber: input.partNumber.trim(),
    description: input.description.trim(),
    material: input.material?.trim() || undefined,
    quantity: input.quantity,
    uom: input.uom ?? "EA",
    trackingPolicy: policy,
    serialNumber: input.serialNumber?.trim() || undefined,
    lotNumber: input.lotNumber?.trim() || undefined,
    heatNumber: input.heatNumber?.trim() || undefined,
    certificateRef: input.certificateRef?.trim() || undefined,
    disposition: input.matchedRequirementId ? "ExactMatch" : "UnknownDemand",
    matchedRequirementId: input.matchedRequirementId,
    vendorPoLineId: input.vendorPoLineId?.trim() || undefined,
    unmatchedReason: input.matchedRequirementId ? undefined : "No demand confirmed at receipt"
  };

  const identity: InventoryIdentity = {
    id: identityId,
    publicRef: mockPublicRef(`inv:${identityId}`),
    partNumber: line.partNumber,
    description: line.description,
    material: line.material ?? "",
    componentKey: input.componentKey?.trim() || undefined,
    category: input.category ?? categoryFor(input.componentKey),
    attributes: input.attributes,
    trackingPolicy: policy,
    serialNumber: line.serialNumber,
    lotNumber: line.lotNumber,
    heatNumber: line.heatNumber,
    receivedQuantity: input.quantity,
    uom: line.uom,
    facility: input.facility,
    receiptId,
    receiptLineId: lineId,
    createdAt: ts,
    createdBy: actorId
  };

  s = {
    ...s,
    inventoryReceipts: [...s.inventoryReceipts, receipt],
    inventoryReceiptLines: [...s.inventoryReceiptLines, line],
    inventoryIdentities: [...s.inventoryIdentities, identity],
    qrIdentities: [
      ...s.qrIdentities,
      {
        publicRef: identity.publicRef,
        recordType: "InventoryItem",
        targetId: identityId,
        label: `${identity.partNumber} — ${identity.description}`,
        printEvents: []
      }
    ]
  };

  s = appendMovement(s, {
    inventoryIdentityId: identityId,
    type: "Received",
    quantity: input.quantity,
    toLocationId: `LOC-${input.facility === "Houston" ? "HOU" : "MIS"}-RECV`,
    requirementId: input.matchedRequirementId,
    recordedBy: actorId,
    recordedAt: ts
  });

  // INV-002. Only an untracked consumable skips the cage.
  if (permitsDirectAcceptance(policy)) {
    s = appendMovement(s, {
      inventoryIdentityId: identityId,
      type: "InspectionAccepted",
      quantity: 0,
      recordedBy: actorId,
      recordedAt: ts
    });
  } else {
    s = appendMovement(s, {
      inventoryIdentityId: identityId,
      type: "Quarantined",
      quantity: 0,
      toLocationId: `LOC-${input.facility === "Houston" ? "HOU" : "MIS"}-QUAR`,
      recordedBy: actorId,
      recordedAt: ts
    });
  }

  // A receipt booked against confirmed demand is an OPEN receipt fulfilment:
  // it becomes progress only when inspection accepts it (INV-003).
  if (input.matchedRequirementId) {
    const [fulId, s4] = takeId(s, "ful");
    s = s4;
    let ledger = appendFulfillment(
      { requirements: s.requirements, fulfillments: s.fulfillments },
      {
        id: fulId,
        requirementId: input.matchedRequirementId,
        kind: "Receipt",
        ref: lineId,
        quantity: input.quantity,
        status: "Open",
        recordedBy: actorId,
        recordedAt: ts
      }
    );
    ledger = advanceRequirement(ledger, input.matchedRequirementId, "Planned");
    s = { ...s, requirements: ledger.requirements, fulfillments: ledger.fulfillments };
  }

  return audit(s, {
    at: ts,
    actorId,
    action: "inventory.received",
    targetType: "InventoryItem",
    targetId: identityId,
    unitId: null,
    detail:
      `Received ${input.quantity} ${line.uom} of ${line.partNumber} (${line.description})` +
      `${receipt.poNumber ? ` against PO ${receipt.poNumber}${receipt.poLine ? ` line ${receipt.poLine}` : ""}` : ""}` +
      ` — ${permitsDirectAcceptance(policy) ? "accepted directly" : "quarantined pending inspection"}.`,
    supersedesEventId: null
  });
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

export function inspectInventory(
  state: AppState,
  actorId: string,
  identityId: string,
  decision: "Accept" | "Reject",
  note: string,
  at?: string
): AppState {
  const identity = state.inventoryIdentities.find((i) => i.id === identityId);
  if (!identity) throw new Error(`Unknown inventory item ${identityId}`);
  if (decision === "Reject" && !note.trim()) {
    throw new Error("Rejecting incoming material requires a reason");
  }
  const ts = nowIso(at);

  let s = appendMovement(state, {
    inventoryIdentityId: identityId,
    type: decision === "Accept" ? "InspectionAccepted" : "InspectionRejected",
    quantity: 0,
    reason: note.trim() || undefined,
    recordedBy: actorId,
    recordedAt: ts
  });

  // Inspection is what turns a booked receipt into progress on the demand it
  // was received for; a rejection leaves the requirement open with the
  // rejected receipt retained as history.
  let ledger = { requirements: s.requirements, fulfillments: s.fulfillments };
  for (const f of openReceiptFulfillmentsForRef(ledger, identity.receiptLineId)) {
    ledger = {
      ...ledger,
      fulfillments: ledger.fulfillments.map((x) =>
        x.id === f.id ? { ...x, status: decision === "Accept" ? ("Complete" as const) : ("Rejected" as const) } : x
      )
    };
    if (decision === "Accept") ledger = advanceRequirement(ledger, f.requirementId, "InProgress");
  }
  s = { ...s, requirements: ledger.requirements, fulfillments: ledger.fulfillments };

  return audit(s, {
    at: ts,
    actorId,
    action: decision === "Accept" ? "inventory.accepted" : "inventory.rejected",
    targetType: "InventoryItem",
    targetId: identityId,
    unitId: null,
    detail: `${identity.partNumber} ${decision === "Accept" ? "accepted" : "rejected"} at incoming inspection${note.trim() ? `: ${note.trim()}` : "."}`,
    supersedesEventId: null
  });
}

export function putAwayInventory(
  state: AppState,
  actorId: string,
  identityId: string,
  locationId: string,
  at?: string
): AppState {
  const identity = state.inventoryIdentities.find((i) => i.id === identityId);
  if (!identity) throw new Error(`Unknown inventory item ${identityId}`);
  if (qualityState(state.inventoryMovements, identityId) !== "Accepted") {
    throw new Error("Only accepted material can be put away");
  }
  const ts = nowIso(at);
  const location = state.inventoryLocations.find((l) => l.id === locationId);

  const s = appendMovement(state, {
    inventoryIdentityId: identityId,
    type: "PutAway",
    quantity: 0,
    toLocationId: locationId,
    recordedBy: actorId,
    recordedAt: ts
  });

  return audit(s, {
    at: ts,
    actorId,
    action: "inventory.putaway",
    targetType: "InventoryItem",
    targetId: identityId,
    unitId: null,
    detail: `${identity.partNumber} put away at ${locationLabel(location)}.`,
    supersedesEventId: null
  });
}

/** Freezes stock against an order/Unit. This is the "reserved" in the plan. */
export function reserveInventory(
  state: AppState,
  actorId: string,
  identityId: string,
  unitId: string,
  quantity: number,
  requirementId?: string,
  at?: string
): AppState {
  const identity = state.inventoryIdentities.find((i) => i.id === identityId);
  if (!identity) throw new Error(`Unknown inventory item ${identityId}`);
  if (qualityState(state.inventoryMovements, identityId) !== "Accepted") {
    throw new Error("Only accepted material can be reserved");
  }
  const held = activeUnitAllocation(state.inventoryMovements, identityId);
  if (held && held !== unitId) {
    throw new Error(`Already reserved for ${held}`);
  }
  if (available(state.inventoryMovements, identityId) < quantity) {
    throw new Error(`Only ${available(state.inventoryMovements, identityId)} available`);
  }
  const ts = nowIso(at);

  const s = appendMovement(state, {
    inventoryIdentityId: identityId,
    type: "Reserved",
    quantity,
    unitId,
    requirementId,
    recordedBy: actorId,
    recordedAt: ts
  });

  return audit(s, {
    at: ts,
    actorId,
    action: "inventory.reserved",
    targetType: "InventoryItem",
    targetId: identityId,
    unitId,
    detail: `${identity.partNumber} reserved to ${unitId}.`,
    supersedesEventId: null
  });
}

// ---------------------------------------------------------------------------
// Outtake
// ---------------------------------------------------------------------------

/**
 * Issues stock to a Unit. Every gate is checked first and the whole thing fails
 * closed with a named reason — a mismatch must never quietly become the
 * as-built record (INV-010).
 */
export function issueInventoryToUnit(
  state: AppState,
  actorId: string,
  identityId: string,
  unitId: string,
  quantity: number,
  at?: string
): AppState {
  const identity = state.inventoryIdentities.find((i) => i.id === identityId);
  if (!identity) throw new Error(`Unknown inventory item ${identityId}`);

  const check = checkIssueToUnit({
    identity,
    movements: state.inventoryMovements,
    ledger: { requirements: state.requirements, fulfillments: state.fulfillments },
    unitId,
    quantity
  });
  if (!check.ok) throw new Error(check.message ?? "Cannot issue this item to this Unit");

  const ts = nowIso(at);
  const s = appendMovement(state, {
    inventoryIdentityId: identityId,
    type: "IssuedToUnit",
    quantity,
    unitId,
    requirementId: check.requirement?.id,
    recordedBy: actorId,
    recordedAt: ts
  });

  return audit(s, {
    at: ts,
    actorId,
    action: "inventory.issued",
    targetType: "InventoryItem",
    targetId: identityId,
    unitId,
    detail: `${identity.partNumber} (${identity.description}) issued to ${unitId}.`,
    supersedesEventId: null
  });
}

/** Records the part as physically fitted, entering the Unit's as-built history. */
export function installInventory(
  state: AppState,
  actorId: string,
  identityId: string,
  unitId: string,
  quantity: number,
  at?: string
): AppState {
  const identity = state.inventoryIdentities.find((i) => i.id === identityId);
  if (!identity) throw new Error(`Unknown inventory item ${identityId}`);
  if (activeUnitAllocation(state.inventoryMovements, identityId) !== unitId) {
    throw new Error(`${identity.partNumber} is not issued to ${unitId}`);
  }
  const ts = nowIso(at);

  let s = appendMovement(state, {
    inventoryIdentityId: identityId,
    type: "Installed",
    quantity,
    unitId,
    recordedBy: actorId,
    recordedAt: ts
  });

  // As-built: the tracked item enters this Unit's history with its heat /
  // lot / serial, the matching requirement is satisfied, and any work held
  // for material is released once nothing physical still blocks the Unit.
  const issued = [...state.inventoryMovements]
    .reverse()
    .find((m) => m.inventoryIdentityId === identityId && m.unitId === unitId && (m.type === "IssuedToUnit" || m.type === "Reserved") && m.requirementId);
  const requirement = requirementForInstall(
    { requirements: s.requirements, fulfillments: s.fulfillments },
    unitId,
    identity.componentKey,
    issued?.requirementId
  );
  if (requirement) {
    const match = evaluateMatch(requiredSpecFromDescription(requirement.description), {
      partNumber: identity.partNumber,
      material: identity.material
    });
    const [usageId, s2] = takeId(s, "use");
    s = s2;
    const usage: ComponentUsage = {
      id: usageId,
      requirementId: requirement.id,
      unitId,
      componentRole: requirement.componentId?.split("-").pop() ?? identity.componentKey ?? "component",
      quantity,
      trackingType:
        identity.trackingPolicy === "Serialized"
          ? "Serialized"
          : identity.trackingPolicy === "HeatTracked"
            ? "HeatTracked"
            : identity.trackingPolicy === "LotTracked"
              ? "LotTracked"
              : "QuantityTracked",
      inventoryIdentityId: identityId,
      source: "Inventory",
      partNumber: identity.partNumber,
      material: identity.material || undefined,
      heatLot: identity.heatNumber ?? identity.lotNumber,
      serial: identity.serialNumber,
      usageStatus: "Installed",
      matchStatus: match.status,
      matchNote: match.note,
      installedBy: actorId,
      installedAt: ts,
      recordedBy: actorId,
      recordedAt: ts
    };
    s = { ...s, componentUsages: [...s.componentUsages, usage] };
    const [fulId, s3] = takeId(s, "ful");
    s = s3;
    let ledger = appendFulfillment(
      { requirements: s.requirements, fulfillments: s.fulfillments },
      { id: fulId, requirementId: requirement.id, kind: "InventoryItem", ref: identityId, quantity, status: "Complete", recordedBy: actorId, recordedAt: ts }
    );
    if (match.status === "Matched") ledger = advanceRequirement(ledger, requirement.id, "Satisfied");
    s = { ...s, requirements: ledger.requirements, fulfillments: ledger.fulfillments };
    if (materialGateClear(ledger, unitId)) s = releaseMaterialGate(s, unitId, actorId, ts);
  }

  const trace = [identity.serialNumber, identity.lotNumber, identity.heatNumber]
    .filter(Boolean)
    .join(" / ");

  return audit(s, {
    at: ts,
    actorId,
    action: "inventory.installed",
    targetType: "Unit",
    targetId: unitId,
    unitId,
    detail: `Installed ${identity.partNumber} (${identity.description})${trace ? ` — ${trace}` : ""} into ${unitId}.`,
    supersedesEventId: null
  });
}

export function returnInventoryToStock(
  state: AppState,
  actorId: string,
  identityId: string,
  unitId: string,
  quantity: number,
  reason: string,
  locationId: string,
  at?: string
): AppState {
  const identity = state.inventoryIdentities.find((i) => i.id === identityId);
  if (!identity) throw new Error(`Unknown inventory item ${identityId}`);
  if (!reason.trim()) throw new Error("Returning a part to stock requires a reason");
  const ts = nowIso(at);

  let s = appendMovement(state, {
    inventoryIdentityId: identityId,
    type: "RemovedFromUnit",
    quantity,
    unitId,
    reason: reason.trim(),
    recordedBy: actorId,
    recordedAt: ts
  });
  s = appendMovement(s, {
    inventoryIdentityId: identityId,
    type: "ReturnedToStock",
    quantity,
    toLocationId: locationId,
    recordedBy: actorId,
    recordedAt: ts
  });

  return audit(s, {
    at: ts,
    actorId,
    action: "inventory.returned",
    targetType: "InventoryItem",
    targetId: identityId,
    unitId,
    detail: `${identity.partNumber} removed from ${unitId} and returned to stock: ${reason.trim()}`,
    supersedesEventId: null
  });
}

/** INV-015: an adjustment is the one movement that invents or destroys stock. */
export function adjustInventory(
  state: AppState,
  actorId: string,
  identityId: string,
  delta: number,
  reason: string,
  authorizedBy: string,
  at?: string
): AppState {
  const identity = state.inventoryIdentities.find((i) => i.id === identityId);
  if (!identity) throw new Error(`Unknown inventory item ${identityId}`);
  const ts = nowIso(at);

  const s = appendMovement(state, {
    inventoryIdentityId: identityId,
    type: "Adjusted",
    quantity: delta,
    reason: reason.trim(),
    authorizedBy,
    recordedBy: actorId,
    recordedAt: ts
  });

  return audit(s, {
    at: ts,
    actorId,
    action: "inventory.adjusted",
    targetType: "InventoryItem",
    targetId: identityId,
    unitId: null,
    detail: `${identity.partNumber} adjusted by ${delta > 0 ? "+" : ""}${delta}: ${reason.trim()} (authorized by ${authorizedBy}).`,
    supersedesEventId: null
  });
}

/**
 * Releases every task on the Unit that was held for material once nothing
 * physical still blocks its work. The task returns to the state it held
 * before the hold, exactly as a manual blocker resolution does.
 */
export function releaseMaterialGate(state: AppState, unitId: string, actorId: string, at: string): AppState {
  let s = state;
  const held = state.tasks.filter((t) => t.unitId === unitId && t.status === "Blocked" && t.blockReason === MATERIAL_GATE_REASON);
  for (const t of held) {
    const restored: Task["status"] = t.status_beforeBlock ?? "Ready";
    s = {
      ...s,
      tasks: s.tasks.map((x) =>
        x.id === t.id
          ? {
              ...x,
              status: restored,
              status_beforeBlock: null,
              blockReason: null,
              history: [...x.history, { action: "BlockerResolved", actorId, at, note: "All required material installed" }]
            }
          : x
      )
    };
    s = audit(s, {
      at,
      actorId,
      action: "task.blockerResolved",
      targetType: "Task",
      targetId: t.id,
      unitId,
      detail: `Material gate cleared; "${t.name}" returned to ${restored}.`,
      supersedesEventId: null
    });
  }
  return held.length > 0 ? recomputeUnitProjection(s, unitId) : s;
}

// ---------------------------------------------------------------------------
// Stock receipt → put-away job
// ---------------------------------------------------------------------------

export function createPutAwayJob(
  state: AppState,
  actorId: string,
  identityIds: string[],
  facility: string,
  at?: string
): AppState {
  if (identityIds.length === 0) throw new Error("Nothing to put away");
  const ts = nowIso(at);
  const [jobNumber, s1] = takeId(state, "IJ");
  let s = s1;

  const { job } = buildPutAwayJob({
    jobNumber,
    identityIds,
    facility,
    accountableOwnerId: "Shipping",
    createdBy: actorId,
    createdAt: ts
  });

  s = { ...s, internalJobs: [...s.internalJobs, job] };

  return audit(s, {
    at: ts,
    actorId,
    action: "internaljob.created",
    targetType: "InternalJob",
    targetId: job.id,
    unitId: null,
    detail: `${job.title} (${job.type}) created for ${facility}.`,
    supersedesEventId: null
  });
}

// ---------------------------------------------------------------------------
// Read helpers for the UI
// ---------------------------------------------------------------------------

export interface InventoryPosition {
  identity: InventoryIdentity;
  onHand: number;
  available: number;
  quality: ReturnType<typeof qualityState>;
  locationId: string | null;
  locationLabel: string;
  allocatedUnitId: string | null;
}

export function inventoryPositions(state: AppState): InventoryPosition[] {
  return state.inventoryIdentities.map((identity) => {
    const locId = currentLocation(state.inventoryMovements, identity.id);
    return {
      identity,
      onHand: onHand(state.inventoryMovements, identity.id),
      available: available(state.inventoryMovements, identity.id),
      quality: qualityState(state.inventoryMovements, identity.id),
      locationId: locId,
      locationLabel: locationLabel(state.inventoryLocations.find((l) => l.id === locId)),
      allocatedUnitId: activeUnitAllocation(state.inventoryMovements, identity.id)
    };
  });
}

export function awaitingInspection(state: AppState): InventoryPosition[] {
  return inventoryPositions(state).filter((p) => p.quality === "Quarantine");
}

export function acceptedNotPutAway(state: AppState): InventoryPosition[] {
  return inventoryPositions(state).filter(
    (p) => p.quality === "Accepted" && (!p.locationId || p.locationId.endsWith("-QUAR") || p.locationId.endsWith("-RECV"))
  );
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  Received: "Received",
  Quarantined: "Quarantined",
  InspectionAccepted: "Inspection accepted",
  InspectionRejected: "Inspection rejected",
  PutAway: "Put away",
  Reserved: "Reserved",
  ReservationReleased: "Reservation released",
  Picked: "Picked",
  IssuedToUnit: "Issued to Unit",
  Installed: "Installed",
  RemovedFromUnit: "Removed from Unit",
  ReturnedToStock: "Returned to stock",
  Transferred: "Transferred",
  ReturnedToVendor: "Returned to vendor",
  Scrapped: "Scrapped",
  Adjusted: "Adjusted"
};
