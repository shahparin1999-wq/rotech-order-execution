// Per-browser, per-device demo-session persistence. This is localStorage: it
// only survives on the one browser/device that wrote it. Using the tool on a
// different device, or a different browser on the same device, starts a
// completely independent, unsynced session - there is no server, so this
// never creates shared team state.
//
// The parsing/validation here is a pure function specifically so it can be
// unit tested without a DOM/localStorage mock (see
// tests/store/persistence.test.ts).

import type { AppState } from "@/domain/types";

export const STORAGE_KEY = "rotech-proto-state";

// Bump manually whenever AppState's shape changes in a way that could make
// an old save invalid (new required fields, renamed fields, etc.). A saved
// envelope from a different version is discarded rather than trusted.
// v2: added customers/contacts, Order.customerId (replacing the old
// customer string field), and the extended Planner Task shape - a v1 save
// would be missing all of these, so it must not be trusted.
// v3: CPQ import - first-class OrderLine fields (id/sourceSystem/family/model)
// plus configurationSnapshots, manufacturingNotes, and configurationAdjustments
// arrays. A v2 save lacks these, so it must not be trusted.
export const SCHEMA_VERSION = 3;

export interface StoredEnvelope {
  schemaVersion: number;
  state: AppState;
}

// Minimal structural check - just enough to catch a save from before a
// breaking shape change or a corrupted/foreign value, not a full schema
// validator. Deliberately conservative: on any doubt, discard rather than
// risk handing a malformed object to the rest of the app.
function looksLikeAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.units) &&
    Array.isArray(v.orders) &&
    Array.isArray(v.tasks) &&
    Array.isArray(v.routeOps) &&
    Array.isArray(v.customers) &&
    Array.isArray(v.contacts) &&
    Array.isArray(v.configurationSnapshots) &&
    Array.isArray(v.manufacturingNotes) &&
    Array.isArray(v.configurationAdjustments) &&
    typeof v.nextId === "number" &&
    typeof v.currentUserId === "string"
  );
}

// Parses and validates a raw localStorage string. Returns null on anything
// that isn't a trustworthy, current-version saved state - malformed JSON,
// missing/wrong schemaVersion, or a shape that doesn't look like AppState -
// so the caller can fall back to fresh fixtures instead of crashing or
// silently rendering a broken UI.
export function parseStoredEnvelope(raw: string | null): AppState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const envelope = parsed as Partial<StoredEnvelope>;
  if (envelope.schemaVersion !== SCHEMA_VERSION) return null;
  if (!looksLikeAppState(envelope.state)) return null;
  return envelope.state;
}

export function serializeEnvelope(state: AppState): string {
  const envelope: StoredEnvelope = { schemaVersion: SCHEMA_VERSION, state };
  return JSON.stringify(envelope);
}
