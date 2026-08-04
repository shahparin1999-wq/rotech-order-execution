// Inventory Control acceptance tests.
//
// These target the rules with teeth: the ones where being wrong puts the wrong
// part in a customer's pump, or loses the history of how it got there.

import { describe, expect, it } from "vitest";
import {
  activeUnitAllocation,
  available,
  currentLocation,
  historyFor,
  isInstalled,
  isIssuable,
  onHand,
  qualityState,
  reserved,
  validateMovement,
  type InventoryMovement
} from "@/domain/inventory/movement";
import {
  isSerialized,
  missingTrackingFields,
  permitsDirectAcceptance,
  trackingPolicyFor,
  type InventoryIdentity
} from "@/domain/inventory/identity";
import {
  candidateDemand,
  isProblemDisposition,
  receiptFulfillment,
  remainingAfterReceipt,
  suggestDisposition,
  type InventoryReceipt,
  type InventoryReceiptLine
} from "@/domain/inventory/receipt";
import {
  asBuiltForUnit,
  asBuiltFromInstall,
  checkIssueToUnit,
  specificationMatches
} from "@/domain/inventory/issue";
import {
  buildPutAwayJob,
  canReleaseCustomerUnit,
  isOverdue,
  putAwayIncomplete
} from "@/domain/inventory/internalJobs";
import type { ExecutionRequirement, Ledger } from "@/domain/ledger/requirement";

const AT = "2026-08-04T10:00:00Z";
let seq = 0;
const nextAt = () => `2026-08-04T10:${String(++seq).padStart(2, "0")}:00Z`;

function move(p: Partial<InventoryMovement> & { type: InventoryMovement["type"] }): InventoryMovement {
  return {
    id: `mv-${++seq}`,
    inventoryIdentityId: "INV-1",
    quantity: 0,
    recordedBy: "e-dave",
    recordedAt: nextAt(),
    ...p
  };
}

function identity(p: Partial<InventoryIdentity> = {}): InventoryIdentity {
  return {
    id: "INV-1",
    publicRef: "inv-abc123",
    partNumber: "101-AT-M-A-S6",
    description: "1196 MTR 316SS Impeller",
    material: "316SS",
    trackingPolicy: "HeatTracked",
    heatNumber: "H316-8821",
    receivedQuantity: 1,
    uom: "EA",
    facility: "Mississauga",
    receiptId: "RCV-1",
    receiptLineId: "RCVL-1",
    createdAt: AT,
    createdBy: "e-dave",
    ...p
  };
}

function requirement(p: Partial<ExecutionRequirement> = {}): ExecutionRequirement {
  return {
    id: "REQ-1",
    executionOrderId: "SAMPLE1001",
    lineId: "SAMPLE1001-L1",
    unitId: "SAMPLE1001_1.3",
    componentId: "SAMPLE1001_1.3-impeller",
    category: "Component",
    source: "OperationalRevision",
    sourceRef: "configurator:SAMPLE1001-L1",
    description: "Impeller — 316SS · 101-AT-M-A-S6",
    mandatory: true,
    blocksWork: true,
    blocksRelease: true,
    accountableOwnerType: "Department",
    accountableOwnerId: "Purchasing",
    status: "Planned",
    fulfillmentRefs: [],
    createdAt: AT,
    ...p
  };
}

// A fully received → accepted → put away → reserved item.
function acceptedMovements(unitId?: string): InventoryMovement[] {
  const m = [
    move({ type: "Received", quantity: 1 }),
    move({ type: "Quarantined" }),
    move({ type: "InspectionAccepted" }),
    move({ type: "PutAway", toLocationId: "LOC-B04-03" })
  ];
  if (unitId) m.push(move({ type: "Reserved", quantity: 1, unitId }));
  return m;
}

