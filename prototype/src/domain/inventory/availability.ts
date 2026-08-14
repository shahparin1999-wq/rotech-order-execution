// Material availability — the computed answer to "can I get this part right
// now", replacing the red/yellow/green cells someone currently colors by hand
// in a spreadsheet and the paragraph someone types when two orders want the
// same casing.
//
// This is deliberately NOT a scheduling engine. There is no capacity or
// lead-time model behind it, and it must never imply one. It answers exactly
// one question per physical requirement: is a matching, quality-accepted item
// free right now, on its way, or already spoken for — and if spoken for, by
// what.
//
// Two different kinds of "spoken for" are kept distinct rather than collapsed
// into one guess:
//   - an ACTUAL reservation already exists (a real `Reserved` movement ties
//     stock to a sibling Unit) — this is a fact, read straight off the ledger.
//   - nothing is reserved yet, but a higher-priority open requirement would
//     claim the free stock first — this is a preview, and is worded as one.
//
// PURE DOMAIN — no React, no localStorage.

import type { AppState, Order, Unit } from "../types";
import { evaluateMatch, requiredSpecFromDescription, type RequiredSpec } from "../ledger/componentUsage";
import { isOpen, isPhysicalCategory, type ExecutionRequirement } from "../ledger/requirement";
import { activeUnitAllocation, available, qualityState } from "./movement";
import type { InventoryIdentity } from "./identity";

export const MATERIAL_AVAILABILITY_STATES = ["InStock", "Expected", "NotAvailable", "NoRecipe"] as const;
export type MaterialAvailability = (typeof MATERIAL_AVAILABILITY_STATES)[number];

export interface AvailabilityResult {
  state: MaterialAvailability;
  reason: string;
  /** Quality-accepted identities matching this requirement's role and spec. */
  matchingIdentities: InventoryIdentity[];
  /** Free quantity across every matching identity, before this requirement claims any of it. */
  poolAvailable: number;
  /** Set only for Expected — when the matching stock was received, not a promised date (no PO entity exists to promise one). */
  expectedSince?: string;
  /** Set only for NotAvailable — the order currently holding or first in line for the matching stock. */
  heldByOrderNumber?: string;
  heldByRequirementId?: string;
}

/** The component role a requirement names, derived from `${unitId}-${key}` (fromConfigurator.ts). Component keys never contain "-". */
export function componentKeyOf(requirement: Pick<ExecutionRequirement, "componentId">): string | undefined {
  if (!requirement.componentId) return undefined;
  const key = requirement.componentId.split("-").pop();
  return key?.trim() || undefined;
}

function specMatches(required: RequiredSpec, identity: InventoryIdentity): boolean {
  if (!required.material?.trim() && !required.partNumber?.trim()) return false;
  return evaluateMatch(required, { partNumber: identity.partNumber, material: identity.material }).status === "Matched";
}

function roleMatches(componentKey: string | undefined, identity: InventoryIdentity): boolean {
  if (!componentKey || !identity.componentKey) return true; // absence cannot be contradicted, same rule as evaluateMatch
  return identity.componentKey === componentKey;
}

function candidateIdentities(
  state: AppState,
  componentKey: string | undefined,
  required: RequiredSpec,
  onlyAccepted: boolean
): InventoryIdentity[] {
  return state.inventoryIdentities.filter((i) => {
    if (onlyAccepted && qualityState(state.inventoryMovements, i.id) !== "Accepted") return false;
    if (!onlyAccepted && qualityState(state.inventoryMovements, i.id) !== "Quarantine") return false;
    return roleMatches(componentKey, i) && specMatches(required, i);
  });
}

function poolAvailable(state: AppState, identities: InventoryIdentity[]): number {
  return identities.reduce((sum, i) => sum + available(state.inventoryMovements, i.id), 0);
}

function orderFor(state: AppState, orderNumber: string): Order | undefined {
  return state.orders.find((o) => o.orderNumber === orderNumber);
}

function unitFor(state: AppState, unitId: string): Unit | undefined {
  return state.units.find((u) => u.unitId === unitId);
}

// Lower ranks first: Urgent, then High, then Medium, then Low.
const PRIORITY_RANK: Record<Order["priority"], number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

/**
 * Every OPEN physical requirement competing for the same role+spec across the
 * whole order book, ranked most-urgent first: order priority, then due date,
 * then order number for a stable tiebreak. Each requirement is treated as
 * claiming one matching item — quantity beyond that is a `ComponentUsage`
 * concern, not an allocation concern.
 */
