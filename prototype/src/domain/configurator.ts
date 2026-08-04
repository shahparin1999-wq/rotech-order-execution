// Internal work-order configurator.
//
// Shaped after the CPQ line builder — you add a configured assembly, a spare,
// or a bought-out item — but deliberately LESS RULE-BOUND, because this is
// internal and the person configuring it usually knows more than the rule set
// does. Concretely:
//
//   - catalogue values (size/frame/material) pre-fill component rows, but every
//     field stays editable
//   - brands, seal numbers, part numbers and materials are free text
//   - anything typed over a catalogue value is marked `custom` so it is
//     visible and reviewable rather than silently indistinguishable
//
// That last point is the whole compromise: easy to use, but never pretending a
// hand-typed value came from the controlled catalogue.
//
// PURE DOMAIN — no React, no localStorage.

import {
  componentHasMaterial,
  componentMaterialFor,
  flangeOptionsFor,
  materialOptionsFor,
  PACKAGE_COMPONENT_LABELS,
  pumpSizeEntryFor,
  pumpSizesFor,
  sealDefaultsFor,
  sealSizeForFrame,
  shaftTypesFor
} from "./model1196";
import { capabilitiesForFamily, familyShape, type FamilyShape } from "./familyShapes";

export type ConfiguratorLineKind = "ConfiguredAssembly" | "Spare" | "Item";

export const LINE_KIND_LABELS: Record<ConfiguratorLineKind, string> = {
  ConfiguredAssembly: "Configured assembly",
  Spare: "Spare part",
  Item: "Bought-out item"
};

// Where a component field's value came from. `custom` means a person typed it.
export type ValueProvenance = "catalogue" | "custom" | "empty";

export interface ComponentEntry {
  key: string;
  label: string;
  /** Free text — e.g. "A529L-S22", or a vendor's own number. */
  partNumber: string;
  /** Free text manufacturer — "Chesterton", "WEG", "TECO", "Rotech". */
  brand: string;
  /** Free text — may be a catalogue MOC or anything the builder needs. */
  material: string;
  /**
   * Contextual second identifier. For a seal this is the seal number; for a
   * motor, the serial; for a drawing-governed part, the drawing reference.
   */
  reference: string;
  referenceLabel: string;
  quantity: number;
  notes: string;
  /** Set when the row was seeded from the catalogue, for provenance display. */
  seededValue?: { partNumber?: string; material?: string };
  inScope: boolean;
  /** True for a row a coordinator added by hand; its label is editable and it
   *  carries no catalogue provenance. */
  isCustomRow?: boolean;
}

export interface ConfiguratorLine {
  id: string;
  kind: ConfiguratorLineKind;
  quantity: number;
  description: string;

  // ConfiguredAssembly only
  family?: string;
  size?: string;
  frame?: string;
  materialBuild?: string;
  buildType?: "BarePumpEnd" | "CompletePackage";
  /** Shape-dependent build fields; all optional, all free to leave blank. */
  flangeType?: string;
  sbcType?: string;
  shaftType?: string;
  /** Close-coupled families only — drives stub-shaft bore and adapter code. */
  motorFrame?: string;

  /** Impeller trim. `fullTrim` is the size's max diameter from the reference. */
  fullTrim?: number;
  requestedTrim?: string;

  /** Seal — defaults come from the CPQ reference per family shape. */
  sealArrangement?: string;
  sealMoc?: string;
  sealGlandMoc?: string;
  sealPlan?: string;
  sealManufacturer?: string;
  sealPartNumber?: string;
  /** Derived from frame for ANSI families (owner-supplied table). */
  sealSize?: number | null;

  /** Selected testing requirements (CPQ testingAdders vocabulary). */
  testingRequirements?: string[];

  /** Which fields the coordinator has typed over, for provenance display. */
  coordinatorEdited?: string[];

  components: ComponentEntry[];

  // Spare / Item only
  partNumber?: string;
  brand?: string;
  notes?: string;
}

