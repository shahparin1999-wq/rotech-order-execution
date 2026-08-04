// CPQ → Work Order catalogue release (product master data).
// Contract: docs/integration/CPQ_CATALOGUE_CONTRACT.md
//
// This is the ONLY sanctioned source of product option tables (pump sizes,
// frame options, materials, part-code rules). Work Order never authors or
// transcribes them — see the contract's core rule and the no-transcription
// guard in tests/domain/catalogue-release.test.ts.
//
// Same boundary discipline as orderHandoffV2.ts, deliberately: identical
// canonicalization + SHA-256 so both sides agree byte-for-byte, and the same
// monetary allowlist so invariant 5 is enforced on master data too (CPQ's
// working catalogue interleaves option data with pricing, so this is a real
// filter, not a formality).
//
// Pure and dependency-free apart from the shared hash helper: it validates an
// untrusted JSON file, never throws on bad input, and never silently coerces.

import { sha256Hex } from "./sha256";
import { findMonetaryLeaks } from "./orderHandoffV2";

export const CATALOGUE_RELEASE_SCHEMA = "rotech-cpq-catalogue-release/1.0";

// A provisional release is a Work-Order-authored development fixture. It
// validates identically to a published one so the import path under test is
// the real one, but a definition pinned to it is NOT releasable (contract §7).
export const CATALOGUE_RELEASE_STATUSES = ["published", "provisional"] as const;
export type CatalogueReleaseStatus = (typeof CATALOGUE_RELEASE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Types. Option tables are typed (unlike the order handoff's permissive config
// blocks) because their whole purpose is to be the authoritative, checkable
// option set — a permissive shape here would defeat the contract.
// ---------------------------------------------------------------------------

export interface CataloguePumpSize {
  pumpSize: string;
  defaultFrame: string;
  frameOptions: string[];
  defaultMoc: string;
  fullImpellerTrim: number;
  defaultMotorHp?: number;
  defaultFlange?: string;
  flangeOptions?: string[];
}

export interface CatalogueFrameSpacing {
  dbse: number;
  pumpShaftDiameter: number;
}

export interface CatalogueCouplingSelection {
  // size code keyed by hp → rpm → dbse, mirroring CPQ's sureFlexCouplingSelection
  rows: Array<{ hp: number; sizes: Record<string, Record<string, string>> }>;
  maxBoreBySize: Record<string, number>;
}

export interface CataloguePartCodeRules {
  // part code keyed by shaft type, for each buildable power-end component
  powerFrameByShaftType: Record<string, string>;
  shaftKitByShaftType: Record<string, string>;
  // frame/shaftType combinations the catalogue explicitly does not offer
  unsupportedShaftTypesByFrame?: Record<string, string[]>;
}

// Part-number code tables (CPQ partNumberRules). Present only for families
// that compose part numbers from codes rather than shipping released numbers.
export interface CataloguePartNumberCodes {
  seriesCode: string;
  modelCode: string;
  frameCode: Record<string, string>;
  flangeCode: Record<string, string>;
  sbcCode: Record<string, string>;
  shaftDesignCode: Record<string, string>;
  materialCode: Record<string, string>;
  pumpSizeCode: Record<string, string>;
  componentSizeCodeSource?: Record<string, string>;
  componentDesignCode?: Record<string, string>;
  componentPrefixes?: Record<string, string>;
  casingMaterialCode: Record<string, string>;
  impellerMaterialCode: Record<string, string>;
  sbcMaterialCode: Record<string, string>;
  sbcMaterialCodeByFamily?: Record<string, string>;
  closeCoupled?: boolean;
}

// Seal defaults as CPQ's normalizeLineTypeAndSealDefaults applies them.
// null means the family owns its own seal configurator and must NOT receive the
// generic ANSI placeholder — CPQ is explicit that stamping it early wins forever.
export interface CatalogueSealDefaults {
  sealOption: string;
  sealArrangement: string;
  sealManufacturer: string;
  sealMoc: string;
  sealGlandMoc: string;
  sealPlanOption: string;
}

export interface CatalogueCommonOptionSets {
  materialBuilds: string[];
  flangeTypes: string[];
  shaftTypes: string[];
  sbcTypes: string[];
  sealAdderTypes: string[];
  sealMoc: string[];
  sealGlandMoc: string[];
  sealPlans: string[];
  motorStandards: string[];
  testingAdders: string[];
}

export interface CatalogueFamily {
  familyCode: string;
  displayName: string;
  buildType: string;
  capabilities: {
    supportsCompletePackage: boolean;
    supportsBaseframe: boolean;
    supportsMotor: boolean;
  };
  materialOptions: string[];
  pumpSizes: CataloguePumpSize[];
  // Optional: DBSE / pump shaft diameter is an ANSI-frame concept. Solids-
  // handling and compact self-primer families have no published spacing.
  frameSpacing?: Record<string, CatalogueFrameSpacing>;
  shaftTypes: string[];
  partCodeRules?: CataloguePartCodeRules;
  couplingSelection?: CatalogueCouplingSelection;
  sealSizeByFrame?: Record<string, number>;
  partNumberCodes?: CataloguePartNumberCodes;
  sealDefaults?: CatalogueSealDefaults | null;
  sealMocOptions?: string[];
  sealSizeSource?: string;
  /** approved | staged | incomplete | blocked */
  sourceStatus?: string;
}

export interface CatalogueRelease {
  schema: typeof CATALOGUE_RELEASE_SCHEMA;
  catalogueReleaseId: string;
  status: CatalogueReleaseStatus;
  publishedAt: string;
  publishedBy: { userId: string; email?: string };
  sourceEdition: string;
  checksum: string;
  families: CatalogueFamily[];

  // Provenance — which CPQ commit and files this reference was derived from.
  sourceRepository?: string;
  sourceBranch?: string;
  sourceCommit?: string;
  sourceFileChecksums?: Record<string, string>;
  sourceNote?: string;

  commonOptionSets?: CatalogueCommonOptionSets;
  scopeOptions?: Record<string, string[]>;
  statusEnums?: Record<string, string[]>;
}

// What a family definition stores to prove which catalogue state it resolved
// against. Both fields are required: the id alone would not detect a release
// republished with different content.
export interface CataloguePin {
  catalogueReleaseId: string;
  checksum: string;
}

export interface CatalogueValidationResult {
  ok: boolean;
  release?: CatalogueRelease;
  errors: string[];
  monetaryLeaks: string[];
}

// ---------------------------------------------------------------------------
// Checksum — identical canonicalization to the order handoff so a release
// hashed by CPQ and by Work Order agree byte-for-byte.
// ---------------------------------------------------------------------------
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return value;
}

export function computeCatalogueChecksum(release: CatalogueRelease): string {
  const { checksum: _omit, ...rest } = release;
  void _omit;
  return sha256Hex(JSON.stringify(canonicalize(rest)));
}

export function verifyCatalogueChecksum(release: CatalogueRelease): boolean {
  return release.checksum === computeCatalogueChecksum(release);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function requireString(v: unknown, path: string, errors: string[]): void {
  if (typeof v !== "string" || v.trim() === "") {
    errors.push(`${path} is required and must be a non-empty string`);
  }
}

function requireNumber(v: unknown, path: string, errors: string[]): void {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    errors.push(`${path} is required and must be a finite number`);
  }
}

function requireNonEmptyStringArray(v: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string" || x.trim() === "")) {
    errors.push(`${path} must be a non-empty array of non-empty strings`);
  }
}

