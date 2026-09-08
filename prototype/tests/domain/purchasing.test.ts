import { describe, expect, it } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import { referenceVendorPo, updateVendorPoExpectedDate } from "@/domain/purchasingActions";
import { receiveInventory, inspectInventory } from "@/domain/inventoryActions";
import { availabilityForRequirement } from "@/domain/inventory/availability";
import { orderAttention } from "@/domain/ledger/attention";
import { openPoLines, pendingQuantity, receivedQuantity, isPoLineLate } from "@/domain/purchasing/poReference";
import type { AppState } from "@/domain/types";
import type { ExecutionRequirement } from "@/domain/ledger/requirement";

const AT = "2026-09-08T10:00:00Z";

function withCasingDemand(state: AppState, unitIds: string[]): AppState {
  const requirements: ExecutionRequirement[] = unitIds.map((unitId, i) => ({
    id: `REQ-T-${i + 1}`,
    executionOrderId: "SAMPLE1001",
    lineId: "SAMPLE1001-L1",
    unitId,
    componentId: `${unitId}-casing`,
    category: "Component",
    source: "CpqConfiguration",
    sourceRef: "cfgsnap:test#pumpBuild.materialBuild",
    description: "Casing 3X4-13 MTR — DI",
    mandatory: true,
    blocksWork: true,
    blocksRelease: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Purchasing",
    needBy: "2026-10-01",
    status: "Unplanned",
    fulfillmentRefs: [],
    createdAt: AT
  }));
  return { ...state, requirements: [...state.requirements, ...requirements] };
}

const PO = {
  poNumber: "4500187",
  vendor: "RFHPL India",
  poDate: "2026-09-08",
  facility: "Mississauga",
  lines: [
    {
      partNumber: "100-34-M-A-1F-DI",
      description: "Casing 3X4-13 MTR — DI",
      material: "DI",
      componentKey: "casing",
      orderedQuantity: 2,
      expectedDate: "2026-10-02",
      requirementIds: ["REQ-T-1", "REQ-T-2"]
    }
  ]
};

