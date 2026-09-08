// Purchasing visibility, wired into app state.
//
// AIMCOR issues the PO; this records the REFERENCE and links it to the demand
// it was raised for, so availability can say "on order, expected <date>"
// instead of "nothing tracked", and a late PO shows up as an exception on
// the order it is holding. Nothing here places, prices or approves a PO.

import type { AppState, AuditEvent } from "./types";
import {
  normalizePoNumber,
  validateVendorPoReference,
  type VendorPoLine,
  type VendorPoReference
} from "./purchasing/poReference";
import { advanceRequirement, appendFulfillment } from "./ledger/requirementFlow";
import type { Ledger } from "./ledger/requirement";

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

function ledgerOf(state: AppState): Ledger {
  return { requirements: state.requirements, fulfillments: state.fulfillments };
}

function withLedger(state: AppState, ledger: Ledger): AppState {
  return { ...state, requirements: ledger.requirements, fulfillments: ledger.fulfillments };
}

export interface VendorPoLineInput {
  partNumber: string;
  description: string;
  material?: string;
  componentKey?: string;
  orderedQuantity: number;
  uom?: string;
  expectedDate: string; // ISO date
  requirementIds: string[];
}

export interface VendorPoInput {
  poNumber: string;
  vendor: string;
  poDate: string; // ISO date
  facility: string;
  notes?: string;
  lines: VendorPoLineInput[];
}

/**
 * Records a vendor PO reference. Each linked requirement gets an Open
 * `PoReference` fulfilment and moves Unplanned → Planned: it now has a
 * fulfilment path, which is exactly what the "no-fulfillment-path" coverage
 * rule looks for.
 */
export function referenceVendorPo(state: AppState, actorId: string, input: VendorPoInput, at?: string): AppState {
  const poNumber = normalizePoNumber(input.poNumber);
  const validation = validateVendorPoReference(
    { poNumber, vendor: input.vendor, poDate: input.poDate, facility: input.facility, lines: input.lines },
    state.vendorPoReferences.map((p) => p.poNumber)
  );
  if (!validation.ok) throw new Error(validation.errors.join("; "));

  const ts = nowIso(at);
  const requirementById = new Map(state.requirements.map((r) => [r.id, r]));
  for (const line of input.lines) {
    for (const requirementId of line.requirementIds) {
      const requirement = requirementById.get(requirementId);
      if (!requirement) throw new Error(`Unknown requirement ${requirementId}`);
      if (requirement.status === "Satisfied" || requirement.status === "Superseded" || requirement.status === "Cancelled") {
        throw new Error(`Requirement ${requirementId} is ${requirement.status} and cannot be purchased for`);
      }
    }
  }

  let s = state;
  const [poId, s1] = takeId(s, "vpo");
  s = s1;
  const lines: VendorPoLine[] = [];
  let ledger = ledgerOf(s);
  const orderNumbers = new Set<string>();

  input.lines.forEach((line, index) => {
    const [lineId, s2] = takeId(s, "vpol");
    s = s2;
    const record: VendorPoLine = {
      id: lineId,
      lineNumber: index + 1,
      partNumber: line.partNumber.trim(),
      description: line.description.trim(),
      material: line.material?.trim() || undefined,
      componentKey: line.componentKey?.trim() || undefined,
      orderedQuantity: line.orderedQuantity,
      uom: line.uom ?? "EA",
      expectedDate: line.expectedDate,
      expectedDateHistory: [{ expectedDate: line.expectedDate, changedAt: ts, changedBy: actorId, reason: "PO placed" }],
      requirementIds: [...line.requirementIds]
    };
    lines.push(record);
    for (const requirementId of line.requirementIds) {
      const requirement = requirementById.get(requirementId)!;
      orderNumbers.add(requirement.executionOrderId);
      const [fulId, s3] = takeId(s, "ful");
      s = s3;
      ledger = appendFulfillment(ledger, {
        id: fulId,
        requirementId,
        kind: "PoReference",
        ref: `${poNumber}/${record.lineNumber}`,
        quantity: 1,
        status: "Open",
        recordedBy: actorId,
        recordedAt: ts
      });
      ledger = advanceRequirement(ledger, requirementId, "Planned");
    }
  });

  const po: VendorPoReference = {
    id: poId,
    poNumber,
    vendor: input.vendor.trim(),
    poDate: input.poDate,
    facility: input.facility,
    notes: input.notes?.trim() || undefined,
    sourceOrderNumbers: [...orderNumbers].sort(),
    lines,
    createdAt: ts,
    createdBy: actorId
  };

  s = withLedger({ ...s, vendorPoReferences: [...s.vendorPoReferences, po] }, ledger);
  const linked = lines.reduce((n, l) => n + l.requirementIds.length, 0);
  return audit(s, {
    at: ts,
    actorId,
    action: "purchase.referenced",
    targetType: "VendorPoReference",
    targetId: poId,
    unitId: null,
    detail:
      `Vendor PO ${poNumber} (${po.vendor}) referenced: ${lines.length} line(s), ${linked} requirement(s) now planned` +
      `${po.sourceOrderNumbers.length ? ` for ${po.sourceOrderNumbers.join(", ")}` : ""}. AIMCOR remains the PO system of record.`,
    supersedesEventId: null
  });
}

/** Appends a new expectation; the previous dates stay in the history. */
export function updateVendorPoExpectedDate(
  state: AppState,
  actorId: string,
  poId: string,
  lineId: string,
  expectedDate: string,
  reason: string,
  at?: string
): AppState {
  const po = state.vendorPoReferences.find((p) => p.id === poId);
  if (!po) throw new Error(`Unknown vendor PO reference ${poId}`);
  const line = po.lines.find((l) => l.id === lineId);
  if (!line) throw new Error(`Unknown PO line ${lineId}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) throw new Error("Expected date must be an ISO date (YYYY-MM-DD)");
  if (!reason.trim()) throw new Error("Changing an expected date requires a reason");
  const ts = nowIso(at);
  const prior = line.expectedDate;
  const s: AppState = {
    ...state,
    vendorPoReferences: state.vendorPoReferences.map((p) =>
      p.id !== poId
        ? p
        : {
            ...p,
            lines: p.lines.map((l) =>
              l.id !== lineId
                ? l
                : {
                    ...l,
                    expectedDate,
                    expectedDateHistory: [...l.expectedDateHistory, { expectedDate, changedAt: ts, changedBy: actorId, reason: reason.trim() }]
                  }
            )
          }
    )
  };
  return audit(s, {
    at: ts,
    actorId,
    action: "purchase.expectedDateChanged",
    targetType: "VendorPoReference",
    targetId: poId,
    unitId: null,
    detail: `PO ${po.poNumber} line ${line.lineNumber} expected ${prior} → ${expectedDate}: ${reason.trim()}`,
    supersedesEventId: null
  });
}