export interface ConfiguratorDraft {
  orderNumber: string;
  customerId: string;
  customerPo: string;
  description: string;
  facility: string;
  coordinatorId: string;
  priority: string;
  dueDate: string;
  lines: ConfiguratorLine[];
}

// ---------------------------------------------------------------------------
// Component templates
// ---------------------------------------------------------------------------

interface ComponentTemplate {
  key: string;
  label: string;
  referenceLabel: string;
  packageOnly?: boolean;
}

// The wet end / power end / package breakdown a builder actually pulls parts
// for. Which rows appear is decided by the FAMILY SHAPE, not the model — a
// close-coupled pump has a stub shaft and adapter instead of a shaft kit and
// baseplate, and a solids-handling pump has neither.
const PUMP_COMPONENT_TEMPLATE: ComponentTemplate[] = [
  { key: "casing", label: "Casing", referenceLabel: "Heat / lot" },
  { key: "impeller", label: "Impeller", referenceLabel: "Heat / lot" },
  { key: "stuffingBoxCover", label: "Stuffing-box cover", referenceLabel: "Heat / lot" },
  { key: "shaftKit", label: "Shaft kit", referenceLabel: "Shaft type" },
  { key: "powerFrame", label: "Power frame", referenceLabel: "Frame reference" },
  { key: "seal", label: "Mechanical seal", referenceLabel: "Seal number" },
  { key: "sealGland", label: "Seal gland", referenceLabel: "Gland part number" },
  { key: "baseplate", label: PACKAGE_COMPONENT_LABELS.baseplate, referenceLabel: "Drawing reference", packageOnly: true },
  { key: "motor", label: PACKAGE_COMPONENT_LABELS.motor, referenceLabel: "Serial number", packageOnly: true },
  { key: "coupling", label: PACKAGE_COMPONENT_LABELS.coupling, referenceLabel: "Coupling size", packageOnly: true },
  { key: "couplingGuard", label: PACKAGE_COMPONENT_LABELS.couplingGuard, referenceLabel: "Reference", packageOnly: true },
  { key: "accessories", label: PACKAGE_COMPONENT_LABELS.accessories, referenceLabel: "Reference", packageOnly: true }
];

function emptyEntry(t: ComponentTemplate): ComponentEntry {
  return {
    key: t.key,
    label: t.label,
    partNumber: "",
    brand: "",
    material: "",
    reference: "",
    referenceLabel: t.referenceLabel,
    quantity: 1,
    notes: "",
    inScope: true
  };
}

// Seeds the component rows for a configured assembly. Catalogue values pre-fill
// material where the size is known; everything stays editable.
export function seedComponents(
  size: string,
  materialBuild: string,
  buildType: "BarePumpEnd" | "CompletePackage",
  familyCode = "1196"
): ComponentEntry[] {
  const sizeEntry = pumpSizeEntryFor(familyCode, size);
  const caps = capabilitiesForFamily(familyCode);
  const rows = PUMP_COMPONENT_TEMPLATE
    .filter((t) => !t.packageOnly || buildType === "CompletePackage")
    // A close-coupled pump bolts to the motor: no baseplate, coupling or guard.
    .filter((t) => !(caps.closeCoupled && ["baseplate", "coupling", "couplingGuard"].includes(t.key)))
    // Shaft kit only where the family lets you choose one.
    .filter((t) => !(t.key === "shaftKit" && !caps.choosesShaftKit))
    // The seal is part of the released build for simplified shapes.
    .filter((t) => !(["seal", "sealGland"].includes(t.key) && !caps.configuresSeal))
    .filter((t) => !(t.key === "stuffingBoxCover" && !caps.choosesStuffingBoxCover))
    .map(emptyEntry);

  // Close-coupled adds what replaces the removed rows.
  if (caps.closeCoupled) {
    rows.push(
      emptyEntry({ key: "stubShaft", label: "Stub shaft", referenceLabel: "Motor frame (JM)" }),
      emptyEntry({ key: "adapter", label: "Adapter", referenceLabel: "Adapter code" })
    );
  }

  for (const row of rows) {
    // A material build is a PAIRED code: "DI/316SS" means the casing side is
    // ductile iron and the impeller is 316SS. Each component therefore gets its
    // OWN decoded material, never the pair — see componentMaterialFor.
    const decoded = componentHasMaterial(row.key)
      ? componentMaterialFor(familyCode, row.key, materialBuild)
      : "";
    if (decoded) {
      row.material = decoded;
      row.seededValue = { material: decoded };
    }
    if (row.key === "impeller" && sizeEntry) {
      row.notes = `Full diameter ${sizeEntry.fullImpellerTrim} in`;
    }
    // Accessories default out of scope — an unselected accessory should create
    // no work at all (R-1196-016).
    if (row.key === "accessories") row.inScope = false;
  }
  return rows;
}