describe("Quantities derive from movements, never a stored field", () => {
  it("computes on hand, reserved and available from history alone", () => {
    const m = acceptedMovements("SAMPLE1001_1.3");
    expect(onHand(m, "INV-1")).toBe(1);
    expect(reserved(m, "INV-1")).toBe(1);
    expect(available(m, "INV-1")).toBe(0); // reserved is not available
  });

  it("state-only movements never change on hand", () => {
    const m = [move({ type: "Received", quantity: 1 }), move({ type: "Quarantined" }), move({ type: "InspectionAccepted" }), move({ type: "PutAway", toLocationId: "L1" })];
    expect(onHand(m, "INV-1")).toBe(1);
  });

  it("installing consumes the item; returning to stock restores it", () => {
    const m = acceptedMovements("SAMPLE1001_1.3");
    m.push(move({ type: "IssuedToUnit", quantity: 1, unitId: "SAMPLE1001_1.3" }));
    m.push(move({ type: "Installed", quantity: 1, unitId: "SAMPLE1001_1.3" }));
    expect(onHand(m, "INV-1")).toBe(0);
    expect(isInstalled(m, "INV-1")).toBe(true);

    m.push(move({ type: "RemovedFromUnit", quantity: 1, unitId: "SAMPLE1001_1.3" }));
    m.push(move({ type: "ReturnedToStock", quantity: 1, toLocationId: "LOC-B04-03" }));
    expect(onHand(m, "INV-1")).toBe(1);
    expect(isInstalled(m, "INV-1")).toBe(false);
    // History is preserved, not rewritten.
    // Received, Quarantined, Accepted, PutAway, Reserved, Issued, Installed,
    // Removed, ReturnedToStock — nine, all retained.
    expect(historyFor(m, "INV-1")).toHaveLength(9);
    expect(historyFor(m, "INV-1").some((x) => x.type === "Installed")).toBe(true);
  });

  it("tracks current location through the movement chain", () => {
    const m = acceptedMovements();
    expect(currentLocation(m, "INV-1")).toBe("LOC-B04-03");
    m.push(move({ type: "Transferred", toLocationId: "LOC-HOU-A1" }));
    expect(currentLocation(m, "INV-1")).toBe("LOC-HOU-A1");
  });
});

describe("Movement validation", () => {
  it("an adjustment requires a reason and authorization (INV-015)", () => {
    const bad = validateMovement(move({ type: "Adjusted", quantity: -1 }));
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/reason/);
    expect(bad.errors.join(" ")).toMatch(/authorization/);

    const good = validateMovement(
      move({ type: "Adjusted", quantity: -1, reason: "Cycle count variance", authorizedBy: "e-sarah" })
    );
    expect(good.ok).toBe(true);
  });

  it("scrapping requires a reason", () => {
    expect(validateMovement(move({ type: "Scrapped", quantity: 1 })).ok).toBe(false);
    expect(validateMovement(move({ type: "Scrapped", quantity: 1, reason: "Cracked on arrival" })).ok).toBe(true);
  });

  it("a Unit-bound movement must name its Unit", () => {
    expect(validateMovement(move({ type: "Installed", quantity: 1 })).ok).toBe(false);
    expect(validateMovement(move({ type: "Installed", quantity: 1, unitId: "U1" })).ok).toBe(true);
  });

  it("put-away must name a destination", () => {
    expect(validateMovement(move({ type: "PutAway" })).ok).toBe(false);
  });
});

describe("Tracking policy", () => {
  it("assigns the right policy per component role", () => {
    expect(trackingPolicyFor("motor")).toBe("Serialized");
    expect(trackingPolicyFor("casing")).toBe("HeatTracked");
    expect(trackingPolicyFor("seal")).toBe("LotTracked");
    expect(trackingPolicyFor("coupling")).toBe("QuantityTracked");
    // An unknown role makes the weakest honest claim rather than over-promising.
    expect(trackingPolicyFor("mystery-widget")).toBe("QuantityTracked");
  });

  it("only an untracked consumable may skip quarantine (INV-002)", () => {
    expect(permitsDirectAcceptance("UntrackedConsumable")).toBe(true);
    for (const p of ["Serialized", "LotTracked", "HeatTracked", "QuantityTracked"] as const) {
      expect(permitsDirectAcceptance(p)).toBe(false);
    }
  });

  it("demands the field its policy requires", () => {
    expect(missingTrackingFields("HeatTracked", {})).toEqual(["heat"]);
    expect(missingTrackingFields("HeatTracked", { heatNumber: "H316-8821" })).toEqual([]);
    expect(missingTrackingFields("Serialized", { heatNumber: "x" })).toEqual(["serial"]);
    expect(missingTrackingFields("QuantityTracked", {})).toEqual([]);
  });
});

