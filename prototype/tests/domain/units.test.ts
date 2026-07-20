import { describe, expect, it } from "vitest";
import { buildInitialState, ORDER_NO } from "@/domain/fixtures";
import { generateUnits } from "@/domain/ids";
import {
  orderProgress,
  unitsForOrder,
  unitsInStatus
} from "@/domain/selectors";

describe("Unit generation (criteria 1-2)", () => {
  it("quantity five produces exactly five independent Units", () => {
    const units = generateUnits("TEST-0001", 1, 5, {
      model: "1196",
      size: "3x4-13",
      orderedMaterial: "316SS",
      location: "Mississauga"
    });
    expect(units).toHaveLength(5);
    // Independence: distinct objects, distinct identities, distinct QR refs.
    const ids = new Set(units.map((u) => u.unitId));
    const refs = new Set(units.map((u) => u.publicRef));
    expect(ids.size).toBe(5);
    expect(refs.size).toBe(5);
  });

  it("the five Unit IDs are correct and unique", () => {
    const state = buildInitialState();
    const units = unitsForOrder(state, ORDER_NO);
    expect(units.map((u) => u.unitId)).toEqual([
      `${ORDER_NO}_1.1`,
      `${ORDER_NO}_1.2`,
      `${ORDER_NO}_1.3`,
      `${ORDER_NO}_1.4`,
      `${ORDER_NO}_1.5`
    ]);
  });

  it("fixture Units occupy five different states with serial rules", () => {
    const state = buildInitialState();
    const units = unitsForOrder(state, ORDER_NO);
    expect(units.map((u) => u.status)).toEqual([
      "Complete",
      "InAssembly",
      "Blocked",
      "AwaitingQuality",
      "NotStarted"
    ]);
    expect(units[0].serial).toBe("DEMO-SN-0001");
    expect(units[1].serial).toBeNull(); // renders as "Serial pending"
  });
});

describe("Progress drill-down (criterion 5)", () => {
  it("progress fractions return the exact Unit set", () => {
    const state = buildInitialState();
    const p = orderProgress(state, ORDER_NO);
    expect(p.total).toBe(5);
    expect(p.complete.map((u) => u.unitId)).toEqual([`${ORDER_NO}_1.1`]);
    expect(p.blocked.map((u) => u.unitId)).toEqual([`${ORDER_NO}_1.3`]);
    expect(p.inProgress.map((u) => u.unitId)).toEqual([`${ORDER_NO}_1.2`]);
    expect(p.awaitingQuality.map((u) => u.unitId)).toEqual([`${ORDER_NO}_1.4`]);
    expect(p.notStarted.map((u) => u.unitId)).toEqual([`${ORDER_NO}_1.5`]);
    expect(unitsInStatus(state, ORDER_NO, "Blocked").map((u) => u.unitId)).toEqual([
      `${ORDER_NO}_1.3`
    ]);
  });
});
