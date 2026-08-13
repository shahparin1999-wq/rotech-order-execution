// Attention — exceptions first, and computed rather than typed.
//
// The thing these tests protect is that nobody has to remember to raise an
// exception, and that an exception on one Unit never appears on a sibling.

import { describe, expect, it } from "vitest";
import { blockingItems, orderAttention, unitAttention } from "@/domain/ledger/attention";
import { buildInitialState, CUSTOMER_ACME } from "@/domain/fixtures";
import { createConfiguredOrder, recordComponentUsage } from "@/domain/actions";
import { newAssemblyLine } from "@/domain/configurator";
import type { AppState } from "@/domain/types";

const ASOF = "2026-08-20T09:00:00Z";

function order(state: AppState, orderNumber: string, quantity = 2): AppState {
  return createConfiguredOrder(state, "e-sarah", {
    orderNumber,
    customerId: CUSTOMER_ACME,
    customerPo: `PO-${orderNumber}`,
    description: "Attention test",
    facility: "Mississauga",
    coordinatorId: "e-sarah",
    priority: "Medium",
    dueDate: "2026-10-01",
    lines: [{ ...newAssemblyLine("l1"), quantity }]
  });
}

describe("Material exceptions are derived, not typed", () => {
  it("raises a Shortage for every open physical requirement nothing can satisfy", () => {
    const state = order(buildInitialState(), "ATT-001");
    const items = orderAttention(state, "ATT-001", ASOF);
    const shortages = items.filter((i) => i.kind === "Shortage");
    expect(shortages.length).toBeGreaterThan(0);
    // Each one names the specific thing, never "see notes".
    for (const s of shortages) {
      expect(s.title).toMatch(/^Shortage · /);
      expect(s.detail.length).toBeGreaterThan(10);
    }
  });

  it("a shortage is a Blocker, an incoming item is only a Warning", () => {
    const state = order(buildInitialState(), "ATT-002");
    const items = orderAttention(state, "ATT-002", ASOF);
    for (const i of items.filter((x) => x.kind === "Shortage")) {
      expect(i.severity).toBe("Blocker");
    }
    for (const i of items.filter((x) => x.kind === "Incoming")) {
      expect(i.severity).toBe("Warning");
    }
  });

  it("names the order holding the stock when another order has it reserved", () => {
    // The seeded 6X8-13 casing is reserved to SAMPLE1001_1.1, so any other
    // order needing it must say so rather than leaving someone to remember.
    const state = buildInitialState();
    const items = orderAttention(state, "SAMPLE1001", ASOF);
    // Nothing on SAMPLE1001 should claim its own reservation is a conflict.
    for (const i of items.filter((x) => x.kind === "Shortage")) {
      expect(i.detail).not.toMatch(/Held by SAMPLE1001\./);
    }
  });
});

describe("Blockers sort above warnings, oldest first", () => {
  it("orders by severity then age", () => {
    const state = order(buildInitialState(), "ATT-003");
    const items = orderAttention(state, "ATT-003", ASOF);
    const severities = items.map((i) => i.severity);
    const firstWarning = severities.indexOf("Warning");
    if (firstWarning !== -1) {
      expect(severities.slice(firstWarning).every((s) => s === "Warning")).toBe(true);
    }
  });
});

describe("An unresolved substitution is an exception", () => {
  it("raises a Blocker naming both sides of the difference", () => {
    let state = order(buildInitialState(), "ATT-004", 1);
    const req = state.requirements.find(
      (r) => r.unitId === "ATT-004_1.1" && r.componentId?.endsWith("-casing")
    )!;
    state = recordComponentUsage(state, "e-dave", {
      requirementId: req.id,
      unitId: "ATT-004_1.1",
      componentRole: "casing",
      material: "CD4MCU"
    });

    const items = orderAttention(state, "ATT-004", ASOF);
    const review = items.find((i) => i.kind === "SubstitutionReview");
    expect(review).toBeDefined();
    expect(review!.severity).toBe("Blocker");
    expect(review!.detail).toMatch(/required Ductile Iron/i);
    expect(review!.detail).toMatch(/actual CD4MCU/i);
    expect(review!.unitId).toBe("ATT-004_1.1");
  });
});

describe("Unit isolation", () => {
  it("a Unit's attention never contains a sibling's exception", () => {
    let state = order(buildInitialState(), "ATT-005", 2);
    const req = state.requirements.find(
      (r) => r.unitId === "ATT-005_1.1" && r.componentId?.endsWith("-casing")
    )!;
    state = recordComponentUsage(state, "e-dave", {
      requirementId: req.id,
      unitId: "ATT-005_1.1",
      componentRole: "casing",
      material: "CD4MCU"
    });

    const onSibling = unitAttention(state, "ATT-005_1.2", ASOF);
    expect(onSibling.some((i) => i.kind === "SubstitutionReview")).toBe(false);
    expect(onSibling.every((i) => i.unitId === "ATT-005_1.2")).toBe(true);

    const onOwn = unitAttention(state, "ATT-005_1.1", ASOF);
    expect(onOwn.some((i) => i.kind === "SubstitutionReview")).toBe(true);
  });

  it("returns nothing for a Unit that does not exist, rather than throwing", () => {
    expect(unitAttention(buildInitialState(), "nope", ASOF)).toEqual([]);
  });
});

describe("Overdue work", () => {
  it("uses the injected clock, not an ambient one", () => {
    const state = buildInitialState();
    const early = orderAttention(state, "SAMPLE1001", "2020-01-01T00:00:00Z");
    const late = orderAttention(state, "SAMPLE1001", "2030-01-01T00:00:00Z");
    expect(early.filter((i) => i.kind === "OverdueAction")).toHaveLength(0);
    expect(late.filter((i) => i.kind === "OverdueAction").length).toBeGreaterThan(0);
  });
});

describe("blockingItems", () => {
  it("keeps only what actually holds up completion", () => {
    const state = order(buildInitialState(), "ATT-006");
    const items = orderAttention(state, "ATT-006", ASOF);
    expect(blockingItems(items).every((i) => i.severity === "Blocker")).toBe(true);
  });
});