describe("Demand matching suggests but never auto-allocates", () => {
  const ledger: Ledger = {
    requirements: [
      requirement({ id: "REQ-IMP", description: "Impeller — 316SS · 101-AT-M-A-S6" }),
      requirement({ id: "REQ-CAS", componentId: "SAMPLE1001_1.3-casing", description: "Casing — Ductile Iron · 100-AT-M-A-1F-DI" })
    ],
    fulfillments: []
  };

  it("ranks a part-number match above an unrelated requirement", () => {
    const candidates = candidateDemand({ ledger, partNumber: "101-AT-M-A-S6", material: "316SS", quantity: 1 });
    expect(candidates[0].requirement.id).toBe("REQ-IMP");
    expect(candidates[0].reasons.join(" ")).toMatch(/part number/);
  });

  it("explains why each candidate was suggested", () => {
    const candidates = candidateDemand({ ledger, description: "Impeller", quantity: 1 });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].reasons.length).toBeGreaterThan(0);
  });

  it("returns nothing when nothing matches — an unmatched receipt is an exception", () => {
    expect(candidateDemand({ ledger, partNumber: "ZZZ-NOTHING", quantity: 1 })).toEqual([]);
  });

  it("excludes a requirement already fully received", () => {
    const fullyReceived: Ledger = {
      requirements: [requirement({ id: "REQ-IMP" })],
      fulfillments: [
        {
          id: "F1", requirementId: "REQ-IMP", kind: "Receipt", ref: "L1",
          quantity: 1, status: "Complete", recordedBy: "e-dave", recordedAt: AT
        }
      ]
    };
    expect(candidateDemand({ ledger: fullyReceived, partNumber: "101-AT-M-A-S6", quantity: 1 })).toEqual([]);
  });

  it("a rejected receipt does NOT count as received — the demand stays open", () => {
    const rejected: Ledger = {
      requirements: [requirement({ id: "REQ-IMP" })],
      fulfillments: [
        {
          id: "F1", requirementId: "REQ-IMP", kind: "Receipt", ref: "L1",
          quantity: 1, status: "Rejected", recordedBy: "e-dave", recordedAt: AT
        }
      ]
    };
    const candidates = candidateDemand({ ledger: rejected, partNumber: "101-AT-M-A-S6", quantity: 1 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].alreadyReceived).toBe(0);
    expect(candidates[0].outstandingQuantity).toBe(1);
  });
});

describe("Partial receipt leaves the remainder open", () => {
  const candidate = {
    requirement: requirement(),
    outstandingQuantity: 3,
    alreadyReceived: 0,
    score: 50,
    reasons: []
  };

  it("suggests PartialReceipt and computes what is left", () => {
    expect(suggestDisposition(2, candidate)).toBe("PartialReceipt");
    expect(remainingAfterReceipt(candidate, 2)).toBe(1);
  });

  it("suggests ExactMatch and OverReceipt correctly", () => {
    expect(suggestDisposition(3, candidate)).toBe("ExactMatch");
    expect(suggestDisposition(4, candidate)).toBe("OverReceipt");
    expect(remainingAfterReceipt(candidate, 4)).toBe(0);
  });

  it("an unmatched receipt is UnknownDemand and flagged as a problem", () => {
    expect(suggestDisposition(1, undefined)).toBe("UnknownDemand");
    expect(isProblemDisposition("UnknownDemand")).toBe(true);
    expect(isProblemDisposition("WrongMaterial")).toBe(true);
    expect(isProblemDisposition("PartialReceipt")).toBe(false);
  });

  it("a receipt fulfilment starts Open, not Complete — the dock is not acceptance", () => {
    const receipt: InventoryReceipt = {
      id: "RCV-1", kind: "AgainstPo", facility: "Mississauga", receivedBy: "e-dave", receivedAt: AT
    };
    const line: InventoryReceiptLine = {
      id: "RCVL-1", receiptId: "RCV-1", partNumber: "101", description: "Impeller",
      quantity: 2, uom: "EA", trackingPolicy: "HeatTracked",
      disposition: "PartialReceipt", matchedRequirementId: "REQ-IMP"
    };
    const f = receiptFulfillment(line, receipt, "F1")!;
    expect(f.status).toBe("Open");
    expect(f.kind).toBe("Receipt");
    expect(f.quantity).toBe(2);
  });

  it("writes no fulfilment when nothing was matched", () => {
    const receipt: InventoryReceipt = { id: "R", kind: "AgainstPo", facility: "M", receivedBy: "e", receivedAt: AT };
    const line: InventoryReceiptLine = {
      id: "L", receiptId: "R", partNumber: "x", description: "y", quantity: 1, uom: "EA",
      trackingPolicy: "QuantityTracked", disposition: "UnknownDemand"
    };
    expect(receiptFulfillment(line, receipt, "F")).toBeNull();
  });
});

