// Coverage rules — the mechanism that prevents details being missed.
//
// This is the control the whole product exists for. Every rule answers one part
// of: "for every pump on every order, is everything required identified, owned,
// due, sourced, completed, verified and documented?"
//
// Every rule returns the OFFENDING IDS, never a bare boolean. A boolean tells
// you something is wrong; a list tells you what to go fix. Callers surface
// these as exceptions in the Control Tower.
//
// PURE DOMAIN — no React, no localStorage, no browser globals.

import {
  fulfillmentsFor,
  isInert,
  isLiveFulfillment,
  type ExecutionRequirement,
  type Ledger,
  type RequirementCategory
} from "./requirement";
import { isAccepted, untraceableSharedEvidence, type EvidenceRecord } from "./evidence";

export interface CoverageFinding {
  rule: CoverageRuleId;
  requirementIds: string[];
  detail: string;
}

export const COVERAGE_RULE_IDS = [
  "no-accountable-owner",
  "no-need-by",
  "no-fulfillment-path",
  "overdue",
  "blocked",
  "waived-without-authority",
  "satisfied-without-evidence",
  "superseded-configuration",
  "component-without-source-disposition",
  "inspection-without-task-or-checkpoint",
  "evidence-without-capture-mechanism",
  "untraceable-shared-evidence"
] as const;
export type CoverageRuleId = (typeof COVERAGE_RULE_IDS)[number];

// Categories where a need-by date is meaningful. A Configuration requirement
// has no delivery date; a purchased Component certainly does.
const CATEGORIES_REQUIRING_NEED_BY: RequirementCategory[] = [
  "Component",
  "Material",
  "Drawing",
  "Certificate",
  "Packaging",
  "Shipment"
];

// Categories that must be backed by an actual capture mechanism, not just a
// statement that evidence is required.
const CATEGORIES_REQUIRING_CAPTURE: RequirementCategory[] = ["Evidence", "Measurement", "Test"];

// Who may waive what. A requirement traced to the commercial snapshot or the
// family definition cannot be waived by an ordinary participant.
const WAIVER_AUTHORITY: Record<string, string[]> = {
  CommercialSnapshot: ["Commercial", "Quality"],
  CpqConfiguration: ["Engineering", "Quality"],
  FamilyDefinition: ["Quality"],
  OperationalRevision: ["Production", "Quality", "Engineering"],
  AuthorizedManualAddition: ["Production", "Quality", "Engineering", "Coordination"]
};

export interface CoverageContext {
  ledger: Ledger;
  evidence: EvidenceRecord[];
  // Roles held by whoever waived a requirement, keyed by actor id. Supplied by
  // the caller because role membership is not the ledger's concern.
  rolesByActor?: Record<string, string[]>;
  // Requirement ids that carry a source disposition (stock/build/buy/transfer/
  // customer-supplied/not-in-scope). Supplied by the materials subsystem.
  requirementIdsWithDisposition?: string[];
  // "Today" for overdue evaluation; injected so tests are deterministic and the
  // module stays free of ambient clock dependencies.
  asOf: string;
}

function active(ledger: Ledger): ExecutionRequirement[] {
  return ledger.requirements.filter((r) => !isInert(r));
}

// 1. Requirement has no accountable owner.
export function noAccountableOwner(ctx: CoverageContext): string[] {
  return active(ctx.ledger)
    .filter((r) => !r.accountableOwnerId?.trim())
    .map((r) => r.id);
}

// 2. Requirement has no need-by date where its category demands one.
export function noNeedBy(ctx: CoverageContext): string[] {
  return active(ctx.ledger)
    .filter((r) => r.status !== "Satisfied" && r.status !== "Waived")
    .filter((r) => CATEGORIES_REQUIRING_NEED_BY.includes(r.category) && !r.needBy)
    .map((r) => r.id);
}

// 3. Requirement has no valid fulfilment path — nothing live is even attempting
// to satisfy it. This is the earliest and most important signal: it is how a
// required item ends up simply forgotten.
export function noFulfillmentPath(ctx: CoverageContext): string[] {
  return active(ctx.ledger)
    .filter((r) => r.status !== "Satisfied" && r.status !== "Waived")
    .filter((r) => fulfillmentsFor(ctx.ledger, r.id).filter(isLiveFulfillment).length === 0)
    .map((r) => r.id);
}

// 4. Requirement is overdue against its need-by date.
export function overdue(ctx: CoverageContext): string[] {
  return active(ctx.ledger)
    .filter((r) => r.status !== "Satisfied" && r.status !== "Waived")
    .filter((r) => !!r.needBy && r.needBy < ctx.asOf)
    .map((r) => r.id);
}

// 5. Requirement is blocking work or release while still open.
export function blocked(ctx: CoverageContext): string[] {
  return active(ctx.ledger)
    .filter((r) => r.status !== "Satisfied" && r.status !== "Waived")
    .filter((r) => r.blocksWork === true || r.blocksRelease === true)
    .map((r) => r.id);
}

// 6. Requirement was waived by someone without the authority to waive that
// source. A waiver is a decision someone must answer for, so an unauthorized
// one is detectable rather than unrepresentable.
export function waivedWithoutAuthority(ctx: CoverageContext): string[] {
  const roles = ctx.rolesByActor ?? {};
  return ctx.ledger.requirements
    .filter((r) => r.status === "Waived")
    .filter((r) => {
      if (!r.waivedBy || !r.waivedReason?.trim()) return true;
      const permitted = WAIVER_AUTHORITY[r.source] ?? [];
      const held = roles[r.waivedBy] ?? [];
      return !held.some((role) => permitted.includes(role));
    })
    .map((r) => r.id);
}

