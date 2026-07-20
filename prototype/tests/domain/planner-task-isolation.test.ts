// Unit isolation under the extended Planner Task model: a Task created,
// assigned, or moved for one Unit must never appear against a sibling Unit,
// and customer-level/general Planner tasks (no Unit) must never leak into a
// Unit's own task list either.

import { describe, expect, it } from "vitest";
import { buildInitialState, CUSTOMER_ACME, ORDER_NO } from "@/domain/fixtures";
import { assignTask, createTask, moveTaskBucket } from "@/domain/actions";
import { tasksForUnit } from "@/domain/selectors";

const U = (n: number) => `${ORDER_NO}_1.${n}`;

describe("Planner task Unit isolation", () => {
  it("a task created against one Unit never appears in a sibling Unit's task list", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "Unit 1.2 only follow-up", unitId: U(2) });
    const created = state.tasks.at(-1)!;
    expect(tasksForUnit(state, U(2))).toContainEqual(created);
    for (const seq of [1, 3, 4, 5]) {
      expect(tasksForUnit(state, U(seq)).some((t) => t.id === created.id)).toBe(false);
    }
  });

  it("assigning/moving a Unit-linked task does not alter any sibling Unit's tasks", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t", unitId: U(1) });
    const id = state.tasks.at(-1)!.id;
    const before = {
      2: tasksForUnit(state, U(2)).map((t) => t.id),
      3: tasksForUnit(state, U(3)).map((t) => t.id),
      4: tasksForUnit(state, U(4)).map((t) => t.id),
      5: tasksForUnit(state, U(5)).map((t) => t.id)
    };
    state = assignTask(state, id, "e-sarah", "e-alex");
    state = moveTaskBucket(state, id, "e-sarah", "Quality");
    expect(tasksForUnit(state, U(2)).map((t) => t.id)).toEqual(before[2]);
    expect(tasksForUnit(state, U(3)).map((t) => t.id)).toEqual(before[3]);
    expect(tasksForUnit(state, U(4)).map((t) => t.id)).toEqual(before[4]);
    expect(tasksForUnit(state, U(5)).map((t) => t.id)).toEqual(before[5]);
  });

  it("a customer-linked task with no Unit never shows up under any Unit", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "Customer-only task", customerId: CUSTOMER_ACME });
    const created = state.tasks.at(-1)!;
    for (const seq of [1, 2, 3, 4, 5]) {
      expect(tasksForUnit(state, U(seq)).some((t) => t.id === created.id)).toBe(false);
    }
  });

  it("a general Planner task (no Unit, no order, no customer) is isolated from every Unit", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "General task" });
    const created = state.tasks.at(-1)!;
    for (const seq of [1, 2, 3, 4, 5]) {
      expect(tasksForUnit(state, U(seq)).some((t) => t.id === created.id)).toBe(false);
    }
  });
});