describe("vendor PO reference — visibility, not procurement", () => {
  it("records the reference, links the demand, and moves requirements to Planned", () => {
    const s0 = withCasingDemand(buildInitialState(), ["SAMPLE1001_1.4", "SAMPLE1001_1.5"]);
    expect(availabilityForRequirement(s0, "REQ-T-1").state).toBe("NoRecipe");

    const s1 = referenceVendorPo(s0, "e-alex", PO, AT);
    const po = s1.vendorPoReferences[0];
    expect(po.poNumber).toBe("4500187");
    expect(po.sourceOrderNumbers).toEqual(["SAMPLE1001"]);
    expect(po.lines[0].expectedDateHistory).toHaveLength(1);
    const req = s1.requirements.find((r) => r.id === "REQ-T-1")!;
    expect(req.status).toBe("Planned");
    expect(req.fulfillmentRefs).toHaveLength(1);
    const ful = s1.fulfillments.find((f) => f.id === req.fulfillmentRefs[0])!;
    expect(ful).toMatchObject({ kind: "PoReference", ref: "4500187/1", status: "Open" });
    expect(s1.auditEvents.at(-1)?.action).toBe("purchase.referenced");

    const availability = availabilityForRequirement(s1, "REQ-T-1");
    expect(availability.state).toBe("OnOrder");
    expect(availability.expectedDate).toBe("2026-10-02");
    expect(availability.poNumber).toBe("4500187");
  });

  it("rejects a duplicate PO number, a bad date, and an unknown requirement", () => {
    const s0 = withCasingDemand(buildInitialState(), ["SAMPLE1001_1.4", "SAMPLE1001_1.5"]);
    const s1 = referenceVendorPo(s0, "e-alex", PO, AT);
    expect(() => referenceVendorPo(s1, "e-alex", PO, AT)).toThrow(/already referenced/);
    expect(() => referenceVendorPo(s0, "e-alex", { ...PO, poNumber: "X1", lines: [{ ...PO.lines[0], expectedDate: "next week" }] }, AT)).toThrow(/ISO date/);
    expect(() => referenceVendorPo(s0, "e-alex", { ...PO, poNumber: "X2", lines: [{ ...PO.lines[0], requirementIds: ["nope"] }] }, AT)).toThrow(/Unknown requirement/);
  });

  it("attention shows 'on order' before the expected date and a late-PO blocker after it", () => {
    const s0 = withCasingDemand(buildInitialState(), ["SAMPLE1001_1.4", "SAMPLE1001_1.5"]);
    const s1 = referenceVendorPo(s0, "e-alex", PO, AT);
    const before = orderAttention(s1, "SAMPLE1001", "2026-09-20T00:00:00Z");
    const onOrder = before.filter((i) => i.id.startsWith("att-onorder-REQ-T-"));
    expect(onOrder).toHaveLength(2);
    expect(onOrder[0].kind).toBe("Incoming");
    expect(onOrder[0].severity).toBe("Warning");

    const after = orderAttention(s1, "SAMPLE1001", "2026-10-10T00:00:00Z");
    const late = after.filter((i) => i.kind === "LatePurchase");
    expect(late).toHaveLength(2);
    expect(late[0].severity).toBe("Blocker");
    expect(late[0].title).toMatch(/Late PO/);
  });

  it("expected-date changes append to history and need a reason", () => {
    const s0 = withCasingDemand(buildInitialState(), ["SAMPLE1001_1.4", "SAMPLE1001_1.5"]);
    const s1 = referenceVendorPo(s0, "e-alex", PO, AT);
    const po = s1.vendorPoReferences[0];
    expect(() => updateVendorPoExpectedDate(s1, "e-alex", po.id, po.lines[0].id, "2026-10-09", "", AT)).toThrow(/reason/);
    const s2 = updateVendorPoExpectedDate(s1, "e-alex", po.id, po.lines[0].id, "2026-10-09", "Vendor slipped one week", AT);
    const line = s2.vendorPoReferences[0].lines[0];
    expect(line.expectedDate).toBe("2026-10-09");
    expect(line.expectedDateHistory.map((h) => h.expectedDate)).toEqual(["2026-10-02", "2026-10-09"]);
    expect(isPoLineLate(s2, s2.vendorPoReferences[0], line, "2026-10-08T00:00:00Z")).toBe(false);
    expect(isPoLineLate(s2, s2.vendorPoReferences[0], line, "2026-10-10T00:00:00Z")).toBe(true);
  });

  it("a partial receipt against the PO line leaves the remainder pending and on order", () => {
    const s0 = withCasingDemand(buildInitialState(), ["SAMPLE1001_1.4", "SAMPLE1001_1.5"]);
    const s1 = referenceVendorPo(s0, "e-alex", PO, AT);
    const po = s1.vendorPoReferences[0];
    const s2 = receiveInventory(
      s1,
      "e-tom",
      {
        kind: "AgainstPo",
        poNumber: "4500187",
        poLine: "1",
        vendor: "RFHPL India",
        facility: "Mississauga",
        partNumber: "100-34-M-A-1F-DI",
        description: "Casing 3X4-13 MTR",
        material: "DI",
        quantity: 1,
        componentKey: "casing",
        heatNumber: "H-IN-77821",
        matchedRequirementId: "REQ-T-1",
        vendorPoLineId: po.lines[0].id
      },
      "2026-09-30T09:00:00Z"
    );
    expect(receivedQuantity(s2, po, po.lines[0])).toBe(1);
    expect(pendingQuantity(s2, po, po.lines[0])).toBe(1);
    expect(openPoLines(s2, "2026-09-30T09:00:00Z")).toHaveLength(1);
    // The receipt is an open fulfilment until inspection accepts it.
    const req1 = s2.requirements.find((r) => r.id === "REQ-T-1")!;
    expect(req1.status).toBe("Planned");
    expect(s2.fulfillments.filter((f) => f.requirementId === "REQ-T-1").map((f) => f.kind)).toEqual(["PoReference", "Receipt"]);
    const identity = s2.inventoryIdentities.at(-1)!;
    expect(availabilityForRequirement(s2, "REQ-T-1").state).toBe("Expected"); // arrived, awaiting inspection
    // The sibling requirement is still on order, not "expected": no leakage between Units.
    expect(availabilityForRequirement(s2, "REQ-T-2").state).toBe("OnOrder");

    const s3 = inspectInventory(s2, "e-priya", identity.id, "Accept", "Heat cert matches", "2026-09-30T10:00:00Z");
    expect(s3.requirements.find((r) => r.id === "REQ-T-1")!.status).toBe("InProgress");
    expect(s3.fulfillments.find((f) => f.kind === "Receipt" && f.requirementId === "REQ-T-1")!.status).toBe("Complete");
    expect(availabilityForRequirement(s3, "REQ-T-1").state).toBe("InStock");
  });
});
