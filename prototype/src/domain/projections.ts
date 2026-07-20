// Calculated Unit and Operation status. Previously these were static fixture
// fields, so completing a task never visibly moved the Unit's badge. This
// module derives both from the Unit's own Tasks and RouteOperations at
// write time, and is also the single place a saved/hydrated state must pass
// through before its projected values are trusted (see recomputeUnitProjection
// callers in actions.ts and StoreProvider.tsx's hydrateState handling).
//
// A projection is only ever built for one Unit's own data (Unit isolation,
// AGENTS.md invariant 1) - callers must never pass a mixed set of ops/tasks
// across Units.

import type { AppState, RouteOperation, Task, Unit, UnitStatus } from "./types";

// Operations before the "currently active" one have no backing Task record
// in the fixtures - they're historical seed data, the same way pre-seeded
// checklist timestamps already are. Only an operation a live Task actually
// references gets its status derived; everything else passes its seed value
// through unchanged.
export function projectOperationStatus(
  task: Task | undefined,
  op: RouteOperation,
  siblingOps: RouteOperation[]
): RouteOperation["status"] {
  if (!task) return op.status;

  switch (task.status) {
    case "Blocked":
      return "Blocked";
    case "InProgress":
    case "Paused":
    case "WaitingInspection":
      return "InProgress";
    case "Complete":
      return "Complete";
    default: {
      const prior = siblingOps.find((o) => o.seq === op.seq - 1);
      return op.seq === 1 || prior?.status === "Complete" ? "Ready" : "NotStarted";
    }
  }
}

// Derives a Unit's 5-value status from its own projected operations, with a
// Task-only fallback for Units that have zero RouteOperations (e.g. the
// Houston order in the fixtures).
export function projectUnitStatus(
  unitTasks: Task[],
  projectedOps: RouteOperation[]
): UnitStatus {
  if (projectedOps.length === 0) {
    if (unitTasks.some((t) => t.status === "Blocked")) return "Blocked";
    if (unitTasks.some((t) => t.status === "InProgress" || t.status === "Paused")) {
      return "InAssembly";
    }
    if (unitTasks.length > 0 && unitTasks.every((t) => t.status === "Complete")) {
      return "Complete";
    }
    return "NotStarted";
  }

  if (projectedOps.some((op) => op.status === "Blocked")) return "Blocked";
  if (projectedOps.some((op) => op.status === "InProgress")) return "InAssembly";

  const completeCount = projectedOps.filter((op) => op.status === "Complete").length;
  if (completeCount === projectedOps.length) return "Complete";
  if (completeCount === 0) return "NotStarted";

  const nextOp = projectedOps
    .filter((op) => op.status !== "Complete")
    .sort((a, b) => a.seq - b.seq)[0];
  return nextOp?.department === "Quality" ? "AwaitingQuality" : "InAssembly";
}

// Recomputes and writes back this one Unit's routeOps + Unit.status. Reads
// only that Unit's own tasks/ops (Unit isolation) and returns a new AppState
// - does not mutate the one passed in.
export function recomputeUnitProjection(state: AppState, unitId: string): AppState {
  const unitTasks = state.tasks.filter((t) => t.unitId === unitId);
  const unitOps = state.routeOps
    .filter((op) => op.unitId === unitId)
    .sort((a, b) => a.seq - b.seq);

  const projectedOps = unitOps.map((op) => {
    const task = unitTasks.find((t) => t.operationId === op.id);
    return { ...op, status: projectOperationStatus(task, op, unitOps) };
  });

  const nextStatus = projectUnitStatus(unitTasks, projectedOps);

  return {
    ...state,
    routeOps: state.routeOps.map(
      (op) => projectedOps.find((p) => p.id === op.id) ?? op
    ),
    units: state.units.map((u): Unit =>
      u.unitId === unitId ? { ...u, status: nextStatus } : u
    )
  };
}
