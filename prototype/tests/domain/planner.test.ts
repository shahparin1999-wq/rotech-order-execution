// Planner task creation, assignment, due dates, priority, bucket movement,
// completion, checklist, and My Work's urgency sections.

import { describe, expect, it } from "vitest";
import { buildInitialState, CUSTOMER_ACME, ORDER_NO } from "@/domain/fixtures";
import {
  addTaskChecklistItem,
  assignTask,
  changeTaskDueDate,
  changeTaskPriority,
  completeTaskDirect,
  createTask,
  moveTaskBucket,
  reopenTaskDirect,
  toggleTaskChecklistItem,
  unassignTask
} from "@/domain/actions";
import { isOverdue, myWorkSections } from "@/domain/selectors";

const U = (n: number) => `${ORDER_NO}_1.${n}`;

describe("Task creation from Planner/Order/Unit/Customer", () => {
  it("creates a general Planner task with no order/unit target", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "General planning task" });
    const t = state.tasks.at(-1)!;
    expect(t.name).toBe("General planning task");
    expect(t.unitId).toBeNull();
    expect(t.orderNumber).toBeNull();
    expect(t.bucket).toBe("TBC");
    expect(t.status).toBe("Ready");
  });

  it("creates a Unit-linked task and infers the order from the Unit", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "Unit follow-up", unitId: U(2) });
    const t = state.tasks.at(-1)!;
    expect(t.unitId).toBe(U(2));
    expect(t.orderNumber).toBe(ORDER_NO);
  });

  it("creates a customer-linked task with no order/unit", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "Customer follow-up", customerId: CUSTOMER_ACME });
    const t = state.tasks.at(-1)!;
    expect(t.customerId).toBe(CUSTOMER_ACME);
    expect(t.unitId).toBeNull();
    expect(t.orderNumber).toBeNull();
  });

  it("rejects an explicit order/unit mismatch (ancestor consistency)", () => {
    const state = buildInitialState();
    expect(() =>
      createTask(state, "e-sarah", { name: "Bad task", unitId: U(1), orderNumber: "SAMPLE1002" })
    ).toThrow(/Inconsistent ancestors/);
  });

  it("rejects an unknown Unit or customer", () => {
    const state = buildInitialState();
    expect(() => createTask(state, "e-sarah", { name: "x", unitId: "no-such-unit" })).toThrow(
      /Unknown unit/
    );
    expect(() =>
      createTask(state, "e-sarah", { name: "x", customerId: "no-such-customer" })
    ).toThrow(/Unknown customer/);
  });

  it("rejects a blank task name", () => {
    const state = buildInitialState();
    expect(() => createTask(state, "e-sarah", { name: "   " })).toThrow(/name is required/i);
  });
});

describe("Task assignment", () => {
  it("assigning adds the assignee and sets ownerId if unset", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "Unassigned task" });
    const id = state.tasks.at(-1)!.id;
    state = assignTask(state, id, "e-sarah", "e-alex");
    const t = state.tasks.find((x) => x.id === id)!;
    expect(t.assigneeIds).toContain("e-alex");
    expect(t.ownerId).toBe("e-alex");
  });

  it("assigning the same employee twice is a no-op", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t" });
    const id = state.tasks.at(-1)!.id;
    state = assignTask(state, id, "e-sarah", "e-alex");
    const after1 = state.tasks.find((x) => x.id === id)!.assigneeIds.length;
    state = assignTask(state, id, "e-sarah", "e-alex");
    expect(state.tasks.find((x) => x.id === id)!.assigneeIds).toHaveLength(after1);
  });

  it("unassigning removes the assignee and clears/reassigns ownerId", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t", assigneeIds: ["e-alex", "e-miguel"] });
    const id = state.tasks.at(-1)!.id;
    expect(state.tasks.find((x) => x.id === id)!.ownerId).toBe("e-alex");
    state = unassignTask(state, id, "e-sarah", "e-alex");
    const t = state.tasks.find((x) => x.id === id)!;
    expect(t.assigneeIds).not.toContain("e-alex");
    expect(t.ownerId).toBe("e-miguel"); // falls back to remaining assignee
  });
});

