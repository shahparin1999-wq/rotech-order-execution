// 1196 standard pump-end configuration rules catalogue (versioned, data-driven
// — see Rotech_1196_Standard_Configuration_Implementation_Plan.pdf §1, §8).
//
// Everything under STANDARD_BASELINE_1196 is directly supported by the
// supplied source blurb (Appendix B.1). Everything else here (power-end
// branching, package scope, DBSE defaults, service catalogue, confirmation
// gate) is a Rotech operating rule layered on top of that blurb — kept
// separate and labelled so a price-list note is never mistaken for a
// complete engineering definition (Appendix B, "Implementation discipline").
//
// Rule IDs (R-1196-NNN) are named constants purely for traceability in code
// and tests; they are not enforced mechanically beyond the behavior each
// function documents.

import { ACTIVE_CATALOGUE, catalogueFamily, catalogueReleaseBlockers } from "./catalogueRegistry";
import type { CatalogueFamily, CataloguePumpSize } from "./catalogueRelease";

export const RULES_VERSION_1196 = "1196-rules-v1";

export const RULES_1196 = {
  "R-1196-001": "Every 1196 line requires size, frame, quantity, material build, build type and source/rule-set version.",
  "R-1196-002": "Quantity must be a positive whole number and creates exactly N independent Units.",
  "R-1196-003": "The standard casing is 150# FF unless an explicit approved option replaces it.",
  "R-1196-004": "The standard impeller condition is maximum diameter unless an explicit trim/modification is selected.",
  "R-1196-005": "The standard shaft is AISI 4140 unless an explicit approved option replaces it.",
  "R-1196-006": "The standard shaft sleeve uses the casing MOC unless an explicit approved option replaces it.",
  "R-1196-007": "Bearings, sight glass and labyrinth seals are included in the standard pump end.",
  "R-1196-008": "The standard stuffing-box cover is standard bore and uses the casing MOC.",
  "R-1196-009": "Large-bore, taper-bore or alternate-material stuffing-box covers must be explicit selected options.",
  "R-1196-010": "Extra services, adders and customizations must be commercially supported by the approved quotation/PO.",
  "R-1196-011": "Starred carbon-steel standard offerings are data-driven; the system must not infer the size list.",
  "R-1196-012": "A 1196 pump-end requirement includes casing, impeller, stuffing-box cover and power end with adapter.",
  "R-1196-013": "If a correct power end with adapter is unavailable, the system creates a power-end build with controlled child requirements.",
  "R-1196-014": "The power-end build inherits frame, shaft type/material and adapter mapping from the approved configuration.",
  "R-1196-015": "Package scope is explicitly Bare Pump End or Complete Package.",
  "R-1196-016": "Items marked Not in scope create no purchasing, receipt, assembly, inspection or documentation requirement.",
  "R-1196-017": "STR, MTR and LTR package bases default to 3.75-inch DBSE.",
  "R-1196-018": "XLR package bases default to 5.25-inch DBSE.",
  "R-1196-019": "Unknown frame/DBSE combinations fail closed and require controlled data.",
  "R-1196-020": "A nonstandard DBSE requires value, reason and compatibility confirmation.",
  "R-1196-021": "Rotech-scope motors require frame, voltage and serial confirmation before package release.",
  "R-1196-022": "Customer-supplied motors generate receipt/compatibility checks but no Rotech purchasing requirement.",
  "R-1196-023": "Actual coupling components used must be recorded.",
  "R-1196-024": "Selected services generate tasks, result fields, evidence and release blockers.",
  "R-1196-025": "The ordered configuration is read-only; changes use separate adjustment records.",
  "R-1196-026": "Unit-specific records must never appear on sibling Units.",
  "R-1196-027": "The Unit view separates Ordered, Required, Confirmed and As Built.",
  "R-1196-028": "Unknown or incomplete required data blocks release rather than silently applying a fallback."
} as const;
export type RuleId1196 = keyof typeof RULES_1196;

// ---------------------------------------------------------------------------
// Section 1: source-derived standard baseline (Appendix B.1 — directly
// supported by the supplied blurb).
// ---------------------------------------------------------------------------

export const STANDARD_BASELINE_1196 = {
  casing: "150# FF" as const,
  impellerCondition: "MAX_DIAMETER" as const,
  shaftMaterial: "AISI_4140" as const,
  sleeveMaterialRule: "MATCH_CASING_MOC" as const,
  stuffingBoxCover: "STANDARD_BORE_MATCH_CASING_MOC" as const,
  bearingsIncluded: true as const,
  sightGlassIncluded: true as const,
  labyrinthSealsIncluded: true as const
};

