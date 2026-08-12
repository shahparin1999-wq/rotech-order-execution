// The demo stock has to be worth looking at.
//
// Inventory was seeded empty, so every Inventory screen read "Nothing received
// yet." These tests pin the properties that make the seed useful: it exists,
// it is genuinely derived from the movement ledger, it covers categories that
// are not pump-shaped, and it contains a real spread rather than everything
// being conveniently available.

import { describe, expect, it } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import {
  activeUnitAllocation,
  available,
  onHand,
  qualityState
} from "@/domain/inventory/movement";
import { INVENTORY_CATEGORIES } from "@/domain/inventory/identity";

const state = buildInitialState();

describe("Demo stock exists at all", () => {
  it("seeds inventory identities, movements and receipts", () => {
    expect(state.inventoryIdentities.length).toBeGreaterThan(10);
    expect(state.inventoryMovements.length).toBeGreaterThan(30);
    expect(state.inventoryReceipts.length).toBeGreaterThan(10);
  });

  it("gives every seeded item a scannable QR identity", () => {
    for (const identity of state.inventoryIdentities) {
      const qr = state.qrIdentities.find((q) => q.publicRef === identity.publicRef);
      expect(qr, `${identity.partNumber} has no QR identity`).toBeDefined();
      expect(qr!.recordType).toBe("InventoryItem");
      expect(qr!.targetId).toBe(identity.id);
    }
  });
});

describe("Quantities are derived, never stored", () => {
  it("every on-hand figure comes from the movement ledger", () => {
    for (const identity of state.inventoryIdentities) {
      const derived = onHand(state.inventoryMovements, identity.id);
      expect(derived, `${identity.partNumber} has no derived on-hand`).toBeGreaterThan(0);
    }
  });

  it("available never exceeds on hand", () => {
    for (const identity of state.inventoryIdentities) {
      expect(available(state.inventoryMovements, identity.id)).toBeLessThanOrEqual(
        onHand(state.inventoryMovements, identity.id)
      );
    }
  });
});

describe("Inventory identity is not pump-shaped", () => {
  it("covers categories beyond castings — motors, seals, bearings, hardware", () => {
    const seeded = new Set(state.inventoryIdentities.map((i) => i.category));
    for (const c of ["Casting", "Rotating", "Seal", "Bearing", "Motor", "Coupling", "Baseplate", "Guard", "Hardware"]) {
      expect(seeded.has(c as (typeof INVENTORY_CATEGORIES)[number]), `no ${c} in the seed`).toBe(true);
    }
  });

  it("a motor carries motor attributes and no pump size", () => {
    const motor = state.inventoryIdentities.find((i) => i.category === "Motor")!;
    expect(motor.attributes?.hp).toBeTruthy();
    expect(motor.attributes?.frame).toBeTruthy();
    expect(motor.attributes?.size).toBeUndefined();
  });

  it("a bearing carries no size, frame or material at all", () => {
    const bearing = state.inventoryIdentities.find((i) => i.category === "Bearing")!;
    expect(bearing.attributes?.size).toBeUndefined();
    expect(bearing.attributes?.frame).toBeUndefined();
    expect(bearing.material).toBe("");
  });

  it("a casting carries family/size/frame as attributes, not as identity", () => {
    const casting = state.inventoryIdentities.find(
      (i) => i.category === "Casting" && i.attributes?.size === "6X8-13"
    )!;
    expect(casting.attributes).toMatchObject({ family: "1196", size: "6X8-13", frame: "XLR" });
    // The part number is the identity; attributes only describe it.
    expect(casting.partNumber).toBeTruthy();
  });
});

describe("The spread is deliberate, not all-available", () => {
  it("has stock reserved to a Unit, so 'held by another order' is demonstrable", () => {
    const reserved = state.inventoryIdentities.filter(
      (i) => activeUnitAllocation(state.inventoryMovements, i.id) !== null
    );
    expect(reserved.length).toBeGreaterThan(0);
    for (const r of reserved) {
      expect(available(state.inventoryMovements, r.id)).toBe(0);
    }
  });

  it("has stock still awaiting incoming inspection", () => {
    const quarantined = state.inventoryIdentities.filter(
      (i) => qualityState(state.inventoryMovements, i.id) === "Quarantine"
    );
    expect(quarantined.length).toBeGreaterThan(0);
  });

  it("has free stock at both facilities", () => {
    for (const facility of ["Mississauga", "Houston"]) {
      const free = state.inventoryIdentities.filter(
        (i) => i.facility === facility && available(state.inventoryMovements, i.id) > 0
      );
      expect(free.length, `no free stock at ${facility}`).toBeGreaterThan(0);
    }
  });

  it("the same part exists at both facilities, so cross-facility visibility is demonstrable", () => {
    const byPart = new Map<string, Set<string>>();
    for (const i of state.inventoryIdentities) {
      if (!byPart.has(i.partNumber)) byPart.set(i.partNumber, new Set());
      byPart.get(i.partNumber)!.add(i.facility);
    }
    const split = [...byPart.entries()].filter(([, f]) => f.size > 1);
    expect(split.length).toBeGreaterThan(0);
  });
});
