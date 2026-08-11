// Ordered / Required / Actual, side by side, for one Unit.
//
// The four layers stay separate here. This module READS the ordered
// configuration and the as-built records and reports the comparison — it never
// writes back. A disagreement surfaces as a review, not as a corrected order.
//
// It exists because a technician must never be shown two different values and
// left to decide silently: every row carries an evaluated state and, where the
// evaluation failed, the reason naming both sides.
//
// PURE DOMAIN — no React, no localStorage.

import {
  installedQuantity,
  isLiveUsage,
  needsVerification,
  requiredSpecFromDescription,
  usageForRequirement,
  type ComponentUsage,
  type MatchStatus,
  type RequiredSpec
} from "./componentUsage";
import { isInert, isPhysicalCategory, type ExecutionRequirement } from "./requirement";

/** Nothing recorded yet is a distinct state from "recorded and matching". */
export type RowMatchState = MatchStatus | "NotRecorded";

export interface RequiredVsActualRow {
  requirementId: string;
  componentRole: string;
  /** The ordered text, verbatim. Never derived from what was actually fitted. */
  orderedDescription: string;
  required: RequiredSpec;
  /** Parts currently in the Unit (allocated, issued or installed). */
  actual: ComponentUsage[];
  /** Removed, returned and superseded parts — retained, never deleted. */
  history: ComponentUsage[];
  installedQuantity: number;
  matchState: RowMatchState;
  /** The reason the evaluation landed where it did, naming both sides. */
  matchNote?: string;
  /** An unresolved or rejected match holds up installation and release. */
  needsReview: boolean;
  /** A part that never came through inventory: usable, but not trusted. */
  needsVerification: boolean;
  mandatory: boolean;
  blocksRelease: boolean;
}

// Worst-first: a single pending row must not be hidden behind a matching one.
const SEVERITY: Record<RowMatchState, number> = {
  Rejected: 0,
  PendingReview: 1,
  NotRecorded: 2,
  ApprovedSubstitution: 3,
  Matched: 4
};

function worstMatch(records: ComponentUsage[]): { state: RowMatchState; note?: string } {
  const live = records.filter(isLiveUsage);
  if (live.length === 0) return { state: "NotRecorded" };
  const worst = live.reduce((a, b) => (SEVERITY[a.matchStatus] <= SEVERITY[b.matchStatus] ? a : b));
  return { state: worst.matchStatus, note: worst.matchNote };
}

/**
 * Only the requirements that name a physical thing get an actual-part row.
 * A test or a drawing approval is satisfied by other evidence.
 */
export function isPhysicalRequirement(r: ExecutionRequirement): boolean {
  return isPhysicalCategory(r.category);
}

/**
 * One row per required component on ONE Unit. Sibling Units never appear —
 * the QC record depends on that isolation, so it is applied here rather than
 * left to the caller.
 */
export function requiredVsActual(
  requirements: ExecutionRequirement[],
  usages: ComponentUsage[],
  unitId: string
): RequiredVsActualRow[] {
  return requirements
    .filter((r) => r.unitId === unitId && isPhysicalRequirement(r) && !isInert(r))
    .map((r) => {
      const records = usageForRequirement(usages, r.id).filter((u) => u.unitId === unitId);
      const live = records.filter(isLiveUsage);
      const { state, note } = worstMatch(records);
      return {
        requirementId: r.id,
        componentRole: r.componentId ?? r.id,
        orderedDescription: r.description,
        required: requiredSpecFromDescription(r.description),
        actual: live,
        history: records.filter((u) => !isLiveUsage(u)),
        installedQuantity: installedQuantity(records, r.id),
        matchState: state,
        matchNote: note,
        needsReview: state === "PendingReview" || state === "Rejected",
        needsVerification: live.some(needsVerification),
        mandatory: r.mandatory,
        blocksRelease: r.blocksRelease === true
      };
    });
}

/** Rows a person has to act on, worst first. Drives the Unit exception list. */
export function rowsNeedingAttention(rows: RequiredVsActualRow[]): RequiredVsActualRow[] {
  return rows
    .filter((row) => row.needsReview || row.needsVerification || row.matchState === "NotRecorded")
    .sort((a, b) => SEVERITY[a.matchState] - SEVERITY[b.matchState]);
}

/** A Unit cannot be released while any mandatory physical row is unresolved. */
export function unresolvedForRelease(rows: RequiredVsActualRow[]): RequiredVsActualRow[] {
  return rows.filter(
    (row) => row.blocksRelease && (row.needsReview || row.matchState === "NotRecorded")
  );
}
