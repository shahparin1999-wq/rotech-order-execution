// Derived component and assembly part numbers.
//
// Ported from CPQ's buildPumpPartNumber / buildMajorComponentPartCodes
// (app.js:21249, 21369). Every code table comes from the pinned catalogue
// release — nothing is transcribed here (D-027).
//
// The shop needs a starting point for what to pull, so these are DERIVED and
// shown, but never authoritative: the builder records the part number actually
// used, and derived-vs-actual are kept separately for the QC record.
//
// PURE DOMAIN — no React, no localStorage.

import { catalogueFamily } from "./catalogueRegistry";
import { capabilitiesForFamily, closeCoupledAdapterCode, stubShaftBoreCode } from "./familyShapes";

export interface PartNumberResult {
  value: string;
  status: "standard" | "code-needed" | "rfq" | "pending";
  missing: string[];
}

export interface PumpConfigurationInput {
  familyCode: string;
  pumpSize: string;
  frameSize: string;
  materialBuild: string;
  flangeType?: string;
  sbcType?: string;
  shaftType?: string;
  fullImpellerTrim?: number;
  /** JM motor frame, close-coupled families only. */
  motorFrame?: string;
  /** True when the build was flagged as a customization. */
  isCustom?: boolean;
}

// CPQ lookupPartCode: exact match, then a normalized (alphanumeric-only,
// uppercased) match so "150#FF" and "150FF" resolve the same.
function normalizeKey(value: string): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function lookupCode(map: Record<string, string> | undefined, value: string | undefined): string {
  if (!map || !value) return "";
  if (map[value]) return map[value];
  const target = normalizeKey(value);
  const hit = Object.entries(map).find(([key]) => normalizeKey(key) === target);
  return hit?.[1] ?? "";
}

// CPQ formatHydraulicSizeCode: round the full impeller diameter, cap at 17,
// zero-pad to two digits.
export function hydraulicSizeCode(fullImpellerTrim: number | undefined): string {
  const diameter = Number(fullImpellerTrim || 0);
  if (!diameter) return "";
  const rounded = Math.round(diameter);
  if (rounded >= 16) return "17";
  return String(rounded).padStart(2, "0");
}

function codesFor(familyCode: string) {
  const family = catalogueFamily(familyCode);
  return family?.partNumberCodes;
}

// Some families take their component size code from another family's table
// (e.g. 1796 impellers use the 1196 codes) — CPQ componentSizeCodeSourceByFamily.
function componentSizeCode(familyCode: string, component: string, pumpSize: string): string {
  const codes = codesFor(familyCode);
  if (!codes) return "";
  const sourceFamily = codes.componentSizeCodeSource?.[component] ?? codes.componentSizeCodeSource?.default;
  if (sourceFamily && sourceFamily !== familyCode) {
    const other = catalogueFamily(sourceFamily)?.partNumberCodes?.pumpSizeCode;
    return lookupCode(other, pumpSize);
  }
  return lookupCode(codes.pumpSizeCode, pumpSize);
}

function componentDesignCode(familyCode: string, component: string): string {
  const codes = codesFor(familyCode);
  return codes?.componentDesignCode?.[component] ?? codes?.componentDesignCode?.default ?? "A";
}

function decide(value: string, missing: string[], isCustom: boolean | undefined): PartNumberResult {
  if (isCustom) return { value: "RFQ", status: "rfq", missing: [] };
  if (missing.length) return { value: "Code Needed", status: "code-needed", missing };
  return { value, status: "standard", missing: [] };
}

// ---------------------------------------------------------------------------
// Major components
// ---------------------------------------------------------------------------

export interface MajorComponentPartCode {
  key: string;
  label: string;
  result: PartNumberResult;
}