// True when a field was typed over its catalogue-seeded value.
export function isCustomValue(entry: ComponentEntry, field: "material" | "partNumber"): boolean {
  const seeded = entry.seededValue?.[field];
  const current = entry[field];
  if (!current.trim()) return false;
  if (seeded === undefined) return true; // nothing seeded it — a person typed it
  return current.trim() !== seeded.trim();
}

export function customFieldCount(line: ConfiguratorLine): number {
  return line.components.filter(
    (c) => c.inScope && (isCustomValue(c, "material") || isCustomValue(c, "partNumber"))
  ).length;
}

// ---------------------------------------------------------------------------
// Draft construction
// ---------------------------------------------------------------------------

// Fills every applicable field from the CPQ reference. Defaults are
// SUGGESTIONS, not manufacturing history — `coordinatorEdited` records which
// ones a person subsequently changed.
export function applyReferenceDefaults(line: ConfiguratorLine): ConfiguratorLine {
  if (line.kind !== "ConfiguredAssembly") return line;
  const familyCode = line.family ?? "1196";
  const entry = line.size ? pumpSizeEntryFor(familyCode, line.size) : undefined;
  const caps = capabilitiesForFamily(familyCode);
  const edited = new Set(line.coordinatorEdited ?? []);
  const keep = <T,>(field: string, current: T, fallback: T): T =>
    edited.has(field) && current !== undefined && current !== "" ? current : fallback;

  const frame: string = keep("frame", line.frame, entry?.defaultFrame ?? line.frame ?? "") ?? "";
  const seal = sealDefaultsFor(familyCode);
  const shafts = shaftTypesFor(familyCode);
  const flanges = flangeOptionsFor(familyCode, line.size ?? "");

  return {
    ...line,
    frame,
    materialBuild: keep("materialBuild", line.materialBuild, entry?.defaultMoc ?? line.materialBuild ?? ""),
    fullTrim: entry?.fullImpellerTrim,
    // CPQ syncPumpDefaults: requested trim defaults to the full diameter.
    requestedTrim: keep(
      "requestedTrim",
      line.requestedTrim,
      entry?.fullImpellerTrim !== undefined ? String(entry.fullImpellerTrim) : ""
    ),
    flangeType: caps.choosesFlange
      ? keep("flangeType", line.flangeType, entry?.defaultFlange ?? flanges[0] ?? "")
      : undefined,
    sbcType: caps.choosesStuffingBoxCover ? keep("sbcType", line.sbcType, "STD BORE") : undefined,
    shaftType: caps.choosesShaftKit ? keep("shaftType", line.shaftType, shafts[0] ?? "") : undefined,
    // A family with its own seal configurator gets no generic default at all.
    sealArrangement: seal ? keep("sealArrangement", line.sealArrangement, seal.sealArrangement) : line.sealArrangement,
    sealMoc: seal ? keep("sealMoc", line.sealMoc, seal.sealMoc) : line.sealMoc,
    sealGlandMoc: seal ? keep("sealGlandMoc", line.sealGlandMoc, seal.sealGlandMoc) : line.sealGlandMoc,
    sealPlan: seal ? keep("sealPlan", line.sealPlan, seal.sealPlanOption) : line.sealPlan,
    sealManufacturer: seal ? keep("sealManufacturer", line.sealManufacturer, seal.sealManufacturer) : line.sealManufacturer,
    sealSize: sealSizeForFrame(familyCode, frame)
  };
}

