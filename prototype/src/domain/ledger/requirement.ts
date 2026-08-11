// Execution Requirement Ledger — core contract.
// Spec: the approved "Execution Requirement Ledger — Domain Contract" plan.
//
// Governing principle: for every pump on every order, is everything required
// identified, owned, due, sourced, completed, verified and documented?
//
// The central distinction this module enforces: a REQUIREMENT is a statement of
// something that must be TRUE. It is never the task used to make it true. What
// actually happened is recorded as one or more separate FulfillmentRecords.
// That one-to-many split is what makes partial receipts, replacements,
// rejections, multiple POs, transfers and returns representable at all — a
// single merged record cannot express "ordered 1, received 1, rejected it,
// received a replacement".
//
// PURE DOMAIN. No React, no localStorage, no browser globals, no storage
// coupling — so these same modules and tests run unchanged against
// PostgreSQL-backed repositories after Gate A (D-025). Enforced by the purity
// guard in tests/domain/ledger/purity.test.ts.

// ---------------------------------------------------------------------------
// Requirement
// ---------------------------------------------------------------------------

// Deliberately exactly the set 1196 needs. It grows only when a second family
// (1296 close-coupled) proves a genuine gap — abstracting ahead of evidence is
// how the previous per-family modules became unmaintainable.
export const REQUIREMENT_CATEGORIES = [
  "Configuration",
  "Component",
  "Material",
  "Drawing",
  "TaskCoverage",
  "Inspection",
  "Measurement",
  "Test",
  "Certificate",
  "Evidence",
  "Packaging",
  "Shipment"
] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

// Where the requirement came from. Drives authority: an AuthorizedManualAddition
// can be waived more freely than something derived from the commercial snapshot.
export const REQUIREMENT_SOURCES = [
  "CommercialSnapshot",
  "CpqConfiguration",
  "FamilyDefinition",
  "OperationalRevision",
  "AuthorizedManualAddition"
] as const;
export type RequirementSource = (typeof REQUIREMENT_SOURCES)[number];

