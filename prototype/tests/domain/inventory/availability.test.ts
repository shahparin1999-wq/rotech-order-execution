// Material availability — the computed replacement for the color-coded
// spreadsheet cell and the hand-typed "holding Knighten orders" remark.

import { describe, expect, it } from "vitest";
import {
  availabilityForRequirement,
  competingRequirements,
  componentKeyOf
} from "@/domain/inventory/availability";
import { buildInitialState, CUSTOMER_ACME } from "@/domain/fixtures";
import { createConfiguredOrder } from "@/domain/actions";
import { inspectInventory, receiveInventory, reserveInventory } from "@/domain/inventoryActions";
import { newAssemblyLine } from "@/domain/configurator";
import { trackingPolicyFor } from "@/domain/inventory/identity";
import type { AppState } from "@/domain/types";

/**
 * These tests exercise the availability ALGORITHM, so they start from a state
 * with no stock at all — otherwise the demo seed (inventorySeed.ts) supplies
 * matching castings and every assertion here would be measuring the fixtures
 * rather than the rules.
 */
function emptyInventoryState(): AppState {
  const s = buildInitialState();
  return {
    ...s,
    inventoryIdentities: [],
    inventoryMovements: [],
    inventoryReceipts: [],
    inventoryReceiptLines: []
  };
}

function orderWithCasingRequirement(state: AppState, orderNumber: string, priority: "Urgent" | "High" | "Medium" | "Low", dueDate: string) {
  return createConfiguredOrder(state, "e-sarah", {
    orderNumber,
    customerId: CUSTOMER_ACME,
    customerPo: `PO-${orderNumber}`,
    description: "Availability test",
    facility: "Mississauga",
    coordinatorId: "e-sarah",
    priority,
    dueDate,
    lines: [newAssemblyLine("l1")]
  });
}

function casingRequirement(state: AppState, unitId: string) {
  return state.requirements.find((r) => r.unitId === unitId && r.componentId?.endsWith("-casing"))!;
}

function acceptedCasing(state: AppState, opts: { componentKey?: string; material?: string } = {}) {
  const componentKey = opts.componentKey === undefined ? "casing" : opts.componentKey;
  const trackingPolicy = trackingPolicyFor(componentKey ?? "");
  let s = receiveInventory(state, "e-dave", {
    kind: "Stock",
    facility: "Mississauga",
    partNumber: "CAS-3X4-13-DI",
    description: "Casing",
    material: opts.material ?? "Ductile Iron",
    quantity: 1,
    componentKey,
    trackingPolicy,
    ...(trackingPolicy === "HeatTracked" ? { heatNumber: `H-${componentKey ?? "generic"}` } : {})
  });
  const identityId = s.inventoryIdentities.at(-1)!.id;
  s = inspectInventory(s, "e-dave", identityId, "Accept", "Looks good");
  return { state: s, identityId };
}

describe("componentKeyOf", () => {
  it("takes the trailing role even when the order number itself contains a hyphen", () => {
    expect(componentKeyOf({ componentId: "TEST1196-01_1.1-casing" })).toBe("casing");
  });

  it("is undefined when the requirement names no component", () => {
    expect(componentKeyOf({ componentId: undefined })).toBeUndefined();
  });
});

describe("NoRecipe — nothing to match against", () => {
  it("reports NoRecipe when the requirement carries no part number or material", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "NR-001", "Medium", "2026-10-01");
    const req = casingRequirement(state, "NR-001_1.1");
    state = {
      ...state,
      requirements: state.requirements.map((r) => (r.id === req.id ? { ...r, description: "Casing" } : r))
    };
    const result = availabilityForRequirement(state, req.id);
    expect(result.state).toBe("NoRecipe");
  });

  it("reports NoRecipe when nothing in inventory, quarantined or accepted, matches", () => {
    const state = orderWithCasingRequirement(emptyInventoryState(), "NR-002", "Medium", "2026-10-01");
    const req = casingRequirement(state, "NR-002_1.1");
    expect(availabilityForRequirement(state, req.id).state).toBe("NoRecipe");
  });
});

describe("Expected — arrived but not yet cleared", () => {
  it("reports Expected when matching stock is sitting in quarantine", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "EX-001", "Medium", "2026-10-01");
    state = receiveInventory(state, "e-dave", {
      kind: "Stock",
      facility: "Mississauga",
      partNumber: "CAS-3X4-13-DI",
      description: "Casing",
      material: "Ductile Iron",
      quantity: 1,
      componentKey: "casing",
      trackingPolicy: "HeatTracked",
      heatNumber: "H-EX-001"
    });
    const req = casingRequirement(state, "EX-001_1.1");
    const result = availabilityForRequirement(state, req.id);
    expect(result.state).toBe("Expected");
    expect(result.expectedSince).toBeTruthy();
  });
});

