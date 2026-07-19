import { describe, expect, it } from "vitest";
import { buildInitialState, ORDER_NO } from "@/domain/fixtures";
import {
  applyView,
  humanizeStatus,
  search,
  unitStatusLabel
} from "@/domain/selectors";

describe("Display helpers", () => {
  it("humanizes PascalCase lifecycle values", () => {
    expect(humanizeStatus("NotStarted")).toBe("Not started");
    expect(humanizeStatus("InProgress")).toBe("In progress");
    expect(humanizeStatus("WaitingInspection")).toBe("Waiting inspection");
    expect(humanizeStatus("Complete")).toBe("Complete");
  });

  it("labels Unit statuses for display", () => {
    expect(unitStatusLabel("InAssembly")).toBe("In assembly");
    expect(unitStatusLabel("AwaitingQuality")).toBe("Awaiting quality");
  });
});

describe("Views are filters over master orders", () => {
  it("location views never duplicate an order", () => {
    const state = buildInitialState();
    const miss = applyView(state, "mississauga");
    const hou = applyView(state, "houston");
    expect(miss.orders.map((o) => o.orderNumber)).toEqual([ORDER_NO]);
    expect(hou.orders.map((o) => o.orderNumber)).toEqual(["26SO00735"]);
    // The same master order object is reused, not copied per facility.
    expect(miss.orders[0]).toBe(state.orders[0]);
    // Total orders in the system is unchanged by filtering.
    expect(state.orders).toHaveLength(2);
  });

  it("blocked view returns only blocked Units", () => {
    const state = buildInitialState();
    const blocked = applyView(state, "blocked");
    expect(blocked.units.map((u) => u.unitId)).toEqual([`${ORDER_NO}_1.3`]);
  });
});

describe("Search", () => {
  it("finds a Unit by serial, an order by PO, and a comment by text", () => {
    const state = buildInitialState();
    expect(search(state, "2607143053").some((h) => h.id === `${ORDER_NO}_1.1`)).toBe(true);
    expect(search(state, "432877").some((h) => h.type === "Order")).toBe(true);
    expect(search(state, "CD4").some((h) => h.type === "Post")).toBe(true);
  });

  it("returns nothing for an empty query", () => {
    const state = buildInitialState();
    expect(search(state, "   ")).toEqual([]);
  });
});
