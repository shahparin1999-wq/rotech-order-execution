// Order -> Line -> Unit drill-down: the tree that replaces the flat Units
// table (which had no line grouping at all) and the per-line nested tabs.

import { describe, expect, it } from "vitest";
import {
  buildOrderTree,
  findLineNode,
  findUnitNode,
  lineNodeId,
  parseNodeId,
  rollupStatusForUnits,
  summarizeOrderTree,
  unitNodeId,
  unitsWaitingOnMaterial
} from "@/domain/ledger/orderTree";
import { buildInitialState, CUSTOMER_ACME } from "@/domain/fixtures";
import { createConfiguredOrder } from "@/domain/actions";
import { inspectInventory, receiveInventory, reserveInventory } from "@/domain/inventoryActions";
import { requiredSpecFromDescription } from "@/domain/ledger/componentUsage";
import { availabilityForRequirement } from "@/domain/inventory/availability";
import { newAssemblyLine, newSpareLine } from "@/domain/configurator";
import type { AppState } from "@/domain/types";

function orderWithSpareAndAssembly(quantity = 2) {
  const assembly = { ...newAssemblyLine("l1"), quantity };
  const spare = { ...newSpareLine("l2"), description: "Spare seal kit" };
  return createConfiguredOrder(buildInitialState(), "e-sarah", {
    orderNumber: "TREE-001",
    customerId: CUSTOMER_ACME,
    customerPo: "PO-TREE",
    description: "Order tree test",
    facility: "Mississauga",
    coordinatorId: "e-sarah",
    priority: "Medium",
    dueDate: "2026-10-01",
    lines: [assembly, spare]
  });
}

describe("parseNodeId / node ids", () => {
  it("round-trips a line node id", () => {
    expect(parseNodeId(lineNodeId(2))).toEqual({ kind: "line", lineNumber: 2 });
  });

  it("round-trips a unit node id, tolerating hyphenated order numbers", () => {
    expect(parseNodeId(unitNodeId("TEST1196-01_1.1"))).toEqual({ kind: "unit", unitId: "TEST1196-01_1.1" });
  });

  it("falls back to the order root for null, missing or unrecognised ids", () => {
    expect(parseNodeId(null)).toEqual({ kind: "order" });
    expect(parseNodeId(undefined)).toEqual({ kind: "order" });
    expect(parseNodeId("garbage")).toEqual({ kind: "order" });
  });
});

describe("rollupStatusForUnits", () => {
  it("has no units -> NotStarted", () => {
    expect(rollupStatusForUnits([])).toBe("NotStarted");
  });

  it("any Blocked wins over everything else", () => {
    expect(rollupStatusForUnits(["Complete", "Blocked", "NotStarted"])).toBe("Blocked");
  });

  it("all Complete -> Done", () => {
    expect(rollupStatusForUnits(["Complete", "Complete"])).toBe("Done");
  });

  it("all NotStarted -> NotStarted", () => {
    expect(rollupStatusForUnits(["NotStarted", "NotStarted"])).toBe("NotStarted");
  });

  it("a mix including at least one Complete -> PartiallyComplete", () => {
    expect(rollupStatusForUnits(["Complete", "InAssembly"])).toBe("PartiallyComplete");
  });

  it("in progress with none complete and none blocked -> InProgress", () => {
    expect(rollupStatusForUnits(["InAssembly", "AwaitingQuality"])).toBe("InProgress");
  });
});

