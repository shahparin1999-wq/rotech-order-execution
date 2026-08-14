// Family shapes — ported from the CPQ configurator.
//
// The key architectural idea taken from CPQ (app.js:1955-2050): there is no
// per-model code path. Families are classified into a small number of SHAPES,
// and the shape decides which configuration sections and component rows exist.
// `renderPumpSection` in CPQ early-returns into a different renderer per shape;
// `isSimplifiedFamily` then removes the seal/docs/template steps entirely.
//
// That is why adding 1296 or SXT here is data plus one renderer rather than a
// new hand-written module — the same duplication problem the 1196 slice had.
//
// Shape membership mirrors CPQ's own family-code lists exactly. It is Rotech
// *behaviour*, not catalogue option data, so it lives here rather than in the
// catalogue release (which stays the sole source of sizes/frames/materials
// per D-027).
//
// PURE DOMAIN — no React, no localStorage.

export const FAMILY_SHAPES = [
  "StandardAnsi",
  "CloseCoupled",
  "SolidsHandling",
  "CompactSelfPrimer",
  "VerticalMultistage"
] as const;
export type FamilyShape = (typeof FAMILY_SHAPES)[number];

// CPQ isCloseCoupledFamilyCode (app.js:1963)
const CLOSE_COUPLED = ["1296", "1296LF", "1796CC"];
// CPQ isSolidsHandlingFamilyCode (app.js:1971)
const SOLIDS_HANDLING = ["SXT", "SXU"];
// CPQ isCompactSelfPrimerFamilyCode (app.js:2003)
const COMPACT_SELF_PRIMER = ["1600", "SCP", "SFP", "RE500", "RE500CC"];
// CPQ isVerticalMultistageFamilyCode — not carried in the catalogue yet.
const VERTICAL_MULTISTAGE = ["RVM", "RVMS", "RVN", "RVNS"];

export function familyShape(familyCode: string): FamilyShape {
  const code = String(familyCode || "").toUpperCase();
  if (CLOSE_COUPLED.includes(code)) return "CloseCoupled";
  if (SOLIDS_HANDLING.includes(code)) return "SolidsHandling";
  if (COMPACT_SELF_PRIMER.includes(code)) return "CompactSelfPrimer";
  if (VERTICAL_MULTISTAGE.includes(code)) return "VerticalMultistage";
  return "StandardAnsi";
}

// CPQ's isSimplifiedFamily (app.js:10371): these shapes drop the seal, docs and
// template steps because their build is a released assembly rather than a
// configured wet end.
export function isSimplifiedShape(shape: FamilyShape): boolean {
  return shape === "SolidsHandling" || shape === "CompactSelfPrimer" || shape === "VerticalMultistage";
}

// ---------------------------------------------------------------------------
// What each shape actually configures
// ---------------------------------------------------------------------------

export interface ShapeCapabilities {
  /** Frame is a user choice (ANSI) vs implied by the size (SXT). */
  choosesFrame: boolean;
  /** Wet-end material is configurable. */
  choosesMaterial: boolean;
  /** Impeller trim is requested against a full diameter. */
  choosesTrim: boolean;
  /** Suction/discharge flange rating is configurable. */
  choosesFlange: boolean;
  /** Stuffing-box cover bore is configurable. */
  choosesStuffingBoxCover: boolean;
  /** Shaft kit type is a user choice (ANSI) vs fixed (solids = 4140). */
  choosesShaftKit: boolean;
  /** Seal is separately configured rather than pre-set by the released build. */
  configuresSeal: boolean;
  /** Motor bolts directly to the pump — no baseplate, coupling or guard. */
  closeCoupled: boolean;
  /** Belt drive is offered (side-by-side / Z-drive) alongside direct drive. */
  supportsBeltDrive: boolean;
  /** Composes major-component part numbers from catalogue part-code rules. */
  composesPartNumbers: boolean;
}