describe("Task due dates and priority", () => {
  it("changes a task's due date and records history", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t" });
    const id = state.tasks.at(-1)!.id;
    state = changeTaskDueDate(state, id, "e-sarah", "2026-08-01");
    const t = state.tasks.find((x) => x.id === id)!;
    expect(t.dueDate).toBe("2026-08-01");
    expect(t.history.at(-1)!.action).toBe("DueDateChanged");
  });

  it("changes task priority", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t" });
    const id = state.tasks.at(-1)!.id;
    state = changeTaskPriority(state, id, "e-sarah", "Urgent");
    expect(state.tasks.find((x) => x.id === id)!.priority).toBe("Urgent");
  });
});

describe("Overdue computation", () => {
  it("isOverdue is true for a past due date and false for future/null", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    expect(isOverdue("2026-07-01", now)).toBe(true);
    expect(isOverdue("2026-08-01", now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });

  it("a task past its due date and not complete appears in My Work's overdue section", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", {
      name: "Overdue thing",
      assigneeIds: ["e-alex"],
      dueDate: "2020-01-01"
    });
    const sections = myWorkSections(state, "e-alex", new Date("2026-07-20T12:00:00Z"));
    expect(sections.overdue.some((t) => t.name === "Overdue thing")).toBe(true);
  });

  it("a Blocked task takes priority over its due date and lands in Blocked, not Overdue", () => {
    const state = buildInitialState();
    // Fixture task t-plan-blocked is Blocked, assigned to e-alex, with a
    // future due date.
    const sections = myWorkSections(state, "e-alex");
    expect(sections.blocked.some((t) => t.id === "t-plan-blocked")).toBe(true);
    expect(sections.overdue.some((t) => t.id === "t-plan-blocked")).toBe(false);
  });
});

describe("Planner board bucket movement", () => {
  it("moves a task to a new bucket and records history/audit, without altering status", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t", bucket: "TBC" });
    const id = state.tasks.at(-1)!.id;
    state = moveTaskBucket(state, id, "e-sarah", "Machining");
    const t = state.tasks.find((x) => x.id === id)!;
    expect(t.bucket).toBe("Machining");
    expect(t.status).toBe("Ready"); // a board drag never silently completes work
    expect(t.history.at(-1)!.action).toBe("BucketMoved");
    const audit = state.auditEvents.find(
      (e) => e.targetId === id && e.action === "task.bucketMoved"
    );
    expect(audit).toBeDefined();
  });

  it("moving to the same bucket is a no-op", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t", bucket: "TBC" });
    const id = state.tasks.at(-1)!.id;
    const before = state.tasks.find((x) => x.id === id)!.history.length;
    state = moveTaskBucket(state, id, "e-sarah", "TBC");
    expect(state.tasks.find((x) => x.id === id)!.history.length).toBe(before);
  });

  it("completeTaskDirect marks Complete and moves to the Complete bucket; reopen restores TBC", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t", bucket: "Machining" });
    const id = state.tasks.at(-1)!.id;
    state = completeTaskDirect(state, id, "e-sarah");
    let t = state.tasks.find((x) => x.id === id)!;
    expect(t.status).toBe("Complete");
    expect(t.bucket).toBe("Complete");
    state = reopenTaskDirect(state, id, "e-sarah");
    t = state.tasks.find((x) => x.id === id)!;
    expect(t.status).toBe("Ready");
    expect(t.bucket).toBe("TBC");
  });

  it("completeTaskDirect rejects an already-complete task", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t" });
    const id = state.tasks.at(-1)!.id;
    state = completeTaskDirect(state, id, "e-sarah");
    expect(() => completeTaskDirect(state, id, "e-sarah")).toThrow(/already complete/);
  });
});

describe("Task checklist", () => {
  it("adds and toggles a checklist item", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t" });
    const id = state.tasks.at(-1)!.id;
    state = addTaskChecklistItem(state, id, "e-sarah", "Do the thing");
    const item = state.tasks.find((x) => x.id === id)!.checklist[0];
    expect(item.done).toBe(false);
    state = toggleTaskChecklistItem(state, id, item.id);
    expect(state.tasks.find((x) => x.id === id)!.checklist[0].done).toBe(true);
  });

  it("rejects blank checklist item text", () => {
    let state = buildInitialState();
    state = createTask(state, "e-sarah", { name: "t" });
    const id = state.tasks.at(-1)!.id;
    expect(() => addTaskChecklistItem(state, id, "e-sarah", "  ")).toThrow(/text is required/i);
  });
});
