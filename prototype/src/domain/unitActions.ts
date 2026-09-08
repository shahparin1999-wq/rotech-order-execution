// Unit identity actions.
//
// Serial numbers are strings, globally unique across all Units, never reused,
// and corrected only through audited supersession (D-026). The Unit ID and QR
// identity exist before the serial and never change when it is assigned.

import type { AppState, AuditEvent } from "./types";

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function takeId(state: AppState, prefix: string): [string, AppState] {
  const id = `${prefix}-${state.nextId}`;
  return [id, { ...state, nextId: state.nextId + 1 }];
}

function audit(state: AppState, ev: Omit<AuditEvent, "id">): AppState {
  const [id, s] = takeId(state, "ae");
  return { ...s, auditEvents: [...s.auditEvents, { id, ...ev }] };
}

export function normalizeSerial(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** Assigns (or, with a reason, supersedes) a Unit's serial number. */
export function assignUnitSerial(
  state: AppState,
  actorId: string,
  unitId: string,
  serial: string,
  reason?: string,
  at?: string
): AppState {
  const unit = state.units.find((u) => u.unitId === unitId);
  if (!unit) throw new Error(`Unknown unit ${unitId}`);
  const normalized = normalizeSerial(serial);
  if (!normalized) throw new Error("A serial number is required");
  const clash = state.units.find((u) => u.unitId !== unitId && u.serial && normalizeSerial(u.serial) === normalized);
  if (clash) throw new Error(`Serial ${normalized} is already assigned to ${clash.unitId}; serials are never reused`);
  if (unit.serial && normalizeSerial(unit.serial) === normalized) return state;
  if (unit.serial && !reason?.trim()) {
    throw new Error(`Unit ${unitId} already carries serial ${unit.serial}; a correction requires a reason`);
  }
  const ts = nowIso(at);
  const prior = unit.serial;
  const s: AppState = {
    ...state,
    units: state.units.map((u) => (u.unitId === unitId ? { ...u, serial: normalized } : u))
  };
  return audit(s, {
    at: ts,
    actorId,
    action: prior ? "unit.serialCorrected" : "unit.serialAssigned",
    targetType: "Unit",
    targetId: unitId,
    unitId,
    detail: prior
      ? `Serial corrected from ${prior} to ${normalized}: ${reason!.trim()}`
      : `Serial ${normalized} assigned; Unit ID and QR identity unchanged.`,
    supersedesEventId: null
  });
}