export function majorComponentPartCodes(config: PumpConfigurationInput): MajorComponentPartCode[] {
  const caps = capabilitiesForFamily(config.familyCode);
  const codes = codesFor(config.familyCode);
  if (!codes || !config.pumpSize) return [];

  const frameCode = lookupCode(codes.frameCode, config.frameSize);
  const flangeCode = lookupCode(codes.flangeCode, config.flangeType);
  const sbcCode = lookupCode(codes.sbcCode, config.sbcType);
  const casingSize = componentSizeCode(config.familyCode, "casing", config.pumpSize);
  const impellerSize = componentSizeCode(config.familyCode, "impeller", config.pumpSize);
  const casingMaterial = lookupCode(codes.casingMaterialCode, config.materialBuild);
  const impellerMaterial = lookupCode(codes.impellerMaterialCode, config.materialBuild);
  // A family may override the cover material for a specific build — CPQ uses a
  // ductile-iron cover on a CS/316SS 1196 build.
  const sbcMaterial =
    lookupCode(codes.sbcMaterialCodeByFamily, config.materialBuild) ||
    lookupCode(codes.sbcMaterialCode, config.materialBuild);
  const sizeCode = hydraulicSizeCode(config.fullImpellerTrim);

  const out: MajorComponentPartCode[] = [
    {
      key: "casing",
      label: "Casing",
      result: decide(
        `${codes.componentPrefixes?.casing ?? "100"}-${casingSize}-${frameCode}-${componentDesignCode(config.familyCode, "casing")}-${flangeCode}-${casingMaterial}`,
        [
          !casingSize && `pump size code for ${config.pumpSize}`,
          !frameCode && `frame code for ${config.frameSize || "TBD"}`,
          !flangeCode && `flange code for ${config.flangeType || "TBD"}`,
          !casingMaterial && `casing material code for ${config.materialBuild || "TBD"}`
        ].filter(Boolean) as string[],
        config.isCustom
      )
    },
    {
      key: "impeller",
      label: "Impeller",
      result: decide(
        `${codes.componentPrefixes?.impeller ?? "101"}-${impellerSize}-${frameCode}-${componentDesignCode(config.familyCode, "impeller")}-${impellerMaterial}`,
        [
          !impellerSize && `pump size code for ${config.pumpSize}`,
          !frameCode && `frame code for ${config.frameSize || "TBD"}`,
          !impellerMaterial && `impeller material code for ${config.materialBuild || "TBD"}`
        ].filter(Boolean) as string[],
        config.isCustom
      )
    },
    {
      key: "stuffingBoxCover",
      label: "Stuffing box cover",
      result: decide(
        `${codes.componentPrefixes?.stuffingBoxCover ?? "184"}-${sizeCode}-${sbcCode}-${frameCode}-${componentDesignCode(config.familyCode, "stuffingBoxCover")}-${sbcMaterial}`,
        [
          !sizeCode && "hydraulic size code (full impeller trim)",
          !sbcCode && `stuffing-box code for ${config.sbcType || "TBD"}`,
          !frameCode && `frame code for ${config.frameSize || "TBD"}`,
          !sbcMaterial && `cover material code for ${config.materialBuild || "TBD"}`
        ].filter(Boolean) as string[],
        config.isCustom
      )
    }
  ];

  if (caps.closeCoupled) {
    const boreCode = stubShaftBoreCode(config.motorFrame ?? "");
    out.push({
      key: "stubShaft",
      label: "Stub shaft",
      result: decide(
        boreCode ?? "",
        boreCode ? [] : [`JM motor frame for ${config.familyCode}`],
        config.isCustom
      )
    });
    const adapter = closeCoupledAdapterCode(frameCode || config.frameSize, config.motorFrame ?? "");
    out.push({
      key: "adapter",
      label: "Adapter",
      result: decide(adapter ?? "", adapter ? [] : ["JM motor frame"], config.isCustom)
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Assembly part number
// ---------------------------------------------------------------------------

// CPQ close-coupled assembly suffix: stub code + adapter band.
// Bands are 143-184 = A, 213-256 = B, 284-365 = C (app.js:21363).
export function closeCoupledAssemblySuffix(motorFrame: string): string {
  const match = String(motorFrame || "").match(/^(\d+)/);
  if (!match) return "";
  const n = Number(match[1]);
  const stub = n >= 254 ? "B" : "S";
  const adapter = n >= 143 && n <= 184 ? "A" : n >= 213 && n <= 256 ? "B" : n >= 284 && n <= 365 ? "C" : "";
  return adapter ? `${stub}${adapter}` : "";
}

export function assemblyPartNumber(config: PumpConfigurationInput): PartNumberResult {
  const caps = capabilitiesForFamily(config.familyCode);
  if (!caps.composesPartNumbers && !caps.closeCoupled) {
    return { value: "Released part number", status: "pending", missing: [] };
  }
  const codes = codesFor(config.familyCode);
  if (!codes) return { value: "Select model", status: "pending", missing: ["catalogue part-number codes"] };
  if (!config.pumpSize) return { value: "Select pump size", status: "pending", missing: ["pump size"] };
  if (config.isCustom || config.shaftType === "CUSTOM") return { value: "RFQ", status: "rfq", missing: [] };

  const frameCode = lookupCode(codes.frameCode, config.frameSize);
  const sizeCode = lookupCode(codes.pumpSizeCode, config.pumpSize);
  const sbcCode = lookupCode(codes.sbcCode, config.sbcType);
  const flangeCode = lookupCode(codes.flangeCode, config.flangeType);

  const missing: string[] = [];
  if (!codes.seriesCode) missing.push(`series code for ${config.familyCode}`);
  if (!codes.modelCode) missing.push(`model code for ${config.familyCode}`);
  if (!frameCode) missing.push(`frame code for ${config.frameSize || "TBD"}`);
  if (!sizeCode) missing.push(`pump size code for ${config.pumpSize}`);
  if (!sbcCode) missing.push(`SBC code for ${config.sbcType || "TBD"}`);
  if (!flangeCode) missing.push(`flange code for ${config.flangeType || "TBD"}`);

  let suffix: string;
  if (caps.closeCoupled) {
    suffix = closeCoupledAssemblySuffix(config.motorFrame ?? "");
    if (!suffix) missing.push(`close-coupled stub/adapter code for motor frame ${config.motorFrame || "TBD"}`);
  } else {
    const shaftCode = lookupCode(codes.shaftDesignCode, config.shaftType);
    const materialCode = lookupCode(codes.materialCode, config.materialBuild);
    if (!shaftCode) missing.push(`shaft design code for ${config.shaftType || "TBD"}`);
    if (!materialCode) missing.push(`material code for ${config.materialBuild || "TBD"}`);
    suffix = `${shaftCode}${materialCode}`;
  }

  if (missing.length) return { value: "Code Needed", status: "code-needed", missing };
  return {
    value: `${codes.seriesCode}-${frameCode}-${codes.modelCode}-${sizeCode}-${sbcCode}-${flangeCode}-${suffix}`,
    status: "standard",
    missing: []
  };
}
