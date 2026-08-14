// Internal Jobs — lightweight operational work that is not a customer
// deliverable.
//
// Putting away stock, counting a rack or building a power end for stock are all
// real work that needs an owner and a due date, but none of them ships to a
// customer and none of them earns a QC release package. Forcing them through a
// full Execution Order would bury the orders that DO ship.
//
// Tasks are real `Task` records, so an internal job's work appears in Planner,
// My Work and department queues alongside production work rather than in a
// separate silo nobody checks.
//
// PURE DOMAIN — no React, no localStorage.

export const INTERNAL_JOB_TYPES = [
  "Receiving",
  "PutAway",
  "InventoryMove",
  "CycleCount",
  "Relabel",
  "Kitting",
  "InternalMachining",
  "StockAssembly",
  "Inspection",
  "Repair",
  "Transfer",
  "Custom"
] as const;
export type InternalJobType = (typeof INTERNAL_JOB_TYPES)[number];

export const INTERNAL_JOB_STATUSES = [
  "Draft",
  "Ready",
  "InProgress",
  "Blocked",
  "Complete",
  "Cancelled"
] as const;
export type InternalJobStatus = (typeof INTERNAL_JOB_STATUSES)[number];

export type InternalJobPriority = "Critical" | "High" | "Normal" | "Low";

export interface InternalJob {
  id: string;
  jobNumber: string;
  type: InternalJobType;
  title: string;
  description?: string;

  // Optional links. An internal job may stand alone or support an order.
  relatedOrderId?: string;
  relatedLineId?: string;
  relatedUnitId?: string;
  relatedRequirementId?: string;
  relatedInventoryItemIds: string[];

  locationId?: string;
  department: string;
  accountableOwnerId: string;
  assigneeIds: string[];
  priority: InternalJobPriority;
  dueDate?: string;
  status: InternalJobStatus;

  /** Ids of real Task records — internal jobs reuse the production task model. */
  taskIds: string[];

  /** Inventory this job produced, e.g. a power end built for stock. */
  outputInventoryIdentityIds: string[];

  createdAt: string;
  createdBy: string;
}

/**
 * INV-012: an internal job may CREATE inventory but can never release a
 * customer Unit. Enforced as a function rather than a comment because it is the
 * boundary that keeps stock work from short-circuiting QC.
 */
export function canReleaseCustomerUnit(): false {
  return false;
}

export function isOpenJob(job: InternalJob): boolean {
  return job.status !== "Complete" && job.status !== "Cancelled";
}

export function isOverdue(job: InternalJob, asOf: string): boolean {
  if (!isOpenJob(job) || !job.dueDate) return false;
  return job.dueDate < asOf;
}

// ---------------------------------------------------------------------------
// Put-away job generation
// ---------------------------------------------------------------------------

export interface PutAwayJobInput {
  jobNumber: string;
  identityIds: string[];
  facility: string;
  accountableOwnerId: string;
  createdBy: string;
  createdAt: string;
  dueDate?: string;
}

export interface GeneratedJob {
  job: InternalJob;
  /** Task descriptions, in order. The caller creates real Tasks from these. */
  taskSpecs: Array<{ title: string; department: string }>;
}

/**
 * INV-011: a stock receipt creates a put-away job unless it was accepted
 * directly into a defined location. The task list mirrors what actually has to
 * happen physically, so "put away" cannot be closed by a single click that
 * proves nothing.
 */
export function buildPutAwayJob(input: PutAwayJobInput): GeneratedJob {
  const count = input.identityIds.length;
  const job: InternalJob = {
    id: `ijob-${input.jobNumber}`,
    jobNumber: input.jobNumber,
    type: "PutAway",
    title: `Put away ${count} received item${count === 1 ? "" : "s"}`,
    description: "Stock receipt accepted without a final storage location.",
    relatedInventoryItemIds: [...input.identityIds],
    department: "Shipping",
    accountableOwnerId: input.accountableOwnerId,
    assigneeIds: [],
    priority: "Normal",
    dueDate: input.dueDate,
    status: "Ready",
    taskIds: [],
    outputInventoryIdentityIds: [],
    createdAt: input.createdAt,
    createdBy: input.createdBy
  };

  return {
    job,
    taskSpecs: [
      { title: "Verify received quantity", department: "Shipping" },
      { title: "Complete incoming inspection", department: "Quality" },
      { title: `Print ${count} inventory label${count === 1 ? "" : "s"}`, department: "Shipping" },
      { title: "Assign storage locations", department: "Shipping" },
      { title: "Move items to storage", department: "Shipping" },
      { title: "Confirm put away by scanning each location", department: "Shipping" }
    ]
  };
}

/**
 * A job is only complete when every accepted item it covers has landed
 * somewhere (INV-013). Returns the identity ids still without a location, so
 * the blocker is specific rather than "not finished".
 */
export function putAwayIncomplete(
  job: InternalJob,
  locationByIdentity: Record<string, string | null>
): string[] {
  return job.relatedInventoryItemIds.filter((id) => !locationByIdentity[id]);
}