const CAPABILITIES: Record<FamilyShape, ShapeCapabilities> = {
  StandardAnsi: {
    choosesFrame: true,
    choosesMaterial: true,
    choosesTrim: true,
    choosesFlange: true,
    choosesStuffingBoxCover: true,
    choosesShaftKit: true,
    configuresSeal: true,
    closeCoupled: false,
    supportsBeltDrive: false,
    composesPartNumbers: true
  },
  CloseCoupled: {
    choosesFrame: true,
    choosesMaterial: true,
    choosesTrim: true,
    choosesFlange: true,
    choosesStuffingBoxCover: true,
    configuresSeal: true,
    choosesShaftKit: false, // stub shaft is derived from the JM motor frame
    closeCoupled: true,
    supportsBeltDrive: false,
    composesPartNumbers: false
  },
  SolidsHandling: {
    choosesFrame: false,
    choosesMaterial: true,
    choosesTrim: true,
    choosesFlange: true,
    choosesStuffingBoxCover: false,
    choosesShaftKit: false, // CPQ pins 4140 (app.js:3467)
    configuresSeal: false, // seal is part of the released build
    closeCoupled: false,
    supportsBeltDrive: true,
    composesPartNumbers: false // released part numbers per size
  },
  CompactSelfPrimer: {
    choosesFrame: false,
    choosesMaterial: true,
    choosesTrim: false,
    choosesFlange: false,
    choosesStuffingBoxCover: false,
    choosesShaftKit: false,
    configuresSeal: false,
    closeCoupled: true,
    supportsBeltDrive: false,
    composesPartNumbers: false
  },
  VerticalMultistage: {
    choosesFrame: false,
    choosesMaterial: false,
    choosesTrim: false,
    choosesFlange: false,
    choosesStuffingBoxCover: false,
    choosesShaftKit: false,
    configuresSeal: false,
    closeCoupled: false,
    supportsBeltDrive: false,
    composesPartNumbers: false
  }
};

export function shapeCapabilities(shape: FamilyShape): ShapeCapabilities {
  return CAPABILITIES[shape];
}

export function capabilitiesForFamily(familyCode: string): ShapeCapabilities {
  return shapeCapabilities(familyShape(familyCode));
}

// ---------------------------------------------------------------------------
// Drive arrangement (solids-handling only)
// ---------------------------------------------------------------------------

// CPQ's sxt-sxu package data carries exactly these (269 rows).
export const DRIVE_ARRANGEMENTS = ["DIRECT_DRIVE", "SIDE_BY_SIDE", "Z_DRIVE"] as const;
export type DriveArrangement = (typeof DRIVE_ARRANGEMENTS)[number];

export const DRIVE_ARRANGEMENT_LABELS: Record<DriveArrangement, string> = {
  DIRECT_DRIVE: "Direct drive (coupled)",
  SIDE_BY_SIDE: "Belt drive — side by side",
  Z_DRIVE: "Belt drive — Z-drive"
};

export function isBeltDrive(arrangement: DriveArrangement): boolean {
  return arrangement === "SIDE_BY_SIDE" || arrangement === "Z_DRIVE";
}

// ---------------------------------------------------------------------------
// Close-coupled stub shaft and adapter (CPQ app.js:4455, 9686-9696)
// ---------------------------------------------------------------------------

// CPQ's rule verbatim: "143JM-215JM uses standard bore stub shaft; 254JM and
// larger uses big bore stub shaft. Stub shaft is 316SS and adapter is standard
// DI." Note this is a numeric threshold, not a band table — which settles the
// 213JM / 256JM ambiguity that was previously an open decision.
export const BIG_BORE_MOTOR_FRAME_THRESHOLD = 254;

export function motorFrameNumber(motorFrame: string): number | null {
  const match = String(motorFrame || "").match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

export type StubShaftBore = "Standard" | "Big";

// Returns null when the motor frame is unknown — fail closed rather than
// assuming a standard bore.
export function stubShaftBore(motorFrame: string): StubShaftBore | null {
  const n = motorFrameNumber(motorFrame);
  if (n === null) return null;
  return n >= BIG_BORE_MOTOR_FRAME_THRESHOLD ? "Big" : "Standard";
}

export function stubShaftLabel(motorFrame: string): string {
  const bore = stubShaftBore(motorFrame);
  if (!bore) return "Select JM motor frame";
  return `${bore === "Big" ? "Big" : "Standard"} bore stub shaft | 316SS | Motor frame ${motorFrame}`;
}

// CPQ getCloseCoupledStubShaftBoreCode / getCloseCoupledAdapterCode.
export function stubShaftBoreCode(motorFrame: string): "G" | "K" | null {
  const bore = stubShaftBore(motorFrame);
  if (!bore) return null;
  return bore === "Big" ? "K" : "G";
}

// Adapter code by pump frame × bore. Frame codes are CPQ's BOM frame letters
// (S = STR, M = MTR, X = XLR).
export function closeCoupledAdapterCode(pumpFrameCode: string, motorFrame: string): string | null {
  const boreCode = stubShaftBoreCode(motorFrame);
  if (!boreCode) return null;
  const big = boreCode === "K";
  switch (String(pumpFrameCode || "").toUpperCase()) {
    case "S":
    case "STR":
      return big ? "B" : "A";
    case "M":
    case "MTR":
      return big ? "C" : "B";
    case "X":
    case "XLR":
      return big ? "D" : "C";
    default:
      return boreCode;
  }
}
