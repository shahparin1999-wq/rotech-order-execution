// Receipts and demand matching.
//
// A receipt is immutable once created (INV-001). What changes afterwards is
// recorded as movements and inspections against it, never by editing it.
//
// Demand matching SUGGESTS; a person confirms. The system must never silently
// allocate a component to the wrong Unit (INV-005) — a wrong allocation is
// worse than an unmatched receipt, because it looks correct.
//
// PURE DOMAIN — no React, no localStorage.

import {
  fulfilledQuantity,
  isInert,
  type ExecutionRequirement,
  type FulfillmentRecord,
  type Ledger
} from "../ledger/requirement";
import type { TrackingPolicy } from "./identity";

export const RECEIPT_KINDS = [
  "AgainstPo",
  "CustomerSupplied",
  "Transfer",
  "Stock",
  "Return"
] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

// What the receiver saw, compared with what was expected. Recorded explicitly
// so "we got the wrong thing" is data rather than a note nobody reads.
export const RECEIPT_DISPOSITIONS = [
  "ExactMatch",
  "PartialReceipt",
  "OverReceipt",
  "WrongPart",
  "WrongMaterial",
  "Damaged",
  "MissingDocumentation",
  "UnknownDemand"
] as const;
export type ReceiptDisposition = (typeof RECEIPT_DISPOSITIONS)[number];

export interface InventoryReceipt {
  id: string;
  kind: ReceiptKind;
  /** AIMCOR reference — entered by hand in V1; AIMCOR stays the PO system of record. */
  poNumber?: string;
  poLine?: string;
  vendor?: string;
  packingSlip?: string;
  facility: string;
  receivedBy: string;
  receivedAt: string;
  notes?: string;
}

export interface InventoryReceiptLine {
  id: string;
  receiptId: string;
  partNumber: string;
  vendorPartNumber?: string;
  description: string;
  material?: string;
  quantity: number;
  uom: string;
  trackingPolicy: TrackingPolicy;
  serialNumber?: string;
  lotNumber?: string;
  heatNumber?: string;
  certificateRef?: string;
  /** Vendor PO line this receipt was booked against, when received against a referenced PO. */
  vendorPoLineId?: string;
  /** Expected-shipment line this receipt is explicitly matched to. */
  expectedShipmentLineId?: string;
  condition?: string;
  disposition: ReceiptDisposition;
  /** The requirement a person explicitly confirmed this satisfies. */
  matchedRequirementId?: string;
  /** Free-text note when nothing matched — becomes an exception. */
  unmatchedReason?: string;
}

// ---------------------------------------------------------------------------
// Demand matching
// ---------------------------------------------------------------------------

export interface DemandCandidate {
  requirement: ExecutionRequirement;
  /** How much this requirement still needs. */
  outstandingQuantity: number;
  alreadyReceived: number;
  /** Higher is a better suggestion. Never used to auto-select. */
  score: number;
  reasons: string[];
}

export interface MatchInput {
  ledger: Ledger;
  partNumber?: string;
  description?: string;
  material?: string;
  poNumber?: string;
  poLine?: string;
  orderNumber?: string;
  quantity: number;
}

function requiredQuantity(requirement: ExecutionRequirement): number {
  // One Component requirement is one physical part for one Unit. Quantity lives
  // on the requirement's component row, not here, so this is deliberately 1 —
  // multi-quantity component rows generate separate requirements per Unit.
  return requirement.category === "Component" ? 1 : 1;
}

/**
 * Suggests requirements a receipt could satisfy, best first.
 *
 * Scoring is transparent and additive so the receiver can see WHY something was
 * suggested. Nothing here selects a match — `matchedRequirementId` is only ever
 * set by a person.
 */
