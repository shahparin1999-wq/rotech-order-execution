// New Work Order creation, including quantity-driven Unit generation
// (protected invariant: quantity N creates exactly N isolated Units with
// stable ids, never a shared/aggregate object).

import { describe, expect, it } from "vitest";
import { buildInitialState, CUSTOMER_ACME } from "@/domain/fixtures";
import { createWorkOrder, type WorkOrderInput } from "@/domain/actions";
import { tasksForOrder, unitsForOrder } from "@/domain/selectors";

function baseInput(overrides: Partial<WorkOrderInput> = {}): WorkOrderInput {
  return {
    orderNumber: "DEMO-9001",
    customerId: CUSTOMER_ACME,
    customerPo: "PO-9001",
    description: "Fictional demo work order",
    facility: "Mississauga",
    orderType: "Bare pump end",
    priority: "Medium",
    dueDate: "2026-09-01",
    coordinatorId: "e-sarah",
    instructions: "Handle with care",
    quantity: 3,
    model: "1196",
    size: "3x4-13",
    material: "316SS",
    ...overrides
  };
}

describe("Work order creation", () => {
  it("creates the order, one line, and an audit event", () => {
    let state = buildInitialState();
    state = createWorkOrder(state, "e-sarah", baseInput());
    const order = state.orders.find((o) => o.orderNumber === "DEMO-9001")!;
    expect(order).toBeDefined();
    expect(order.customerId).toBe(CUSTOMER_ACME);
    expect(order.customerPo).toBe("PO-9001");
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].quantity).toBe(3);
    const audit = state.auditEvents.find(
      (e) => e.action === "order.created" && e.targetId === "DEMO-9001"
    );
    expect(audit).toBeDefined();
  });

  it("quantity N generates exactly N isolated Units with stable, sequential ids", () => {
    let state = buildInitialState();
    state = createWorkOrder(state, "e-sarah", baseInput({ quantity: 4 }));
    const units = unitsForOrder(state, "DEMO-9001");
    expect(units).toHaveLength(4);
    expect(units.map((u) => u.unitId)).toEqual([
      "DEMO-9001_1.1",
      "DEMO-9001_1.2",
      "DEMO-9001_1.3",
      "DEMO-9001_1.4"
    ]);
    // Every Unit is independent (no shared object): distinct publicRefs.
    const refs = new Set(units.map((u) => u.publicRef));
    expect(refs.size).toBe(4);
  });

  it("creates one intake Task per Unit, correctly scoped, with no id collisions", () => {
    let state = buildInitialState();
    state = createWorkOrder(state, "e-sarah", baseInput({ quantity: 5 }));
    const units = unitsForOrder(state, "DEMO-9001");
    const tasks = tasksForOrder(state, "DEMO-9001");
    expect(tasks).toHaveLength(5);
    const taskIds = new Set(tasks.map((t) => t.id));
    expect(taskIds.size).toBe(5); // no collisions
    for (const u of units) {
      const t = tasks.find((task) => task.unitId === u.unitId);
      expect(t).toBeDefined();
      expect(t!.name).toBe("Intake review");
    }
  });

  it("a Unit created through the drawer never leaks into a sibling Unit's task list", () => {
    let state = buildInitialState();
    state = createWorkOrder(state, "e-sarah", baseInput({ quantity: 3 }));
    const units = unitsForOrder(state, "DEMO-9001");
    for (const u of units) {
      const tasksForThisUnit = state.tasks.filter((t) => t.unitId === u.unitId);
      expect(tasksForThisUnit).toHaveLength(1);
      for (const sibling of units) {
        if (sibling.unitId === u.unitId) continue;
        expect(tasksForThisUnit.some((t) => t.unitId === sibling.unitId)).toBe(false);
      }
    }
  });

  it("rejects a duplicate order number", () => {
    let state = buildInitialState();
    state = createWorkOrder(state, "e-sarah", baseInput());
    expect(() => createWorkOrder(state, "e-sarah", baseInput())).toThrow(/already exists/);
  });

  it("rejects an unknown customer", () => {
    const state = buildInitialState();
    expect(() =>
      createWorkOrder(state, "e-sarah", baseInput({ customerId: "cust-does-not-exist" }))
    ).toThrow(/Unknown customer/);
  });

  it("rejects a quantity below 1", () => {
    const state = buildInitialState();
    expect(() => createWorkOrder(state, "e-sarah", baseInput({ quantity: 0 }))).toThrow(
      /Quantity must be at least 1/
    );
  });

  it("rejects a blank order number", () => {
    const state = buildInitialState();
    expect(() => createWorkOrder(state, "e-sarah", baseInput({ orderNumber: "  " }))).toThrow(
      /Order number is required/
    );
  });
});