// ---------------------------------------------------------------------------
// Section 1a: size / frame / material / trim / part-code options.
//
// NONE of this is authored here. Every option resolves through the pinned CPQ
// catalogue release (docs/integration/CPQ_CATALOGUE_CONTRACT.md) — Work Order
// never transcribes product option tables, and a hardcoded table here would
// fail the no-transcription guard in tests/domain/catalogue-release.test.ts.
//
// Everything returns null / empty when the catalogue cannot answer, so callers
// fail closed instead of falling back to a guess.
// ---------------------------------------------------------------------------

const FAMILY_CODE_1196 = "1196";

function family1196(): CatalogueFamily | null {
  return catalogueFamily(FAMILY_CODE_1196);
}

// Why anything configured for 1196 may not be released yet (currently: the
// catalogue is a provisional fixture, not a CPQ publication).
export function catalogueBlockers1196(): string[] {
  return catalogueReleaseBlockers(FAMILY_CODE_1196);
}

export type PumpSizeEntry1196 = CataloguePumpSize;

export function pumpSizes1196(): PumpSizeEntry1196[] {
  return family1196()?.pumpSizes ?? [];
}

export function pumpSizeEntry1196(size: string): PumpSizeEntry1196 | undefined {
  return pumpSizes1196().find((e) => e.pumpSize === size);
}

export function knownFrames1196(): string[] {
  const f = family1196();
  return f?.frameSpacing ? Object.keys(f.frameSpacing) : [];
}

export function isKnown1196Frame(frame: string): boolean {
  return knownFrames1196().includes(frame);
}

export function materialOptions1196(): string[] {
  return family1196()?.materialOptions ?? [];
}

// R-1196-001/019: a size the catalogue does not carry returns null - the
// caller must fail closed rather than guess a frame.
export function frameOptionsForSize(size: string): string[] | null {
  return pumpSizeEntry1196(size)?.frameOptions ?? null;
}

// The allowed material-build set for a size is its own defaultMoc (the size's
// standard offering - several larger sizes default to "CS/316SS", which is not
// itself in the family-level upgrade list) unioned with the family upgrades.
// Returns null for a size the catalogue does not carry (fail closed).
export function materialOptionsForSize(size: string): { default: string; options: string[] } | null {
  const entry = pumpSizeEntry1196(size);
  if (!entry) return null;
  return { default: entry.defaultMoc, options: Array.from(new Set([entry.defaultMoc, ...materialOptions1196()])) };
}

export function shaftTypes1196(): string[] {
  return family1196()?.shaftTypes ?? [];
}

export function isShaftType1196(value: string): boolean {
  return shaftTypes1196().includes(value);
}

// The catalogue lists shaft types in its own order; the first is the standard
// build. There is no hardcoded default to fall back to.
export function defaultShaftType1196(): string | null {
  return shaftTypes1196()[0] ?? null;
}

// ---------------------------------------------------------------------------
// Section 5: DBSE. The frame spacing table now comes from the catalogue
// release (CPQ rules.pumpFrameSpacing), which also carries XLR-17 - the value
// D-1196-008 was open on. It resolves while the catalogue is provisional, but
// catalogueBlockers1196() still blocks release until CPQ publishes for real.
// ---------------------------------------------------------------------------

export interface DbseResolution {
  value: number;
  isDefault: true;
  ruleId: RuleId1196;
}

// R-1196-017/018/019: a frame with no catalogue spacing entry returns null -
// the caller must fail closed, never guess.
export function resolveDefaultDbse(frame: string): DbseResolution | null {
  const spacing = family1196()?.frameSpacing?.[frame];
  if (!spacing) return null;
  return {
    value: spacing.dbse,
    isDefault: true,
    ruleId: frame.startsWith("XLR") ? "R-1196-018" : "R-1196-017"
  };
}

export function pumpShaftDiameter1196(frame: string): number | null {
  return family1196()?.frameSpacing?.[frame]?.pumpShaftDiameter ?? null;
}

export const PACKAGE_COMPONENT_KEYS = [
  "baseplate",
  "motor",
  "coupling",
  "couplingGuard",
  "seal",
  "accessories"
] as const;
export type PackageComponentKey = (typeof PACKAGE_COMPONENT_KEYS)[number];

