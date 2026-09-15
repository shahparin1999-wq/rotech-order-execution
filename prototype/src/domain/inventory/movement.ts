// Inventory movements — the source of truth.
//
// There is deliberately NO editable on-hand quantity anywhere in this module.
// On-hand, reserved, available, current location and active Unit allocation are
// all DERIVED from an append-only movement list. That is the whole point: a
// stored quantity field can be corrected into agreeing with a wrong reality,
// and the history of how it got there is lost. A movement list cannot.
//
// PURE DOMAIN — no React, no localStorage, no ambient clock.

export const MOVEMENT_TYPES = [
  "Received",
  "Quarantined",
  "InspectionAccepted",
  "InspectionRejected",
  "PutAway",
  "Reserved",
  "ReservationReleased",
  "Picked",
  "IssuedToUnit",
  "Installed",
  "RemovedFromUnit",
  "ReturnedToStock",
  "Transferred",
  "ReturnedToVendor",
  "Scrapped",
  "Adjusted"
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface InventoryMovement {
  id: string;
  inventoryIdentityId: string;
  type: MovementType;
  /** Signed only where it changes on-hand; 0 for pure state/location changes. */
  quantity: number;
  fromLocationId?: string;
  toLocationId?: string;
  /** Set for Reserved / IssuedToUnit / Installed / RemovedFromUnit. */
  unitId?: string;
  requirementId?: string;
  /** Required for Adjusted and Scrapped (INV-015). */
  reason?: string;
  /** Required for Adjusted (INV-015). */
  authorizedBy?: string;
  /** Opening-balance provenance. These fields are retained on every movement. */
  importBatchId?: string;
  sourceFileId?: string;
  sourceFileHash?: string;
  sourceRow?: number;
  approvedBy?: string;
  approvedAt?: string;
  recordedBy: string;
  recordedAt: string;
}

// Which movements change the on-hand balance, and in which direction. Movements
// not listed here (Quarantined, InspectionAccepted, PutAway, Reserved, Picked…)
// change STATE or LOCATION, not how much exists.
const ON_HAND_DELTA: Partial<Record<MovementType, 1 | -1>> = {
  Received: 1,
  ReturnedToStock: 1,
  Installed: -1,
  ReturnedToVendor: -1,
  Scrapped: -1
};

// Adjusted carries its own sign, so it is handled separately rather than being
// forced into the table above.
export function onHandDelta(movement: InventoryMovement): number {
  if (movement.type === "Adjusted") return movement.quantity;
  const direction = ON_HAND_DELTA[movement.type];
  return direction === undefined ? 0 : direction * Math.abs(movement.quantity);
}

// ---------------------------------------------------------------------------
// Validation. A movement that would break an invariant is rejected before it
// is appended — an append-only log is only trustworthy if what goes in is.
// ---------------------------------------------------------------------------

export interface MovementValidation {
  ok: boolean;
  errors: string[];
}

export function validateMovement(movement: InventoryMovement): MovementValidation {
  const errors: string[] = [];

  if (!movement.inventoryIdentityId) errors.push("movement must reference an inventory identity");
  if (!movement.recordedBy) errors.push("movement must record who performed it");
  if (!movement.recordedAt) errors.push("movement must record when it happened");

  // INV-015: an adjustment is the one movement that can invent or destroy
  // quantity, so it never happens anonymously or unexplained.
  if (movement.type === "Adjusted") {
    if (!movement.reason?.trim()) errors.push("an adjustment requires a reason (INV-015)");
    if (!movement.authorizedBy?.trim()) errors.push("an adjustment requires authorization (INV-015)");
    if (movement.quantity === 0) errors.push("an adjustment of zero changes nothing");
  }

  if (movement.type === "Scrapped" && !movement.reason?.trim()) {
    errors.push("scrapping requires a reason");
  }

  const needsUnit: MovementType[] = ["IssuedToUnit", "Installed", "RemovedFromUnit"];
  if (needsUnit.includes(movement.type) && !movement.unitId) {
    errors.push(`${movement.type} must name the Unit`);
  }

  if (movement.type === "PutAway" && !movement.toLocationId) {
    errors.push("put-away must name the destination location");
  }

  if (onHandDelta(movement) !== 0 && movement.quantity === 0) {
    errors.push(`${movement.type} must carry a quantity`);
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Derived state. Every function here reads the movement list; none of them
// reads a stored field.
// ---------------------------------------------------------------------------

function forIdentity(movements: InventoryMovement[], identityId: string): InventoryMovement[] {
  return movements
    .filter((m) => m.inventoryIdentityId === identityId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export function onHand(movements: InventoryMovement[], identityId: string): number {
  return forIdentity(movements, identityId).reduce((sum, m) => sum + onHandDelta(m), 0);
}

/** Quantity currently committed to a Unit but not yet installed. */
export function reserved(movements: InventoryMovement[], identityId: string): number {
  let total = 0;
  for (const m of forIdentity(movements, identityId)) {
    if (m.type === "Reserved") total += Math.abs(m.quantity);
    // A release, an issue or an install all end the reservation: issued and
    // installed stock is no longer "reserved", it is gone or committed.
    if (m.type === "ReservationReleased" || m.type === "IssuedToUnit") total -= Math.abs(m.quantity);
  }
  return Math.max(0, total);
}

/** What can actually be picked: on hand, minus what is spoken for. */
export function available(movements: InventoryMovement[], identityId: string): number {
  return Math.max(0, onHand(movements, identityId) - reserved(movements, identityId));
}

export function currentLocation(movements: InventoryMovement[], identityId: string): string | null {
  let location: string | null = null;
  for (const m of forIdentity(movements, identityId)) {
    if (m.toLocationId) location = m.toLocationId;
    // Leaving the building clears the location rather than pretending it is
    // still on a shelf.
    if (m.type === "ReturnedToVendor" || m.type === "Scrapped" || m.type === "IssuedToUnit") {
      location = m.toLocationId ?? null;
    }
  }
  return location;
}

/**
 * The Unit this item is currently committed to, if any. Issue and install
 * commit it; removal and return to stock release it.
 *
 * INV-004 depends on this: a serialized item may have only ONE active Unit
 * allocation, and "active" is defined here rather than by a mutable flag.
 */
export function activeUnitAllocation(
  movements: InventoryMovement[],
  identityId: string
): string | null {
  let unit: string | null = null;
  for (const m of forIdentity(movements, identityId)) {
    if (m.type === "Reserved" || m.type === "IssuedToUnit" || m.type === "Installed") {
      unit = m.unitId ?? unit;
    }
    if (m.type === "RemovedFromUnit" || m.type === "ReturnedToStock" || m.type === "ReservationReleased") {
      unit = null;
    }
  }
  return unit;
}

export function isInstalled(movements: InventoryMovement[], identityId: string): boolean {
  let installed = false;
  for (const m of forIdentity(movements, identityId)) {
    if (m.type === "Installed") installed = true;
    if (m.type === "RemovedFromUnit") installed = false;
  }
  return installed;
}

// ---------------------------------------------------------------------------
// Quality state. Derived, so "accepted" can never be set without the movement
// that accepted it.
// ---------------------------------------------------------------------------

export type QualityState = "Quarantine" | "Accepted" | "Rejected";

export function qualityState(movements: InventoryMovement[], identityId: string): QualityState {
  let state: QualityState = "Quarantine";
  for (const m of forIdentity(movements, identityId)) {
    if (m.type === "InspectionAccepted") state = "Accepted";
    if (m.type === "InspectionRejected") state = "Rejected";
  }
  return state;
}

/**
 * INV-003: material is not available for assembly until inspection passes.
 * This is the gate the receiving dock must not be able to bypass.
 */
export function isIssuable(movements: InventoryMovement[], identityId: string): boolean {
  return qualityState(movements, identityId) === "Accepted" && available(movements, identityId) > 0;
}

/** The full movement history for display — oldest first, never mutated. */
export function historyFor(movements: InventoryMovement[], identityId: string): InventoryMovement[] {
  return forIdentity(movements, identityId);
}
