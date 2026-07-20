// Tests for the pure, DOM-free localStorage envelope parser. This is
// per-browser, per-device demo-session persistence, not shared team state -
// see src/store/persistence.ts for the full framing.

import { describe, expect, it } from "vitest";
import {
  parseStoredEnvelope,
  serializeEnvelope,
  SCHEMA_VERSION
} from "@/store/persistence";
import { buildInitialState } from "@/domain/fixtures";

describe("parseStoredEnvelope - graceful fallback on anything untrustworthy", () => {
  it("returns null for a missing value", () => {
    expect(parseStoredEnvelope(null)).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(() => parseStoredEnvelope("{not valid json")).not.toThrow();
    expect(parseStoredEnvelope("{not valid json")).toBeNull();
  });

  it("returns null for valid JSON that isn't an object", () => {
    expect(parseStoredEnvelope("42")).toBeNull();
    expect(parseStoredEnvelope('"a string"')).toBeNull();
    expect(parseStoredEnvelope("null")).toBeNull();
  });

  it("returns null for a missing schemaVersion", () => {
    const state = buildInitialState();
    expect(parseStoredEnvelope(JSON.stringify({ state }))).toBeNull();
  });

  it("returns null for an obsolete/mismatched schemaVersion", () => {
    const state = buildInitialState();
    expect(
      parseStoredEnvelope(JSON.stringify({ schemaVersion: SCHEMA_VERSION - 1, state }))
    ).toBeNull();
    expect(
      parseStoredEnvelope(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, state }))
    ).toBeNull();
  });

  it("returns null for a correctly-versioned envelope with the wrong shape", () => {
    expect(
      parseStoredEnvelope(
        JSON.stringify({ schemaVersion: SCHEMA_VERSION, state: { units: "not an array" } })
      )
    ).toBeNull();
    expect(
      parseStoredEnvelope(JSON.stringify({ schemaVersion: SCHEMA_VERSION, state: {} }))
    ).toBeNull();
  });

  it("accepts a valid, current-version envelope", () => {
    const state = buildInitialState();
    const raw = serializeEnvelope(state);
    const parsed = parseStoredEnvelope(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.units).toHaveLength(state.units.length);
    expect(parsed!.nextId).toBe(state.nextId);
  });
});

describe("Never persist transient browser objects", () => {
  it("the seeded AppState round-trips cleanly through JSON with no data loss", () => {
    // File, Blob, and object URLs cannot survive JSON.stringify/parse without
    // becoming "{}" or throwing - round-tripping cleanly is a structural
    // guarantee that AppState holds only plain, serializable data.
    const state = buildInitialState();
    const roundTripped = JSON.parse(JSON.stringify(state));
    expect(roundTripped).toEqual(state);
  });

  it("every attachment stores a placeholder art key, never a real file reference", () => {
    const state = buildInitialState();
    expect(state.attachments.length).toBeGreaterThan(0);
    for (const a of state.attachments) {
      expect(typeof a.placeholderArt).toBe("string");
      expect(a.placeholderArt).not.toMatch(/^blob:|^data:/);
    }
  });
});
