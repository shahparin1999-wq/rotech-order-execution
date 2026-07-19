import { describe, expect, it } from "vitest";
import { buildInitialState, ORDER_NO } from "@/domain/fixtures";
import {
  buildOrderSummarySnapshot,
  buildUnitHistorySnapshot
} from "@/domain/documents";

const U = (n: number) => `${ORDER_NO}_1.${n}`;

describe("Unit history snapshot (criterion 10)", () => {
  it("contains only the target Unit's records", () => {
    const state = buildInitialState();
    for (const seq of [1, 2, 3, 4, 5]) {
      const snap = buildUnitHistorySnapshot(state, U(seq));
      expect(snap.unit.unitId).toBe(U(seq));
      for (const r of snap.responses) expect(r.unitId).toBe(U(seq));
      for (const t of snap.tasks) expect(t.unitId).toBe(U(seq));
      for (const a of snap.attachments) expect(a.unitId).toBe(U(seq));
      for (const op of snap.route) expect(op.unitId).toBe(U(seq));
      for (const e of snap.auditEvents) expect(e.unitId).toBe(U(seq));
      for (const m of snap.approvedChanges) expect(m.unitId).toBe(U(seq));
      for (const s of snap.specialInstructions) expect(s.unitId).toBe(U(seq));
    }
  });

  it("Unit 1.1 snapshot shows ordered 316SS, approved CD4MCu change, and as-built CD4MCu", () => {
    const state = buildInitialState();
    const snap = buildUnitHistorySnapshot(state, U(1));
    expect(snap.orderedSpecification.material).toBe("316SS");
    expect(snap.approvedChanges).toHaveLength(1);
    expect(snap.approvedChanges[0].proposedMaterial).toBe("CD4MCu");
    expect(snap.asBuiltSpecification.material).toBe("CD4MCu");
    expect(snap.asBuiltSpecification.serial).toBe("2607143053");
    expect(snap.documentName).toBe(
      "26SO00729_1.1_Unit_QC_and_Manufacturing_History.pdf"
    );
  });

  it("sibling snapshots have no approved changes and remain 316SS", () => {
    const state = buildInitialState();
    for (const seq of [2, 3, 4, 5]) {
      const snap = buildUnitHistorySnapshot(state, U(seq));
      expect(snap.approvedChanges).toHaveLength(0);
      expect(snap.asBuiltSpecification.material).toBe("316SS");
    }
  });

  it("order completion summary includes all five Units", () => {
    const state = buildInitialState();
    const summary = buildOrderSummarySnapshot(state, ORDER_NO);
    expect(summary.units.map((u) => u.unitId)).toEqual([
      U(1), U(2), U(3), U(4), U(5)
    ]);
  });
});
