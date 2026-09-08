// Vendor purchase-order REFERENCES — purchasing visibility without a
// purchasing system.
//
// AIMCOR remains the commercial, vendor-PO and accounting authority. This
// module holds only what the shop and the coordinator need to answer "what is
// on order, when is it expected, and what is it for": the Rotech PO number,
// the vendor, the ordered quantity, the expected date (with an append-only
// history of changes), the destination facility, and the requirement(s) the
// line was raised for. No price, no terms, no vendor master, no approvals.
//
// Received and pending quantities are DERIVED from receipts, never stored, so
// "ordered" can never be mistaken for "received".
//
// PURE DOMAIN — no React, no localStorage, no ambient clock.

import type { InventoryReceipt, InventoryReceiptLine } from "../inventory/receipt";

export interface ExpectedDateChange {
  expectedDate: string; // ISO date
  changedAt: string;
  changedBy: string;
  reason: string;
}

export interface VendorPoLine {
  id: string;
  lineNumber: number;
  partNumber: string;
  description: string;
  material?: string;
  /** Component role the line is buying for (casing, impeller, …), when known. */
  componentKey?: string;
  orderedQuantity: number;
  uom: string;
  /** Current expectation. Every change is appended to expectedDateHistory. */
  expectedDate: string;
  expectedDateHistory: ExpectedDateChange[];
  /** The requirements this line was raised to satisfy. */
  requirementIds: string[];
}

export interface VendorPoReference {
  id: string;
  /** Rotech PO number as issued in AIMCOR. Unique within this system. */
  poNumber: string;
  vendor: string;
  poDate: string; // ISO date
  facility: string;
  notes?: string;
  /** Orders this PO supports, derived from the linked requirements at creation. */
  sourceOrderNumbers: string[];
  lines: VendorPoLine[];
  createdAt: string;
  createdBy: string;
}

export interface ReceiptLedgerView {
  inventoryReceipts: InventoryReceipt[];
  inventoryReceiptLines: InventoryReceiptLine[];
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export interface PoValidation {
  ok: boolean;
  errors: string[];
}

/** Structural validation of a reference before it is recorded. */
export type VendorPoLineDraft = Pick<VendorPoLine, "partNumber" | "description" | "orderedQuantity" | "expectedDate">;

export function validateVendorPoReference(
  po: Pick<VendorPoReference, "poNumber" | "vendor" | "poDate" | "facility"> & { lines: VendorPoLineDraft[] },
  existingPoNumbers: string[]
): PoValidation {
  const errors: string[] = [];
  if (!po.poNumber.trim()) errors.push("A Rotech PO number is required");
  if (existingPoNumbers.some((n) => n.trim().toLowerCase() === po.poNumber.trim().toLowerCase())) {
    errors.push(`PO ${po.poNumber} is already referenced`);
  }
  if (!po.vendor.trim()) errors.push("A vendor is required");
  if (!isIsoDate(po.poDate)) errors.push("PO date must be an ISO date (YYYY-MM-DD)");
  if (!po.facility.trim()) errors.push("A destination facility is required");
  if (po.lines.length === 0) errors.push("At least one PO line is required");
  po.lines.forEach((line, i) => {
    const p = `line ${i + 1}`;
    if (!line.partNumber.trim() && !line.description.trim()) errors.push(`${p}: a part number or description is required`);
    if (!Number.isInteger(line.orderedQuantity) || line.orderedQuantity < 1) errors.push(`${p}: ordered quantity must be a positive integer`);
    if (!isIsoDate(line.expectedDate)) errors.push(`${p}: expected date must be an ISO date (YYYY-MM-DD)`);
  });
  return { ok: errors.length === 0, errors };
}

/** Receipt lines booked against this PO line: explicit link first, then PO number + line number. */
export function receiptLinesForPoLine(
  view: ReceiptLedgerView,
  po: Pick<VendorPoReference, "poNumber">,
  line: Pick<VendorPoLine, "id" | "lineNumber">
): InventoryReceiptLine[] {
  const receiptsByPo = new Map(
    view.inventoryReceipts
      .filter((r) => (r.poNumber ?? "").trim().toLowerCase() === po.poNumber.trim().toLowerCase())
      .map((r) => [r.id, r])
  );
  return view.inventoryReceiptLines.filter((rl) => {
    if (rl.vendorPoLineId) return rl.vendorPoLineId === line.id;
    const receipt = receiptsByPo.get(rl.receiptId);
    if (!receipt) return false;
    return (receipt.poLine ?? "").trim() === String(line.lineNumber);
  });
}

export function receivedQuantity(view: ReceiptLedgerView, po: VendorPoReference, line: VendorPoLine): number {
  return receiptLinesForPoLine(view, po, line).reduce((sum, rl) => sum + rl.quantity, 0);
}

export function pendingQuantity(view: ReceiptLedgerView, po: VendorPoReference, line: VendorPoLine): number {
  return Math.max(0, line.orderedQuantity - receivedQuantity(view, po, line));
}

/** Late = still pending after the expected date has passed. Today is injected. */
export function isPoLineLate(view: ReceiptLedgerView, po: VendorPoReference, line: VendorPoLine, asOf: string): boolean {
  return pendingQuantity(view, po, line) > 0 && line.expectedDate < asOf.slice(0, 10);
}

export interface OpenPoLine {
  po: VendorPoReference;
  line: VendorPoLine;
  received: number;
  pending: number;
  late: boolean;
}

/** Every PO line with quantity still pending, most urgent first. */
export function openPoLines(
  view: ReceiptLedgerView & { vendorPoReferences: VendorPoReference[] },
  asOf: string
): OpenPoLine[] {
  const rows: OpenPoLine[] = [];
  for (const po of view.vendorPoReferences) {
    for (const line of po.lines) {
      const received = receivedQuantity(view, po, line);
      const pending = Math.max(0, line.orderedQuantity - received);
      if (pending === 0) continue;
      rows.push({ po, line, received, pending, late: line.expectedDate < asOf.slice(0, 10) });
    }
  }
  return rows.sort((a, b) => a.line.expectedDate.localeCompare(b.line.expectedDate));
}

/** PO lines still pending for one requirement, regardless of date (availability has no clock). */
export function pendingPoLinesForRequirement(
  view: ReceiptLedgerView & { vendorPoReferences: VendorPoReference[] },
  requirementId: string
): OpenPoLine[] {
  const rows: OpenPoLine[] = [];
  for (const po of view.vendorPoReferences) {
    for (const line of po.lines) {
      if (!line.requirementIds.includes(requirementId)) continue;
      const received = receivedQuantity(view, po, line);
      const pending = Math.max(0, line.orderedQuantity - received);
      if (pending === 0) continue;
      rows.push({ po, line, received, pending, late: false });
    }
  }
  return rows.sort((a, b) => a.line.expectedDate.localeCompare(b.line.expectedDate));
}

/** The open PO line(s) raised for one requirement. */
export function openPoLinesForRequirement(
  view: ReceiptLedgerView & { vendorPoReferences: VendorPoReference[] },
  requirementId: string,
  asOf: string
): OpenPoLine[] {
  return openPoLines(view, asOf).filter((row) => row.line.requirementIds.includes(requirementId));
}

/** Rotech PO reference format: letters, digits, dashes; matches what AIMCOR issues. */
export function normalizePoNumber(value: string): string {
  return value.trim().toUpperCase();
}