describe("Quarantine blocks assembly (INV-003)", () => {
  const ledger: Ledger = { requirements: [requirement()], fulfillments: [] };

  it("refuses to issue quarantined material", () => {
    const m = [move({ type: "Received", quantity: 1 }), move({ type: "Quarantined" })];
    expect(qualityState(m, "INV-1")).toBe("Quarantine");
    expect(isIssuable(m, "INV-1")).toBe(false);

    const check = checkIssueToUnit({ identity: identity(), movements: m, ledger, unitId: "SAMPLE1001_1.3", quantity: 1 });
    expect(check.ok).toBe(false);
    expect(check.rejection).toBe("NotAccepted");
  });

  it("refuses to issue rejected material", () => {
    const m = [move({ type: "Received", quantity: 1 }), move({ type: "InspectionRejected" })];
    expect(qualityState(m, "INV-1")).toBe("Rejected");
    expect(checkIssueToUnit({ identity: identity(), movements: m, ledger, unitId: "SAMPLE1001_1.3", quantity: 1 }).rejection).toBe("NotAccepted");
  });

  it("acceptance makes it issuable", () => {
    const m = acceptedMovements();
    expect(isIssuable(m, "INV-1")).toBe(true);
    expect(checkIssueToUnit({ identity: identity(), movements: m, ledger, unitId: "SAMPLE1001_1.3", quantity: 1 }).ok).toBe(true);
  });
});

describe("Mismatch fails closed (INV-010)", () => {
  it("blocks a CD4MCu impeller against a 316SS requirement and names both", () => {
    const ledger: Ledger = { requirements: [requirement()], fulfillments: [] };
    const wrong = identity({ material: "CD4MCU", description: "1196 MTR CD4MCu Impeller" });
    const check = checkIssueToUnit({
      identity: wrong, movements: acceptedMovements(), ledger, unitId: "SAMPLE1001_1.3", quantity: 1
    });
    expect(check.ok).toBe(false);
    expect(check.rejection).toBe("SpecificationMismatch");
    expect(check.expected).toBe("316SS");
    expect(check.actual).toBe("CD4MCU");
    expect(check.message).toMatch(/Engineering review required/);
  });

  it("tolerates formatting differences but not different alloys", () => {
    const req = requirement({ description: "Impeller — 316 SS · 101" });
    expect(specificationMatches(req, identity({ material: "316ss" })).matches).toBe(true);
    expect(specificationMatches(req, identity({ material: "CD4MCU" })).matches).toBe(false);
  });

  it("a requirement naming no material cannot be contradicted", () => {
    const req = requirement({ description: "Impeller" });
    expect(specificationMatches(req, identity({ material: "CD4MCU" })).matches).toBe(true);
  });

  it("rejects when the Unit wants nothing", () => {
    const ledger: Ledger = { requirements: [], fulfillments: [] };
    const check = checkIssueToUnit({ identity: identity(), movements: acceptedMovements(), ledger, unitId: "SAMPLE1001_1.9", quantity: 1 });
    expect(check.rejection).toBe("NoMatchingRequirement");
  });
});

describe("A serialized item cannot be in two Units (INV-004)", () => {
  const ledger: Ledger = {
    requirements: [requirement({ id: "R1", unitId: "SAMPLE1001_1.1" }), requirement({ id: "R2", unitId: "SAMPLE1001_1.2" })],
    fulfillments: []
  };
  const motor = identity({ trackingPolicy: "Serialized", serialNumber: "WEG-99213", material: "" });

  it("blocks a second allocation and names the Unit holding it", () => {
    const m = acceptedMovements();
    m.push(move({ type: "IssuedToUnit", quantity: 1, unitId: "SAMPLE1001_1.1" }));
    expect(activeUnitAllocation(m, "INV-1")).toBe("SAMPLE1001_1.1");

    const check = checkIssueToUnit({ identity: motor, movements: m, ledger, unitId: "SAMPLE1001_1.2", quantity: 1 });
    expect(check.ok).toBe(false);
    expect(check.rejection).toBe("SerializedAlreadyAllocated");
    expect(check.message).toMatch(/WEG-99213/);
    expect(check.message).toMatch(/SAMPLE1001_1\.1/);
  });

  it("releases the allocation when it is removed from the Unit", () => {
    const m = acceptedMovements();
    m.push(move({ type: "IssuedToUnit", quantity: 1, unitId: "SAMPLE1001_1.1" }));
    m.push(move({ type: "RemovedFromUnit", quantity: 1, unitId: "SAMPLE1001_1.1" }));
    m.push(move({ type: "ReturnedToStock", quantity: 1, toLocationId: "LOC-B04-03" }));
    expect(activeUnitAllocation(m, "INV-1")).toBeNull();
    expect(isSerialized(motor.trackingPolicy)).toBe(true);
  });

  it("blocks a non-serialized item reserved for a different Unit too", () => {
    const m = acceptedMovements("SAMPLE1001_1.1");
    const check = checkIssueToUnit({ identity: identity({ material: "" }), movements: m, ledger, unitId: "SAMPLE1001_1.2", quantity: 1 });
    expect(check.rejection).toBe("ReservedForAnotherUnit");
  });
});

