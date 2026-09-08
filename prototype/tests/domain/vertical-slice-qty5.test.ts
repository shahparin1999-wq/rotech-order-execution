// The Gate A milestone, end to end at domain level, on the REAL CPQ fixture:
//
//   sample-data/cpq-order-handoff-v2-qty5.json was produced by the CPQ
//   repository's own lifecycle (customer quote → Rotech manual pricing →
//   submission → publish → Won → award → confirmation → immutable PO →
//   acceptance → v2 publication) in an isolated runtime. Nothing here is a
//   hand-written package.
//
//   import as Rotech SO → 5 Units → per-Unit demand from the frozen
//   configuration → real shortage → vendor PO reference → receipt against the
//   PO line → inspection → issue + install into ONE Unit → as-built with heat /
//   lot → every component installed → the Unit's assembly task is released →
//   serial, photo and QC captured → sibling Units untouched → the whole state
//   survives the persistence diff/assemble round trip.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import { addAttachment, addChecklistResponse, importOrderHandoffV2 } from "@/domain/actions";
import { assignUnitSerial } from "@/domain/unitActions";
import { referenceVendorPo } from "@/domain/purchasingActions";
import { inspectInventory, installInventory, issueInventoryToUnit, putAwayInventory, receiveInventory } from "@/domain/inventoryActions";
import { computeHandoffChecksum, validateOrderHandoffPackage, type OrderHandoffPackageV2 } from "@/domain/orderHandoffV2";
import { availabilityForRequirement, componentKeyOf } from "@/domain/inventory/availability";
import { orderAttention, unitAttention } from "@/domain/ledger/attention";
import { readinessForUnit } from "@/domain/ledger/completeness";
import { MATERIAL_GATE_REASON } from "@/domain/ledger/requirementFlow";
import { requiredVsActual } from "@/domain/ledger/requiredVsActual";
import { trackingPolicyFor } from "@/domain/inventory/identity";
import { assembleState, diffStates } from "@/server/collections";
import type { AppState } from "@/domain/types";

const SO = "26SO01234";
const UNITS = [1, 2, 3, 4, 5].map((n) => `${SO}_1.${n}`);
const U14 = `${SO}_1.4`;
const U15 = `${SO}_1.5`;
const SIBLINGS = UNITS.filter((u) => u !== U14);
let clock = 0;
const at = () => `2026-09-08T10:${String(clock++).padStart(2, "0")}:00Z`;

function loadFixture(): OrderHandoffPackageV2 {
  return JSON.parse(readFileSync("sample-data/cpq-order-handoff-v2-qty5.json", "utf8")) as OrderHandoffPackageV2;
}

function requirementFor(state: AppState, unitId: string, componentKey: string) {
  const r = state.requirements.find((x) => x.unitId === unitId && componentKeyOf(x) === componentKey);
  if (!r) throw new Error(`no ${componentKey} requirement for ${unitId}`);
  return r;
}

function assemblyTask(state: AppState, unitId: string) {
  const t = state.tasks.find((x) => x.unitId === unitId && x.name === "Pull parts and assemble");
  if (!t) throw new Error(`no assembly task for ${unitId}`);
  return t;
}

/** Receive → accept → put away → issue → install one tracked component into a Unit. */
function supplyAndInstall(
  state: AppState,
  unitId: string,
  componentKey: string,
  spec: { partNumber: string; description: string; material?: string; heat?: string; lot?: string },
  matched = true
): AppState {
  let s = receiveInventory(
    state,
    "e-tom",
    {
      kind: "Stock",
      facility: "Mississauga",
      partNumber: spec.partNumber,
      description: spec.description,
      material: spec.material,
      quantity: 1,
      componentKey,
      trackingPolicy: trackingPolicyFor(componentKey),
      heatNumber: spec.heat,
      lotNumber: spec.lot,
      matchedRequirementId: matched ? requirementFor(state, unitId, componentKey).id : undefined
    },
    at()
  );
  const identity = s.inventoryIdentities.at(-1)!;
  s = inspectInventory(s, "e-priya", identity.id, "Accept", "Certificate matches", at());
  s = putAwayInventory(s, "e-tom", identity.id, "LOC-MIS-B04-03", at());
  s = issueInventoryToUnit(s, "e-dave", identity.id, unitId, 1, at());
  return installInventory(s, "e-dave", identity.id, unitId, 1, at());
}