export const PACKAGE_COMPONENT_LABELS: Record<PackageComponentKey, string> = {
  baseplate: "Baseplate",
  motor: "Motor",
  coupling: "Coupling",
  couplingGuard: "Coupling guard",
  seal: "Seal",
  accessories: "Accessories / instruments"
};

export type PackageComponentScope = "RotechSupplied" | "CustomerSupplied" | "NotInScope";

// ---------------------------------------------------------------------------
// Section 4: power-end availability/build branching — Rotech operating rule.
//
// Shaft types and the bearing-frame / shaft-kit part codes resolve through the
// pinned catalogue release (partCodeRules), which also declares which
// frame/shaft-type combinations it does not offer. The remaining children
// (frame foot, adapter, bearings, labyrinth seals, sight glass) have no
// mapping in any source, so they stay controlled placeholders — never an
// invented part number (D-1196-005 remains partly open).
// ---------------------------------------------------------------------------

export interface PowerEndChildRequirement {
  key: string;
  label: string;
  ruleId: RuleId1196;
  partNumber: string | null; // null => controlled placeholder, no catalogue mapping
}

const PLACEHOLDER_CHILDREN: PowerEndChildRequirement[] = [
  { key: "frameFoot", label: "Frame foot (pilot placeholder - owner approval required)", ruleId: "R-1196-014", partNumber: null },
  { key: "adapter", label: "Adapter (pilot placeholder - owner approval required)", ruleId: "R-1196-014", partNumber: null },
  { key: "bearings", label: "Bearings (pilot placeholder - owner approval required)", ruleId: "R-1196-007", partNumber: null },
  { key: "labyrinthSeals", label: "Labyrinth seals (pilot placeholder - owner approval required)", ruleId: "R-1196-007", partNumber: null },
  { key: "sightGlassFittings", label: "Sight glass and fittings (pilot placeholder - owner approval required)", ruleId: "R-1196-007", partNumber: null }
];

// R-1196-013/014: returns the controlled child-requirement list for a frame +
// shaft type, or null when the catalogue does not carry that combination
// (fail closed — the caller must not invent a build list).
export function powerEndBuildChildren(
  frame: string,
  shaftType?: string
): PowerEndChildRequirement[] | null {
  const family = family1196();
  if (!family) return null;

  const resolvedShaftType = shaftType ?? defaultShaftType1196();
  if (!resolvedShaftType || !isShaftType1196(resolvedShaftType)) return null;
  if (!isKnown1196Frame(frame)) return null;

  // A combination the catalogue explicitly does not offer (e.g. XLR-17 with a
  // solid shaft) is genuinely unavailable, not merely undocumented.
  const rules = family.partCodeRules;
  if (!rules) return null; // this family does not compose shaft-kit part codes

  const unsupported = rules.unsupportedShaftTypesByFrame?.[frame] ?? [];
  if (unsupported.includes(resolvedShaftType)) return null;

  const shaftKitPart = rules.shaftKitByShaftType[resolvedShaftType];
  const powerFramePart = rules.powerFrameByShaftType[resolvedShaftType];
  if (!shaftKitPart || !powerFramePart) return null;

  return [
    {
      key: "shaftKit",
      label: `Shaft kit — ${resolvedShaftType}`,
      ruleId: "R-1196-014",
      partNumber: shaftKitPart
    },
    {
      key: "bearingFrame",
      label: `Bearing frame (${frame}) — ${resolvedShaftType}`,
      ruleId: "R-1196-014",
      partNumber: powerFramePart
    },
    ...PLACEHOLDER_CHILDREN
  ];
}

// ---------------------------------------------------------------------------
// Section 10.1: selected-service catalogue. Only a selected service generates
// work (R-1196-024); an unselected service is not "missing" (§10.1, §12.1).
// ---------------------------------------------------------------------------

export interface ServiceCatalogueEntry {
  key: string;
  label: string;
  resultFieldKeys: string[];
  blocksRelease: boolean;
}

