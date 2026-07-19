import { describe, expect, it } from "vitest";
import { buildInitialState, ORDER_NO } from "@/domain/fixtures";
import { addPost, addReply, convertPost } from "@/domain/actions";

const U = (n: number) => `${ORDER_NO}_1.${n}`;

describe("Activity and comment conversion (criterion 7)", () => {
  it("comment conversion retains the original comment", () => {
    let state = buildInitialState();
    state = addPost(state, "e-lena", {
      orderNumber: ORDER_NO,
      unitId: U(4),
      body: "Deburr the volute edge on Unit 1.4 before final inspection"
    }, "2026-07-18T14:00:00Z");
    const post = state.posts.at(-1)!;
    const originalBody = post.body;

    state = convertPost(state, post.id, "e-lena", {
      kind: "Task",
      unitId: U(4),
      name: "Deburr volute edge"
    }, "2026-07-18T14:05:00Z");

    const after = state.posts.find((p) => p.id === post.id)!;
    expect(after.body).toBe(originalBody); // original preserved
    expect(after.convertedTo).not.toBeNull();
    expect(after.convertedTo!.kind).toBe("Task");
    const task = state.tasks.find((t) => t.id === after.convertedTo!.recordId)!;
    expect(task.unitId).toBe(U(4));
    expect(task.sourcePostId).toBe(post.id);
  });

  it("fixture conversions preserve source posts and back-links", () => {
    const state = buildInitialState();
    const p1 = state.posts.find((p) => p.id === "p1")!;
    expect(p1.body).toMatch(/Use CD4 for Unit 1.1/);
    expect(p1.convertedTo).toEqual({ kind: "MaterialChange", recordId: "mc-001" });
    expect(state.materialChanges.find((m) => m.id === "mc-001")!.sourcePostId).toBe("p1");

    const p2 = state.posts.find((p) => p.id === "p2")!;
    expect(p2.body).toMatch(/0.150 inch for Unit 1.2/);
    expect(p2.convertedTo).toEqual({ kind: "SpecialInstruction", recordId: "swi-001" });
    expect(state.specialInstructions.find((s) => s.id === "swi-001")!.sourcePostId).toBe("p2");
  });

  it("a post cannot be converted twice", () => {
    const state = buildInitialState();
    expect(() =>
      convertPost(state, "p1", "e-sarah", { kind: "Task", unitId: U(1) })
    ).toThrow(/already converted/);
  });

  it("replies stay one level deep and record author and time", () => {
    let state = buildInitialState();
    state = addReply(state, "p4", "e-dave", "Nice work.", "2026-07-18T15:00:00Z");
    const p4 = state.posts.find((p) => p.id === "p4")!;
    const reply = p4.replies.at(-1)!;
    expect(reply.authorId).toBe("e-dave");
    expect(reply.at).toBe("2026-07-18T15:00:00Z");
  });
});
