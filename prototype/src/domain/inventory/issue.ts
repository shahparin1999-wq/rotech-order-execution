// Issue to Unit and installation.
//
// This is where the rules have to hold. A mismatch here is how a CD4MCu
// impeller ends up in a 316SS pump and nobody finds out until the customer
// does — so every check fails CLOSED and returns the reason, and none of them
// can be satisfied by a stored flag.
//
// PURE DOMAIN — no React, no localStorage.

import type { ExecutionRequirement, Ledger } from "../ledger/requirement";
import { isInert } from "../ledger/requirement";
import { isSerialized, type InventoryIdentity } from "./identity";
import {
  activeUnitAllocation,
  available,
  isIssuable,
  qualityState,
  type InventoryMovement
} from "./movement";

export const ISSUE_REJECTIONS = [
  "NotAccepted",
  "NoMatchingRequirement",
  "ReservedForAnotherUnit",
  "SpecificationMismatch",
  "NoAvailableQuantity",
  "SerializedAlreadyAllocated",
  "AlreadyInstalled"
] as const;
export type IssueRejection = (typeof ISSUE_REJECTIONS)[number];

export interface IssueCheckInput {
  identity: InventoryIdentity;
  movements: InventoryMovement[];
  ledger: Ledger;
  unitId: string;
  /** Quantity the technician is trying to issue. */
  quantity: number;
}

export interface IssueCheckResult {
  ok: boolean;
  rejection?: IssueRejection;
  message?: string;
  /** The requirement this issue would satisfy, when the check passes. */
  requirement?: ExecutionRequirement;
  /** Present on a specification mismatch so the message can be specific. */
  expected?: string;
  actual?: string;
}

// Requirements this Unit still needs, that a physical item could satisfy.
function openComponentRequirements(ledger: Ledger, unitId: string): ExecutionRequirement[] {
  return ledger.requirements.filter(
    (r) =>
      !isInert(r) &&
      r.unitId === unitId &&
      (r.category === "Component" || r.category === "Material") &&
      r.status !== "Satisfied"
  );
}

// Normalizes a material for comparison: the shop writes "316SS", "316 SS" and
// "316ss" for the same thing, and rejecting on whitespace would be noise. It
// does NOT collapse genuinely different alloys.
function normalizeSpec(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Does this identity satisfy this requirement's material spec?
 *
 * A requirement whose description does not name a material cannot be
 * contradicted, so it passes — we only fail on a genuine disagreement, never on
 * absence of information.
 */
export function specificationMatches(
  requirement: ExecutionRequirement,
  identity: InventoryIdentity
): { matches: boolean; expected?: string; actual?: string } {
  if (!identity.material?.trim()) return { matches: true };

  // The requirement description is "Casing — Ductile Iron · 100-AP-M-A-1F-DI".
  const parts = requirement.description.split("—")[1]?.split("·") ?? [];
  const expected = parts[0]?.trim();
  if (!expected) return { matches: true };

  const matches = normalizeSpec(expected) === normalizeSpec(identity.material);
  return { matches, expected, actual: identity.material };
}

/**
 * The full gate between a scanned item and a Unit. Every rejection names what
 * went wrong so the technician sees a reason, not just a refusal.
 */
export function checkIssueToUnit(input: IssueCheckInput): IssueCheckResult {
  const { identity, movements, ledger, unitId, quantity } = input;

  // INV-003: quarantined or rejected material never reaches assembly.
  if (qualityState(movements, identity.id) !== "Accepted") {
    return {
      ok: false,
      rejection: "NotAccepted",
      message: `${identity.description} is ${qualityState(movements, identity.id).toLowerCase()}, not accepted. It cannot be issued.`
    };
  }

  // INV-004: a serialized item lives in exactly one Unit.
  const currentUnit = activeUnitAllocation(movements, identity.id);
  if (isSerialized(identity.trackingPolicy) && currentUnit && currentUnit !== unitId) {
    return {
      ok: false,
      rejection: "SerializedAlreadyAllocated",
      message: `Serial ${identity.serialNumber ?? identity.id} is already allocated to ${currentUnit}. A serialized item cannot be in two Units.`
    };
  }
  if (currentUnit && currentUnit !== unitId) {
    return {
      ok: false,
      rejection: "ReservedForAnotherUnit",
      message: `${identity.description} is reserved for ${currentUnit}, not ${unitId}.`
    };
  }

  if (!isIssuable(movements, identity.id) || available(movements, identity.id) < quantity) {
    return {
      ok: false,
      rejection: "NoAvailableQuantity",
      message: `Only ${available(movements, identity.id)} available; ${quantity} requested.`
    };
  }

  // Does this Unit actually want this?
  const open = openComponentRequirements(ledger, unitId);
  if (open.length === 0) {
    return {
      ok: false,
      rejection: "NoMatchingRequirement",
      message: `${unitId} has no open component requirement this could satisfy.`
    };
  }

  // Prefer a requirement whose spec agrees; report the mismatch otherwise.
  const agreeing = open.find((r) => specificationMatches(r, identity).matches);
  if (!agreeing) {
    const first = open[0];
    const spec = specificationMatches(first, identity);
    return {
      ok: false,
      rejection: "SpecificationMismatch",
      message: `This component does not match the Unit requirement. Engineering review required.`,
      expected: spec.expected,
      actual: spec.actual,
      requirement: first
    };
  }

  return { ok: true, requirement: agreeing };
}

// ---------------------------------------------------------------------------
// As-built
// ---------------------------------------------------------------------------

/** What installing a tracked component records into the Unit's history. */
export interface AsBuiltRecord {
  unitId: string;
  requirementId: string;
  inventoryIdentityId: string;
  componentRole: string;
  partNumber: string;
  description: string;
  material: string;
  serialNumber?: string;
  lotNumber?: string;
  heatNumber?: string;
  quantity: number;
  installedBy: string;
  installedAt: string;
  taskId?: string;
  evidenceIds: string[];
  /** Set when an approved substitution allowed a non-matching part. */
  approvedSubstitutionRef?: string;
}

export function asBuiltFromInstall(
  identity: InventoryIdentity,
  requirement: ExecutionRequirement,
  unitId: string,
  installedBy: string,
  installedAt: string,
  quantity = 1
): AsBuiltRecord {
  return {
    unitId,
    requirementId: requirement.id,
    inventoryIdentityId: identity.id,
    componentRole: requirement.componentId?.split("-").pop() ?? "component",
    partNumber: identity.partNumber,
    description: identity.description,
    material: identity.material,
    serialNumber: identity.serialNumber,
    lotNumber: identity.lotNumber,
    heatNumber: identity.heatNumber,
    quantity,
    installedBy,
    installedAt,
    evidenceIds: []
  };
}

/**
 * Unit isolation: a Unit's as-built history contains only its own parts.
 * Explicit rather than incidental, because this is the invariant that a QC
 * report depends on being true.
 */
export function asBuiltForUnit(records: AsBuiltRecord[], unitId: string): AsBuiltRecord[] {
  return records.filter((r) => r.unitId === unitId);
}