export const SERVICE_CATALOGUE_1196: ServiceCatalogueEntry[] = [
  { key: "hydrostaticTest", label: "Hydrostatic test", resultFieldKeys: ["testPressure", "duration", "result"], blocksRelease: true },
  { key: "witnessHydrostaticTest", label: "Witness hydrostatic test", resultFieldKeys: ["testPressure", "duration", "result", "witnessIdentity", "signedResult"], blocksRelease: true },
  { key: "materialReports", label: "Material reports", resultFieldKeys: ["documentRef"], blocksRelease: true },
  { key: "pmi", label: "PMI", resultFieldKeys: ["componentScope", "instrumentResult", "approval"], blocksRelease: true },
  { key: "performanceTest", label: "Performance test", resultFieldKeys: ["operatingPoints", "results", "curveDocumentRef", "approval"], blocksRelease: true },
  { key: "impellerBalancing", label: "Impeller balancing", resultFieldKeys: ["balanceResult", "certificateRef"], blocksRelease: true },
  { key: "npshrTest", label: "NPSHr test", resultFieldKeys: ["testRecord", "reportRef"], blocksRelease: true },
  { key: "vibrationSoundTest", label: "Vibration/sound test", resultFieldKeys: ["measurementPoints", "limits", "results", "reportRef"], blocksRelease: true },
  { key: "alignmentReport", label: "Alignment report", resultFieldKeys: ["alignmentRecord", "reportRef"], blocksRelease: true },
  { key: "other", label: "Other", resultFieldKeys: ["title", "description", "owner", "dueDate", "evidenceDefinition"], blocksRelease: true }
];

export function serviceCatalogueEntry(key: string): ServiceCatalogueEntry | undefined {
  return SERVICE_CATALOGUE_1196.find((s) => s.key === key);
}

// ---------------------------------------------------------------------------
// Section 3.3: confirmation gate.
// ---------------------------------------------------------------------------

export interface ConfirmationGateItem {
  key: string;
  label: string;
}

export const CONFIRMATION_GATE_ITEMS_1196: ConfirmationGateItem[] = [
  { key: "identityMatchesSource", label: "Model, size and frame match the approved source" },
  { key: "baselineComplete", label: "Material build and standard baseline are complete" },
  { key: "nonstandardExplicit", label: "All nonstandard selections are explicitly present" },
  { key: "quantityCorrect", label: "Quantity and Unit generation are correct" },
  { key: "packageScopeCorrect", label: "Bare pump end / package scope is correct" },
  { key: "servicesComplete", label: "Additional services and testing are complete" },
  { key: "openQuestionsResolved", label: "Open configuration questions are resolved or blocking" },
  { key: "coordinatorConfirmed", label: "Coordinator confirms the work order reflects the approved order" }
];

// ---------------------------------------------------------------------------
// Section 10: route template. Conditional steps are filtered by the caller
// (build1196Route in actions.ts) based on the frozen Pump1196LineConfig.
// ---------------------------------------------------------------------------

export type Department1196 = "Coordination" | "Machining" | "Assembly" | "Quality" | "Shipping";

export interface RouteStep1196 {
  key: string;
  name: string;
  department: Department1196;
}

export const ROUTE_STEPS_1196: RouteStep1196[] = [
  { key: "intake", name: "Intake and configuration confirmation", department: "Coordination" },
  { key: "pullTag", name: "Pull and tag casing, impeller, stuffing-box cover and power-end requirement", department: "Assembly" },
  { key: "verifyMaterial", name: "Verify material and heat/lot records", department: "Quality" },
  { key: "inspectFit", name: "Inspect parts and fit", department: "Assembly" },
  { key: "powerEndAllocateOrBuild", name: "Allocate or build power end with adapter", department: "Assembly" },
  { key: "powerEndLeakTest", name: "Power-end oil-leak and free-rotation check", department: "Assembly" },
  { key: "verifyShaftSleeve", name: "Verify shaft and sleeve", department: "Assembly" },
  { key: "trimImpeller", name: "Trim/verify impeller", department: "Machining" },
  { key: "verifySbcSeal", name: "Verify/install stuffing-box cover and seal", department: "Assembly" },
  { key: "assemblyMeasurements", name: "Pump assembly measurements and free rotation", department: "Assembly" },
  { key: "packageAssembly", name: "Package assembly", department: "Assembly" },
  { key: "serialNameplateQc", name: "Serial/nameplate and final quality", department: "Quality" },
  { key: "packagingShipping", name: "Packaging and shipping", department: "Shipping" }
];

