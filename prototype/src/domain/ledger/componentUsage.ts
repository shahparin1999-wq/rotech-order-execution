// Actual parts fitted to a Unit — the "as built" layer.
//
// One record per ACTUAL TRACKED ITEM, lot allocation or quantity issue — NOT
// one row per component role. A Unit legitimately has two bearings, several
// coupling pieces, multiple lots contributing one quantity, and a replacement
// fitted after a removal. Forcing one row per role would make all of that
// unrepresentable, so many usage records may hang off one requirement.
//
// This generalises ComponentUsage1196, which was locked to the 1196 slice and
// never reached the QC document.
//
// The ordered configuration is NEVER rewritten from here. Actual use is a
// separate layer that is compared against Ordered, and a disagreement produces
// a review — not a silent overwrite.
//
// PURE DOMAIN — no React, no localStorage.

export const USAGE_SOURCES = [
  "Inventory",
  "CustomerSupplied",
  "ManualUntracked",
  "BuiltInternally"
] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

export const USAGE_STATUSES = [
  "Allocated",
  "Issued",
  "Installed",
  "Removed",
  "Returned",
  "Superseded"
] as const;
export type UsageStatus = (typeof USAGE_STATUSES)[number];

export const MATCH_STATUSES = [
  "Matched",
  "ApprovedSubstitution",
  "PendingReview",
  "Rejected"
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export type UsageTrackingType = "Serialized" | "HeatTracked" | "LotTracked" | "QuantityTracked";

export interface ComponentUsage {
  id: string;
  /** Ties this actual item to what the order required. */
  requirementId: string;
  unitId: string;
  componentRole: string;
  quantity: number;
  trackingType: UsageTrackingType;

  /** Set when the part came through inventory; absent for manual entry. */
  inventoryIdentityId?: string;
  source: UsageSource;

  partNumber?: string;
  manufacturer?: string;
  model?: string;
  material?: string;
  heatLot?: string;
  serial?: string;

  usageStatus: UsageStatus;
  matchStatus: MatchStatus;
  /** Why the match landed where it did — shown to the technician verbatim. */
  matchNote?: string;
  /** Set when a mismatch was accepted; names who accepted it. */
  approvedBy?: string;
  approvedReason?: string;

  installedBy?: string;
  installedAt?: string;
  /** Replacement chain: the record this one replaces. Nothing is deleted. */
  supersedesUsageId?: string;

  recordedBy: string;
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// Live-ness
// ---------------------------------------------------------------------------

/** A usage record that still describes what is physically in the Unit. */
export function isLiveUsage(usage: ComponentUsage): boolean {
  return (
    usage.usageStatus === "Allocated" ||
    usage.usageStatus === "Issued" ||
    usage.usageStatus === "Installed"
  );
}

/** Only installed parts belong in the as-built record. */
export function isInstalled(usage: ComponentUsage): boolean {
  return usage.usageStatus === "Installed";
}

/**
 * Unit isolation. A Unit's as-built history contains ONLY its own parts —
 * explicit rather than incidental, because the QC report depends on it.
 */
export function usageForUnit(records: ComponentUsage[], unitId: string): ComponentUsage[] {
  return records.filter((u) => u.unitId === unitId);
}

export function usageForRequirement(records: ComponentUsage[], requirementId: string): ComponentUsage[] {
  return records.filter((u) => u.requirementId === requirementId);
}

/** Installed quantity against a requirement, across however many records it took. */
export function installedQuantity(records: ComponentUsage[], requirementId: string): number {
  return usageForRequirement(records, requirementId)
    .filter(isInstalled)
    .reduce((sum, u) => sum + u.quantity, 0);
}

/**
 * A usage record blocks work or release while its match is unresolved or
 * rejected. An approved substitution does not — that is what approval means.
 */
export function blocksOnMatch(usage: ComponentUsage): boolean {
  if (!isLiveUsage(usage)) return false;
  return usage.matchStatus === "PendingReview" || usage.matchStatus === "Rejected";
}

/** Manual entries keep Production moving but are never silently trusted. */
export function needsVerification(usage: ComponentUsage): boolean {
  return isLiveUsage(usage) && usage.source === "ManualUntracked";
}

/** The replacement chain for one physical position, oldest first. */
export function supersessionChain(records: ComponentUsage[], usageId: string): ComponentUsage[] {
  const byId = new Map(records.map((u) => [u.id, u]));
  const chain: ComponentUsage[] = [];
  let current = byId.get(usageId);
  while (current) {
    chain.unshift(current);
    current = current.supersedesUsageId ? byId.get(current.supersedesUsageId) : undefined;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Match evaluation
// ---------------------------------------------------------------------------

export interface RequiredSpec {
  partNumber?: string;
  manufacturer?: string;
  material?: string;
  description?: string;
}

export interface ActualSpec {
  partNumber?: string;
  manufacturer?: string;
  material?: string;
}

export interface MatchEvaluation {
  status: MatchStatus;
  /** Human-readable reason, naming both sides. Never just "mismatch". */
  note: string;
  differences: string[];
}

// The shop writes "316SS", "316 SS" and "316ss" for the same thing. Normalising
// avoids noise; it does NOT collapse genuinely different alloys.
function norm(value: string | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function compare(field: string, required: string | undefined, actual: string | undefined): string | null {
  // Absence of a requirement cannot be contradicted — we only fail on genuine
  // disagreement, never on missing information.
  if (!required?.trim() || !actual?.trim()) return null;
  if (norm(required) === norm(actual)) return null;
  return `${field} mismatch: required ${required}, actual ${actual}`;
}

/**
 * Evaluates actual against required. The system decides — a technician must not
 * be shown two different values and left to continue regardless.
 *
 * Returns PendingReview on any real difference. Only an explicit approval
 * (`approveSubstitution`) turns that into ApprovedSubstitution.
 */
export function evaluateMatch(required: RequiredSpec, actual: ActualSpec): MatchEvaluation {
  const differences = [
    compare("Part number", required.partNumber, actual.partNumber),
    compare("Manufacturer", required.manufacturer, actual.manufacturer),
    compare("Material", required.material, actual.material)
  ].filter(Boolean) as string[];

  if (differences.length === 0) {
    return { status: "Matched", note: "Matches the ordered specification.", differences: [] };
  }
  return {
    status: "PendingReview",
    note: `${differences.join("; ")}. Review required before this can be installed.`,
    differences
  };
}

/** Records an authorised acceptance of a mismatch. The difference is retained. */
export function approveSubstitution(
  usage: ComponentUsage,
  approvedBy: string,
  reason: string
): ComponentUsage {
  if (!reason.trim()) throw new Error("Approving a substitution requires a reason");
  return {
    ...usage,
    matchStatus: "ApprovedSubstitution",
    approvedBy,
    approvedReason: reason.trim()
  };
}

export function rejectUsage(usage: ComponentUsage, rejectedBy: string, reason: string): ComponentUsage {
  if (!reason.trim()) throw new Error("Rejecting a part requires a reason");
  return {
    ...usage,
    matchStatus: "Rejected",
    approvedBy: rejectedBy,
    approvedReason: reason.trim()
  };
}

/**
 * Parses the required spec out of a ledger requirement description, which the
 * configurator writes as "Impeller — 316SS · 101-AT-M-A-S6".
 */
export function requiredSpecFromDescription(description: string): RequiredSpec {
  const [, tail] = description.split("—");
  if (!tail) return { description };
  const parts = tail.split("·").map((p) => p.trim()).filter(Boolean);
  return { material: parts[0], partNumber: parts[1], description };
}
