// Gate A repository contract. The domain never sees this; the command handler
// does. Two adapters exist: PostgreSQL (the target, D-003/D-019) and a JSON
// file (development without a database). Both honour the same optimistic
// state version, the same command log, and the same idempotency rules.

import type { AppState } from "@/domain/types";

export interface PersistedSnapshot {
  version: number;
  state: AppState;
}

export interface CommandRecord {
  idempotencyKey: string;
  actorId: string;
  actionType: string;
  /** SHA-256 of the canonical action JSON: a replay with a different payload is rejected (D-021). */
  actionHash: string;
  resultVersion: number;
  createdAt: string;
}

export type CommitResult =
  | { ok: true; version: number }
  | { ok: false; reason: "version-conflict"; version: number };

export interface CommitInput {
  expectedVersion: number;
  prev: AppState;
  next: AppState;
  command: Omit<CommandRecord, "resultVersion">;
}

export interface StateRepository {
  readonly kind: "postgres" | "file";
  /** Runs migrations and seeds the initial state when storage is empty. */
  init(seed: () => AppState): Promise<void>;
  load(): Promise<PersistedSnapshot>;
  findCommand(idempotencyKey: string): Promise<CommandRecord | null>;
  commit(input: CommitInput): Promise<CommitResult>;
  /** Replaces everything with the given state (development / test reset only). */
  reset(state: AppState): Promise<PersistedSnapshot>;
  close(): Promise<void>;
}

/** The mock identity shown before the viewer picks one; never persisted. */
export const SESSION_DEFAULT_USER = "e-alex";
