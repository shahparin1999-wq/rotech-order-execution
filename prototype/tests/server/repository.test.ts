// Gate A repository contract: the same tests run against the file adapter and,
// when OEH_TEST_DATABASE_URL points at a disposable cluster, against PostgreSQL.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import { applyAction } from "@/domain/reducer";
import { assembleState, diffStates } from "@/server/collections";
import { executeCommand } from "@/server/commands";
import { FileStateRepository } from "@/server/persistence/file";
import { PostgresStateRepository } from "@/server/persistence/postgres";
import type { StateRepository } from "@/server/repository";

const PG_URL = process.env.OEH_TEST_DATABASE_URL;

describe("collections diff/assemble round trip", () => {
  it("assembles exactly the state it diffed, in order, without session fields", () => {
    const state = buildInitialState();
    const diff = diffStates(null, state);
    const rebuilt = assembleState(diff.upserts, diff.scalars, { currentUserId: "e-alex" });
    expect(rebuilt).toEqual({ ...state, currentUserId: "e-alex" });
    expect(diff.deletes).toHaveLength(0);
    expect(diff.upserts.some((u) => u.collection === "orders" && u.id === "ord-sample1001")).toBe(true);
  });

  it("diffs only what changed", () => {
    const state = buildInitialState();
    const next = applyAction(state, { type: "toggleFollowOrder", orderNumber: "SAMPLE1002" }, "2026-09-08T10:00:00Z");
    const diff = diffStates(state, next);
    expect(diff.upserts.map((u) => u.collection)).toEqual(["followedOrders"]);
    expect(diff.deletes).toHaveLength(0);
  });
});

function contractTests(name: string, make: () => Promise<StateRepository>) {
  describe(`${name} repository`, () => {
    let repo: StateRepository;
    beforeAll(async () => {
      repo = await make();
      await repo.init(buildInitialState);
    });
    afterAll(async () => {
      await repo.close();
    });

    it("seeds fixtures once and loads them back identically", async () => {
      const snapshot = await repo.load();
      expect(snapshot.version).toBe(1);
      expect(snapshot.state.orders.map((o) => o.orderNumber)).toEqual(buildInitialState().orders.map((o) => o.orderNumber));
      expect(snapshot.state.nextId).toBe(buildInitialState().nextId);
      await repo.init(buildInitialState); // idempotent
      expect((await repo.load()).version).toBe(1);
    });

    it("commits a command, bumps the version, and records the command", async () => {
      const outcome = await executeCommand(repo, {
        idempotencyKey: "k-1",
        actorId: "e-alex",
        expectedVersion: 1,
        action: { type: "addPost", orderNumber: "SAMPLE1001", unitId: null, body: "Gate A smoke post" }
      }, "2026-09-08T10:00:00Z");
      expect(outcome.status).toBe(200);
      if (outcome.status !== 200) return;
      expect(outcome.version).toBe(2);
      expect(outcome.state.posts.at(-1)?.body).toBe("Gate A smoke post");
      const reloaded = await repo.load();
      expect(reloaded.version).toBe(2);
      expect(reloaded.state.posts.at(-1)?.body).toBe("Gate A smoke post");
      expect(reloaded.state.currentUserId).toBe("e-alex");
      expect(await repo.findCommand("k-1")).toMatchObject({ actorId: "e-alex", actionType: "addPost", resultVersion: 2 });
    });

    it("replays an identical idempotency key without re-applying, rejects a different payload", async () => {
      const replay = await executeCommand(repo, {
        idempotencyKey: "k-1",
        actorId: "e-alex",
        expectedVersion: 2,
        action: { type: "addPost", orderNumber: "SAMPLE1001", unitId: null, body: "Gate A smoke post" }
      });
      expect(replay.status).toBe(200);
      if (replay.status === 200) expect(replay.replayed).toBe(true);
      expect((await repo.load()).state.posts.filter((p) => p.body === "Gate A smoke post")).toHaveLength(1);
      const conflict = await executeCommand(repo, {
        idempotencyKey: "k-1",
        actorId: "e-alex",
        expectedVersion: 2,
        action: { type: "addPost", orderNumber: "SAMPLE1001", unitId: null, body: "different" }
      });
      expect(conflict.status).toBe(409);
      if (conflict.status === 409) expect(conflict.code).toBe("idempotency-conflict");
    });

    it("rejects a stale base version and returns the current state", async () => {
      const stale = await executeCommand(repo, {
        idempotencyKey: "k-2",
        actorId: "e-alex",
        expectedVersion: 1,
        action: { type: "toggleFollowOrder", orderNumber: "SAMPLE1002" }
      });
      expect(stale.status).toBe(409);
      if (stale.status === 409) {
        expect(stale.code).toBe("version-conflict");
        expect(stale.version).toBe(2);
      }
    });

    it("surfaces a domain rejection as 422 and persists nothing", async () => {
      const rejected = await executeCommand(repo, {
        idempotencyKey: "k-3",
        actorId: "e-alex",
        expectedVersion: 2,
        action: { type: "blockTask", taskId: "does-not-exist", reason: "x" }
      });
      expect(rejected.status).toBe(422);
      expect((await repo.load()).version).toBe(2);
      expect(await repo.findCommand("k-3")).toBeNull();
    });

    it("refuses session-local actions", async () => {
      const local = await executeCommand(repo, { idempotencyKey: "k-4", actorId: "e-alex", expectedVersion: 2, action: { type: "switchUser", employeeId: "e-tom" } });
      expect(local.status).toBe(422);
    });

    it("reset reloads the fixtures at a new version", async () => {
      const snapshot = await repo.reset(buildInitialState());
      expect(snapshot.version).toBe(3);
      expect((await repo.load()).state.posts.some((p) => p.body === "Gate A smoke post")).toBe(false);
    });
  });
}

const tempDir = mkdtempSync(path.join(tmpdir(), "oeh-file-repo-"));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));
contractTests("file", async () => new FileStateRepository(path.join(tempDir, "state.json")));

if (PG_URL) {
  contractTests("postgres", async () => {
    const repo = new PostgresStateRepository(PG_URL);
    // Fresh tables for every run so the version assertions hold.
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: PG_URL });
    await pool.query("DROP TABLE IF EXISTS oeh_records, oeh_commands, oeh_meta");
    await pool.end();
    return repo;
  });
} else {
  it.skip("postgres repository (set OEH_TEST_DATABASE_URL to a disposable cluster)", () => undefined);
}
