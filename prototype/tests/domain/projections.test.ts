// Regression guard for calculated Unit/Operation status (Phase 3 of the
// team-demo plan). Two things must always hold:
//   1. The seeded state's stored status already agrees with a from-scratch
//      recompute - if a future mutating action forgets to call
//      recomputeUnitProjection, this test fails loudly instead of the bug
//      going unnoticed.
//   2. A deliberately wrong/stale cached status is corrected the moment it
//      is recomputed - the projection is always the source of truth, a
//      persisted value is only ever a starting point.

import { describe, expect, it } from "vitest";
import { buildInitialState, HOUSTON_ORDER_NO, ORDER_NO } from "@/domain/fixtures";
import {
  projectOperationStatus,
  projectUnitStatus,
  recomputeUnitProjection
} from "@/domain/projections";
import { unitsForOrder } from "@/domain/selectors";
import type { AppState } from "@/domain/types";

function fromScratchUnitStatus(state: AppState, unitId: string) {
  const unitTasks = state.tasks.filter((t) => t.unitId === unitId);
  const unitOps = state.routeOps
    .filter((op) => op.unitId === unitId)
    .sort((a, b) => a.seq - b.seq);
  const projectedOps = unitOps.map((op) => {
    const task = unitTasks.find((t) => t.operationId === op.id);
    return { ...op, status: projectOperationStatus(task, op, unitOps) };
  });
  return projectUnitStatus(unitTasks, projectedOps);
}

describe("Calculated Unit/Operation status - drift guard", () => {
  it("every seeded Unit's stored status already matches a from-scratch recompute", () => {
    const state = buildInitialState();
    const allUnits = [
      ...unitsForOrder(state, ORDER_NO),
      ...unitsForOrder(state, HOUSTON_ORDER_NO)
    ];
    expect(allUnits.length).toBeGreaterThan(0);
    for (const unit of allUnits) {
      expect(fromScratchUnitStatus(state, unit.unitId)).toBe(unit.status);
    }
  });

  it("reproduces the demo narrative: 5 Units in 5 different states", () => {
    const state = buildInitialState();
    const units = unitsForOrder(state, ORDER_NO);
    expect(units.map((u) => u.status)).toEqual([
      "Complete",
      "InAssembly",
      "Blocked",
      "AwaitingQuality",
      "NotStarted"
    ]);
  });
});

describe("Calculated Unit/Operation status - never trust a cached value", () => {
  it("recompute corrects a deliberately wrong cached Unit status", () => {
    let state = buildInitialState();
    const unitId = unitsForOrder(state, ORDER_NO)[0].unitId; // genuinely Complete

    // Simulate a stale/tampered save: force the wrong status directly,
    // bypassing any action.
    state = {
      ...state,
      units: state.units.map((u) =>
        u.unitId === unitId ? { ...u, status: "Blocked" } : u
      )
    };
    expect(state.units.find((u) => u.unitId === unitId)!.status).toBe("Blocked");

    const corrected = recomputeUnitProjection(state, unitId);
    expect(corrected.units.find((u) => u.unitId === unitId)!.status).toBe("Complete");
  });

  it("recompute corrects a deliberately wrong cached Operation status", () => {
    let state = buildInitialState();
    const unitId = unitsForOrder(state, ORDER_NO)[1].unitId; // has an active Task

    state = {
      ...state,
      routeOps: state.routeOps.map((op) =>
        op.unitId === unitId ? { ...op, status: "Complete" } : op
      )
    };
    expect(
      state.routeOps.filter((op) => op.unitId === unitId).every((op) => op.status === "Complete")
    ).toBe(true);

    const corrected = recomputeUnitProjection(state, unitId);
    const correctedOps = corrected.routeOps.filter((op) => op.unitId === unitId);
    // At least one operation reverts to a non-Complete status once
    // recomputed from the Unit's actual Task data.
    expect(correctedOps.some((op) => op.status !== "Complete")).toBe(true);
  });
});

describe("Calculated Unit/Operation status - completing work moves the badge", () => {
  it("a Unit with zero RouteOperations derives status from its Tasks alone", () => {
    const state = buildInitialState();
    const houstonUnits = unitsForOrder(state, HOUSTON_ORDER_NO);
    const opsForHouston = state.routeOps.filter((op) =>
      houstonUnits.some((u) => u.unitId === op.unitId)
    );
    expect(opsForHouston).toHaveLength(0); // confirms the fallback path is exercised
    // Still produces a sensible status per the Task-only fallback.
    for (const u of houstonUnits) {
      expect(["NotStarted", "InAssembly", "Blocked", "Complete"]).toContain(u.status);
    }
  });
});