describe("Installation enters as-built, isolated per Unit", () => {
  it("records the actual part, heat and installer", () => {
    const record = asBuiltFromInstall(identity(), requirement(), "SAMPLE1001_1.3", "e-dave", AT);
    expect(record).toMatchObject({
      unitId: "SAMPLE1001_1.3",
      partNumber: "101-AT-M-A-S6",
      material: "316SS",
      heatNumber: "H316-8821",
      componentRole: "impeller",
      installedBy: "e-dave"
    });
  });

  it("never leaks one Unit's installed part into a sibling", () => {
    const a = asBuiltFromInstall(identity(), requirement(), "SAMPLE1001_1.3", "e-dave", AT);
    const b = asBuiltFromInstall(
      identity({ id: "INV-2", heatNumber: "H316-9999" }),
      requirement({ id: "REQ-2", unitId: "SAMPLE1001_1.4" }),
      "SAMPLE1001_1.4",
      "e-dave",
      AT
    );
    const forUnit3 = asBuiltForUnit([a, b], "SAMPLE1001_1.3");
    expect(forUnit3).toHaveLength(1);
    expect(forUnit3[0].heatNumber).toBe("H316-8821");
    expect(forUnit3.some((r) => r.inventoryIdentityId === "INV-2")).toBe(false);
  });
});

describe("Internal Jobs", () => {
  it("a stock receipt generates a put-away job with real physical steps", () => {
    const { job, taskSpecs } = buildPutAwayJob({
      jobNumber: "IJ-000184",
      identityIds: ["INV-1", "INV-2", "INV-3", "INV-4"],
      facility: "Mississauga",
      accountableOwnerId: "Shipping",
      createdBy: "e-dave",
      createdAt: AT
    });
    expect(job.type).toBe("PutAway");
    expect(job.title).toMatch(/Put away 4 received items/);
    expect(job.relatedInventoryItemIds).toHaveLength(4);
    expect(job.status).toBe("Ready");
    expect(taskSpecs.map((t) => t.title)).toContain("Confirm put away by scanning each location");
    expect(taskSpecs.some((t) => t.department === "Quality")).toBe(true);
  });

  it("is incomplete until every item has a location (INV-013)", () => {
    const { job } = buildPutAwayJob({
      jobNumber: "IJ-1", identityIds: ["INV-1", "INV-2"], facility: "M",
      accountableOwnerId: "Shipping", createdBy: "e", createdAt: AT
    });
    expect(putAwayIncomplete(job, { "INV-1": "LOC-A", "INV-2": null })).toEqual(["INV-2"]);
    expect(putAwayIncomplete(job, { "INV-1": "LOC-A", "INV-2": "LOC-B" })).toEqual([]);
  });

  it("can never release a customer Unit (INV-012)", () => {
    expect(canReleaseCustomerUnit()).toBe(false);
  });

  it("reports overdue only while still open", () => {
    const { job } = buildPutAwayJob({
      jobNumber: "IJ-1", identityIds: ["INV-1"], facility: "M",
      accountableOwnerId: "Shipping", createdBy: "e", createdAt: AT, dueDate: "2026-08-01"
    });
    expect(isOverdue(job, "2026-08-04")).toBe(true);
    expect(isOverdue({ ...job, status: "Complete" }, "2026-08-04")).toBe(false);
  });
});

describe("No monetary field enters inventory", () => {
  it("the contract surface carries no price, cost or currency", () => {
    const sample = {
      movement: move({ type: "Received", quantity: 1 }),
      identity: identity(),
      job: buildPutAwayJob({
        jobNumber: "IJ-1", identityIds: ["INV-1"], facility: "M",
        accountableOwnerId: "Shipping", createdBy: "e", createdAt: AT
      }).job
    };
    const raw = JSON.stringify(sample);
    expect(raw).not.toMatch(/price|cost|margin|currency|discount|multiplier|tax/i);
  });
});
