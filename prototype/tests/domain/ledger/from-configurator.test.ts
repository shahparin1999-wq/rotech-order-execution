// Stage 1: the ledger becomes live. A configured order must generate the real
// demand that receiving later matches against.

import { describe, expect, it } from "vitest";
import { buildInitialState, CUSTOMER_ACME } from "@/domain/fixtures";
import { createConfiguredOrder } from "@/domain/actions";
import {
  addTestingRequirement,
  newAssemblyLine,
  newSpareLine,
  reseedAssembly,
  type ConfiguratorDraft
} from "@/domain/configurator";
import { isCustomerSupplied } from "@/domain/ledger/fromConfigurator";
import { isOpen } from "@/domain/ledger/requirement";

function draft(lines: ConfiguratorDraft["lines"]): ConfiguratorDraft {
  return {
    orderNumber: "LEDGER-001",
    customerId: CUSTOMER_ACME,
    customerPo: "PO-L",
    description: "Ledger wiring",
    facility: "Mississauga",
    coordinatorId: "e-sarah",
    priority: "Medium",
    dueDate: "2026-09-30",
    lines
  };
}

function build(lines: ConfiguratorDraft["lines"]) {
  return createConfiguredOrder(buildInitialState(), "e-sarah", draft(lines));
}

describe("A configured order generates real requirements", () => {
  it("creates one Component requirement per in-scope row per Unit", () => {
    const line = { ...newAssemblyLine("l1"), quantity: 2 };
    const state = build([line]);
    const inScope = line.components.filter((c) => c.inScope).length;

    const components = state.requirements.filter((r) => r.category === "Component");
    expect(components).toHaveLength(inScope * 2);

    // Each Unit owns its own copies — no sharing of physical parts.
    for (const unitId of ["LEDGER-001_1.1", "LEDGER-001_1.2"]) {
      expect(components.filter((r) => r.unitId === unitId)).toHaveLength(inScope);
    }
  });

  it("gives every requirement an accountable owner and an open status", () => {
    const state = build([newAssemblyLine("l1")]);
    expect(state.requirements.length).toBeGreaterThan(0);
    for (const r of state.requirements) {
      expect(r.accountableOwnerId, `${r.description} needs an owner`).toBeTruthy();
      expect(r.executionOrderId).toBe("LEDGER-001");
      expect(isOpen(r)).toBe(true);
    }
  });

  it("creates a Test requirement per Unit, because each pump is tested", () => {
    let line = { ...newAssemblyLine("l1"), quantity: 2 };
    line = addTestingRequirement(line, "NON-WITNESSED HYDROSTATIC TEST");
    line = addTestingRequirement(line, "Witnessed hydrostatic — customer inspector");
    const state = build([line]);

    const tests = state.requirements.filter((r) => r.category === "Test");
    expect(tests).toHaveLength(4); // 2 scopes x 2 Units
    expect(tests.every((r) => r.blocksRelease)).toBe(true);
    expect(tests.every((r) => r.accountableOwnerId === "Quality")).toBe(true);
    // A special free-text scope becomes demand exactly like a catalogue one.
    expect(tests.some((r) => r.description === "Witnessed hydrostatic — customer inspector")).toBe(true);
  });

  it("scopes the package drawing to the LINE, never duplicated per Unit", () => {
    const line = reseedAssembly({ ...newAssemblyLine("l1"), quantity: 3, buildType: "CompletePackage" });
    const state = build([line]);
    const drawings = state.requirements.filter((r) => r.category === "Drawing");
    expect(drawings).toHaveLength(1);
    expect(drawings[0].unitId).toBeUndefined();
    expect(drawings[0].lineId).toBe("LEDGER-001-L1");
    // It blocks fabrication, not the whole Unit.
    expect(drawings[0].blocksWork).toBe(true);
    expect(drawings[0].blocksRelease).toBeUndefined();
  });

  it("a bare pump end has no drawing requirement", () => {
    const state = build([newAssemblyLine("l1")]);
    expect(state.requirements.some((r) => r.category === "Drawing")).toBe(false);
  });

  it("an out-of-scope component creates nothing at all", () => {
    const line = reseedAssembly({ ...newAssemblyLine("l1"), buildType: "CompletePackage" });
    // accessories default out of scope
    expect(line.components.find((c) => c.key === "accessories")!.inScope).toBe(false);
    const state = build([line]);
    expect(state.requirements.some((r) => r.componentId?.endsWith("-accessories"))).toBe(false);
  });

  it("a spare line creates no manufacturing demand", () => {
    const spare = { ...newSpareLine("s1"), description: "Repair kit", partNumber: "RK-1" };
    const state = build([newAssemblyLine("l1"), spare]);
    expect(state.requirements.every((r) => r.lineId === "LEDGER-001-L1")).toBe(true);
  });
});

describe("Customer-supplied items create receipt work, never purchase demand", () => {
  it("recognises a customer-supplied marking", () => {
    const base = { key: "motor", label: "Motor", partNumber: "", material: "", reference: "", referenceLabel: "", quantity: 1, notes: "", inScope: true, isCustom: false, brand: "" };
    expect(isCustomerSupplied({ ...base, brand: "Customer supplied" })).toBe(true);
    expect(isCustomerSupplied({ ...base, notes: "by customer" })).toBe(true);
    expect(isCustomerSupplied({ ...base, brand: "WEG" })).toBe(false);
  });

  it("opens a receipt expectation and assigns it to Receiving", () => {
    let line = reseedAssembly({ ...newAssemblyLine("l1"), buildType: "CompletePackage" });
    line = {
      ...line,
      components: line.components.map((c) =>
        c.key === "motor" ? { ...c, brand: "Customer supplied" } : c
      )
    };
    const state = build([line]);

    const motor = state.requirements.find((r) => r.componentId?.endsWith("-motor"))!;
    expect(motor.accountableOwnerId).toBe("Receiving");
    expect(motor.status).toBe("Planned");

    const linked = state.fulfillments.filter((f) => f.requirementId === motor.id);
    expect(linked).toHaveLength(1);
    expect(linked[0].kind).toBe("Receipt");
    expect(linked[0].status).toBe("Open");
    // No purchasing fulfilment of any kind.
    expect(linked.some((f) => f.kind === "PurchaseRequirement")).toBe(false);
  });

  it("a Rotech-supplied component gets no receipt expectation yet", () => {
    const state = build([newAssemblyLine("l1")]);
    const casing = state.requirements.find((r) => r.componentId?.endsWith("-casing"))!;
    expect(casing.accountableOwnerId).toBe("Purchasing");
    expect(state.fulfillments.filter((f) => f.requirementId === casing.id)).toHaveLength(0);
  });
});