export const REQUIREMENT_STATUSES = [
  "Unplanned",
  "Planned",
  "InProgress",
  "Satisfied",
  "Waived",
  "Superseded",
  "Cancelled"
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

// A requirement is never "owned by nobody". The owner may be a specific person,
// a role, or a department queue — see the accountable-owner vs execution-
// assignee split: demanding a named technician on every future requirement
// produces fake assignments weeks in advance.
export type AccountableOwnerType = "Person" | "Role" | "Department";

export interface ExecutionRequirement {
  id: string;

  // Scope. executionOrderId is always set; the rest narrow it. A requirement
  // with no unitId is line- or order-scoped shared work (approve one drawing
  // used by five Units), which must NOT be duplicated per Unit.
  executionOrderId: string;
  lineId?: string;
  unitId?: string;
  assemblyId?: string;
  componentId?: string;

  category: RequirementCategory;
  source: RequirementSource;
  sourceRef: string; // the rule / snapshot field / revision that produced it
  description: string;

  mandatory: boolean;
  blocksWork?: boolean; // gates its own operation
  blocksRelease?: boolean; // gates final Unit release

  accountableOwnerType: AccountableOwnerType;
  accountableOwnerId: string;
  needBy?: string; // ISO date

  status: RequirementStatus;
  fulfillmentRefs: string[]; // FulfillmentRecord ids

  // Set when status is Waived. Authority is checked by the coverage rules, not
  // here, so an unauthorized waiver is detectable rather than impossible to
  // represent (we must be able to see that it happened).
  waivedBy?: string;
  waivedReason?: string;

  // Set when a controlled revision supersedes this requirement. The old record
  // stays in history — nothing is deleted.
  supersededById?: string;

  createdAt: string;
}

// Only these categories name a physical thing that can be matched against
// inventory. A test result or a drawing approval is satisfied by other
// evidence, never by a part.
export function isPhysicalCategory(category: RequirementCategory): boolean {
  return category === "Component" || category === "Material";
}

// A requirement is "open" when it still demands action.
export function isOpen(requirement: ExecutionRequirement): boolean {
  return (
    requirement.status === "Unplanned" ||
    requirement.status === "Planned" ||
    requirement.status === "InProgress"
  );
}

// A requirement is "closed out" when it no longer demands action — whether it
// was met, waived, superseded or cancelled. Note Waived counts as closed for
// flow purposes but is reported separately on the release manifest, because a
// waiver is a decision someone must answer for.
export function isClosedOut(requirement: ExecutionRequirement): boolean {
  return !isOpen(requirement);
}

// Only a requirement that is genuinely inert should be ignored by coverage
// checks. A Waived requirement is NOT inert — it still needs its authority
// checked and still appears on the release manifest.
export function isInert(requirement: ExecutionRequirement): boolean {
  return requirement.status === "Superseded" || requirement.status === "Cancelled";
}

// Requirements that hold up final release: mandatory, release-gating, and not
// yet satisfied. Waived ones do not block (that is the point of a waiver) but
// are surfaced on the manifest.
export function blocksRelease(requirement: ExecutionRequirement): boolean {
  if (isInert(requirement)) return false;
  if (!requirement.blocksRelease) return false;
  return requirement.status !== "Satisfied" && requirement.status !== "Waived";
}

// Requirements that hold up their own operation — this is what lets power-end
// work proceed while an impeller trim requirement is still open, instead of
// one open item freezing the whole Unit.
export function blocksWork(requirement: ExecutionRequirement): boolean {
  if (isInert(requirement)) return false;
  if (!requirement.blocksWork) return false;
  return requirement.status !== "Satisfied" && requirement.status !== "Waived";
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  Unplanned: ["Planned", "Superseded", "Cancelled", "Waived"],
  Planned: ["InProgress", "Unplanned", "Superseded", "Cancelled", "Waived"],
  InProgress: ["Satisfied", "Planned", "Superseded", "Cancelled", "Waived"],
  // Satisfied can still be superseded (a controlled revision changed the spec)
  // or reopened if evidence is later rejected — but never silently cancelled.
  Satisfied: ["Superseded", "InProgress"],
  Waived: ["Superseded", "Planned"],
  // Terminal.
  Superseded: [],
  Cancelled: []
};

export function canTransition(from: RequirementStatus, to: RequirementStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface TransitionResult {
  ok: boolean;
  requirement?: ExecutionRequirement;
  error?: string;
}

// Applies a status change, refusing an illegal transition rather than coercing
// it. Waiving requires a reason and an actor so the coverage rules can check
// authority afterwards (fail loud, not fail silent).
export function transition(
  requirement: ExecutionRequirement,
  to: RequirementStatus,
  opts: { actorId?: string; reason?: string } = {}
): TransitionResult {
  if (!canTransition(requirement.status, to)) {
    return {
      ok: false,
      error: `Cannot move requirement ${requirement.id} from ${requirement.status} to ${to}`
    };
  }
  if (to === "Waived") {
    if (!opts.actorId) return { ok: false, error: "Waiving a requirement requires an actor" };
    if (!opts.reason?.trim()) return { ok: false, error: "Waiving a requirement requires a reason" };
    return {
      ok: true,
      requirement: { ...requirement, status: to, waivedBy: opts.actorId, waivedReason: opts.reason.trim() }
    };
  }
  return { ok: true, requirement: { ...requirement, status: to } };
}

// ---------------------------------------------------------------------------
// Fulfillment
// ---------------------------------------------------------------------------

export const FULFILLMENT_KINDS = [
  "PurchaseRequirement",
  "PoReference",
  "Reservation",
  "Transfer",
  "Receipt",
  "IncomingInspection",
  "InventoryItem",
  "UnitAllocation",
  "Task",
  "Checkpoint",
  "MeasurementResult",
  "TestResult",
  "Evidence"
] as const;
export type FulfillmentKind = (typeof FULFILLMENT_KINDS)[number];

export const FULFILLMENT_STATUSES = [
  "Open",
  "Complete",
  "Rejected",
  "Cancelled",
  "Superseded"
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export interface FulfillmentRecord {
  id: string;
  requirementId: string;
  kind: FulfillmentKind;
  ref: string; // id in the owning subsystem (PO line, task id, evidence id…)
  quantity?: number;
  status: FulfillmentStatus;
  supersedesId?: string; // replacement chain: rejected receipt → replacement
  recordedBy: string;
  recordedAt: string;
}

// A fulfilment record only counts toward satisfying a requirement when it
// actually landed. A rejected receipt or a cancelled PO is history, not progress
// — this is what stops "ordered" being mistaken for "received".
export function countsTowardSatisfaction(record: FulfillmentRecord): boolean {
  return record.status === "Complete";
}

// Live records are those still in play (open or complete). Used to decide
// whether a requirement has any fulfilment PATH at all, which is a weaker and
// earlier check than whether it is satisfied.
export function isLiveFulfillment(record: FulfillmentRecord): boolean {
  return record.status === "Open" || record.status === "Complete";
}

// Total received/allocated quantity across live records, for partial receipts:
// a PO line delivering 1 of 2 must not mark the requirement complete.
export function fulfilledQuantity(records: FulfillmentRecord[], kind?: FulfillmentKind): number {
  return records
    .filter((r) => countsTowardSatisfaction(r) && (kind === undefined || r.kind === kind))
    .reduce((sum, r) => sum + (r.quantity ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Ledger view helpers
// ---------------------------------------------------------------------------

export interface Ledger {
  requirements: ExecutionRequirement[];
  fulfillments: FulfillmentRecord[];
}

export function fulfillmentsFor(ledger: Ledger, requirementId: string): FulfillmentRecord[] {
  return ledger.fulfillments.filter((f) => f.requirementId === requirementId);
}

export function requirementById(ledger: Ledger, id: string): ExecutionRequirement | undefined {
  return ledger.requirements.find((r) => r.id === id);
}

// Requirements applying to one Unit: its own, plus the line- and order-scoped
// shared requirements above it. Shared work is REFERENCED here, never copied —
// the same line-scoped drawing approval appears for every Unit on the line but
// exists once in the ledger.
export function requirementsForUnit(
  ledger: Ledger,
  unitId: string,
  unitLineId: string,
  executionOrderId: string
): ExecutionRequirement[] {
  return ledger.requirements.filter((r) => {
    if (isInert(r)) return false;
    if (r.unitId) return r.unitId === unitId;
    if (r.lineId) return r.lineId === unitLineId;
    return r.executionOrderId === executionOrderId;
  });
}

// Strictly this Unit's own requirements — no shared ones. This is the set that
// must never contain a sibling's actual parts or evidence.
export function ownRequirementsForUnit(ledger: Ledger, unitId: string): ExecutionRequirement[] {
  return ledger.requirements.filter((r) => r.unitId === unitId && !isInert(r));
}