function validatePumpSize(raw: unknown, path: string, family: Record<string, unknown>, errors: string[]): void {
  if (!isObject(raw)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireString(raw.pumpSize, `${path}.pumpSize`, errors);
  requireString(raw.defaultFrame, `${path}.defaultFrame`, errors);
  requireString(raw.defaultMoc, `${path}.defaultMoc`, errors);
  requireNumber(raw.fullImpellerTrim, `${path}.fullImpellerTrim`, errors);
  requireNonEmptyStringArray(raw.frameOptions, `${path}.frameOptions`, errors);

  // A size whose default frame is not among its own options is internally
  // inconsistent — fail rather than silently preferring one of them.
  if (
    Array.isArray(raw.frameOptions) &&
    typeof raw.defaultFrame === "string" &&
    !raw.frameOptions.includes(raw.defaultFrame)
  ) {
    errors.push(`${path}.defaultFrame ${JSON.stringify(raw.defaultFrame)} is not listed in its own frameOptions`);
  }

  // Every frame a size offers must have frame spacing in the same release, so
  // the family block stays self-contained (contract §5).
  const spacing = family.frameSpacing;
  if (spacing !== undefined && isObject(spacing) && Array.isArray(raw.frameOptions)) {
    for (const frame of raw.frameOptions) {
      if (typeof frame === "string" && !(frame in spacing)) {
        errors.push(`${path}.frameOptions references frame ${JSON.stringify(frame)} with no frameSpacing entry`);
      }
    }
  }
}

function validateFamily(raw: unknown, index: number, errors: string[]): void {
  const p = `families[${index}]`;
  if (!isObject(raw)) {
    errors.push(`${p} must be an object`);
    return;
  }
  requireString(raw.familyCode, `${p}.familyCode`, errors);
  requireString(raw.displayName, `${p}.displayName`, errors);
  requireString(raw.buildType, `${p}.buildType`, errors);
  requireNonEmptyStringArray(raw.materialOptions, `${p}.materialOptions`, errors);
  requireNonEmptyStringArray(raw.shaftTypes, `${p}.shaftTypes`, errors);

  if (!isObject(raw.capabilities)) {
    errors.push(`${p}.capabilities must be an object`);
  } else {
    for (const key of ["supportsCompletePackage", "supportsBaseframe", "supportsMotor"]) {
      if (typeof (raw.capabilities as Record<string, unknown>)[key] !== "boolean") {
        errors.push(`${p}.capabilities.${key} must be a boolean`);
      }
    }
  }

  if (raw.frameSpacing !== undefined) {
    if (!isObject(raw.frameSpacing) || Object.keys(raw.frameSpacing).length === 0) {
      errors.push(`${p}.frameSpacing, when present, must be a non-empty object`);
    } else {
    for (const [frame, spacing] of Object.entries(raw.frameSpacing)) {
      if (!isObject(spacing)) {
        errors.push(`${p}.frameSpacing.${frame} must be an object`);
        continue;
      }
      requireNumber(spacing.dbse, `${p}.frameSpacing.${frame}.dbse`, errors);
      requireNumber(spacing.pumpShaftDiameter, `${p}.frameSpacing.${frame}.pumpShaftDiameter`, errors);
      }
    }
  }

  if (!Array.isArray(raw.pumpSizes) || raw.pumpSizes.length === 0) {
    errors.push(`${p}.pumpSizes must be a non-empty array`);
  } else {
    raw.pumpSizes.forEach((size, i) => validatePumpSize(size, `${p}.pumpSizes[${i}]`, raw, errors));
  }

  // partCodeRules is optional: only families with a shaft-kit power end
  // (standard ANSI) compose part numbers this way. Solids-handling and
  // compact self-primer families ship released part numbers per size instead.
  if (raw.partCodeRules !== undefined) {
    if (!isObject(raw.partCodeRules)) {
      errors.push(`${p}.partCodeRules, when present, must be an object`);
    } else {
    for (const key of ["powerFrameByShaftType", "shaftKitByShaftType"]) {
      const table = (raw.partCodeRules as Record<string, unknown>)[key];
      if (!isObject(table) || Object.keys(table).length === 0) {
        errors.push(`${p}.partCodeRules.${key} must be a non-empty object`);
        continue;
      }
      // Every part-code table must cover exactly the declared shaft types —
      // a missing entry would otherwise surface as an unexplained failure
      // deep in a power-end build.
      if (Array.isArray(raw.shaftTypes)) {
        for (const shaftType of raw.shaftTypes) {
          if (typeof shaftType === "string" && !(shaftType in table)) {
            errors.push(`${p}.partCodeRules.${key} has no entry for shaft type ${JSON.stringify(shaftType)}`);
          }
        }
      }
      }
    }
  }
}

// Validates an untrusted, already-JSON-parsed value against the catalogue
// contract. A tampered or money-leaking release is rejected before any option
// can become a manufacturing fact.
export function validateCatalogueRelease(raw: unknown): CatalogueValidationResult {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ["Catalogue release must be a JSON object"], monetaryLeaks: [] };
  }

  if (raw.schema !== CATALOGUE_RELEASE_SCHEMA) {
    // Without a matching schema we cannot trust any other field.
    return {
      ok: false,
      errors: [`Unsupported schema ${JSON.stringify(raw.schema)}; expected "${CATALOGUE_RELEASE_SCHEMA}"`],
      monetaryLeaks: []
    };
  }

  requireString(raw.catalogueReleaseId, "catalogueReleaseId", errors);
  requireString(raw.publishedAt, "publishedAt", errors);
  requireString(raw.sourceEdition, "sourceEdition", errors);
  requireString(raw.checksum, "checksum", errors);

  if (!CATALOGUE_RELEASE_STATUSES.includes(raw.status as CatalogueReleaseStatus)) {
    errors.push(`status must be one of ${CATALOGUE_RELEASE_STATUSES.join(", ")} (got ${JSON.stringify(raw.status)})`);
  }

  if (!isObject(raw.publishedBy)) {
    errors.push("publishedBy must be an object");
  } else {
    requireString(raw.publishedBy.userId, "publishedBy.userId", errors);
  }

  if (!Array.isArray(raw.families) || raw.families.length === 0) {
    errors.push("families must be a non-empty array");
  } else {
    raw.families.forEach((family, i) => validateFamily(family, i, errors));
    const codes = raw.families
      .map((f) => (isObject(f) ? f.familyCode : undefined))
      .filter((c): c is string => typeof c === "string");
    const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
    for (const dup of new Set(duplicates)) {
      errors.push(`families contains more than one entry for familyCode ${JSON.stringify(dup)}`);
    }
  }

  // Invariant 5: no money anywhere. CPQ's working catalogue interleaves option
  // data with pricing, so this is the filter that keeps it out of manufacturing.
  const monetaryLeaks = findMonetaryLeaks(raw);
  for (const leak of monetaryLeaks) {
    errors.push(`monetary field not allowed in catalogue release: ${leak}`);
  }

  // Checksum last, only when structurally sound enough to hash meaningfully.
  if (errors.length === 0 && !verifyCatalogueChecksum(raw as unknown as CatalogueRelease)) {
    errors.push("checksum mismatch: catalogue release may have been altered after publishing");
  }

  if (errors.length > 0) {
    return { ok: false, errors, monetaryLeaks };
  }
  return { ok: true, release: raw as unknown as CatalogueRelease, errors: [], monetaryLeaks: [] };
}

// ---------------------------------------------------------------------------
// Pinning and lookup
// ---------------------------------------------------------------------------

export function pinFor(release: CatalogueRelease): CataloguePin {
  return { catalogueReleaseId: release.catalogueReleaseId, checksum: release.checksum };
}

// A pin matches only when BOTH id and checksum agree — the id alone would not
// detect a release republished with altered content.
export function pinMatches(pin: CataloguePin, release: CatalogueRelease): boolean {
  return pin.catalogueReleaseId === release.catalogueReleaseId && pin.checksum === release.checksum;
}

// Contract §7: anything resolved from a provisional release may be built
// against for development, but never released.
export function isReleasable(release: CatalogueRelease): boolean {
  return release.status === "published";
}

export function familyFromRelease(release: CatalogueRelease, familyCode: string): CatalogueFamily | undefined {
  return release.families.find((f) => f.familyCode === familyCode);
}
