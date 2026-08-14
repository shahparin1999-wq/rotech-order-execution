import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import {
  createWorkOrder,
  importExecutionPackage,
  addUnitsToLine,
  seedWorkingBom,
  addWorkingBomRow,
  updateWorkingBomRow,
  removeWorkingBomRow
} from "@/domain/actions";
import type { ExecutionPackageV1 } from "@/domain/executionPackage";

function manualOrder(on: string) {
  return createWorkOrder(buildInitialState(), "e-alex", {
    orderNumber: on,
    customerId: buildInitialState().customers[0].id,
    customerPo: "PO-1",
    description: "d",
    facility: "Mississauga" as const,
    orderType: "Bare pump end",
    priority: "Medium" as const,
    dueDate: "2026-08-01",
    coordinatorId: "e-alex",
    quantity: 2,
    model: "1196",
    size: "3x4-13",
    material: "316SS",
    templateId: "1196-pump-end"
  });
}

function loadSample(): ExecutionPackageV1 {
  return JSON.parse(readFileSync("sample-data/cpq-execution-package-v1.json", "utf8")) as ExecutionPackageV1;
}
function importSample(on: string) {
  return importExecutionPackage(buildInitialState(), "e-alex", {
    package: loadSample(),
    orderNumber: on,
    facility: "Mississauga" as const,
    coordinatorId: "e-alex"
  });
}

describe("addUnitsToLine", () => {
  it("appends units to a manual line, continuing the sequence and template route", () => {
    const on = "ADD-MANUAL";
    let state = manualOrder(on);
    state = addUnitsToLine(state, "e-alex", { orderNumber: on, lineId: `${on}-L1`, count: 2 });

    const units = state.units.filter((u) => u.orderNumber === on).map((u) => u.unitId).sort();
    expect(units).toEqual([`${on}_1.1`, `${on}_1.2`, `${on}_1.3`, `${on}_1.4`]);
    expect(state.orders[state.orders.length - 1] && state.orders.find((o) => o.orderNumber === on)!.lines[0].quantity).toBe(4);
    // publicRefs all distinct (independent units)
    const refs = state.units.filter((u) => u.orderNumber === on).map((u) => u.publicRef);
    expect(new Set(refs).size).toBe(4);
    // new unit has the pump-end master route (6 ops)
    expect(state.routeOps.filter((o) => o.unitId === `${on}_1.3`)).toHaveLength(6);
  });

  it("appends units to a CPQ line without touching sibling lines", () => {
    const on = "Q-DEMO-1001-R3";
    let state = importSample(on);
    const line1 = `${on}-L1`;
    state = addUnitsToLine(state, "e-alex", { orderNumber: on, lineId: line1, count: 1 });

    const line1Units = state.units.filter((u) => u.orderNumber === on && u.lineNumber === 1);
    expect(line1Units.map((u) => u.unitId).sort()).toEqual([`${on}_1.1`, `${on}_1.2`, `${on}_1.3`]);
    // line 2 unaffected (still 1 unit)
    expect(state.units.filter((u) => u.orderNumber === on && u.lineNumber === 2)).toHaveLength(1);
    expect(state.auditEvents.some((e) => e.action === "units.added" && e.detail.includes("beyond CPQ baseline"))).toBe(true);
  });

  it("rejects a line that is not on the order (inconsistent ancestors)", () => {
    const on = "ADD-BAD";
    const state = manualOrder(on);
    expect(() => addUnitsToLine(state, "e-alex", { orderNumber: on, lineId: "SAMPLE1001-L1", count: 1 })).toThrow(
      /Inconsistent ancestors/
    );
  });
});

describe("working BOM (editable), layered over the frozen snapshot", () => {
  it("seeds from the CPQ snapshot and never mutates it", () => {
    const on = "Q-DEMO-1001-R3";
    let state = importSample(on);
    const line1 = `${on}-L1`;
    const snapBefore = JSON.stringify(state.configurationSnapshots);

    state = seedWorkingBom(state, "e-alex", on, line1);
    const rows = state.workingBomRows.filter((r) => r.lineId === line1);
    expect(rows.length).toBe(5); // sample line 1 has 5 bom rows
    expect(rows.every((r) => r.seededFrom === "CPQ")).toBe(true);

    // Re-seeding is a no-op (does not clobber edits).
    const state2 = seedWorkingBom(state, "e-alex", on, line1);
    expect(state2.workingBomRows.filter((r) => r.lineId === line1)).toHaveLength(5);

    // Editing a working row leaves the frozen snapshot untouched.
    state = updateWorkingBomRow(state, "e-alex", rows[0].id, { material: "CD4MCu", partNumber: "NEW-PN" });
    expect(state.workingBomRows.find((r) => r.id === rows[0].id)!.material).toBe("CD4MCu");
    expect(JSON.stringify(state.configurationSnapshots)).toBe(snapBefore);
  });

  it("seeds a manual line from its model-template skeleton", () => {
    const on = "WBOM-MANUAL";
    let state = manualOrder(on);
    state = seedWorkingBom(state, "e-alex", on, `${on}-L1`);
    const rows = state.workingBomRows.filter((r) => r.lineId === `${on}-L1`);
    expect(rows.length).toBe(5); // 1196 pump-end skeleton
    expect(rows.every((r) => r.seededFrom === "Template")).toBe(true);
  });

  it("supports add and remove, isolated per line", () => {
    const on = "Q-DEMO-1001-R3";
    let state = importSample(on);
    const line1 = `${on}-L1`;
    const line2 = `${on}-L2`;

    state = addWorkingBomRow(state, "e-alex", { orderNumber: on, lineId: line1, description: "Gasket kit", material: "PTFE", quantity: 2 });
    state = addWorkingBomRow(state, "e-alex", { orderNumber: on, lineId: line2, description: "Seal set", quantity: 1 });
    expect(state.workingBomRows.filter((r) => r.lineId === line1)).toHaveLength(1);
    expect(state.workingBomRows.filter((r) => r.lineId === line2)).toHaveLength(1);

    const rowToRemove = state.workingBomRows.find((r) => r.lineId === line1)!;
    state = removeWorkingBomRow(state, "e-alex", rowToRemove.id);
    expect(state.workingBomRows.filter((r) => r.lineId === line1)).toHaveLength(0);
    // line 2's row is untouched
    expect(state.workingBomRows.filter((r) => r.lineId === line2)).toHaveLength(1);
  });
});
