import { describe, expect, it } from "vitest";
import { buildInitialState, ORDER_NO } from "@/domain/fixtures";
import {
  addAttachment,
  addChecklistResponse,
  convertPost,
  addPost
} from "@/domain/actions";
import { responsesForUnit, unitsForOrder } from "@/domain/selectors";

const U = (n: number) => `${ORDER_NO}_1.${n}`;

describe("Unit isolation (criteria 3-4, 10)", () => {
  it("material change on Unit 1.1 does not alter Units 1.2-1.5", () => {
    const state = buildInitialState();
    const units = unitsForOrder(state, ORDER_NO);
    const u11 = units.find((u) => u.unitId === U(1))!;
    expect(u11.orderedMaterial).toBe("316SS");
    expect(u11.asBuiltMaterial).toBe("CD4MCu");
    for (const seq of [2, 3, 4, 5]) {
      const sibling = units.find((u) => u.unitId === U(seq))!;
      expect(sibling.orderedMaterial).toBe("316SS");
      expect(sibling.asBuiltMaterial).toBe("316SS");
    }
    // The change record itself targets exactly one Unit.
    const mc = state.materialChanges.find((m) => m.id === "mc-001")!;
    expect(mc.unitId).toBe(U(1));
  });

  it("a new material change created by conversion affects only its target Unit", () => {
    let state = buildInitialState();
    state = addPost(state, "e-sarah", {
      orderNumber: ORDER_NO,
      unitId: U(3),
      body: "Proposal: CD4 for Unit 1.3 as well"
    }, "2026-07-18T12:00:00Z");
    const post = state.posts.at(-1)!;
    state = convertPost(state, post.id, "e-sarah", {
      kind: "MaterialChange",
      unitId: U(3),
      proposedMaterial: "CD4MCu",
      reason: "test"
    }, "2026-07-18T12:05:00Z");
    const mc = state.materialChanges.at(-1)!;
    expect(mc.unitId).toBe(U(3));
    expect(mc.status).toBe("PendingApproval");
    // Sibling as-built materials unchanged (approval flow not exercised).
    for (const u of unitsForOrder(state, ORDER_NO)) {
      expect(u.asBuiltMaterial).toBe(u.unitId === U(1) ? "CD4MCu" : "316SS");
    }
  });

  it("a checklist response belongs only to its selected Unit", () => {
    let state = buildInitialState();
    const before13 = responsesForUnit(state, U(3)).length;
    state = addChecklistResponse(state, U(2), "e-alex", {
      itemKey: "shaft-runout",
      value: 1.2,
      enteredText: "1.2"
    }, "2026-07-18T13:00:00Z");
    const added = state.responses.at(-1)!;
    expect(added.unitId).toBe(U(2));
    expect(responsesForUnit(state, U(3)).length).toBe(before13);
    for (const seq of [1, 3, 4, 5]) {
      expect(responsesForUnit(state, U(seq)).some((r) => r.id === added.id)).toBe(false);
    }
  });

  it("a photo attachment belongs only to its selected Unit and validates ancestors", () => {
    let state = buildInitialState();
    state = addAttachment(state, "e-alex", {
      kind: "photo",
      category: "Measurement evidence",
      orderNumber: ORDER_NO,
      unitId: U(2),
      targetRef: "impeller-trim",
      fileName: "trim-photo.jpg",
      placeholderArt: "caliper"
    }, "2026-07-18T13:10:00Z");
    const a = state.attachments.at(-1)!;
    expect(a.unitId).toBe(U(2));
    expect(
      state.attachments.filter((x) => x.unitId === U(3) && x.id === a.id)
    ).toHaveLength(0);

    // Inconsistent ancestors are rejected (unit belongs to another order).
    expect(() =>
      addAttachment(state, "e-alex", {
        kind: "photo",
        category: "General reference",
        orderNumber: "26SO00735",
        unitId: U(2),
        targetRef: null,
        fileName: "wrong.jpg",
        placeholderArt: "pump"
      })
    ).toThrow(/Inconsistent ancestors/);
  });

  it("cross-Unit response supersession is rejected", () => {
    const state = buildInitialState();
    expect(() =>
      addChecklistResponse(state, U(2), "e-alex", {
        itemKey: "impeller-trim",
        value: 12.5,
        supersedesId: "r-11-trim-v2" // belongs to Unit 1.1
      })
    ).toThrow(/Cross-Unit supersession rejected/);
  });
});
