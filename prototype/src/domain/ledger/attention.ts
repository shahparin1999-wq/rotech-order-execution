// Attention — the exceptions on an order, computed.
//
// "Exceptions first" is a hard UI rule, and this is what makes it possible:
// every item here is DERIVED from a record that already exists, so nothing on
// the Attention list can be stale, and nobody has to remember to raise it.
//
// This is the structured replacement for the Teams Remarks column, where all
// of this currently lives as hand-typed paragraphs:
//
//   "1.5X3-8 IS READY TO SHIP / CANT BUILD 6X8-13 / HOLDING KNIGHTEN ORDERS"
//   "May 27: Waiting for Coupling - due to arrive Friday June 5"
//
// Both of those are facts the ledger already knows. Typing them was only ever
// necessary because nothing surfaced them.
//
// PURE DOMAIN — no React, no localStorage, no ambient clock (time is injected).

import type { AppState } from "../types";
import { availabilityForRequirement } from "../inventory/availability";
import { blocksOnMatch, isLiveUsage, type ComponentUsage } from "./componentUsage";
import { isOpen, isPhysicalCategory } from "./requirement";

export const ATTENTION_KINDS = [
  "Shortage",
  "Incoming",
  "SubstitutionReview",
  "QualityProblem",
  "OverdueAction",
  "CommercialReview",
  "LatePurchase"
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export type AttentionSeverity = "Blocker" | "Warning";

export interface OrderAttentionItem {
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  /** One line, readable on a tablet without expanding anything. */
  title: string;
  /** Why, naming the specific thing — never "see notes". */
  detail: string;
  unitId?: string;
  lineNumber?: number;
  /** Who is accountable, as a label rather than an id. */
  ownerLabel?: string;
  /** ISO — how long this has been open. */
  since?: string;
}

// Blockers first, then warnings; within a group, oldest first, because age is
// the thing that makes a shortage worse.
const SEVERITY_RANK: Record<AttentionSeverity, number> = { Blocker: 0, Warning: 1 };

function sortAttention(items: OrderAttentionItem[]): OrderAttentionItem[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return (a.since ?? "9999").localeCompare(b.since ?? "9999");
  });
}

function unitLineNumber(state: AppState, unitId: string | undefined): number | undefined {
  if (!unitId) return undefined;
  return state.units.find((u) => u.unitId === unitId)?.lineNumber;
}

/**
 * Every exception on one order. `asOf` is injected so overdue is testable and
 * the module stays free of an ambient clock.
 */
