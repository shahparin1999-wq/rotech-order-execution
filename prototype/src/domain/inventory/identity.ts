// Inventory identity, tracking policy and locations.
//
// An InventoryIdentity is the stable thing a QR label points at. It is minted
// on ACCEPTANCE, not at the dock — the label says what quality decided, so it
// cannot exist before that decision.
//
// PURE DOMAIN — no React, no localStorage.

// How much traceability a part demands. This drives what receiving must
// capture and whether an item may skip quarantine.
export const TRACKING_POLICIES = [
  "Serialized",
  "LotTracked",
  "HeatTracked",
  "QuantityTracked",
  "UntrackedConsumable"
] as const;
export type TrackingPolicy = (typeof TRACKING_POLICIES)[number];

// What each policy REQUIRES at receipt. A heat-tracked casting without a heat
// number is not receivable — that is the whole point of the policy.
export const REQUIRED_FIELD_BY_POLICY: Record<TrackingPolicy, "serial" | "lot" | "heat" | null> = {
  Serialized: "serial",
  LotTracked: "lot",
  HeatTracked: "heat",
  QuantityTracked: null,
  UntrackedConsumable: null
};

// INV-002: everything enters quarantine unless its policy explicitly permits
// direct acceptance. Only untracked consumables do.
export function permitsDirectAcceptance(policy: TrackingPolicy): boolean {
  return policy === "UntrackedConsumable";
}

// A serialized item is the one that can never be in two Units at once (INV-004).
export function isSerialized(policy: TrackingPolicy): boolean {
  return policy === "Serialized";
}

// Default policy per component role. Mirrors the brief's table; a component not
// listed falls back to QuantityTracked, which is the weakest claim we can make
// honestly rather than over-promising traceability we do not capture.
const POLICY_BY_COMPONENT: Record<string, TrackingPolicy> = {
  motor: "Serialized",
  casing: "HeatTracked",
  impeller: "HeatTracked",
  stuffingBoxCover: "HeatTracked",
  powerFrame: "HeatTracked",
  shaftKit: "LotTracked",
  seal: "LotTracked",
  sealGland: "LotTracked",
  stubShaft: "LotTracked",
  adapter: "LotTracked",
  bearings: "LotTracked",
  baseplate: "Serialized",
  coupling: "QuantityTracked",
  couplingGuard: "QuantityTracked",
  gasket: "QuantityTracked",
  fasteners: "QuantityTracked",
  paint: "LotTracked",
  accessories: "QuantityTracked"
};

export function trackingPolicyFor(componentKey: string): TrackingPolicy {
  return POLICY_BY_COMPONENT[componentKey] ?? "QuantityTracked";
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface InventoryIdentity {
  id: string;
  /** Opaque QR value. Carries no customer or security-sensitive data (INV-014). */
  publicRef: string;
  partNumber: string;
  description: string;
  material: string;
  trackingPolicy: TrackingPolicy;
  /** Whichever of these the policy demanded at receipt. */
  serialNumber?: string;
  lotNumber?: string;
  heatNumber?: string;
  /** Quantity as received; current on-hand is derived from movements. */
  receivedQuantity: number;
  uom: string;
  facility: string;
  receiptId: string;
  receiptLineId: string;
  createdAt: string;
  createdBy: string;
}

export interface InventoryLocation {
  id: string;
  facility: string;
  /** e.g. "Rack B04" */
  area: string;
  /** e.g. "Bin 03" */
  bin?: string;
  description?: string;
}

export function locationLabel(location: InventoryLocation | undefined): string {
  if (!location) return "Unassigned";
  return [location.facility, location.area, location.bin].filter(Boolean).join(" · ");
}

// The label's headline status. Derived from movement-based quality state plus
// allocation, so a label can never claim a state the history does not support.
export const LABEL_STATUSES = [
  "QUARANTINE",
  "ACCEPTED",
  "REJECTED",
  "STOCK",
  "RESERVED",
  "PICKED",
  "IN ASSEMBLY",
  "RETURN TO VENDOR"
] as const;
export type LabelStatus = (typeof LABEL_STATUSES)[number];

/**
 * Validates what receiving must capture for a given policy. Returns the
 * missing field names rather than throwing, so the UI can prompt for exactly
 * what is absent.
 */
export function missingTrackingFields(
  policy: TrackingPolicy,
  captured: { serialNumber?: string; lotNumber?: string; heatNumber?: string }
): string[] {
  const required = REQUIRED_FIELD_BY_POLICY[policy];
  if (!required) return [];
  const value =
    required === "serial"
      ? captured.serialNumber
      : required === "lot"
        ? captured.lotNumber
        : captured.heatNumber;
  return value?.trim() ? [] : [required];
}
