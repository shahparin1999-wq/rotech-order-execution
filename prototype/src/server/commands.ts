// The server command handler: the only path by which shared state changes.
//
// A command is {idempotencyKey, actorId, expectedVersion, action}. The handler
// replays the same pure reducer the browser uses, so the server can never
// accept a transition the domain would refuse, and rejects stale bases so two
// people cannot silently overwrite each other's work (D-021 idempotency,
// docs/03 controlled commands).

import { createHash } from "node:crypto";
import type { AppState } from "@/domain/types";
import { applyAction, LOCAL_ONLY_ACTIONS, type Action } from "@/domain/reducer";
import type { StateRepository } from "./repository";

export interface CommandRequest {
  idempotencyKey: string;
  actorId: string;
  expectedVersion: number;
  action: Action;
}

export type CommandOutcome =
  | { status: 200; version: number; state: AppState; replayed: boolean }
  | { status: 409; code: "version-conflict" | "idempotency-conflict"; message: string; version: number; state: AppState }
  | { status: 422; code: "domain-rejected" | "invalid-command"; message: string; version: number };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = canonical(obj[key]);
    return out;
  }
  return value;
}

export function actionHash(action: Action): string {
  return createHash("sha256").update(JSON.stringify(canonical(action))).digest("hex");
}

/** Session-only fields never leave the viewer's browser. */
function stripSession(state: AppState, base: AppState): AppState {
  return { ...state, currentUserId: base.currentUserId };
}

export async function executeCommand(repo: StateRepository, request: CommandRequest, now = new Date().toISOString()): Promise<CommandOutcome> {
  const snapshot = await repo.load();
  if (!request.idempotencyKey?.trim() || !request.actorId?.trim() || !request.action?.type) {
    return { status: 422, code: "invalid-command", message: "idempotencyKey, actorId and action.type are required", version: snapshot.version };
  }
  if (LOCAL_ONLY_ACTIONS.has(request.action.type)) {
    return { status: 422, code: "invalid-command", message: `${request.action.type} is a session-local action`, version: snapshot.version };
  }
  const hash = actionHash(request.action);
  const prior = await repo.findCommand(request.idempotencyKey);
  if (prior) {
    if (prior.actionHash === hash) {
      return { status: 200, version: snapshot.version, state: snapshot.state, replayed: true };
    }
    return {
      status: 409,
      code: "idempotency-conflict",
      message: "The same idempotency key was already used with a different action",
      version: snapshot.version,
      state: snapshot.state
    };
  }
  if (request.expectedVersion !== snapshot.version) {
    return {
      status: 409,
      code: "version-conflict",
      message: `Expected version ${request.expectedVersion} but storage is at ${snapshot.version}`,
      version: snapshot.version,
      state: snapshot.state
    };
  }

  let next: AppState;
  try {
    next = applyAction({ ...snapshot.state, currentUserId: request.actorId }, request.action, now);
  } catch (err) {
    return { status: 422, code: "domain-rejected", message: (err as Error).message, version: snapshot.version };
  }
  next = stripSession(next, snapshot.state);

  const result = await repo.commit({
    expectedVersion: snapshot.version,
    prev: snapshot.state,
    next,
    command: { idempotencyKey: request.idempotencyKey, actorId: request.actorId, actionType: request.action.type, actionHash: hash, createdAt: now }
  });
  if (!result.ok) {
    const latest = await repo.load();
    return { status: 409, code: "version-conflict", message: "Storage changed while the command ran; retry against the current state", version: latest.version, state: latest.state };
  }
  return { status: 200, version: result.version, state: next, replayed: false };
}