describe("InStock — already reserved to this Unit", () => {
  it("wins regardless of what else is competing for the pool", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "IS-001", "Low", "2026-10-01");
    const req = casingRequirement(state, "IS-001_1.1");
    const receipt = acceptedCasing(state);
    state = receipt.state;
    state = reserveInventory(state, "e-dave", receipt.identityId, "IS-001_1.1", 1, req.id);

    const result = availabilityForRequirement(state, req.id);
    expect(result.state).toBe("InStock");
    expect(result.reason).toMatch(/already reserved to this unit/i);
  });
});

describe("NotAvailable — a real reservation already holds it", () => {
  it("names the order that holds the matching stock", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "HOLD-001", "Medium", "2026-10-01");
    state = orderWithCasingRequirement(state, "HOLD-002", "Medium", "2026-10-01");
    const reqA = casingRequirement(state, "HOLD-001_1.1");
    const reqB = casingRequirement(state, "HOLD-002_1.1");

    const receipt = acceptedCasing(state);
    state = receipt.state;
    state = reserveInventory(state, "e-dave", receipt.identityId, "HOLD-001_1.1", 1, reqA.id);

    const result = availabilityForRequirement(state, reqB.id);
    expect(result.state).toBe("NotAvailable");
    expect(result.heldByOrderNumber).toBe("HOLD-001");
    expect(result.reason).toMatch(/already reserved to HOLD-001/);
  });
});

describe("NotAvailable — nothing reserved yet, but a higher-priority order would claim it first", () => {
  it("ranks Urgent ahead of Low for the same free item", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "PRI-URGENT", "Urgent", "2026-09-01");
    state = orderWithCasingRequirement(state, "PRI-LOW", "Low", "2026-09-01");
    const receipt = acceptedCasing(state);
    state = receipt.state;

    const urgentReq = casingRequirement(state, "PRI-URGENT_1.1");
    const lowReq = casingRequirement(state, "PRI-LOW_1.1");

    const urgentResult = availabilityForRequirement(state, urgentReq.id);
    expect(urgentResult.state).toBe("InStock");

    const lowResult = availabilityForRequirement(state, lowReq.id);
    expect(lowResult.state).toBe("NotAvailable");
    expect(lowResult.heldByOrderNumber).toBe("PRI-URGENT");
    expect(lowResult.reason).toMatch(/nothing is reserved yet/i);
  });

  it("is only a preview — no movement is actually written", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "PRI2-URGENT", "Urgent", "2026-09-01");
    state = orderWithCasingRequirement(state, "PRI2-LOW", "Low", "2026-09-01");
    const receipt = acceptedCasing(state);
    state = receipt.state;
    const before = state.inventoryMovements.length;

    availabilityForRequirement(state, casingRequirement(state, "PRI2-LOW_1.1").id);

    expect(state.inventoryMovements.length).toBe(before);
  });
});

describe("Component role prevents cross-role false matches", () => {
  it("does not let an impeller satisfy a casing requirement, even with the same material", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "ROLE-001", "Medium", "2026-10-01");
    const receipt = acceptedCasing(state, { componentKey: "impeller" });
    state = receipt.state;

    const req = casingRequirement(state, "ROLE-001_1.1");
    expect(availabilityForRequirement(state, req.id).state).toBe("NoRecipe");
  });

  it("still matches on spec alone when the identity carries no recorded role", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "ROLE-002", "Medium", "2026-10-01");
    const receipt = acceptedCasing(state, { componentKey: null as unknown as undefined });
    state = receipt.state;

    const req = casingRequirement(state, "ROLE-002_1.1");
    expect(availabilityForRequirement(state, req.id).state).toBe("InStock");
  });

  it("does not match on role alone when the material genuinely differs", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "ROLE-003", "Medium", "2026-10-01");
    const receipt = acceptedCasing(state, { material: "CD4MCU" });
    state = receipt.state;

    const req = casingRequirement(state, "ROLE-003_1.1");
    expect(availabilityForRequirement(state, req.id).state).toBe("NoRecipe");
  });
});

describe("competingRequirements", () => {
  it("orders by priority, then due date, then order number", () => {
    let state = orderWithCasingRequirement(emptyInventoryState(), "RANK-B", "Medium", "2026-09-10");
    state = orderWithCasingRequirement(state, "RANK-A", "Medium", "2026-09-05");
    state = orderWithCasingRequirement(state, "RANK-URGENT", "Urgent", "2026-09-20");

    const ranked = competingRequirements(state, "casing", { material: "Ductile Iron" });
    expect(ranked.map((r) => r.executionOrderId)).toEqual(["RANK-URGENT", "RANK-A", "RANK-B"]);
  });
});
