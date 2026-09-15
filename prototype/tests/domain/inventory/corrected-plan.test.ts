import { describe, expect, it, afterEach } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import { applyAction, type Action } from "@/domain/reducer";
import { confirmOpeningImport, inspectInventory, issueInventoryToUnit, putAwayInventory, receiveInventory } from "@/domain/inventoryActions";
import { recordShipmentParse, editExpectedShipmentDraft, confirmExpectedShipment, supersedeExpectedShipment } from "@/domain/inventoryShipmentActions";
import { activeUnitAllocation, onHand, qualityState } from "@/domain/inventory/movement";
import { createConfiguredOrder } from "@/domain/actions";
import { newAssemblyLine } from "@/domain/configurator";
import { requiredSpecFromDescription } from "@/domain/ledger/componentUsage";
import { resolveRequestIdentity, authorizeInventoryAction, CapabilityError, IdentityError } from "@/server/authorization";
import { parseShipmentFile } from "@/server/shipmentParser";

afterEach(() => {
  delete process.env.OEH_UAT_MODE;
  delete process.env.OEH_IDENTITY_MAP_JSON;
});

describe("identity chain and capability authorization", () => {
  it("maps a UAT authenticated Site identity to OEH employee, facility, role and capabilities", () => {
    process.env.OEH_UAT_MODE = "1";
    const identity = resolveRequestIdentity(new Request("https://uat.example", { headers: { "x-oeh-uat-employee-id": "e-tom" } }), buildInitialState());
    expect(identity).toMatchObject({ oehUserId: "e-tom", rotechEmployeeId: "UAT-007", jobRole: "Shipping", facilityScope: ["Mississauga"] });
    expect(identity.capabilities).toContain("inventory.receive");
  });

  it("fails closed when Site identity is missing or role capability is absent", () => {
    expect(() => resolveRequestIdentity(new Request("https://uat.example"), buildInitialState())).toThrow(IdentityError);
    process.env.OEH_UAT_MODE = "1";
    const state = buildInitialState();
    const quality = resolveRequestIdentity(new Request("https://uat.example", { headers: { "x-oeh-uat-employee-id": "e-priya" } }), state);
    expect(() => authorizeInventoryAction({ type: "receiveInventory", input: { kind: "Stock", facility: "Mississauga", partNumber: "P-1", description: "Part", quantity: 1 } }, quality, state)).toThrow(CapabilityError);
  });

  it("enforces facility scope on mutations while allowing the separate pool to remain readable", () => {
    process.env.OEH_UAT_MODE = "1";
    const state = buildInitialState();
    const shipping = resolveRequestIdentity(new Request("https://uat.example", { headers: { "x-oeh-uat-employee-id": "e-tom" } }), state);
    expect(() => authorizeInventoryAction({ type: "receiveInventory", input: { kind: "Stock", facility: "Houston", partNumber: "P-1", description: "Part", quantity: 1 } }, shipping, state)).toThrow(/outside this user's scope/i);
    expect(state.inventoryIdentities.some((x) => x.facility === "Houston")).toBe(true);
  });

  it("fails closed for every tracked receipt and location boundary", () => {
    const state = buildInitialState();
    const seededMotor = state.inventoryIdentities.find((x) => x.trackingPolicy === "Serialized")!;
    expect(() => receiveInventory(state, "e-tom", {
      kind: "Stock", facility: "Mississauga", componentKey: "motor", partNumber: "MOTOR-DUP", description: "Motor", quantity: 1,
      trackingPolicy: "Serialized", serialNumber: seededMotor.serialNumber
    })).toThrow(/already exists/i);
    expect(() => receiveInventory(state, "e-tom", {
      kind: "Stock", facility: "Mississauga", componentKey: "motor", partNumber: "MOTOR-POLICY", description: "Motor", quantity: 1,
      trackingPolicy: "HeatTracked", heatNumber: "H-POLICY"
    })).toThrow(/configured Serialized/i);

    const accepted = state.inventoryIdentities.find((item) => qualityState(state.inventoryMovements, item.id) === "Accepted" && !activeUnitAllocation(state.inventoryMovements, item.id))!;
    expect(() => putAwayInventory(state, "e-tom", accepted.id, "LOC-HOU-A1")).toThrow(/outside Mississauga/i);
    expect(() => putAwayInventory(state, "e-tom", accepted.id, "LOC-NOT-REAL")).toThrow(/Unknown inventory location/i);
    expect(() => inspectInventory(state, "e-priya", accepted.id, "Reject", "late correction")).toThrow(/quarantined/i);
  });

  it("allows accepted material to issue directly to a same-facility Unit without put-away", () => {
    let state = createConfiguredOrder(buildInitialState(), "e-sarah", {
      orderNumber: "DIRECT-ISSUE-UAT",
      customerId: "cust-acme",
      customerPo: "PO-DIRECT-ISSUE-UAT",
      description: "Direct issue UAT",
      facility: "Mississauga",
      coordinatorId: "e-sarah",
      priority: "Medium",
      dueDate: "2026-10-01",
      lines: [newAssemblyLine("direct-1")]
    });
    const unitId = state.units.find((unit) => unit.orderNumber === "DIRECT-ISSUE-UAT")!.unitId;
    const requirement = state.requirements.find((item) => item.unitId === unitId && item.componentId?.endsWith("-casing"));
    expect(requirement).toBeTruthy();
    const spec = requiredSpecFromDescription(requirement!.description);
    state = receiveInventory(state, "e-tom", {
      kind: "Stock",
      facility: "Mississauga",
      partNumber: spec.partNumber ?? "DIRECT-CASING",
      description: requirement!.description,
      material: spec.material,
      quantity: 1,
      componentKey: "casing",
      trackingPolicy: "HeatTracked",
      heatNumber: "H-DIRECT-ISSUE",
      matchedRequirementId: requirement!.id
    });
    const identityId = state.inventoryIdentities.at(-1)!.id;
    state = inspectInventory(state, "e-priya", identityId, "Accept", "Direct issue UAT");
    const before = onHand(state.inventoryMovements, identityId);
    state = issueInventoryToUnit(state, "e-alex", identityId, unitId, 1);
    expect(activeUnitAllocation(state.inventoryMovements, identityId)).toBe(unitId);
    expect(onHand(state.inventoryMovements, identityId)).toBe(before);
    expect(state.inventoryMovements.some((movement) => movement.type === "PutAway" && movement.inventoryIdentityId === identityId)).toBe(false);
  });

  it("authorizes every inventory command through its mapped capability", () => {
    process.env.OEH_UAT_MODE = "1";
    const state = buildInitialState();
    const identity = state.inventoryIdentities.find((x) => x.facility === "Mississauga")!;
    const location = state.inventoryLocations.find((x) => x.facility === "Mississauga")!;
    const unitId = state.units[0].unitId;
    const commands: Array<{ actorId: string; action: Action }> = [
      { actorId: "e-tom", action: { type: "receiveInventory", input: { kind: "Stock", facility: "Mississauga", partNumber: "P-1", description: "Part", quantity: 1 } } },
      { actorId: "e-tom", action: { type: "putAwayInventory", identityId: identity.id, locationId: location.id } },
      { actorId: "e-priya", action: { type: "inspectInventory", identityId: identity.id, decision: "Accept", note: "UAT inspection" } },
      { actorId: "e-alex", action: { type: "reserveInventory", identityId: identity.id, unitId, quantity: 1 } },
      { actorId: "e-alex", action: { type: "issueInventoryToUnit", identityId: identity.id, unitId, quantity: 1 } },
      { actorId: "e-alex", action: { type: "installInventory", identityId: identity.id, unitId, quantity: 1 } },
      { actorId: "e-alex", action: { type: "returnInventoryToStock", identityId: identity.id, unitId, quantity: 1, reason: "UAT return", locationId: location.id } },
      { actorId: "e-dave", action: { type: "adjustInventory", identityId: identity.id, delta: 1, reason: "UAT adjustment", authorizedBy: "e-dave" } },
      { actorId: "e-dave", action: { type: "confirmOpeningImport", input: { importBatchId: "OPEN-UAT-AUTH", sourceFileId: "file-u1", sourceFileHash: "hash-u1", reason: "UAT authorization test", lines: [] } } },
      { actorId: "e-jordan", action: { type: "recordShipmentParse", input: {} as never } },
      { actorId: "e-jordan", action: { type: "editExpectedShipmentDraft", input: { shipmentId: "draft-u1" } } },
      { actorId: "e-jordan", action: { type: "confirmExpectedShipment", shipmentId: "draft-u1" } },
      { actorId: "e-jordan", action: { type: "supersedeExpectedShipment", shipmentId: "draft-u1" } }
    ];

    for (const command of commands) {
      const actor = resolveRequestIdentity(new Request("https://uat.example", { headers: { "x-oeh-uat-employee-id": command.actorId } }), state);
      expect(() => authorizeInventoryAction(command.action, actor, state), command.action.type).not.toThrow();
    }
  });
});

describe("audited opening balances", () => {
  it("creates only provenance-bearing adjustment movements", () => {
    const state = buildInitialState();
    const identity = state.inventoryIdentities[0];
    const before = onHand(state.inventoryMovements, identity.id);
    const next = confirmOpeningImport(state, "e-dave", {
      importBatchId: "OPEN-UAT-001",
      sourceFileId: "file-uat-opening",
      sourceFileHash: "abc123",
      reason: "Approved UAT opening count",
      lines: [{ identityId: identity.id, delta: 2, sourceRow: 7, reason: "Physical count exceeded ledger by two" }]
    }, "2026-09-14T12:00:00Z");
    const movement = next.inventoryMovements.at(-1)!;
    expect(onHand(next.inventoryMovements, identity.id)).toBe(before + 2);
    expect(movement).toMatchObject({ type: "Adjusted", importBatchId: "OPEN-UAT-001", sourceFileId: "file-uat-opening", sourceFileHash: "abc123", sourceRow: 7, approvedBy: "e-dave", approvedAt: "2026-09-14T12:00:00Z", authorizedBy: "e-dave" });
    expect(next.openingImports[0]).toMatchObject({ importBatchId: "OPEN-UAT-001", approvedBy: "e-dave", status: "Confirmed" });
  });
});

describe("shipment parsing and immutable revisions", () => {
  it("parses a structured shipment list with source-row results and creates a draft", async () => {
    const parsed = await parseShipmentFile(new TextEncoder().encode("Supplier,PO,Facility,Expected Date,Part Number,Description,Material,Family,Size,Frame,Component Role,Quantity,UOM\nAcme,PO-UAT-4,Mississauga,2026-10-01,SEAL-1,Mechanical seal,316SS,1196,3X4-13,MTR,seal,4,EA\n"), "text/csv", "shipment.csv");
    expect(parsed.ok).toBe(true);
    expect(parsed.shipment?.lines[0]).toMatchObject({ partNumber: "SEAL-1", expectedQuantity: 4, facility: "Mississauga", material: "316SS", componentKey: "seal", attributes: { Family: "1196", Size: "3X4-13", Frame: "MTR" } });
    expect(parsed.fields.some((x) => x.field === "partNumber" && x.sourceRow === 2)).toBe(true);

    let state = buildInitialState();
    state = recordShipmentParse(state, "e-sarah", {
      file: { originalName: "shipment.csv", mediaType: "text/csv", sizeBytes: 10, sha256: "hash-u1", storageKey: "shipments/hash-u1", status: "Parsed", uploadedBy: "e-sarah", uploadedAt: "2026-09-14T12:00:00Z" },
      parseRun: { parserVersion: "test", status: "Completed", startedAt: "2026-09-14T12:00:00Z", completedAt: "2026-09-14T12:00:01Z" },
      fields: parsed.fields,
      shipment: { ...parsed.shipment!, sourceFileId: "ignored", sourceFileHash: "ignored" }
    }, "2026-09-14T12:00:01Z");
    const draft = state.expectedShipments[0];
    state = editExpectedShipmentDraft(state, "e-sarah", { shipmentId: draft.id, lineId: draft.lines[0].id, line: { expectedQuantity: 5 } }, "2026-09-14T12:01:00Z");
    state = confirmExpectedShipment(state, "e-sarah", draft.id, "2026-09-14T12:02:00Z");
    const confirmed = state.expectedShipments.find((x) => x.id === draft.id)!;
    expect(confirmed).toMatchObject({ status: "Confirmed", lines: [{ expectedQuantity: 5 }] });
    expect(() => editExpectedShipmentDraft(state, "e-sarah", { shipmentId: draft.id, supplier: "Mutated in place" })).toThrow(/immutable/i);

    state = supersedeExpectedShipment(state, "e-sarah", draft.id, "2026-09-14T12:03:00Z");
    const revision = state.expectedShipments.find((x) => x.supersedesId === draft.id)!;
    expect(state.expectedShipments.find((x) => x.id === draft.id)?.status).toBe("Superseded");
    expect(revision.status).toBe("Draft");
    expect(revision.lines[0].expectedQuantity).toBe(5);
  });

  it("returns an explicit review result for unsupported OCR input", async () => {
    const parsed = await parseShipmentFile(new Uint8Array([1, 2, 3]), "image/png", "scan.png");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/OCR adapter is not configured/i);
    expect(parsed.fields[0].flags).toEqual(expect.arrayContaining(["Unsupported", "Missing"]));
  });
});

describe("harmless idempotent feasibility command", () => {
  it("is a real non-local reducer action with no state mutation", () => {
    const state = buildInitialState();
    expect(applyAction(state, { type: "feasibilityProbe", probeId: "probe-1" })).toBe(state);
  });
});
