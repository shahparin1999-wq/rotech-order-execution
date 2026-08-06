// Package and component-scope defaults, ported from the CPQ at HEAD 6b62b0bc
// (`createLineItem` and `syncPackageState`).
//
// The configurator was harder to use than the CPQ for one concrete reason: the
// CPQ plugs in a named default for every package component and DERIVES each
// component's scope from the package selection, whereas we left them blank and
// offered a bare "in scope" checkbox. A coordinator was typing things the
// catalogue already knew.
//
// Scope is the important half. "In scope" alone cannot distinguish "Rotech
// buys it", "the customer sends it" and "somebody else entirely" — and that
// distinction decides whether a purchase demand is created at all. Getting it
// wrong either orders something twice or waits forever for a part nobody
// ordered.
//
// PURE DOMAIN — no React, no localStorage.

import { capabilitiesForFamily } from "./familyShapes";

// CPQ cpq-catalog.json → scopeOptions.selectionMode
export const SELECTION_MODES = [
  "not-included",
  "standard",
  "customer-supplied",
  "custom",
  "special"
] as const;
export type SelectionMode = (typeof SELECTION_MODES)[number];

// CPQ cpq-catalog.json → scopeOptions.responsibility
export const RESPONSIBILITIES = ["in-scope", "by-others"] as const;
export type Responsibility = (typeof RESPONSIBILITIES)[number];

export const SELECTION_MODE_LABELS: Record<SelectionMode, string> = {
  "not-included": "Not included",
  standard: "Standard",
  "customer-supplied": "Customer supplied",
  custom: "Custom",
  special: "Special"
};

// ---------------------------------------------------------------------------
// Named defaults — CPQ createLineItem.packageConfiguration
// ---------------------------------------------------------------------------

export const PACKAGE_DEFAULTS = {
  baseplateType: "Rotech Standard Bent Channel - Mild Steel",
  couplingType: "TB Woods Sure-Flex EPDM Spacer",
  couplingGuardType: "Aluminum Non-Spark Coupling Guard - Barrel Style",
  motorManufacturer: "ROTECH CHOICE",
  motorType: "NEMA",
  motorMountingStandard: "NEMA",
  // CPQ ANSI_STANDARD_NEMA_MOTOR_OPTION (app.js:176)
  motorStandard: "C1D2 PREMIUM EFFICIENCY TEFC",
  driveType: "DIRECT DRIVE"
} as const;

// CPQ replaces these rather than hiding them, so the work order shows WHY there
// is no baseplate on a close-coupled pump instead of silently omitting it.
export const NOT_APPLICABLE_CLOSE_COUPLED = "Not applicable - close coupled";

export interface PackageConfiguration {
  baseplateType: string;
  couplingType: string;
  couplingGuardType: string;
  motorManufacturer: string;
  motorType: string;
  motorMountingStandard: string;
  motorStandard: string;
  driveType: string;
  motorHp: string;
  motorSpeed: string;
  motorVoltage: string;
  motorFrame: string;
  motorEnclosure: string;
}

export interface PackageDefaultsInput {
  familyCode: string;
  buildType: "BarePumpEnd" | "CompletePackage";
  /** The size's defaultMotorHp from the pinned catalogue, when it has one. */
  defaultMotorHp?: number;
  /** Existing values are preserved — defaults never overwrite an entry. */
  current?: Partial<PackageConfiguration>;
}

/**
 * Fills the package block the way CPQ does, without overwriting anything a
 * coordinator already set.
 */
