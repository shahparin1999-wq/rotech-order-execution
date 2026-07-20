// Orders grid: saved views, filters, search, sort, and grouping.

import { describe, expect, it } from "vitest";
import { buildInitialState, CUSTOMER_ACME, CUSTOMER_SAMPLE_PUMP, HOUSTON_ORDER_NO, ORDER_NO } from "@/domain/fixtures";
import { createWorkOrder } from "@/domain/actions";
import {
  applyOrderFilters,
  applySavedView,
  groupOrdersBy,
  searchOrders,
  sortOrders
} from "@/domain/selectors";

describe("Saved views", () => {
  it("'all' returns every order", () => {
    const state = buildInitialState();
    expect(applySavedView(state, "all")).toHaveLength(state.orders.length);
  });

  it("'open' excludes fully-complete orders; neither fixture order is complete", () => {
    const state = buildInitialState();
    const open = applySavedView(state, "open");
    expect(open.map((o) => o.orderNumber)).toEqual(
      expect.arrayContaining([ORDER_NO, HOUSTON_ORDER_NO])
    );
  });

  it("'blocked' returns only orders with a Blocked Unit", () => {
    const state = buildInitialState();
    const blocked = applySavedView(state, "blocked");
    // Unit 1.3 is Blocked in the fixture, so ORDER_NO qualifies.
    expect(blocked.some((o) => o.orderNumber === ORDER_NO)).toBe(true);
    expect(blocked.some((o) => o.orderNumber === HOUSTON_ORDER_NO)).toBe(false);
  });

  it("'awaiting-quality' returns orders with a Unit awaiting quality", () => {
    const state = buildInitialState();
    const aq = applySavedView(state, "awaiting-quality");
    expect(aq.some((o) => o.orderNumber === ORDER_NO)).toBe(true);
  });

  it("'completed' is empty until every Unit on an order is Complete", () => {
    const state = buildInitialState();
    expect(applySavedView(state, "completed")).toHaveLength(0);
  });
});

describe("Order filters", () => {
  it("filters by customer", () => {
    const state = buildInitialState();
    const filtered = applyOrderFilters(state, { customerId: CUSTOMER_ACME });
    expect(filtered.every((o) => o.customerId === CUSTOMER_ACME)).toBe(true);
    expect(filtered.some((o) => o.orderNumber === ORDER_NO)).toBe(true);
    expect(filtered.some((o) => o.orderNumber === HOUSTON_ORDER_NO)).toBe(false);
  });

  it("filters by facility, priority, and orderType", () => {
    const state = buildInitialState();
    expect(applyOrderFilters(state, { facility: "Houston" }).map((o) => o.orderNumber)).toEqual([
      HOUSTON_ORDER_NO
    ]);
    expect(applyOrderFilters(state, { priority: "High" }).every((o) => o.priority === "High")).toBe(
      true
    );
    expect(
      applyOrderFilters(state, { orderType: "Bare pump end" }).every(
        (o) => o.orderType === "Bare pump end"
      )
    ).toBe(true);
  });

  it("overdueOnly / blockedOnly / missingDetailsOnly flags narrow correctly", () => {
    const state = buildInitialState();
    const blockedOnly = applyOrderFilters(state, { blockedOnly: true });
    expect(blockedOnly.some((o) => o.orderNumber === ORDER_NO)).toBe(true);
    expect(blockedOnly.some((o) => o.orderNumber === HOUSTON_ORDER_NO)).toBe(false);

    // Every seeded order has a customerPo and at least one line, so
    // missingDetailsOnly should currently exclude everything.
    expect(applyOrderFilters(state, { missingDetailsOnly: true })).toHaveLength(0);
  });

  it("filters compose (AND semantics)", () => {
    const state = buildInitialState();
    const result = applyOrderFilters(state, { customerId: CUSTOMER_SAMPLE_PUMP, facility: "Mississauga" });
    expect(result).toHaveLength(0); // Sample Pump Services' order is Houston-only
  });
});

describe("Search, sort, and group", () => {
  it("searchOrders matches by order number, customer name, and PO", () => {
    const state = buildInitialState();
    expect(searchOrders(state.orders, state, ORDER_NO).map((o) => o.orderNumber)).toContain(ORDER_NO);
    expect(searchOrders(state.orders, state, "acme sample").map((o) => o.orderNumber)).toContain(ORDER_NO);
    expect(searchOrders(state.orders, state, "DEMO-0001").map((o) => o.orderNumber)).toContain(ORDER_NO);
    expect(searchOrders(state.orders, state, "no such thing")).toHaveLength(0);
  });

  it("an empty query returns every order unfiltered", () => {
    const state = buildInitialState();
    expect(searchOrders(state.orders, state, "  ")).toHaveLength(state.orders.length);
  });

  it("sortOrders sorts by due date ascending/descending", () => {
    const state = buildInitialState();
    const asc = sortOrders(state.orders, state, "dueDate", "asc");
    expect(asc[0].orderNumber).toBe(ORDER_NO); // earlier due date
    const desc = sortOrders(state.orders, state, "dueDate", "desc");
    expect(desc[0].orderNumber).toBe(HOUSTON_ORDER_NO);
  });

  it("groupOrdersBy groups by facility with no order lost or duplicated", () => {
    const state = buildInitialState();
    const groups = groupOrdersBy(state.orders, state, "facility");
    const total = groups.reduce((sum, g) => sum + g.orders.length, 0);
    expect(total).toBe(state.orders.length);
    expect(groups.find((g) => g.group === "Houston")!.orders.map((o) => o.orderNumber)).toEqual([
      HOUSTON_ORDER_NO
    ]);
  });
});

describe("A newly created work order is immediately visible to the grid", () => {
  it("appears in 'all'/'open' saved views and matches its own search/filter", () => {
    let state = buildInitialState();
    state = createWorkOrder(state, "e-sarah", {
      orderNumber: "DEMO-8001",
      customerId: CUSTOMER_ACME,
      customerPo: "PO-8001",
      description: "Grid visibility check",
      facility: "Mississauga",
      orderType: "Bare pump end",
      priority: "Low",
      dueDate: "2026-09-15",
      coordinatorId: "e-sarah",
      quantity: 1,
      model: "1196",
      size: "3x4-13",
      material: "316SS"
    });
    expect(applySavedView(state, "all").some((o) => o.orderNumber === "DEMO-8001")).toBe(true);
    expect(applySavedView(state, "open").some((o) => o.orderNumber === "DEMO-8001")).toBe(true);
    expect(searchOrders(state.orders, state, "DEMO-8001")).toHaveLength(1);
    expect(applyOrderFilters(state, { priority: "Low" }).some((o) => o.orderNumber === "DEMO-8001")).toBe(
      true
    );
  });
});