describe("buildOrderTree", () => {
  it("groups units under their own line — the fix for the flat Units table", () => {
    const state = orderWithSpareAndAssembly(3);
    const tree = buildOrderTree(state, "TREE-001")!;

    expect(tree.lines).toHaveLength(2);
    const assemblyLine = findLineNode(tree, 1)!;
    expect(assemblyLine.units.map((u) => u.unit.unitId)).toEqual([
      "TREE-001_1.1",
      "TREE-001_1.2",
      "TREE-001_1.3"
    ]);
    expect(assemblyLine.displayRef).toBe("TREE-001-1");
    expect(assemblyLine.units[0].displayRef).toBe("TREE-001-1.1");
  });

  it("a non-unit-bearing line is a leaf with no units, not a fake empty table", () => {
    const state = orderWithSpareAndAssembly();
    const tree = buildOrderTree(state, "TREE-001")!;
    const spareLine = findLineNode(tree, 2)!;
    expect(spareLine.units).toHaveLength(0);
    expect(spareLine.rollupStatus).toBe("NotStarted");
  });

  it("returns undefined for an order that does not exist, rather than throwing", () => {
    expect(buildOrderTree(buildInitialState(), "NOPE")).toBeUndefined();
  });

  it("findUnitNode locates a unit under whichever line owns it", () => {
    const state = orderWithSpareAndAssembly(2);
    const tree = buildOrderTree(state, "TREE-001")!;
    expect(findUnitNode(tree, "TREE-001_1.2")?.displayRef).toBe("TREE-001-1.2");
    expect(findUnitNode(tree, "does-not-exist")).toBeUndefined();
  });

  it("rolls the order itself up from every unit across every line", () => {
    const state = orderWithSpareAndAssembly(2);
    const tree = buildOrderTree(state, "TREE-001")!;
    // Freshly configured: every unit starts NotStarted.
    expect(tree.rollupStatus).toBe("NotStarted");
  });
});

describe("summarizeOrderTree", () => {
  it("counts blocked units, and waiting-on-material with nothing yet received", () => {
    let state: AppState = orderWithSpareAndAssembly(2);
    state = {
      ...state,
      units: state.units.map((u) =>
        u.unitId === "TREE-001_1.1" ? { ...u, status: "Blocked" as const } : u
      )
    };
    const tree = buildOrderTree(state, "TREE-001")!;
    const summary = summarizeOrderTree(state, tree);
    expect(summary.totalUnits).toBe(2);
    expect(summary.complete).toBe(0);
    expect(summary.blocked).toBe(1);
    // Nothing has been received anywhere, so every physical requirement on
    // both units reads NoRecipe, which is not InStock either.
    expect(summary.waitingOnMaterial).toBe(2);
  });

  it("resolving every identifiable physical requirement clears them individually, even if unnamed ones (Shaft kit, with no material listed) legitimately stay NoRecipe", () => {
    let state: AppState = orderWithSpareAndAssembly(1);
    expect(unitsWaitingOnMaterial(state, "TREE-001").has("TREE-001_1.1")).toBe(true);

    // Only requirements whose description names a material or part number can
    // ever be matched against inventory (see the NoRecipe tests in
    // availability.test.ts) — that is by design, not a gap this test papers over.
    const identifiable = state.requirements.filter((r) => {
      if (r.unitId !== "TREE-001_1.1" || (r.category !== "Component" && r.category !== "Material")) return false;
      const spec = requiredSpecFromDescription(r.description);
      return Boolean(spec.material?.trim() || spec.partNumber?.trim());
    });
    expect(identifiable.length).toBeGreaterThan(0);

    for (const req of identifiable) {
      const spec = requiredSpecFromDescription(req.description);
      const key = req.componentId?.split("-").pop();
      state = receiveInventory(state, "e-dave", {
        kind: "Stock",
        facility: "Mississauga",
        partNumber: spec.partNumber ?? `PN-${key}`,
        description: req.description,
        material: spec.material,
        quantity: 1,
        componentKey: key,
        trackingPolicy: "QuantityTracked"
      });
      const identityId = state.inventoryIdentities.at(-1)!.id;
      state = inspectInventory(state, "e-dave", identityId, "Accept", "Looks good");
      state = reserveInventory(state, "e-dave", identityId, "TREE-001_1.1", 1, req.id);
    }

    for (const req of identifiable) {
      expect(availabilityForRequirement(state, req.id).state).toBe("InStock");
    }
  });
});