export function competingRequirements(
  state: AppState,
  componentKey: string | undefined,
  required: RequiredSpec
): ExecutionRequirement[] {
  return state.requirements
    .filter((r) => isPhysicalCategory(r.category) && isOpen(r) && componentKeyOf(r) === componentKey)
    .filter((r) => evaluateMatch(required, requiredSpecFromDescription(r.description)).status === "Matched")
    .sort((a, b) => {
      const orderA = orderFor(state, a.executionOrderId);
      const orderB = orderFor(state, b.executionOrderId);
      const rankA = orderA ? PRIORITY_RANK[orderA.priority] : PRIORITY_RANK.Low;
      const rankB = orderB ? PRIORITY_RANK[orderB.priority] : PRIORITY_RANK.Low;
      if (rankA !== rankB) return rankA - rankB;
      const dueA = orderA?.dueDate ?? "9999-12-31";
      const dueB = orderB?.dueDate ?? "9999-12-31";
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return a.executionOrderId.localeCompare(b.executionOrderId);
    });
}

/**
 * The computed answer for one physical requirement. Never mutates anything —
 * a preview, read straight off the movement ledger and the open requirement
 * list.
 */
export function availabilityForRequirement(state: AppState, requirementId: string): AvailabilityResult {
  const requirement = state.requirements.find((r) => r.id === requirementId);
  if (!requirement) throw new Error(`Unknown requirement ${requirementId}`);
  if (!isPhysicalCategory(requirement.category)) {
    throw new Error(`${requirement.category} requirements do not carry material availability`);
  }

  const componentKey = componentKeyOf(requirement);
  const required = requiredSpecFromDescription(requirement.description);

  if (!required.material?.trim() && !required.partNumber?.trim()) {
    return {
      state: "NoRecipe",
      reason: "The requirement names no part number or material to match against inventory.",
      matchingIdentities: [],
      poolAvailable: 0
    };
  }

  const accepted = candidateIdentities(state, componentKey, required, true);

  // Already reserved to this exact Unit — the answer is settled, whatever
  // else is happening on the pool.
  const heldForThisUnit = requirement.unitId
    ? accepted.find((i) => activeUnitAllocation(state.inventoryMovements, i.id) === requirement.unitId)
    : undefined;
  if (heldForThisUnit) {
    return {
      state: "InStock",
      reason: `Already reserved to this Unit: ${heldForThisUnit.partNumber}${heldForThisUnit.material ? ` · ${heldForThisUnit.material}` : ""}.`,
      matchingIdentities: accepted,
      poolAvailable: poolAvailable(state, accepted)
    };
  }

  const free = poolAvailable(state, accepted);

  if (free <= 0) {
    // Real committed stock: someone else's Unit already holds it.
    const held = accepted.find((i) => activeUnitAllocation(state.inventoryMovements, i.id) !== null);
    if (held) {
      const holdingUnitId = activeUnitAllocation(state.inventoryMovements, held.id)!;
      const holdingUnit = unitFor(state, holdingUnitId);
      const holdingRequirement = holdingUnit
        ? state.requirements.find((r) => r.unitId === holdingUnitId && componentKeyOf(r) === componentKey)
        : undefined;
      return {
        state: "NotAvailable",
        reason: `On hand but already reserved to ${holdingUnit?.orderNumber ?? "another order"} (${holdingUnitId}).`,
        matchingIdentities: accepted,
        poolAvailable: 0,
        heldByOrderNumber: holdingUnit?.orderNumber,
        heldByRequirementId: holdingRequirement?.id
      };
    }

    // Nothing accepted at all — check for stock that has arrived but not yet
    // cleared quality, which is real and worth surfacing as "on its way".
    const quarantined = candidateIdentities(state, componentKey, required, false);
    if (quarantined.length > 0) {
      const earliest = quarantined
        .map((i) => i.createdAt)
        .sort((a, b) => a.localeCompare(b))[0];
      return {
        state: "Expected",
        reason: "Matching stock has arrived and is awaiting inspection release, not yet available to issue.",
        matchingIdentities: quarantined,
        poolAvailable: 0,
        expectedSince: earliest
      };
    }

    return {
      state: "NoRecipe",
      reason: "No matching accepted, quarantined, or otherwise tracked inventory exists for this requirement.",
      matchingIdentities: [],
      poolAvailable: 0
    };
  }

  // Free stock exists and nothing has actually reserved it yet — decide who
  // gets it first among every OPEN requirement asking for the same thing.
  const competitors = competingRequirements(state, componentKey, required);
  const rank = competitors.findIndex((r) => r.id === requirement.id);
  const coveredCount = Math.min(free, competitors.length);

  if (rank === -1 || rank < coveredCount) {
    return {
      state: "InStock",
      reason: `${free} matching item(s) available; nothing has claimed it ahead of this requirement.`,
      matchingIdentities: accepted,
      poolAvailable: free
    };
  }

  const claimsFirst = competitors[0];
  const claimingOrder = claimsFirst ? orderFor(state, claimsFirst.executionOrderId) : undefined;
  return {
    state: "NotAvailable",
    reason: `${free} matching item(s) on hand, but a higher-priority open requirement (${claimingOrder?.orderNumber ?? claimsFirst?.executionOrderId ?? "another order"}) would claim it first — nothing is reserved yet.`,
    matchingIdentities: accepted,
    poolAvailable: free,
    heldByOrderNumber: claimingOrder?.orderNumber,
    heldByRequirementId: claimsFirst?.id
  };
}