export function newAssemblyLine(id: string, familyCode = "1196"): ConfiguratorLine {
  const sizes = pumpSizesFor(familyCode);
  const first = sizes[0];
  const size = first?.pumpSize ?? "";
  const materialBuild = first?.defaultMoc ?? "";
  const base: ConfiguratorLine = {
    id,
    kind: "ConfiguredAssembly",
    quantity: 1,
    description: size ? `${familyCode} ${size}` : familyCode,
    family: familyCode,
    size,
    frame: first?.defaultFrame ?? "",
    materialBuild,
    buildType: "BarePumpEnd",
    testingRequirements: [],
    coordinatorEdited: [],
    components: seedComponents(size, materialBuild, "BarePumpEnd", familyCode)
  };
  return applyReferenceDefaults(base);
}

// Marks a field as coordinator-entered so later re-defaulting leaves it alone.
export function markEdited(line: ConfiguratorLine, field: string): ConfiguratorLine {
  const edited = new Set(line.coordinatorEdited ?? []);
  edited.add(field);
  return { ...line, coordinatorEdited: [...edited] };
}

// CPQ clamps a requested trim to the full diameter rather than rejecting it.
export function clampTrim(line: ConfiguratorLine): ConfiguratorLine {
  const full = Number(line.fullTrim ?? 0);
  const requested = Number(line.requestedTrim ?? 0);
  if (full && requested > full) return { ...line, requestedTrim: String(full) };
  return line;
}

// Switching model rebuilds the line against the new family's catalogue — sizes
// and frames from one family are meaningless in another.
export function switchFamily(line: ConfiguratorLine, familyCode: string): ConfiguratorLine {
  if (line.kind !== "ConfiguredAssembly") return line;
  const rebuilt = newAssemblyLine(line.id, familyCode);
  return { ...rebuilt, quantity: line.quantity, notes: line.notes };
}

export function lineShape(line: ConfiguratorLine): FamilyShape {
  return familyShape(line.family ?? "1196");
}

export function newSpareLine(id: string): ConfiguratorLine {
  return { id, kind: "Spare", quantity: 1, description: "", components: [], partNumber: "", brand: "", notes: "" };
}

export function newItemLine(id: string): ConfiguratorLine {
  return { id, kind: "Item", quantity: 1, description: "", components: [], partNumber: "", brand: "", notes: "" };
}

// Re-seeds an assembly line after size/material/build-type changes, preserving
// anything the user already typed — changing build type must not wipe entered
// part numbers.
export function reseedAssembly(line: ConfiguratorLine): ConfiguratorLine {
  if (line.kind !== "ConfiguredAssembly") return line;
  const fresh = seedComponents(
    line.size ?? "",
    line.materialBuild ?? "",
    line.buildType ?? "BarePumpEnd",
    line.family ?? "1196"
  );
  const byKey = new Map(line.components.map((c) => [c.key, c]));
  const components = fresh.map((row) => {
    const existing = byKey.get(row.key);
    if (!existing) return row;
    return {
      ...row,
      partNumber: existing.partNumber,
      brand: existing.brand,
      reference: existing.reference,
      quantity: existing.quantity,
      notes: existing.notes || row.notes,
      inScope: existing.inScope,
      // Keep a typed-over material; otherwise take the newly seeded one.
      material: isCustomValue(existing, "material") ? existing.material : row.material
    };
  });
  return { ...line, components };
}

// ---------------------------------------------------------------------------
// Validation — deliberately light. This is internal: it blocks only what would
// produce an unusable work order, not everything the CPQ would reject.
// ---------------------------------------------------------------------------

