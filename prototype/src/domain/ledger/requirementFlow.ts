// How a physical requirement moves through the ledger as material moves
// through the building.
//
//   Unplanned ──(vendor PO referenced)──▶ Planned
//   Planned   ──(received against demand, accepted at inspection)──▶ InProgress
//   InProgress ─(issued and installed into the Unit)──▶ Satisfied
//
// Each step is a FulfillmentRecord appended to the ledger and a guarded status
// transition — never a flag flipped directly. This module also owns the
// material gate: which of a Unit's tasks are held for material and when they
// may be released.
//
// PURE DOMAIN — no React, no localStorage, no ambient clock.

import type { ExecutionRequirement, FulfillmentRecord, Ledger, RequirementStatus } from "./requirement";
import { canTransition, isInert, isOpen, isPhysicalCategory, transition } from "./requirement";

/** The one blocking reason this module recognises as "held for material". */
export const MATERIAL_GATE_REASON = "Waiting on material";

export function appendFulfillment(ledger: Ledger, record: FulfillmentRecord): Ledger {
  return {
    requirements: ledger.requirements.map((r) =>
      r.id === record.requirementId ? { ...r, fulfillmentRefs: [...r.fulfillmentRefs, record.id] } : r
    ),
    fulfillments: [...ledger.fulfillments, record]
  };
}

const FORWARD_PATH: RequirementStatus[] = ["Unplanned", "Planned", "InProgress", "Satisfied"];

/**
 * Moves a requirement FORWARD along Unplanned → Planned → InProgress →
 * Satisfied, one guarded transition at a time. Never moves backwards and never
 * touches a waived, superseded or cancelled requirement; a requirement already
 * at or past the target is left alone.
 */
export function advanceRequirement(ledger: Ledger, requirementId: string, to: RequirementStatus): Ledger {
  const targetIndex = FORWARD_PATH.indexOf(to);
  if (targetIndex === -1) return ledger;
  return {
    ...ledger,
    requirements: ledger.requirements.map((r) => {
      if (r.id !== requirementId) return r;
      let current: ExecutionRequirement = r;
      let index = FORWARD_PATH.indexOf(current.status);
      if (index === -1) return r; // Waived / Superseded / Cancelled: not ours to move
      while (index < targetIndex) {
        const next = FORWARD_PATH[index + 1];
        if (!canTransition(current.status, next)) return current;
        const result = transition(current, next);
        if (!result.ok || !result.requirement) return current;
        current = result.requirement;
        index += 1;
      }
      return current;
    })
  };
}

export function completeFulfillment(ledger: Ledger, fulfillmentId: string): Ledger {
  return {
    ...ledger,
    fulfillments: ledger.fulfillments.map((f) => (f.id === fulfillmentId ? { ...f, status: "Complete" as const } : f))
  };
}

/** Open Receipt fulfilments that reference a specific receipt line. */
export function openReceiptFulfillmentsForRef(ledger: Ledger, ref: string): FulfillmentRecord[] {
  return ledger.fulfillments.filter((f) => f.kind === "Receipt" && f.ref === ref && f.status === "Open");
}

/** A Unit's own physical requirements that still hold up its work. */
export function openMaterialRequirements(ledger: Ledger, unitId: string): ExecutionRequirement[] {
  return ledger.requirements.filter(
    (r) => r.unitId === unitId && isPhysicalCategory(r.category) && !isInert(r) && isOpen(r) && r.blocksWork === true
  );
}

/** True once nothing physical is still blocking this Unit's work. */
export function materialGateClear(ledger: Ledger, unitId: string): boolean {
  return openMaterialRequirements(ledger, unitId).length === 0;
}

/** The Unit's own open physical requirement a given inventory identity could satisfy, by role then spec. */
export function requirementForInstall(
  ledger: Ledger,
  unitId: string,
  componentKey: string | undefined,
  preferredRequirementId?: string
): ExecutionRequirement | undefined {
  const open = ledger.requirements.filter(
    (r) => r.unitId === unitId && isPhysicalCategory(r.category) && !isInert(r) && r.status !== "Satisfied"
  );
  if (preferredRequirementId) {
    const preferred = open.find((r) => r.id === preferredRequirementId);
    if (preferred) return preferred;
  }
  if (componentKey) {
    const byRole = open.find((r) => r.componentId?.endsWith(`-${componentKey}`));
    if (byRole) return byRole;
  }
  return open[0];
}
