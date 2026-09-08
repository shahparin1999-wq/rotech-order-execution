// CPQ order-handoff (v2) line → ExecutionRequirements.
//
// This is the link the quote-to-shortage chain was missing: a CPQ-imported
// order previously created Units and a descriptive working BOM but no
// requirements, so nothing downstream (availability, attention, readiness,
// receiving) had anything to match against.
//
// What generates demand is the CONFIGURATION — what the pump is (size, frame,
// materials, seal, package selection modes) — not the browser-generated
// technical BOM rows. Those rows arrive labelled `procurementAuthority: false`
// and seed the editable working BOM only. Deriving demand from them would make
// an unversioned browser template the procurement authority, which the owner
// has explicitly ruled out until it is server-owned and versioned.
//
// Scoping follows the ledger rule: physical parts and per-pump tests are
// Unit-scoped; a package drawing is Line-scoped (one approval governs every
// Unit). Selection modes decide the fulfilment path exactly as the internal
// configurator does: customer-supplied creates a receipt expectation and no
// purchase; by-others / not-included creates nothing.
//
// PURE DOMAIN — no React, no localStorage, no ambient clock.

import type { HandoffLine } from "../orderHandoffV2";
import type { ExecutionRequirement, FulfillmentRecord } from "./requirement";

export interface HandoffRequirementInput {
  executionOrderId: string;
  lineId: string;
  lineNumber: number;
  line: HandoffLine;
  /** Units this line generated; empty for a non-unit-bearing line. */
  unitIds: string[];
  /** The frozen snapshot the requirements are traced to. */
  snapshotId: string;
  createdAt: string;
  /** Optional need-by (ISO date) — the committed date the coordinator entered. */
  needBy?: string;
  /** Deterministic id prefix so tests are stable. */
  idPrefix?: string;
}

export interface GeneratedHandoffLedger {
  requirements: ExecutionRequirement[];
  fulfillments: FulfillmentRecord[];
  /** Human-readable reasons a component was NOT turned into demand (visible, never silent). */
  skipped: Array<{ componentKey: string; reason: string }>;
}

export interface DerivedComponent {
  key: string;
  label: string;
  material?: string;
  /** Where in the frozen snapshot this component came from. */
  sourcePath: string;
  selectionMode: string;
  responsibility: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" ? String(v) : undefined;
}

