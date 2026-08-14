// Derived completeness and readiness.
//
// Nothing here is stored. A component is not complete because someone ticked a
// box — completeness is COMPUTED from the requirements that apply to it and
// rolls upward:
//
//   Requirement → Component → Assembly → Unit → Line → Execution Order
//
// Stored counters drift from the ledger; derived ones cannot. This is also why
// readiness is six independent dimensions rather than one status: a Unit can be
// waiting on a motor while six pump-end operations are ready to run, and a
// single overlapping enum hides exactly the thing the shop needs to see.
//
// PURE DOMAIN — no React, no localStorage, no browser globals.

import {
  isInert,
  isOpen,
  type ExecutionRequirement,
  type Ledger,
  type RequirementCategory
} from "./requirement";

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

export interface Completeness {
  total: number;
  satisfied: number;
  waived: number;
  open: number;
  /** Satisfied + waived, i.e. everything no longer demanding action. */
  closed: number;
  /** True only when nothing mandatory remains open. */
  complete: boolean;
  openRequirementIds: string[];
}

export function completenessOf(requirements: ExecutionRequirement[]): Completeness {
  const live = requirements.filter((r) => !isInert(r));
  const satisfied = live.filter((r) => r.status === "Satisfied");
  const waived = live.filter((r) => r.status === "Waived");
  const open = live.filter(isOpen);
  const mandatoryOpen = open.filter((r) => r.mandatory);
  return {
    total: live.length,
    satisfied: satisfied.length,
    waived: waived.length,
    open: open.length,
    closed: satisfied.length + waived.length,
    complete: mandatoryOpen.length === 0,
    openRequirementIds: open.map((r) => r.id)
  };
}

export function completenessForComponent(ledger: Ledger, componentId: string): Completeness {
  return completenessOf(ledger.requirements.filter((r) => r.componentId === componentId));
}

export function completenessForAssembly(ledger: Ledger, assemblyId: string): Completeness {
  return completenessOf(ledger.requirements.filter((r) => r.assemblyId === assemblyId));
}

// A Unit's completeness counts its own requirements plus the shared line/order
// requirements that apply to it — shared work is referenced, not copied, so it
// contributes to every Unit it covers without being duplicated in the ledger.
export function completenessForUnit(
  ledger: Ledger,
  unitId: string,
  unitLineId: string,
  executionOrderId: string
): Completeness {
  return completenessOf(
    ledger.requirements.filter((r) => {
      if (r.unitId) return r.unitId === unitId;
      if (r.lineId) return r.lineId === unitLineId;
      return r.executionOrderId === executionOrderId;
    })
  );
}

export function completenessForLine(ledger: Ledger, lineId: string): Completeness {
  return completenessOf(ledger.requirements.filter((r) => r.lineId === lineId));
}

export function completenessForOrder(ledger: Ledger, executionOrderId: string): Completeness {
  return completenessOf(ledger.requirements.filter((r) => r.executionOrderId === executionOrderId));
}

// ---------------------------------------------------------------------------
// Readiness — six independent dimensions
// ---------------------------------------------------------------------------

export const READINESS_DIMENSIONS = [
  "Configuration",
  "Drawings",
  "Materials",
  "Work",
  "Quality",
  "Shipping"
] as const;
export type ReadinessDimension = (typeof READINESS_DIMENSIONS)[number];

export type ReadinessState = "Ready" | "Partial" | "Blocked" | "NotStarted";

export interface DimensionReadiness {
  dimension: ReadinessDimension;
  state: ReadinessState;
  openRequirementIds: string[];
  blockingRequirementIds: string[];
}

// Which requirement categories feed each dimension.
const DIMENSION_CATEGORIES: Record<ReadinessDimension, RequirementCategory[]> = {
  Configuration: ["Configuration"],
  Drawings: ["Drawing"],
  Materials: ["Component", "Material"],
  Work: ["TaskCoverage"],
  Quality: ["Inspection", "Measurement", "Test", "Certificate", "Evidence"],
  Shipping: ["Packaging", "Shipment"]
};

function readinessFor(
  dimension: ReadinessDimension,
  requirements: ExecutionRequirement[]
): DimensionReadiness {
  const inDimension = requirements.filter(
    (r) => !isInert(r) && DIMENSION_CATEGORIES[dimension].includes(r.category)
  );
  const open = inDimension.filter(isOpen);
  const blocking = open.filter((r) => r.blocksWork === true || r.blocksRelease === true);

  let state: ReadinessState;
  if (inDimension.length === 0) state = "NotStarted";
  else if (open.length === 0) state = "Ready";
  else if (blocking.length > 0) state = "Blocked";
  else state = "Partial";

  return {
    dimension,
    state,
    openRequirementIds: open.map((r) => r.id),
    blockingRequirementIds: blocking.map((r) => r.id)
  };
}

export interface ReadinessSummary {
  dimensions: DimensionReadiness[];
  overall: ReadinessState;
  /** The single thing most worth fixing first, for the control-tower row. */
  primaryConstraint: string | null;
  /** Requirements that are open but not blocking — work available right now. */
  availableWorkCount: number;
}

// Overall is derived, but the dimensions remain individually visible: this is
// what stops one late package component making an entire Unit look unworkable.
export function readinessOf(requirements: ExecutionRequirement[]): ReadinessSummary {
  const dimensions = READINESS_DIMENSIONS.map((d) => readinessFor(d, requirements));
  const started = dimensions.filter((d) => d.state !== "NotStarted");

  let overall: ReadinessState;
  if (started.length === 0) overall = "NotStarted";
  else if (started.every((d) => d.state === "Ready")) overall = "Ready";
  else overall = "Partial";

  // A blocked dimension is the primary constraint, but it does NOT make the
  // overall state Blocked while other dimensions still have runnable work.
  const firstBlocked = dimensions.find((d) => d.state === "Blocked");
  const primaryConstraint = firstBlocked
    ? `${firstBlocked.dimension}: ${firstBlocked.blockingRequirementIds.length} blocking requirement(s)`
    : null;

  const live = requirements.filter((r) => !isInert(r));
  const availableWorkCount = live.filter(
    (r) => isOpen(r) && r.blocksWork !== true
  ).length;

  return { dimensions, overall, primaryConstraint, availableWorkCount };
}

export function readinessForUnit(
  ledger: Ledger,
  unitId: string,
  unitLineId: string,
  executionOrderId: string
): ReadinessSummary {
  return readinessOf(
    ledger.requirements.filter((r) => {
      if (r.unitId) return r.unitId === unitId;
      if (r.lineId) return r.lineId === unitLineId;
      return r.executionOrderId === executionOrderId;
    })
  );
}

// Requirements that can be worked right now: open, not themselves blocking, and
// not waiting on a blocking requirement in the same scope. This is the query
// behind "power-end work can start while the impeller waits for trim".
export function workableRequirements(requirements: ExecutionRequirement[]): ExecutionRequirement[] {
  return requirements.filter((r) => !isInert(r) && isOpen(r) && r.blocksWork !== true);
}
