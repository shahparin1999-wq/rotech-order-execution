import { describe, expect, it } from "vitest";
import { buildInitialState, ORDER_NO } from "@/domain/fixtures";
import { reprintLabel } from "@/domain/actions";
import { resolveScan } from "@/domain/selectors";

const U = (n: number) => `${ORDER_NO}_1.${n}`;

describe("QR identity (criteria 8-9)", () => {
  it("simulated Unit QR resolves to the correct Unit", () => {
    const state = buildInitialState();
    const unit12 = state.units.find((u) => u.unitId === U(2))!;
    const qr = resolveScan(state, unit12.publicRef);
    expect(qr).toBeDefined();
    expect(qr!.recordType).toBe("Unit");
    expect(qr!.targetId).toBe(U(2));
  });

  it("every scannable record type has a distinct identity", () => {
    const state = buildInitialState();
    const types = new Set(state.qrIdentities.map((q) => q.recordType));
    expect(types).toEqual(
      new Set(["Order", "Unit", "Component", "MaterialLot", "Transfer", "Pallet"])
    );
    const refs = state.qrIdentities.map((q) => q.publicRef);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("reprinting a label does not create a new Unit or identity", () => {
    let state = buildInitialState();
    const unitCount = state.units.length;
    const qrCount = state.qrIdentities.length;
    const unit11 = state.units.find((u) => u.unitId === U(1))!;
    const before = resolveScan(state, unit11.publicRef)!;
    const printCountBefore = before.printEvents.length;

    state = reprintLabel(state, unit11.publicRef, "e-dave", "Tag damaged", "2026-07-18T16:00:00Z");

    expect(state.units.length).toBe(unitCount);
    expect(state.qrIdentities.length).toBe(qrCount);
    const after = resolveScan(state, unit11.publicRef)!;
    expect(after.printEvents.length).toBe(printCountBefore + 1);
    expect(after.targetId).toBe(U(1)); // same Unit, same publicRef
  });

  it("QR identity is stable across serial assignment (fixture evidence)", () => {
    const state = buildInitialState();
    // Unit 1.1 was tagged pre-serial and reprinted after serial assignment;
    // both events sit on the same publicRef.
    const unit11 = state.units.find((u) => u.unitId === U(1))!;
    const qr = resolveScan(state, unit11.publicRef)!;
    expect(qr.printEvents.length).toBe(2);
    expect(qr.printEvents[0].reason).toMatch(/pre-serial/i);
    expect(qr.printEvents[1].reason).toMatch(/serial assignment/i);
  });
});