// 7. Requirement is marked satisfied but its required evidence is missing or
// not accepted. Prevents "complete" being asserted without proof.
export function satisfiedWithoutEvidence(ctx: CoverageContext): string[] {
  const acceptedEvidenceIds = new Set(ctx.evidence.filter(isAccepted).map((e) => e.id));
  return ctx.ledger.requirements
    .filter((r) => r.status === "Satisfied")
    .filter((r) => CATEGORIES_REQUIRING_CAPTURE.includes(r.category))
    .filter((r) => {
      const evidenceRefs = fulfillmentsFor(ctx.ledger, r.id).filter((f) => f.kind === "Evidence");
      if (evidenceRefs.length === 0) return true;
      return !evidenceRefs.some((f) => acceptedEvidenceIds.has(f.ref));
    })
    .map((r) => r.id);
}

// 8. Requirement belongs to a cancelled or superseded configuration but is still
// being worked. Stale work after a controlled revision.
export function supersededConfiguration(ctx: CoverageContext): string[] {
  return ctx.ledger.requirements
    .filter((r) => r.status === "Superseded" || r.status === "Cancelled")
    .filter((r) => fulfillmentsFor(ctx.ledger, r.id).some((f) => f.status === "Open"))
    .map((r) => r.id);
}

// 9. In-scope component requirement with no source disposition — nobody has
// decided whether it comes from stock, a build, a purchase or the customer.
export function componentWithoutSourceDisposition(ctx: CoverageContext): string[] {
  const withDisposition = new Set(ctx.requirementIdsWithDisposition ?? []);
  return active(ctx.ledger)
    .filter((r) => r.category === "Component" || r.category === "Material")
    .filter((r) => r.status !== "Waived")
    .filter((r) => !withDisposition.has(r.id))
    .map((r) => r.id);
}

// 10. Required inspection with no task or checkpoint to actually perform it.
export function inspectionWithoutTaskOrCheckpoint(ctx: CoverageContext): string[] {
  return active(ctx.ledger)
    .filter((r) => r.category === "Inspection")
    .filter((r) => r.status !== "Waived")
    .filter((r) => {
      const refs = fulfillmentsFor(ctx.ledger, r.id).filter(isLiveFulfillment);
      return !refs.some((f) => f.kind === "Task" || f.kind === "Checkpoint");
    })
    .map((r) => r.id);
}

// 11. Required evidence with no capture mechanism — nothing will ever produce
// the artefact, so the requirement can never legitimately be satisfied.
export function evidenceWithoutCaptureMechanism(ctx: CoverageContext): string[] {
  return active(ctx.ledger)
    .filter((r) => CATEGORIES_REQUIRING_CAPTURE.includes(r.category))
    .filter((r) => r.status !== "Waived" && r.status !== "Satisfied")
    .filter((r) => {
      const refs = fulfillmentsFor(ctx.ledger, r.id).filter(isLiveFulfillment);
      return !refs.some(
        (f) =>
          f.kind === "Checkpoint" ||
          f.kind === "Evidence" ||
          f.kind === "MeasurementResult" ||
          f.kind === "TestResult" ||
          f.kind === "IncomingInspection"
      );
    })
    .map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Full sweep
// ---------------------------------------------------------------------------

const RULES: Array<{ id: CoverageRuleId; run: (ctx: CoverageContext) => string[]; detail: string }> = [
  { id: "no-accountable-owner", run: noAccountableOwner, detail: "No accountable owner assigned" },
  { id: "no-need-by", run: noNeedBy, detail: "No need-by date for a date-bearing category" },
  { id: "no-fulfillment-path", run: noFulfillmentPath, detail: "Nothing is attempting to satisfy this" },
  { id: "overdue", run: overdue, detail: "Past its need-by date" },
  { id: "blocked", run: blocked, detail: "Open and blocking work or release" },
  { id: "waived-without-authority", run: waivedWithoutAuthority, detail: "Waived without reason or authority" },
  { id: "satisfied-without-evidence", run: satisfiedWithoutEvidence, detail: "Marked satisfied with no accepted evidence" },
  { id: "superseded-configuration", run: supersededConfiguration, detail: "Open work against a superseded requirement" },
  { id: "component-without-source-disposition", run: componentWithoutSourceDisposition, detail: "No source disposition chosen" },
  { id: "inspection-without-task-or-checkpoint", run: inspectionWithoutTaskOrCheckpoint, detail: "No task or checkpoint will perform it" },
  { id: "evidence-without-capture-mechanism", run: evidenceWithoutCaptureMechanism, detail: "No mechanism will capture the artefact" }
];

export interface CoverageReport {
  findings: CoverageFinding[];
  offendingRequirementIds: string[];
  clean: boolean;
}

// Runs every rule. `clean` means the ledger currently has no coverage gap — the
// closest thing to "nothing is falling through the cracks".
export function runCoverage(ctx: CoverageContext): CoverageReport {
  const findings: CoverageFinding[] = [];
  for (const rule of RULES) {
    const ids = rule.run(ctx);
    if (ids.length > 0) findings.push({ rule: rule.id, requirementIds: ids, detail: rule.detail });
  }

  // Evidence-side rule: shared evidence that names no Units cannot be shown on
  // any Unit report with a defensible reason.
  const untraceable = untraceableSharedEvidence(ctx.evidence);
  if (untraceable.length > 0) {
    findings.push({
      rule: "untraceable-shared-evidence",
      requirementIds: untraceable.map((e) => e.id),
      detail: "Shared evidence does not name the Units it applies to"
    });
  }

  const offending = [...new Set(findings.flatMap((f) => f.requirementIds))];
  return { findings, offendingRequirementIds: offending, clean: findings.length === 0 };
}
