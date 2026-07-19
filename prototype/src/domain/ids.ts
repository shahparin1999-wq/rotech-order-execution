import type { Unit } from "./types";

// Unit IDs follow {orderNumber}_{lineNumber}.{unitSequence} (FR-MVP-003).
export function unitIdFor(
  orderNumber: string,
  lineNumber: number,
  sequence: number
): string {
  return `${orderNumber}_${lineNumber}.${sequence}`;
}

// Deterministic, opaque-looking public refs for the mock QR identities.
// A real implementation uses random 128-bit URL-safe base32 values; the
// prototype derives a stable mock value so tests and screenshots are
// reproducible.
export function mockPublicRef(seed: string): string {
  // FNV-1a seeds an xorshift stream so every character keeps full entropy.
  // A real implementation uses a random 128-bit value; this stays
  // deterministic so tests and screenshots are reproducible.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let x = h >>> 0 || 1;
  const next = () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[next() % alphabet.length];
  }
  return out;
}

export interface UnitSeedOverrides {
  serial?: string | null;
  status?: Unit["status"];
  location?: string;
  currentOperation?: string;
  asBuiltMaterial?: string;
  holdReason?: string | null;
}

// Quantity N creates exactly N independent Units (protected invariant).
export function generateUnits(
  orderNumber: string,
  lineNumber: number,
  quantity: number,
  base: {
    model: string;
    size: string;
    orderedMaterial: string;
    location: string;
  },
  overridesBySequence: Record<number, UnitSeedOverrides> = {}
): Unit[] {
  const units: Unit[] = [];
  for (let sequence = 1; sequence <= quantity; sequence++) {
    const unitId = unitIdFor(orderNumber, lineNumber, sequence);
    const o = overridesBySequence[sequence] ?? {};
    units.push({
      unitId,
      orderNumber,
      lineNumber,
      sequence,
      serial: o.serial ?? null,
      model: base.model,
      size: base.size,
      orderedMaterial: base.orderedMaterial,
      asBuiltMaterial: o.asBuiltMaterial ?? base.orderedMaterial,
      status: o.status ?? "NotStarted",
      location: o.location ?? base.location,
      currentOperation: o.currentOperation ?? "Intake review",
      publicRef: mockPublicRef(`unit:${unitId}`),
      holdReason: o.holdReason ?? null
    });
  }
  return units;
}