// Builds the ordered {name, department} step list for one 1196 Unit's route,
// filtering the always-required steps against the frozen configuration
// (docs §10): trim/verify impeller only when a trim was selected, package
// assembly only when the build is a Complete Package, and one bundle per
// selected service (§10.1) appended before final QC/shipping — an unselected
// service never appears (R-1196-024).
export function build1196RouteSteps(config: {
  hydraulicCondition: { kind: "MaxDiameter" } | { kind: "Trim"; trimValue: number; reason: string };
  buildType: "BarePumpEnd" | "CompletePackage";
  selectedServiceKeys: string[];
}): Array<{ name: string; department: Department1196 }> {
  const steps: Array<{ name: string; department: Department1196 }> = [];
  for (const step of ROUTE_STEPS_1196) {
    if (step.key === "trimImpeller" && config.hydraulicCondition.kind !== "Trim") continue;
    if (step.key === "packageAssembly" && config.buildType !== "CompletePackage") continue;
    steps.push({ name: step.name, department: step.department });
    if (step.key === "assemblyMeasurements") {
      for (const serviceKey of config.selectedServiceKeys) {
        const entry = serviceCatalogueEntry(serviceKey);
        steps.push({ name: `Service: ${entry?.label ?? serviceKey}`, department: "Quality" });
      }
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Family-agnostic catalogue lookups. The 1196-specific helpers above remain for
// the existing slice; these take a familyCode so the configurator can offer any
// family the pinned release carries.
// ---------------------------------------------------------------------------

export interface CatalogueFamilySummary {
  familyCode: string;
  displayName: string;
}

export function catalogueFamilies(): CatalogueFamilySummary[] {
  return (ACTIVE_CATALOGUE?.families ?? []).map((f) => ({
    familyCode: f.familyCode,
    displayName: f.displayName
  }));
}

export function pumpSizesFor(familyCode: string): CataloguePumpSize[] {
  return catalogueFamily(familyCode)?.pumpSizes ?? [];
}

export function pumpSizeEntryFor(familyCode: string, size: string): CataloguePumpSize | undefined {
  return pumpSizesFor(familyCode).find((e) => e.pumpSize === size);
}

export function materialOptionsFor(familyCode: string, size: string): { default: string; options: string[] } | null {
  const entry = pumpSizeEntryFor(familyCode, size);
  if (!entry) return null;
  const family = catalogueFamily(familyCode);
  return {
    default: entry.defaultMoc,
    options: Array.from(new Set([entry.defaultMoc, ...(family?.materialOptions ?? [])]))
  };
}

export function shaftTypesFor(familyCode: string): string[] {
  return catalogueFamily(familyCode)?.shaftTypes ?? [];
}

export function flangeOptionsFor(familyCode: string, size: string): string[] {
  const entry = pumpSizeEntryFor(familyCode, size);
  if (entry?.flangeOptions?.length) return entry.flangeOptions;
  // ANSI families are restricted to these four (CPQ isAnsiFlangeRestrictedFamily).
  return ["150#FF", "150#RF", "300#FF", "300#RF"];
}

export const SBC_TYPES = ["STD BORE", "LARGE BORE", "TAPER BORE"] as const;

// ---------------------------------------------------------------------------
// Option vocabulary from the pinned reference (CPQ commonOptionSets).
// ---------------------------------------------------------------------------

export function commonOptions(): NonNullable<typeof ACTIVE_CATALOGUE>["commonOptionSets"] | undefined {
  return ACTIVE_CATALOGUE?.commonOptionSets;
}

export function sealMocOptionsFor(familyCode: string): string[] {
  const family = catalogueFamily(familyCode);
  if (family?.sealMocOptions?.length) return family.sealMocOptions;
  return commonOptions()?.sealMoc ?? [];
}

export function sealDefaultsFor(familyCode: string) {
  return catalogueFamily(familyCode)?.sealDefaults ?? null;
}

export function sealSizeForFrame(familyCode: string, frame: string): number | null {
  return catalogueFamily(familyCode)?.sealSizeByFrame?.[frame] ?? null;
}

export function testingAdders(): string[] {
  return commonOptions()?.testingAdders ?? [];
}

export function sealPlans(): string[] {
  return commonOptions()?.sealPlans ?? [];
}

export function sealArrangements(): string[] {
  return commonOptions()?.sealAdderTypes ?? [];
}

export function sealGlandMocOptions(): string[] {
  return commonOptions()?.sealGlandMoc ?? [];
}

export function catalogueProvenance() {
  if (!ACTIVE_CATALOGUE) return null;
  return {
    catalogueReleaseId: ACTIVE_CATALOGUE.catalogueReleaseId,
    status: ACTIVE_CATALOGUE.status,
    sourceRepository: ACTIVE_CATALOGUE.sourceRepository,
    sourceBranch: ACTIVE_CATALOGUE.sourceBranch,
    sourceCommit: ACTIVE_CATALOGUE.sourceCommit,
    sourceFileChecksums: ACTIVE_CATALOGUE.sourceFileChecksums
  };
}

// Seal-arrangement choices for a family. CPQ's own default ("SINGLE CART")
// is not a member of its sealAdderTypes list ("SINGLE CARTRIDGE"), so the
// default is unioned in rather than renamed — the same thing CPQ's
// buildMaterialChoices does with `new Set([standardMoc, ...choices])`.
// Renaming it here would be inventing catalogue data (D-027).
export function sealArrangementOptionsFor(familyCode: string): string[] {
  const fromDefault = sealDefaultsFor(familyCode)?.sealArrangement;
  return Array.from(new Set([fromDefault, ...sealArrangements()].filter(Boolean) as string[]));
}

// ---------------------------------------------------------------------------
// Per-component materials.
//
// A material build like "DI/316SS" is a PAIRED code, not a component material:
// it means the casing side is ductile iron and the impeller is 316SS. CPQ
// decodes it per component in majorComponentRules.*.materialCode, and that
// decode is authoritative — 1196 even overrides the cover to DI on a CS build.
//
// The code→label map below is a Work-Order DISPLAY mapping, not catalogue
// option data: CPQ stores the two-character codes only. S6 and C4 are
// corroborated by CPQ's own material vocabulary ("316SS", "CD4MCU"); DI and CS
// are the standard industry expansions. Owner confirmation is recorded as a
// blocker rather than assumed.
// ---------------------------------------------------------------------------

export const MATERIAL_CODE_LABELS: Record<string, string> = {
  DI: "Ductile Iron",
  S6: "316SS",
  CS: "Carbon Steel",
  C4: "CD4MCU",
  CI: "Cast Iron"
};

function decodeMaterialCode(code: string | undefined): string {
  if (!code) return "";
  return MATERIAL_CODE_LABELS[code] ?? code;
}

// Which catalogue table decodes each component's material.
type MaterialSource = "casing" | "impeller" | "stuffingBoxCover";
const COMPONENT_MATERIAL_SOURCE: Record<string, MaterialSource> = {
  casing: "casing",
  impeller: "impeller",
  stuffingBoxCover: "stuffingBoxCover"
};

function materialCodeTable(familyCode: string, source: MaterialSource): Record<string, string> | undefined {
  const codes = catalogueFamily(familyCode)?.partNumberCodes;
  if (!codes) return undefined;
  if (source === "casing") return codes.casingMaterialCode;
  if (source === "impeller") return codes.impellerMaterialCode;
  // The family override wins where present (1196 CS build takes a DI cover).
  return { ...codes.sbcMaterialCode, ...(codes.sbcMaterialCodeByFamily ?? {}) };
}

/**
 * The individual material for one component, decoded from the line's material
 * build. Returns "" when the family does not publish a decode table (solids
 * handling and compact self-primers ship released builds instead).
 */
export function componentMaterialFor(
  familyCode: string,
  componentKey: string,
  materialBuild: string
): string {
  const source = COMPONENT_MATERIAL_SOURCE[componentKey];
  if (source) {
    const table = materialCodeTable(familyCode, source);
    return decodeMaterialCode(table?.[materialBuild]);
  }
  // The power frame is Rotech's standard ductile iron base.
  if (componentKey === "powerFrame") return MATERIAL_CODE_LABELS.DI;
  // Everything else (shaft kit, seal, gland, package parts) takes its material
  // from its own selection, not from the build.
  return "";
}

/** The materials a given component can legitimately be, plus the individual
 *  material vocabulary so a single component can be upgraded on its own — the
 *  "if the impeller needs to be CD4, change it right there" case. */
export function componentMaterialOptionsFor(familyCode: string, componentKey: string): string[] {
  if (componentKey === "sealGland") return commonOptions()?.sealGlandMoc ?? [];
  if (componentKey === "seal") return sealMocOptionsFor(familyCode);
  if (componentKey === "shaftKit") return shaftTypesFor(familyCode);

  const family = catalogueFamily(familyCode);
  const source = COMPONENT_MATERIAL_SOURCE[componentKey];
  const derived = source
    ? (family?.materialOptions ?? [])
        .map((build) => decodeMaterialCode(materialCodeTable(familyCode, source)?.[build]))
        .filter(Boolean)
    : [];
  // Individual materials anyone might upgrade a single part to.
  const individual = [
    MATERIAL_CODE_LABELS.DI,
    MATERIAL_CODE_LABELS.S6,
    MATERIAL_CODE_LABELS.CS,
    MATERIAL_CODE_LABELS.C4
  ];
  return Array.from(new Set([...derived, ...individual]));
}
