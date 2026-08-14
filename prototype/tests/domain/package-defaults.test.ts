// CPQ default parity. The configurator was harder to use than the CPQ because
// it left blank what the CPQ fills in; these pin the values so a regression is
// visible rather than merely annoying.

import { describe, expect, it } from "vitest";
import {
  createsPurchaseDemand,
  createsReceiptExpectation,
  defaultComponentScope,
  isOutOfScope,
  needsReview,
  NOT_APPLICABLE_CLOSE_COUPLED,
  PACKAGE_DEFAULTS,
  packageDefaultsFor
} from "@/domain/packageDefaults";
import { applyReferenceDefaults, newAssemblyLine, reseedAssembly } from "@/domain/configurator";
import { pumpSizeEntryFor } from "@/domain/model1196";

describe("Named package defaults match CPQ", () => {
  it("fills baseplate, coupling, guard, motor and drive type", () => {
    const cfg = packageDefaultsFor({ familyCode: "1196", buildType: "CompletePackage" });
    expect(cfg.baseplateType).toBe("Rotech Standard Bent Channel - Mild Steel");
    expect(cfg.couplingType).toBe("TB Woods Sure-Flex EPDM Spacer");
    expect(cfg.couplingGuardType).toBe("Aluminum Non-Spark Coupling Guard - Barrel Style");
    expect(cfg.motorManufacturer).toBe("ROTECH CHOICE");
    expect(cfg.motorType).toBe("NEMA");
    expect(cfg.motorStandard).toBe("C1D2 PREMIUM EFFICIENCY TEFC");
    expect(cfg.driveType).toBe("DIRECT DRIVE");
  });

  it("takes motor HP from the size, which the catalogue already carried", () => {
    const entry = pumpSizeEntryFor("1196", "3X4-13")!;
    expect(entry.defaultMotorHp).toBeGreaterThan(0);
    const cfg = packageDefaultsFor({
      familyCode: "1196", buildType: "CompletePackage", defaultMotorHp: entry.defaultMotorHp
    });
    expect(cfg.motorHp).toBe(String(entry.defaultMotorHp));
  });

  it("leaves motor HP blank on a bare pump end — there is no motor", () => {
    const cfg = packageDefaultsFor({ familyCode: "1196", buildType: "BarePumpEnd", defaultMotorHp: 200 });
    expect(cfg.motorHp).toBe("");
  });

  it("never overwrites something already entered", () => {
    const cfg = packageDefaultsFor({
      familyCode: "1196", buildType: "CompletePackage",
      current: { couplingType: "Falk Steelflex", motorManufacturer: "WEG" }
    });
    expect(cfg.couplingType).toBe("Falk Steelflex");
    expect(cfg.motorManufacturer).toBe("WEG");
    // Untouched fields still default.
    expect(cfg.baseplateType).toBe(PACKAGE_DEFAULTS.baseplateType);
  });

  it("says why a close-coupled pump has no baseplate rather than leaving it blank", () => {
    const cfg = packageDefaultsFor({ familyCode: "1296", buildType: "CompletePackage" });
    expect(cfg.baseplateType).toBe(NOT_APPLICABLE_CLOSE_COUPLED);
    expect(cfg.couplingType).toBe(NOT_APPLICABLE_CLOSE_COUPLED);
  });

  it("does not assume direct drive for a belt-driven family", () => {
    expect(packageDefaultsFor({ familyCode: "SXT", buildType: "CompletePackage" }).driveType).toBe("");
  });
});

describe("Component scope is derived the way CPQ derives it", () => {
  it("keeps the wet end in scope always", () => {
    for (const key of ["casing", "impeller", "stuffingBoxCover", "shaftKit", "seal"]) {
      const scope = defaultComponentScope("1196", key, "BarePumpEnd");
      expect(scope.selectionMode).toBe("standard");
      expect(scope.responsibility).toBe("in-scope");
    }
  });

  it("leaves the package by others on a bare pump end", () => {
    for (const key of ["baseplate", "coupling", "couplingGuard", "motor"]) {
      const scope = defaultComponentScope("1196", key, "BarePumpEnd");
      expect(scope.selectionMode).toBe("not-included");
      expect(scope.responsibility).toBe("by-others");
    }
  });

  it("brings the package in scope for a complete package", () => {
    for (const key of ["baseplate", "coupling", "couplingGuard", "motor"]) {
      const scope = defaultComponentScope("1196", key, "CompletePackage");
      expect(scope.selectionMode).toBe("standard");
      expect(scope.responsibility).toBe("in-scope");
    }
  });

  it("a close-coupled pump has no baseplate, coupling or guard even in a package", () => {
    for (const key of ["baseplate", "coupling", "couplingGuard"]) {
      expect(defaultComponentScope("1296", key, "CompletePackage").selectionMode).toBe("not-included");
    }
    // It still has a motor.
    expect(defaultComponentScope("1296", "motor", "CompletePackage").selectionMode).toBe("standard");
  });

  it("accessories stay off until asked for", () => {
    expect(defaultComponentScope("1196", "accessories", "CompletePackage").selectionMode).toBe("not-included");
  });
});