export interface DraftValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateDraft(draft: ConfiguratorDraft, existingOrderNumbers: string[]): DraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!draft.orderNumber.trim()) errors.push("Order number is required");
  else if (existingOrderNumbers.includes(draft.orderNumber.trim())) {
    errors.push(`Order ${draft.orderNumber.trim()} already exists`);
  }
  if (!draft.customerId) errors.push("Customer is required");
  if (!draft.dueDate) errors.push("Due date is required");
  if (draft.lines.length === 0) errors.push("Add at least one line");

  draft.lines.forEach((line, i) => {
    const at = `Line ${i + 1}`;
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      errors.push(`${at}: quantity must be a whole number of at least 1`);
    }
    if (line.kind === "ConfiguredAssembly") {
      if (!line.size?.trim()) errors.push(`${at}: size is required`);
      if (!line.frame?.trim()) errors.push(`${at}: frame is required`);
      if (!line.materialBuild?.trim()) errors.push(`${at}: material build is required`);

      // Warn, never block, when a frame is outside the size's catalogue set —
      // internal builders legitimately do this and record why.
      const options = line.size ? materialOptionsFor(line.family ?? "1196", line.size) : null;
      if (options && line.materialBuild && !options.options.includes(line.materialBuild)) {
        warnings.push(`${at}: material "${line.materialBuild}" is outside the catalogue options for ${line.size}`);
      }
      const custom = customFieldCount(line);
      if (custom > 0) {
        warnings.push(`${at}: ${custom} component field(s) entered manually — review before release`);
      }
      const seal = line.components.find((c) => c.key === "seal");
      if (seal?.inScope && !seal.partNumber.trim() && !seal.reference.trim()) {
        warnings.push(`${at}: no seal number or part number recorded`);
      }
    } else {
      if (!line.description.trim()) errors.push(`${at}: description is required`);
      if (!line.partNumber?.trim()) {
        warnings.push(`${at}: no part number recorded`);
      }
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

// A short human summary of a line, for the order list and the review step.
export function summarizeLine(line: ConfiguratorLine): string {
  if (line.kind === "ConfiguredAssembly") {
    const bits = [line.family, line.size, line.frame, line.materialBuild].filter(Boolean);
    const build = line.buildType === "CompletePackage" ? "complete package" : "bare pump end";
    return `${bits.join(" ")} — ${build}`;
  }
  const bits = [line.brand, line.partNumber].filter((b) => b && b.trim());
  return bits.length > 0 ? `${line.description} (${bits.join(" ")})` : line.description;
}


// ---------------------------------------------------------------------------
// Coordinator-added scope
// ---------------------------------------------------------------------------

let customRowSeq = 0;

/** Adds a blank, fully editable component row to the line's BOM. Used for
 *  anything the family template does not know about — a special fitting, an
 *  extra gasket set, a customer-supplied part to be received. */
export function addCustomComponent(line: ConfiguratorLine, label = ""): ConfiguratorLine {
  const entry: ComponentEntry = {
    key: `custom-${++customRowSeq}`,
    label,
    partNumber: "",
    brand: "",
    material: "",
    reference: "",
    referenceLabel: "Reference",
    quantity: 1,
    notes: "",
    inScope: true,
    isCustomRow: true
  };
  return { ...line, components: [...line.components, entry] };
}

export function removeComponent(line: ConfiguratorLine, key: string): ConfiguratorLine {
  return { ...line, components: line.components.filter((c) => c.key !== key) };
}

/** Adds a special/other testing requirement. Trimmed, de-duplicated, and
 *  itemized on the work order exactly like a catalogue test scope. */
export function addTestingRequirement(line: ConfiguratorLine, text: string): ConfiguratorLine {
  const value = text.trim();
  if (!value) return line;
  const existing = line.testingRequirements ?? [];
  if (existing.includes(value)) return line;
  return { ...line, testingRequirements: [...existing, value] };
}

export function removeTestingRequirement(line: ConfiguratorLine, text: string): ConfiguratorLine {
  return { ...line, testingRequirements: (line.testingRequirements ?? []).filter((t) => t !== text) };
}
