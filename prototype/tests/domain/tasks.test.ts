import { describe, expect, it } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import {
  blockTask,
  completeTask,
  pauseTask,
  resolveBlocker,
  resumeTask,
  startTask
} from "@/domain/actions";
import { currentHandoff } from "@/domain/selectors";

describe("Task lifecycle and handoff (criterion 6)", () => {
  it("paused work retains handoff fields and can be resumed by another employee", () => {
    let state = buildInitialState();
    // Fixture task t-12-trim was paused by Miguel with a full handoff.
    const paused = state.tasks.find((t) => t.id === "t-12-trim")!;
    expect(paused.status).toBe("Paused");
    const handoff = currentHandoff(paused)!;
    expect(handoff).not.toBeNull();
    expect(handoff.reason).toBe("End of shift");
    expect(handoff.completedWork).toMatch(/rough cut/i);
    expect(handoff.remainingWork).toMatch(/12.50/);
    expect(handoff.location).toMatch(/bay 2/i);
    expect(handoff.storageState).toMatch(/secured/i);
    expect(handoff.byId).toBe("e-miguel");

    // Another employee (Alex) resumes and sees the handoff retained.
    state = resumeTask(state, "t-12-trim", "e-alex", "2026-07-18T12:00:00Z");
    const resumed = state.tasks.find((t) => t.id === "t-12-trim")!;
    expect(resumed.status).toBe("InProgress");
    expect(resumed.ownerId).toBe("e-alex");
    expect(currentHandoff(resumed)).not.toBeNull(); // handoff record retained
    expect(resumed.history.at(-1)!.action).toBe("Resumed");
  });

  it("pausing requires every handoff field", () => {
    let state = buildInitialState();
    state = startTask(state, "t-15-intake", "e-alex", "2026-07-18T12:00:00Z");
    expect(() =>
      pauseTask(state, "t-15-intake", "e-alex", {
        reason: "Break",
        completedWork: "",
        remainingWork: "everything",
        location: "floor",
        storageState: "safe"
      })
    ).toThrow(/completedWork/);
  });

  it("full pause/resume round trip records who and when", () => {
    let state = buildInitialState();
    state = startTask(state, "t-15-intake", "e-alex", "2026-07-18T12:00:00Z");
    state = pauseTask(
      state,
      "t-15-intake",
      "e-alex",
      {
        reason: "Handoff to next shift",
        completedWork: "Paperwork reviewed",
        remainingWork: "Confirm pick list",
        location: "Parts staging",
        storageState: "Parts binned and labelled",
        blockerItem: null,
        note: "None"
      },
      "2026-07-18T15:00:00Z"
    );
    const t = state.tasks.find((x) => x.id === "t-15-intake")!;
    expect(t.status).toBe("Paused");
    expect(currentHandoff(t)!.byId).toBe("e-alex");
    expect(currentHandoff(t)!.at).toBe("2026-07-18T15:00:00Z");
    state = resumeTask(state, "t-15-intake", "e-miguel", "2026-07-18T16:00:00Z");
    state = completeTask(state, "t-15-intake", "e-miguel", "2026-07-18T16:30:00Z");
    const done = state.tasks.find((x) => x.id === "t-15-intake")!;
    expect(done.status).toBe("Complete");
    // Audit trail is append-only and captured each transition.
    const actions = state.auditEvents
      .filter((e) => e.targetId === "t-15-intake")
      .map((e) => e.action);
    expect(actions).toEqual([
      "task.started",
      "task.paused",
      "task.resumed",
      "task.completed"
    ]);
  });

  it("block records pre-block state and resolve returns to it", () => {
    let state = buildInitialState();
    state = startTask(state, "t-15-intake", "e-alex", "2026-07-18T12:00:00Z");
    state = blockTask(state, "t-15-intake", "e-dave", "Missing paperwork", "2026-07-18T12:30:00Z");
    let t = state.tasks.find((x) => x.id === "t-15-intake")!;
    expect(t.status).toBe("Blocked");
    expect(t.status_beforeBlock).toBe("InProgress");
    expect(t.blockReason).toBe("Missing paperwork");
    state = resolveBlocker(state, "t-15-intake", "e-dave", "Paperwork found", "2026-07-18T13:00:00Z");
    t = state.tasks.find((x) => x.id === "t-15-intake")!;
    expect(t.status).toBe("InProgress"); // returned to recorded pre-block state
    expect(t.blockReason).toBeNull();
  });

  it("fixture blocked task on Unit 1.3 resolves back to Ready", () => {
    let state = buildInitialState();
    state = resolveBlocker(state, "t-13-verify", "e-dave", "Casting received", "2026-07-22T14:00:00Z");
    const t = state.tasks.find((x) => x.id === "t-13-verify")!;
    expect(t.status).toBe("Ready");
  });
});