export function orderAttention(
  state: AppState,
  orderNumber: string,
  asOf: string
): OrderAttentionItem[] {
  const items: OrderAttentionItem[] = [];
  const unitIds = new Set(
    state.units.filter((u) => u.orderNumber === orderNumber).map((u) => u.unitId)
  );

  // --- Material: shortages and incoming, straight off the availability engine.
  for (const requirement of state.requirements) {
    if (requirement.executionOrderId !== orderNumber) continue;
    if (!isPhysicalCategory(requirement.category) || !isOpen(requirement)) continue;

    const result = availabilityForRequirement(state, requirement.id);
    if (result.state === "InStock") continue;

    if (result.state === "Expected") {
      items.push({
        id: `att-incoming-${requirement.id}`,
        kind: "Incoming",
        severity: "Warning",
        title: `Incoming · ${requirement.description}`,
        detail: result.reason,
        unitId: requirement.unitId,
        lineNumber: unitLineNumber(state, requirement.unitId),
        ownerLabel: requirement.accountableOwnerId,
        since: result.expectedSince
      });
      continue;
    }

    if (result.state === "OnOrder") {
      const late = !!result.expectedDate && result.expectedDate < asOf.slice(0, 10);
      items.push({
        id: `att-${late ? "late" : "onorder"}-${requirement.id}`,
        kind: late ? "LatePurchase" : "Incoming",
        severity: late ? "Blocker" : "Warning",
        title: `${late ? "Late PO" : "On order"} · ${requirement.description}`,
        detail: result.reason,
        unitId: requirement.unitId,
        lineNumber: unitLineNumber(state, requirement.unitId),
        ownerLabel: "Purchasing",
        since: result.expectedDate
      });
      continue;
    }

    items.push({
      id: `att-shortage-${requirement.id}`,
      kind: "Shortage",
      severity: "Blocker",
      title: `Shortage · ${requirement.description}`,
      detail:
        result.heldByOrderNumber && result.heldByOrderNumber !== orderNumber
          ? `${result.reason} Held by ${result.heldByOrderNumber}.`
          : result.reason,
      unitId: requirement.unitId,
      lineNumber: unitLineNumber(state, requirement.unitId),
      ownerLabel: requirement.accountableOwnerId,
      since: requirement.createdAt
    });
  }

  // --- Actual parts that disagree with the order and have not been resolved.
  for (const usage of state.componentUsages as ComponentUsage[]) {
    if (!unitIds.has(usage.unitId) || !isLiveUsage(usage) || !blocksOnMatch(usage)) continue;
    items.push({
      id: `att-usage-${usage.id}`,
      kind: "SubstitutionReview",
      severity: "Blocker",
      title: `${usage.matchStatus === "Rejected" ? "Rejected part" : "Substitution awaiting approval"} · ${usage.componentRole}`,
      detail: usage.matchNote ?? "Actual part does not match the ordered specification.",
      unitId: usage.unitId,
      lineNumber: unitLineNumber(state, usage.unitId),
      since: usage.recordedAt
    });
  }

  // --- Quality problems raised by a person.
  for (const problem of state.problems) {
    if (problem.orderNumber !== orderNumber || problem.status !== "Open") continue;
    items.push({
      id: `att-problem-${problem.id}`,
      kind: "QualityProblem",
      severity: "Blocker",
      title: "Problem reported",
      detail: problem.description,
      unitId: problem.unitId ?? undefined,
      lineNumber: unitLineNumber(state, problem.unitId ?? undefined)
    });
  }

  // --- Overdue work.
  for (const task of state.tasks) {
    if (task.orderNumber !== orderNumber || task.status === "Complete") continue;
    if (!task.dueDate || task.dueDate.slice(0, 10) >= asOf.slice(0, 10)) continue;
    items.push({
      id: `att-overdue-${task.id}`,
      kind: "OverdueAction",
      severity: "Warning",
      title: `Overdue · ${task.name}`,
      detail: task.blockReason ?? `Due ${task.dueDate.slice(0, 10)}.`,
      unitId: task.unitId ?? undefined,
      lineNumber: unitLineNumber(state, task.unitId ?? undefined),
      ownerLabel: task.department ?? undefined,
      since: task.dueDate
    });
  }

  // --- Commercial/technical items carried in from the CPQ handoff.
  for (const item of state.attentionItems) {
    if (item.orderNumber !== orderNumber) continue;
    items.push({
      id: `att-cpq-${item.id}`,
      kind: "CommercialReview",
      severity: item.blocksRelease ? "Blocker" : "Warning",
      title: `${item.kind} · ${item.affects ?? "order"}`,
      detail: item.description,
      lineNumber: item.lineNumber ?? undefined,
      ownerLabel: item.responsibleParty ?? undefined,
      since: item.createdAt
    });
  }

  return sortAttention(items);
}

/** Attention scoped to one Unit — its own items only, never a sibling's. */
export function unitAttention(
  state: AppState,
  unitId: string,
  asOf: string
): OrderAttentionItem[] {
  const unit = state.units.find((u) => u.unitId === unitId);
  if (!unit) return [];
  return orderAttention(state, unit.orderNumber, asOf).filter((i) => i.unitId === unitId);
}

/** Items that hold up completion or shipment, for the Unit's "blocking" list. */
export function blockingItems(items: OrderAttentionItem[]): OrderAttentionItem[] {
  return items.filter((i) => i.severity === "Blocker");
}