export function packageDefaultsFor(input: PackageDefaultsInput): PackageConfiguration {
  const caps = capabilitiesForFamily(input.familyCode);
  const current = input.current ?? {};
  const keep = (value: string | undefined, fallback: string) =>
    value !== undefined && value !== "" ? value : fallback;

  // A close-coupled pump bolts straight to the motor: there is no baseplate and
  // no coupling, and saying so is more useful than a blank field.
  const closeCoupled = caps.closeCoupled;

  return {
    baseplateType: keep(
      current.baseplateType,
      closeCoupled ? NOT_APPLICABLE_CLOSE_COUPLED : PACKAGE_DEFAULTS.baseplateType
    ),
    couplingType: keep(
      current.couplingType,
      closeCoupled ? NOT_APPLICABLE_CLOSE_COUPLED : PACKAGE_DEFAULTS.couplingType
    ),
    couplingGuardType: keep(
      current.couplingGuardType,
      closeCoupled ? NOT_APPLICABLE_CLOSE_COUPLED : PACKAGE_DEFAULTS.couplingGuardType
    ),
    motorManufacturer: keep(current.motorManufacturer, PACKAGE_DEFAULTS.motorManufacturer),
    motorType: keep(current.motorType, PACKAGE_DEFAULTS.motorType),
    motorMountingStandard: keep(current.motorMountingStandard, PACKAGE_DEFAULTS.motorMountingStandard),
    motorStandard: keep(current.motorStandard, PACKAGE_DEFAULTS.motorStandard),
    // Belt-driven families are not direct drive by default.
    driveType: keep(current.driveType, caps.supportsBeltDrive ? "" : PACKAGE_DEFAULTS.driveType),
    // The catalogue already carries a default HP per size and we were ignoring it.
    motorHp: keep(
      current.motorHp,
      input.buildType === "CompletePackage" && input.defaultMotorHp !== undefined
        ? String(input.defaultMotorHp)
        : ""
    ),
    motorSpeed: keep(current.motorSpeed, ""),
    motorVoltage: keep(current.motorVoltage, ""),
    motorFrame: keep(current.motorFrame, ""),
    motorEnclosure: keep(current.motorEnclosure, "")
  };
}

// ---------------------------------------------------------------------------
// Component scope — CPQ syncPackageState
// ---------------------------------------------------------------------------

export interface ComponentScope {
  selectionMode: SelectionMode;
  responsibility: Responsibility;
}

const PACKAGE_COMPONENT_KEYS = ["baseplate", "coupling", "couplingGuard", "motor", "accessories"];

/**
 * The default scope for one component, derived the way CPQ derives it.
 *
 * Wet-end parts are always Rotech's. Package parts are standard and in scope
 * for a complete package, and not included for a bare pump end. The motor is
 * the exception CPQ treats specially: it is included in a package but is
 * frequently the customer's, so it defaults to standard/in-scope and is the
 * field most often changed.
 */
export function defaultComponentScope(
  familyCode: string,
  componentKey: string,
  buildType: "BarePumpEnd" | "CompletePackage"
): ComponentScope {
  const caps = capabilitiesForFamily(familyCode);

  // A close-coupled pump has no baseplate, coupling or guard at all.
  if (caps.closeCoupled && ["baseplate", "coupling", "couplingGuard"].includes(componentKey)) {
    return { selectionMode: "not-included", responsibility: "by-others" };
  }

  if (PACKAGE_COMPONENT_KEYS.includes(componentKey)) {
    if (buildType !== "CompletePackage") {
      // CPQ: a bare pump end leaves the package by others.
      return { selectionMode: "not-included", responsibility: "by-others" };
    }
    // Accessories stay off until somebody asks for them, so an unselected
    // accessory creates no work (R-1196-016).
    if (componentKey === "accessories") {
      return { selectionMode: "not-included", responsibility: "by-others" };
    }
    return { selectionMode: "standard", responsibility: "in-scope" };
  }

  // Wet end and power end are always Rotech's to supply.
  return { selectionMode: "standard", responsibility: "in-scope" };
}

/**
 * The single question the ledger actually needs answered: does this component
 * create a purchasing demand?
 *
 * Customer-supplied and by-others create receipt/verification work but no
 * purchase demand (INV-006). Not-included creates nothing at all (INV-007).
 * This replaces the previous text-matching heuristic on the brand field, which
 * could only guess.
 */
export function createsPurchaseDemand(scope: ComponentScope): boolean {
  if (scope.selectionMode === "not-included") return false;
  if (scope.selectionMode === "customer-supplied") return false;
  return scope.responsibility === "in-scope";
}

/** Customer-supplied items still need receiving and verification work. */
export function createsReceiptExpectation(scope: ComponentScope): boolean {
  return scope.selectionMode === "customer-supplied";
}

/** Not-included components create nothing — no demand, no receipt, no exception. */
export function isOutOfScope(scope: ComponentScope): boolean {
  return scope.selectionMode === "not-included";
}

/** A selection a coordinator made that needs review before release. */
export function needsReview(scope: ComponentScope): boolean {
  return scope.selectionMode === "custom" || scope.selectionMode === "special";
}