describe("Gate A vertical slice — real CPQ Qty-5 order", () => {
  const pkg = loadFixture();

  it("the CPQ-produced package validates byte-for-byte (schema, checksum, zero monetary keys)", () => {
    const result = validateOrderHandoffPackage(pkg);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.monetaryLeaks).toEqual([]);
    expect(pkg.source.quoteStatus).toBe("Won");
    expect(pkg.source.orderProcessingState).toBe("PUBLISHED");
    expect(pkg.lines[0].executionDisposition).toBe("unit-bearing");
    expect(pkg.lines[0].quantity).toBe(5);
    expect((pkg.lines[0].seal as Record<string, unknown>).sealOption).toBe("ROTECH SHOP MOUNT ROTECH SEAL");
  });

  const imported = importOrderHandoffV2(
    buildInitialState(),
    "e-sarah",
    { package: pkg, orderNumber: SO, facility: "Mississauga", coordinatorId: "e-sarah", dueDate: "2026-10-15" },
    at()
  );

  it("imports as a Rotech sales order with an immutable internal id and CPQ provenance", () => {
    const order = imported.orders.find((o) => o.orderNumber === SO)!;
    expect(order.id).toMatch(/^ord-/);
    expect(order.cpqReference).toBe("26CPQ0005 rev 0");
    expect(order.dueDate).toBe("2026-10-15");
    expect(order.lines[0].cpqQuoteId).toBe(pkg.source.quoteId);
    expect(order.lines[0].cpqRevisionId).toBe(pkg.source.revisionId);
    const snapshot = imported.configurationSnapshots.find((s) => s.orderNumber === SO)!;
    expect(snapshot.checksum).toBe(pkg.checksum);
    expect(imported.units.filter((u) => u.orderNumber === SO).map((u) => u.unitId)).toEqual(UNITS);
  });

  it("derives per-Unit demand from the frozen configuration: 6 components + hydrotest per Unit, none from a BOM template", () => {
    const reqs = imported.requirements.filter((r) => r.executionOrderId === SO);
    expect(reqs).toHaveLength(5 * 7);
    for (const unitId of UNITS) {
      const keys = reqs.filter((r) => r.unitId === unitId && r.category === "Component").map(componentKeyOf).sort();
      expect(keys).toEqual(["casing", "impeller", "powerFrame", "seal", "shaftKit", "stuffingBoxCover"]);
      expect(reqs.filter((r) => r.unitId === unitId && r.category === "Test").map((r) => r.description)).toEqual(["NON-WITNESSED HYDROSTATIC TEST"]);
    }
    expect(new Set(reqs.map((r) => r.source))).toEqual(new Set(["CpqConfiguration"]));
    expect(requirementFor(imported, U14, "casing").description).toBe("Casing 3X4-13 MTR — DI");
    expect(requirementFor(imported, U14, "seal").description).toBe("Mechanical seal (Single cartridge) — CAR/SIC/FKM");
    // The 45-row browser BOM template never becomes demand.
    expect(reqs.some((r) => /bearing|gasket|bolt|plug/i.test(r.description))).toBe(false);
  });

  it("shows a real shortage and holds assembly for material on every Unit", () => {
    const attention = orderAttention(imported, SO, "2026-09-08T12:00:00Z");
    // The demo stockroom already holds a few matching parts (impellers,
    // seals), so the shortage count is derived from availability rather than
    // assumed: every casing is short (no ductile-iron casing in stock).
    const components = imported.requirements.filter((r) => r.executionOrderId === SO && r.category === "Component");
    const notInStock = components.filter((r) => availabilityForRequirement(imported, r.id).state !== "InStock");
    expect(notInStock.length).toBeGreaterThanOrEqual(24);
    expect(attention.filter((i) => i.kind === "Shortage")).toHaveLength(notInStock.length);
    expect(components.filter((r) => componentKeyOf(r) === "casing").every((r) => availabilityForRequirement(imported, r.id).state === "NoRecipe")).toBe(true);
    expect(attention.every((i) => i.severity === "Blocker")).toBe(true);
    for (const unitId of UNITS) {
      const task = assemblyTask(imported, unitId);
      expect(task.status).toBe("Blocked");
      expect(task.blockReason).toBe(MATERIAL_GATE_REASON);
      expect(imported.units.find((u) => u.unitId === unitId)!.status).toBe("Blocked");
      expect(readinessForUnit(imported, unitId, `${SO}-L1`, SO).dimensions.find((d) => d.dimension === "Materials")!.state).toBe("Blocked");
    }
  });

  it("a vendor PO reference turns the casing shortage for 1.4 and 1.5 into 'on order' with an expected date", () => {
    const s = referenceVendorPo(
      imported,
      "e-sarah",
      {
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
            requirementIds: [requirementFor(imported, U14, "casing").id, requirementFor(imported, U15, "casing").id]
          }
        ]
      },
      at()
    );
    expect(availabilityForRequirement(s, requirementFor(s, U14, "casing").id)).toMatchObject({ state: "OnOrder", poNumber: "4500187", expectedDate: "2026-10-02" });
    expect(availabilityForRequirement(s, requirementFor(s, U15, "casing").id).state).toBe("OnOrder");
    expect(availabilityForRequirement(s, requirementFor(s, `${SO}_1.1`, "casing").id).state).toBe("NoRecipe");
    const attention = orderAttention(s, SO, "2026-09-08T12:00:00Z");
    const before = orderAttention(imported, SO, "2026-09-08T12:00:00Z").filter((i) => i.kind === "Shortage").length;
    expect(attention.filter((i) => i.kind === "Incoming")).toHaveLength(2);
    expect(attention.filter((i) => i.kind === "Shortage")).toHaveLength(before - 2);
    expect(orderAttention(s, SO, "2026-10-10T00:00:00Z").filter((i) => i.kind === "LatePurchase")).toHaveLength(2);
  });

  it("receipt against the PO line → inspection → issue → install captures heat on 1.4 only, then all components release its work", () => {
    let s = referenceVendorPo(
      imported,
      "e-sarah",
      {
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
            requirementIds: [requirementFor(imported, U14, "casing").id, requirementFor(imported, U15, "casing").id]
          }
        ]
      },
      at()
    );
    const poLine = s.vendorPoReferences[0].lines[0];
    const casing14 = requirementFor(s, U14, "casing").id;
    const casing15 = requirementFor(s, U15, "casing").id;

    // One casing arrives from India against the PO line, booked to 1.4's demand.
    s = receiveInventory(
      s,
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
        matchedRequirementId: casing14,
        vendorPoLineId: poLine.id
      },
      at()
    );
    const casingIdentity = s.inventoryIdentities.at(-1)!;
    expect(availabilityForRequirement(s, casing14).state).toBe("Expected"); // arrived, awaiting inspection
    expect(availabilityForRequirement(s, casing15).state).toBe("OnOrder"); // still pending, not stolen by the sibling
    s = inspectInventory(s, "e-priya", casingIdentity.id, "Accept", "Heat cert H-IN-77821 verified", at());
    expect(availabilityForRequirement(s, casing14).state).toBe("InStock");
    expect(s.requirements.find((r) => r.id === casing14)!.status).toBe("InProgress");
    s = putAwayInventory(s, "e-tom", casingIdentity.id, "LOC-MIS-B04-03", at());

    // Issue and install into 1.4. The role match means the casing cannot satisfy
    // the stuffing-box cover just because both are ductile iron.
    s = issueInventoryToUnit(s, "e-dave", casingIdentity.id, U14, 1, at());
    s = installInventory(s, "e-dave", casingIdentity.id, U14, 1, at());
    const usage = s.componentUsages.find((u) => u.unitId === U14 && u.componentRole === "casing")!;
    expect(usage).toMatchObject({ source: "Inventory", usageStatus: "Installed", matchStatus: "Matched", heatLot: "H-IN-77821", trackingType: "HeatTracked" });
    expect(s.requirements.find((r) => r.id === casing14)!.status).toBe("Satisfied");
    expect(s.requirements.find((r) => r.id === requirementFor(s, U14, "stuffingBoxCover").id)!.status).toBe("Unplanned");
    expect(assemblyTask(s, U14).status).toBe("Blocked"); // five components still open

    // The rest of 1.4's material arrives from stock: the gate opens on the last install.
    s = supplyAndInstall(s, U14, "impeller", { partNumber: "101-AT-M-A-S6", description: "Impeller 3X4-13", material: "316SS", heat: "H-IMP-4410" });
    s = supplyAndInstall(s, U14, "stuffingBoxCover", { partNumber: "184-34-M-A-DI", description: "Stuffing box cover 3X4-13", material: "DI", heat: "H-SBC-9920" });
    s = supplyAndInstall(s, U14, "shaftKit", { partNumber: "SHK-MTR-4140-316", description: "Shaft kit MTR", material: "4140/316SS SLEEVED SHAFT", lot: "L-SHK-0031" });
    s = supplyAndInstall(s, U14, "powerFrame", { partNumber: "228-M-A-DI", description: "Power frame MTR", material: "DI", heat: "H-PF-1180" });
    expect(assemblyTask(s, U14).status).toBe("Blocked");
    s = supplyAndInstall(s, U14, "seal", { partNumber: "SEAL-CRT-CAR-SIC-FKM", description: "Cartridge seal", material: "CAR/SIC/FKM", lot: "L-SEAL-7781" });

    const task = assemblyTask(s, U14);
    expect(task.status).toBe("Ready");
    expect(task.blockReason).toBeNull();
    expect(task.history.at(-1)?.action).toBe("BlockerResolved");
    expect(s.auditEvents.some((e) => e.action === "task.blockerResolved" && e.unitId === U14)).toBe(true);
    expect(s.units.find((u) => u.unitId === U14)!.status).not.toBe("Blocked");
    expect(readinessForUnit(s, U14, `${SO}-L1`, SO).dimensions.find((d) => d.dimension === "Materials")!.state).toBe("Ready");
    expect(unitAttention(s, U14, "2026-09-08T12:00:00Z").filter((i) => i.kind === "Shortage")).toHaveLength(0);
    const rows = requiredVsActual(s.requirements, s.componentUsages, U14);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.matchState === "Matched" && r.installedQuantity === 1)).toBe(true);

    // Serial, photo and a QC response on 1.4.
    s = assignUnitSerial(s, "e-dave", U14, "2609004401", undefined, at());
    s = addAttachment(s, "e-dave", { kind: "photo", category: "Material marking", orderNumber: SO, unitId: U14, targetRef: null, fileName: "casing-heat-stamp.jpg", placeholderArt: "stamp" }, at());
    s = addChecklistResponse(s, U14, "e-priya", { itemKey: "casing-material", value: "pass" }, at());
    expect(s.units.find((u) => u.unitId === U14)!.serial).toBe("2609004401");
    expect(() => assignUnitSerial(s, "e-dave", U15, "2609004401", undefined, at())).toThrow(/never reused/);

    // Sibling isolation: nothing above leaked into 1.1, 1.2, 1.3 or 1.5.
    for (const sibling of SIBLINGS) {
      expect(s.componentUsages.filter((u) => u.unitId === sibling)).toHaveLength(0);
      expect(s.attachments.filter((a) => a.unitId === sibling)).toHaveLength(0);
      expect(s.responses.filter((r) => r.unitId === sibling)).toHaveLength(0);
      expect(s.units.find((u) => u.unitId === sibling)!.serial).toBeNull();
      expect(assemblyTask(s, sibling).status).toBe("Blocked");
      expect(s.inventoryMovements.filter((m) => m.unitId === sibling)).toHaveLength(0);
      const statuses = new Set(s.requirements.filter((r) => r.unitId === sibling && r.category === "Component").map((r) => r.status));
      expect([...statuses].every((st) => st === "Unplanned" || st === "Planned")).toBe(true);
    }
    expect(availabilityForRequirement(s, casing15).state).toBe("OnOrder");
    expect(requiredVsActual(s.requirements, s.componentUsages, U15).every((r) => r.matchState === "NotRecorded")).toBe(true);

    // The whole resulting state survives the persistence round trip.
    const diff = diffStates(null, s);
    expect(assembleState(diff.upserts, diff.scalars, { currentUserId: s.currentUserId })).toEqual(s);
  });

  it("a byte-identical retry is a no-op and a changed payload for the same revision is refused", () => {
    const retried = importOrderHandoffV2(imported, "e-sarah", { package: pkg, orderNumber: "26SO09999", facility: "Mississauga", coordinatorId: "e-sarah" }, at());
    expect(retried).toBe(imported);
    expect(retried.orders.some((o) => o.orderNumber === "26SO09999")).toBe(false);
    const changed = { ...pkg, lines: [{ ...pkg.lines[0], quantity: 6 }] };
    const resealed = { ...changed, checksum: computeHandoffChecksum(changed) };
    expect(() =>
      importOrderHandoffV2(imported, "e-sarah", { package: resealed, orderNumber: "26SO09999", facility: "Mississauga", coordinatorId: "e-sarah" }, at())
    ).toThrow(/reviewed supersession/);
  });
});