function block(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** "DI/316SS" → { casing: "DI", impeller: "316SS" }; a single value applies to both. */
export function splitMaterialBuild(materialBuild: string | undefined): { casing?: string; impeller?: string } {
  if (!materialBuild) return {};
  const [casing, impeller] = materialBuild.split("/").map((s) => s.trim());
  return { casing: casing || undefined, impeller: impeller || casing || undefined };
}

/**
 * The components a configured line REQUIRES, derived from configuration
 * blocks only. Each carries the snapshot path it was derived from so a
 * requirement can always explain itself.
 */
export function componentsFromHandoffLine(line: HandoffLine): DerivedComponent[] {
  const out: DerivedComponent[] = [];
  const pumpBuild = block(line.pumpBuild);
  const overrides = block(pumpBuild.technicalOverrides);
  const packageBuild = block(line.packageBuild);
  const seal = block(line.seal);

  const pumpSize = str(pumpBuild.pumpSize) ?? str(block(line.product).pumpSize);
  const frame = str(pumpBuild.frameSize);
  const sizeFrame = [pumpSize, frame].filter(Boolean).join(" ");
  const build = splitMaterialBuild(str(pumpBuild.materialBuild));
  const casingMaterial = str(overrides.casing) ?? build.casing;
  const impellerMaterial = str(overrides.impeller) ?? build.impeller;
  const shaftType = str(overrides.shaft) ?? str(pumpBuild.shaftType);

  const rotech = { selectionMode: "standard", responsibility: "in-scope" };

  if (pumpSize || frame) {
    out.push({ key: "casing", label: `Casing ${sizeFrame}`.trim(), material: casingMaterial, sourcePath: "pumpBuild.materialBuild", ...rotech });
    out.push({ key: "impeller", label: `Impeller ${sizeFrame}`.trim(), material: impellerMaterial, sourcePath: "pumpBuild.materialBuild", ...rotech });
    out.push({ key: "stuffingBoxCover", label: `Stuffing box cover ${sizeFrame}`.trim(), material: casingMaterial, sourcePath: "pumpBuild.sbcType", ...rotech });
    out.push({ key: "shaftKit", label: `Shaft kit ${frame ?? ""}`.trim(), material: shaftType, sourcePath: "pumpBuild.shaftType", ...rotech });
    out.push({ key: "powerFrame", label: `Power frame ${frame ?? ""}`.trim(), sourcePath: "pumpBuild.frameSize", ...rotech });
  }

  const sealOption = (str(seal.sealOption) ?? "").toUpperCase();
  if (sealOption && sealOption !== "NO SEAL") {
    const customerSeal = sealOption.includes("CUSTOMER");
    out.push({
      key: "seal",
      label: `Mechanical seal${str(seal.sealArrangement) ? ` (${str(seal.sealArrangement)})` : ""}`,
      material: str(seal.sealMoc),
      sourcePath: "seal.sealOption",
      selectionMode: customerSeal ? "customer-supplied" : "standard",
      responsibility: "in-scope"
    });
  }

  for (const [key, label, sourcePath] of [
    ["motor", "Motor", "packageBuild.motor"],
    ["baseplate", "Baseplate", "packageBuild.baseplate"],
    ["coupling", "Coupling", "packageBuild.coupling"],
    ["couplingGuard", "Coupling guard", "packageBuild.couplingGuard"]
  ] as const) {
    const component = block(packageBuild[key]);
    const selectionMode = str(component.selectionMode) ?? "not-included";
    const responsibility = str(component.responsibility) ?? (selectionMode === "not-included" ? "by-others" : "in-scope");
    const detail = [str(component.hp) ? `${str(component.hp)} HP` : undefined, str(component.frame), str(component.type), str(component.enclosure)]
      .filter(Boolean)
      .join(" ");
    out.push({
      key,
      label: detail ? `${label} ${detail}` : label,
      material: str(component.material),
      sourcePath,
      selectionMode,
      responsibility
    });
  }
  return out;
}

/** Does this component create demand, a receipt expectation, or nothing? */
export function demandKind(component: Pick<DerivedComponent, "selectionMode" | "responsibility">): "purchase" | "receipt" | "none" {
  if (component.selectionMode === "not-included") return "none";
  if (component.responsibility === "by-others") return "none";
  if (component.selectionMode === "customer-supplied") return "receipt";
  return "purchase";
}

// Accountable OWNER, not execution assignee (same discipline as fromConfigurator).
const OWNER_BY_COMPONENT: Record<string, string> = {
  casing: "Purchasing",
  impeller: "Purchasing",
  stuffingBoxCover: "Purchasing",
  shaftKit: "Purchasing",
  powerFrame: "Purchasing",
  seal: "Purchasing",
  motor: "Purchasing",
  baseplate: "Purchasing",
  coupling: "Purchasing",
  couplingGuard: "Purchasing"
};

function idFactory(prefix: string) {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${String(n).padStart(3, "0")}`;
  };
}

/** Description format the ledger parses back: "Label — material". No part
 * number: the CPQ component codes are browser-derived reference only. */
export function requirementDescription(component: DerivedComponent): string {
  return component.material ? `${component.label} — ${component.material}` : component.label;
}

export function requirementsFromHandoffLine(input: HandoffRequirementInput): GeneratedHandoffLedger {
  const { executionOrderId, lineId, line, unitIds, snapshotId, createdAt } = input;
  const nextReqId = idFactory(input.idPrefix ?? `REQ-${lineId}`);
  const nextFulId = idFactory(`FUL-${lineId}`);
  const requirements: ExecutionRequirement[] = [];
  const fulfillments: FulfillmentRecord[] = [];
  const skipped: GeneratedHandoffLedger["skipped"] = [];

  if (line.executionDisposition !== "unit-bearing") {
    return { requirements, fulfillments, skipped };
  }

  const components = componentsFromHandoffLine(line);
  const sourceRef = (path: string) => `cfgsnap:${snapshotId}#${path}`;

  for (const unitId of unitIds) {
    for (const component of components) {
      const kind = demandKind(component);
      if (kind === "none") {
        if (unitId === unitIds[0]) {
          skipped.push({
            componentKey: component.key,
            reason: component.selectionMode === "not-included" ? "not included in scope" : "by others — not a Rotech deliverable"
          });
        }
        continue;
      }
      const requirement: ExecutionRequirement = {
        id: nextReqId(),
        executionOrderId,
        lineId,
        unitId,
        componentId: `${unitId}-${component.key}`,
        category: "Component",
        source: "CpqConfiguration",
        sourceRef: sourceRef(component.sourcePath),
        description: requirementDescription(component),
        mandatory: true,
        blocksWork: true,
        blocksRelease: true,
        accountableOwnerType: "Department",
        accountableOwnerId: kind === "receipt" ? "Receiving" : OWNER_BY_COMPONENT[component.key] ?? "Purchasing",
        needBy: input.needBy,
        status: "Unplanned",
        fulfillmentRefs: [],
        createdAt
      };
      requirements.push(requirement);
      if (kind === "receipt") {
        const fulfillment: FulfillmentRecord = {
          id: nextFulId(),
          requirementId: requirement.id,
          kind: "Receipt",
          ref: `customer-supplied:${component.key}`,
          status: "Open",
          recordedBy: "CPQ",
          recordedAt: createdAt
        };
        fulfillments.push(fulfillment);
        requirement.fulfillmentRefs.push(fulfillment.id);
        requirement.status = "Planned";
      }
    }

    for (const test of line.testingRequirements ?? []) {
      requirements.push({
        id: nextReqId(),
        executionOrderId,
        lineId,
        unitId,
        category: "Test",
        source: "CpqConfiguration",
        sourceRef: sourceRef("testingRequirements"),
        description: test,
        mandatory: true,
        blocksRelease: true,
        accountableOwnerType: "Department",
        accountableOwnerId: "Quality",
        needBy: input.needBy,
        status: "Unplanned",
        fulfillmentRefs: [],
        createdAt
      });
    }
  }

  const packageBuild = block(line.packageBuild);
  if (packageBuild.completePackage === true || line.lineType === "pump-package") {
    requirements.push({
      id: nextReqId(),
      executionOrderId,
      lineId,
      category: "Drawing",
      source: "CpqConfiguration",
      sourceRef: sourceRef("packageBuild"),
      description: "Approved package/baseplate drawing",
      mandatory: true,
      blocksWork: true,
      accountableOwnerType: "Department",
      accountableOwnerId: "Engineering",
      needBy: input.needBy,
      status: "Unplanned",
      fulfillmentRefs: [],
      createdAt
    });
  }

  return { requirements, fulfillments, skipped };
}