export function candidateDemand(input: MatchInput): DemandCandidate[] {
  const { ledger } = input;
  const candidates: DemandCandidate[] = [];

  for (const requirement of ledger.requirements) {
    if (isInert(requirement)) continue;
    if (requirement.status === "Satisfied") continue;
    // Only physical things can be satisfied by a receipt.
    if (requirement.category !== "Component" && requirement.category !== "Material") continue;

    const fulfillments = ledger.fulfillments.filter((f) => f.requirementId === requirement.id);
    const alreadyReceived = fulfilledQuantity(fulfillments, "Receipt");
    const outstanding = requiredQuantity(requirement) - alreadyReceived;
    if (outstanding <= 0) continue;

    const reasons: string[] = [];
    let score = 0;

    // A PO reference recorded against the requirement is the strongest signal.
    const poRefs = fulfillments.filter((f) => f.kind === "PoReference");
    if (input.poNumber && poRefs.some((f) => f.ref.includes(input.poNumber!))) {
      score += 50;
      reasons.push(`PO ${input.poNumber} recorded against this requirement`);
    }

    const haystack = requirement.description.toLowerCase();
    if (input.partNumber && haystack.includes(input.partNumber.toLowerCase())) {
      score += 30;
      reasons.push(`part number ${input.partNumber} appears in the requirement`);
    }
    if (input.description) {
      const words = input.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const hits = words.filter((w) => haystack.includes(w));
      if (hits.length) {
        score += Math.min(20, hits.length * 5);
        reasons.push(`description matches on ${hits.join(", ")}`);
      }
    }
    if (input.material && haystack.includes(input.material.toLowerCase())) {
      score += 15;
      reasons.push(`material ${input.material} matches`);
    }
    if (input.orderNumber && requirement.executionOrderId === input.orderNumber) {
      score += 10;
      reasons.push(`same order ${input.orderNumber}`);
    }
    // An earlier need-by is a better candidate when everything else ties.
    if (requirement.needBy) {
      reasons.push(`need by ${requirement.needBy}`);
    }

    if (score === 0) continue;

    candidates.push({ requirement, outstandingQuantity: outstanding, alreadyReceived, score, reasons });
  }

  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.requirement.needBy ?? "9999").localeCompare(b.requirement.needBy ?? "9999");
  });
}

// ---------------------------------------------------------------------------
// Disposition
// ---------------------------------------------------------------------------

/**
 * Works out how a receipt compares with the demand it was matched to. Used to
 * pre-select the disposition; the receiver can always override, because only
 * they can see the box.
 */
export function suggestDisposition(
  receivingNow: number,
  candidate: DemandCandidate | undefined
): ReceiptDisposition {
  if (!candidate) return "UnknownDemand";
  if (receivingNow < candidate.outstandingQuantity) return "PartialReceipt";
  if (receivingNow > candidate.outstandingQuantity) return "OverReceipt";
  return "ExactMatch";
}

/** Dispositions that mean the goods are not usable as-is. */
export function isProblemDisposition(disposition: ReceiptDisposition): boolean {
  return (
    disposition === "WrongPart" ||
    disposition === "WrongMaterial" ||
    disposition === "Damaged" ||
    disposition === "MissingDocumentation" ||
    disposition === "UnknownDemand"
  );
}

/**
 * Remaining demand after a receipt. A partial receipt must leave the rest open
 * — this is the arithmetic that stops "ordered" being mistaken for "received".
 */
export function remainingAfterReceipt(candidate: DemandCandidate, receivingNow: number): number {
  return Math.max(0, candidate.outstandingQuantity - receivingNow);
}

/** The fulfilment record a confirmed receipt writes back to the ledger. */
export function receiptFulfillment(
  line: InventoryReceiptLine,
  receipt: InventoryReceipt,
  id: string
): FulfillmentRecord | null {
  if (!line.matchedRequirementId) return null;
  return {
    id,
    requirementId: line.matchedRequirementId,
    kind: "Receipt",
    ref: line.id,
    quantity: line.quantity,
    // A receipt is only "Complete" once quality accepts it. At the dock it is
    // Open — this is what keeps quarantined stock out of availability.
    status: "Open",
    recordedBy: receipt.receivedBy,
    recordedAt: receipt.receivedAt
  };
}