describe("Scope decides what work is created", () => {
  it("standard + in-scope creates a purchase demand", () => {
    const scope = { selectionMode: "standard" as const, responsibility: "in-scope" as const };
    expect(createsPurchaseDemand(scope)).toBe(true);
    expect(createsReceiptExpectation(scope)).toBe(false);
    expect(isOutOfScope(scope)).toBe(false);
  });

  it("customer-supplied creates receipt work and NO purchase demand (INV-006)", () => {
    const scope = { selectionMode: "customer-supplied" as const, responsibility: "in-scope" as const };
    expect(createsPurchaseDemand(scope)).toBe(false);
    expect(createsReceiptExpectation(scope)).toBe(true);
  });

  it("by-others creates neither", () => {
    const scope = { selectionMode: "standard" as const, responsibility: "by-others" as const };
    expect(createsPurchaseDemand(scope)).toBe(false);
    expect(createsReceiptExpectation(scope)).toBe(false);
  });

  it("not-included creates nothing at all (INV-007)", () => {
    const scope = { selectionMode: "not-included" as const, responsibility: "by-others" as const };
    expect(isOutOfScope(scope)).toBe(true);
    expect(createsPurchaseDemand(scope)).toBe(false);
  });

  it("custom and special are flagged for review", () => {
    expect(needsReview({ selectionMode: "custom", responsibility: "in-scope" })).toBe(true);
    expect(needsReview({ selectionMode: "special", responsibility: "in-scope" })).toBe(true);
    expect(needsReview({ selectionMode: "standard", responsibility: "in-scope" })).toBe(false);
  });
});

describe("The configurator applies all of it", () => {
  it("a new line already arrives with the package block filled", () => {
    // Nothing here needs typing: newAssemblyLine runs applyReferenceDefaults.
    const line = newAssemblyLine("l1", "1196");
    expect(line.packageConfig?.baseplateType).toBe(PACKAGE_DEFAULTS.baseplateType);
    expect(line.packageConfig?.couplingType).toBe(PACKAGE_DEFAULTS.couplingType);
    expect(line.packageConfig?.motorManufacturer).toBe("ROTECH CHOICE");
  });

  it("a close-coupled line explains the missing baseplate", () => {
    const line = newAssemblyLine("cc", "1296");
    expect(line.packageConfig?.baseplateType).toBe(NOT_APPLICABLE_CLOSE_COUPLED);
  });

  it("a bare pump end marks package rows not-included, so they create no demand", () => {
    const line = newAssemblyLine("l1", "1196");
    // Package rows are absent entirely on a bare pump end.
    expect(line.components.some((c) => c.key === "motor")).toBe(false);
    // Everything present is in scope.
    expect(line.components.filter((c) => c.inScope).length).toBeGreaterThan(0);
  });

  it("a complete package puts accessories out of scope and the rest in", () => {
    const line = reseedAssembly({ ...newAssemblyLine("l1", "1196"), buildType: "CompletePackage" });
    const accessories = line.components.find((c) => c.key === "accessories")!;
    expect(accessories.selectionMode).toBe("not-included");
    expect(accessories.inScope).toBe(false);

    const motor = line.components.find((c) => c.key === "motor")!;
    expect(motor.selectionMode).toBe("standard");
    expect(motor.responsibility).toBe("in-scope");
  });
});

describe("Switching to a complete package fills the motor HP", () => {
  it("re-derives the package block, taking HP from the size", () => {
    const bare = newAssemblyLine("l1", "1196");
    expect(bare.packageConfig?.motorHp).toBe(""); // no motor on a bare pump end

    const entry = pumpSizeEntryFor("1196", bare.size!)!;
    const asPackage = applyReferenceDefaults({ ...bare, buildType: "CompletePackage" });
    expect(asPackage.packageConfig?.motorHp).toBe(String(entry.defaultMotorHp));
  });

  it("does not clobber an HP the coordinator typed", () => {
    let line = applyReferenceDefaults({ ...newAssemblyLine("l1", "1196"), buildType: "CompletePackage" });
    line = { ...line, packageConfig: { ...line.packageConfig!, motorHp: "250" } };
    expect(applyReferenceDefaults(line).packageConfig?.motorHp).toBe("250");
  });
});
