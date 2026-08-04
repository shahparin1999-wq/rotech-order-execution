// Internal configurator: multi-line drafts, free-text component entry, and the
// custom-value marking that keeps hand-typed data reviewable.

import { describe, expect, it } from "vitest";
import { buildInitialState, CUSTOMER_ACME } from "@/domain/fixtures";
import { createConfiguredOrder } from "@/domain/actions";
import {
  applyReferenceDefaults,
  clampTrim,
  customFieldCount,
  markEdited,
  isCustomValue,
  newAssemblyLine,
  newItemLine,
  newSpareLine,
  reseedAssembly,
  seedComponents,
  summarizeLine,
  switchFamily,
  validateDraft,
  type ConfiguratorDraft
} from "@/domain/configurator";
import {
  catalogueFamilies,
  catalogueProvenance,
  commonOptions,
  componentMaterialOptionsFor,
  sealArrangements,
  sealArrangementOptionsFor,
  sealDefaultsFor,
  sealGlandMocOptions,
  sealPlans,
  sealSizeForFrame,
  testingAdders
} from "@/domain/model1196";

function draft(overrides: Partial<ConfiguratorDraft> = {}): ConfiguratorDraft {
  return {
    orderNumber: "CFG-001",
    customerId: CUSTOMER_ACME,
    customerPo: "PO-CFG",
    description: "Configured order",
    facility: "Mississauga",
    coordinatorId: "e-sarah",
    priority: "Medium",
    dueDate: "2026-09-30",
    lines: [newAssemblyLine("l1")],
    ...overrides
  };
}

describe("Component seeding", () => {
  it("decodes the material build into each component's OWN material", () => {
    // A build is a paired code, never a component material. "316SS/316SS"
    // decodes to 316SS on both the casing and the impeller.
    const rows = seedComponents("3X4-13", "316SS/316SS", "BarePumpEnd");
    expect(rows.find((r) => r.key === "casing")!.material).toBe("316SS");
    expect(rows.find((r) => r.key === "impeller")!.material).toBe("316SS");
    // The catalogue does not decide the seal — left for the builder.
    expect(rows.find((r) => r.key === "seal")!.material).toBe("");
    expect(rows.find((r) => r.key === "seal")!.partNumber).toBe("");
  });

  it("splits a DI/316SS build the way the shop actually builds it", () => {
    // Casing and stuffing-box cover ductile iron; impeller 316SS, because that
    // is the base impeller material for ANSI product.
    const rows = seedComponents("3X4-13", "DI/316SS", "BarePumpEnd");
    expect(rows.find((r) => r.key === "casing")!.material).toBe("Ductile Iron");
    expect(rows.find((r) => r.key === "stuffingBoxCover")!.material).toBe("Ductile Iron");
    expect(rows.find((r) => r.key === "impeller")!.material).toBe("316SS");
    // No row ever carries the paired build code itself.
    expect(rows.every((r) => !r.material.includes("/"))).toBe(true);
  });

  it("honours the 1196 override that puts a ductile-iron cover on a CS build", () => {
    const rows = seedComponents("4X6-10H", "CS/316SS", "BarePumpEnd");
    expect(rows.find((r) => r.key === "casing")!.material).toBe("Carbon Steel");
    expect(rows.find((r) => r.key === "impeller")!.material).toBe("316SS");
    expect(rows.find((r) => r.key === "stuffingBoxCover")!.material).toBe("Ductile Iron");
  });

  it("defaults the power frame to Rotech's standard ductile iron base", () => {
    const rows = seedComponents("3X4-13", "DI/316SS", "BarePumpEnd");
    expect(rows.find((r) => r.key === "powerFrame")!.material).toBe("Ductile Iron");
  });

  it("offers each component its own material options, not the build list", () => {
    const casing = componentMaterialOptionsFor("1196", "casing");
    expect(casing).toContain("Ductile Iron");
    expect(casing).toContain("316SS");
    expect(casing).toContain("CD4MCU");
    // A single component can be upgraded on its own.
    expect(casing.every((m) => !m.includes("/"))).toBe(true);

    // Seal and gland take their own vocabulary, not the wet-end materials.
    expect(componentMaterialOptionsFor("1196", "sealGland")).toEqual(sealGlandMocOptions());
    expect(componentMaterialOptionsFor("1196", "seal").length).toBeGreaterThan(0);
    expect(componentMaterialOptionsFor("1196", "shaftKit")).toContain("4140/316SS SLEEVED SHAFT");
  });

  it("adds package rows only for a complete package", () => {
    const bare = seedComponents("3X4-13", "316SS/316SS", "BarePumpEnd").map((r) => r.key);
    const pkg = seedComponents("3X4-13", "316SS/316SS", "CompletePackage").map((r) => r.key);
    expect(bare).not.toContain("motor");
    expect(pkg).toContain("motor");
    expect(pkg).toContain("baseplate");
    expect(pkg).toContain("coupling");
  });

  it("defaults accessories out of scope so an unselected item creates no work", () => {
    const rows = seedComponents("3X4-13", "316SS/316SS", "CompletePackage");
    expect(rows.find((r) => r.key === "accessories")!.inScope).toBe(false);
  });

  it("labels the seal reference field as a seal number", () => {
    const seal = seedComponents("3X4-13", "316SS/316SS", "BarePumpEnd").find((r) => r.key === "seal")!;
    expect(seal.referenceLabel).toBe("Seal number");
  });
});

describe("Custom value marking", () => {
  it("marks a material typed over the seeded catalogue value", () => {
    const rows = seedComponents("3X4-13", "316SS/316SS", "BarePumpEnd");
    const casing = rows.find((r) => r.key === "casing")!;
    expect(isCustomValue(casing, "material")).toBe(false);
    expect(isCustomValue({ ...casing, material: "CD4MCU" }, "material")).toBe(true);
  });

  it("marks any part number as custom — nothing seeds it", () => {
    const rows = seedComponents("3X4-13", "316SS/316SS", "BarePumpEnd");
    const seal = rows.find((r) => r.key === "seal")!;
    expect(isCustomValue({ ...seal, partNumber: "RS1-1.750-SSV" }, "partNumber")).toBe(true);
  });

  it("an empty field is never custom", () => {
    const rows = seedComponents("3X4-13", "316SS/316SS", "BarePumpEnd");
    expect(isCustomValue(rows.find((r) => r.key === "seal")!, "partNumber")).toBe(false);
  });

  it("counts custom fields per line, ignoring out-of-scope rows", () => {
    let line = newAssemblyLine("l1");
    expect(customFieldCount(line)).toBe(0);
    line = {
      ...line,
      components: line.components.map((c) =>
        c.key === "seal" ? { ...c, partNumber: "RS1-1.750-SSV" } : c
      )
    };
    expect(customFieldCount(line)).toBe(1);
    line = { ...line, components: line.components.map((c) => (c.key === "seal" ? { ...c, inScope: false } : c)) };
    expect(customFieldCount(line)).toBe(0);
  });
});

describe("Re-seeding preserves entered data", () => {
  it("switching to a complete package keeps already-typed part numbers", () => {
    let line = newAssemblyLine("l1");
    line = {
      ...line,
      components: line.components.map((c) =>
        c.key === "seal" ? { ...c, partNumber: "RS1-1.750-SSV", brand: "Chesterton" } : c
      )
    };
    const upgraded = reseedAssembly({ ...line, buildType: "CompletePackage" });
    const seal = upgraded.components.find((c) => c.key === "seal")!;
    expect(seal.partNumber).toBe("RS1-1.750-SSV");
    expect(seal.brand).toBe("Chesterton");
    expect(upgraded.components.some((c) => c.key === "motor")).toBe(true);
  });

  it("keeps a typed-over material rather than reverting it", () => {
    let line = newAssemblyLine("l1");
    line = {
      ...line,
      components: line.components.map((c) => (c.key === "casing" ? { ...c, material: "CD4MCU" } : c))
    };
    const reseeded = reseedAssembly(line);
    expect(reseeded.components.find((c) => c.key === "casing")!.material).toBe("CD4MCU");
  });
});

describe("Validation is light but blocks the unusable", () => {
  it("accepts a valid single-assembly draft", () => {
    const v = validateDraft(draft(), []);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("blocks a duplicate order number", () => {
    const v = validateDraft(draft(), ["CFG-001"]);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /already exists/.test(e))).toBe(true);
  });

  it("requires a description on a spare, but not on an assembly", () => {
    const v = validateDraft(draft({ lines: [newSpareLine("s1")] }), []);
    expect(v.errors.some((e) => /description is required/.test(e))).toBe(true);
  });

  it("warns rather than blocks when the material is outside the catalogue", () => {
    const line = { ...newAssemblyLine("l1"), materialBuild: "Hastelloy C276" };
    const v = validateDraft(draft({ lines: [line] }), []);
    expect(v.ok).toBe(true); // internal builds legitimately go off-catalogue
    expect(v.warnings.some((w) => /outside the catalogue/.test(w))).toBe(true);
  });

  it("warns when no seal number or part number was recorded", () => {
    const v = validateDraft(draft(), []);
    expect(v.warnings.some((w) => /no seal number/.test(w))).toBe(true);
  });

  it("warns about manually entered component fields", () => {
    const line = newAssemblyLine("l1");
    const withCustom = {
      ...line,
      components: line.components.map((c) =>
        c.key === "casing" ? { ...c, material: "CD4MCU" } : c
      )
    };
    const v = validateDraft(draft({ lines: [withCustom] }), []);
    expect(v.warnings.some((w) => /entered manually/.test(w))).toBe(true);
  });
});

describe("Creating an order from a draft", () => {
  it("creates one line per draft line and Units only for assemblies", () => {
    const spare = { ...newSpareLine("s1"), description: "Repair kit", partNumber: "RK-3X4-13", brand: "Rotech" };
    const item = { ...newItemLine("i1"), description: "Pressure gauge", partNumber: "PG-100", brand: "Ashcroft" };
    const assembly = { ...newAssemblyLine("l1"), quantity: 2 };

    let state = buildInitialState();
    state = createConfiguredOrder(state, "e-sarah", draft({ lines: [assembly, spare, item] }));

    const order = state.orders.find((o) => o.orderNumber === "CFG-001")!;
    expect(order.lines).toHaveLength(3);

    // Only the assembly bears Units.
    const units = state.units.filter((u) => u.orderNumber === "CFG-001");
    expect(units).toHaveLength(2);
    expect(units.every((u) => u.lineNumber === 1)).toBe(true);

    expect(order.lines[1].executionDisposition).toBe("line-level-scope");
    expect(order.lines[2].executionDisposition).toBe("line-level-scope");
    expect(order.lines[0].executionDisposition).toBe("unit-bearing");
  });

  it("stores brands, part numbers and seal references as entered", () => {
    const line = newAssemblyLine("l1");
    const withEntries = {
      ...line,
      components: line.components.map((c) =>
        c.key === "seal"
          ? { ...c, partNumber: "RS1-1.750-SSV", brand: "Chesterton", reference: "SN-99213" }
          : c
      )
    };
    let state = buildInitialState();
    state = createConfiguredOrder(state, "e-sarah", draft({ lines: [withEntries] }));

    const configured = state.configuredLines.find((c) => c.orderNumber === "CFG-001")!;
    const seal = configured.components.find((c) => c.key === "seal")!;
    expect(seal.partNumber).toBe("RS1-1.750-SSV");
    expect(seal.brand).toBe("Chesterton");
    expect(seal.reference).toBe("SN-99213");
    expect(seal.referenceLabel).toBe("Seal number");
    expect(seal.isCustom).toBe(true);
  });

  it("drops out-of-scope components entirely", () => {
    const line = { ...newAssemblyLine("l1"), buildType: "CompletePackage" as const };
    const reseeded = reseedAssembly(line);
    let state = buildInitialState();
    state = createConfiguredOrder(state, "e-sarah", draft({ lines: [reseeded] }));
    const configured = state.configuredLines.find((c) => c.orderNumber === "CFG-001")!;
    // accessories default out of scope
    expect(configured.components.some((c) => c.key === "accessories")).toBe(false);
    expect(configured.components.some((c) => c.key === "motor")).toBe(true);
  });

  it("rejects an invalid draft rather than creating a partial order", () => {
    const state = buildInitialState();
    expect(() => createConfiguredOrder(state, "e-sarah", draft({ orderNumber: "" }))).toThrow(
      /Order number is required/
    );
    expect(state.orders.some((o) => o.orderNumber === "")).toBe(false);
  });

  it("generates a route only for the unit-bearing line", () => {
    let state = buildInitialState();
    state = createConfiguredOrder(
      state,
      "e-sarah",
      draft({ lines: [newAssemblyLine("l1"), { ...newSpareLine("s1"), description: "Kit" }] })
    );
    const units = state.units.filter((u) => u.orderNumber === "CFG-001");
    const ops = state.routeOps.filter((o) => units.some((u) => u.unitId === o.unitId));
    expect(ops.length).toBeGreaterThan(0);
  });
});

describe("Line summaries", () => {
  it("summarizes an assembly by family, size, frame, material and build type", () => {
    // The default line takes the first size the catalogue lists for the family.
    expect(summarizeLine(newAssemblyLine("l1"))).toMatch(/^1196 \S+ \S+ \S+ — bare pump end$/);
  });

  it("summarizes a line from another family", () => {
    expect(summarizeLine(newAssemblyLine("l2", "SXT"))).toMatch(/^SXT SXT-\d/);
  });

  it("summarizes a spare by brand and part number", () => {
    const spare = { ...newSpareLine("s1"), description: "Repair kit", partNumber: "RK-1", brand: "Rotech" };
    expect(summarizeLine(spare)).toBe("Repair kit (Rotech RK-1)");
  });
});

describe("Shape drives which components exist", () => {
  it("a close-coupled family has a stub shaft and adapter, not a shaft kit or baseplate", () => {
    const cc = newAssemblyLine("cc", "1296");
    const keys = cc.components.map((c) => c.key);
    expect(keys).toContain("stubShaft");
    expect(keys).toContain("adapter");
    expect(keys).not.toContain("shaftKit");

    const pkg = reseedAssembly({ ...cc, buildType: "CompletePackage" });
    const pkgKeys = pkg.components.map((c) => c.key);
    // Close-coupled bolts to the motor — no baseplate, coupling or guard.
    expect(pkgKeys).not.toContain("baseplate");
    expect(pkgKeys).not.toContain("coupling");
    expect(pkgKeys).not.toContain("couplingGuard");
    expect(pkgKeys).toContain("motor");
  });

  it("a solids-handling family has no seal or shaft-kit rows — they are part of the released build", () => {
    const sxt = newAssemblyLine("sxt", "SXT");
    const keys = sxt.components.map((c) => c.key);
    expect(keys).not.toContain("seal");
    expect(keys).not.toContain("sealGland");
    expect(keys).not.toContain("shaftKit");
    expect(keys).not.toContain("stuffingBoxCover");
    expect(keys).toContain("casing");
    expect(keys).toContain("impeller");
  });

  it("standard ANSI keeps the full wet end plus package rows", () => {
    const ansi = reseedAssembly({ ...newAssemblyLine("a", "1196"), buildType: "CompletePackage" });
    const keys = ansi.components.map((c) => c.key);
    for (const k of ["casing", "impeller", "stuffingBoxCover", "shaftKit", "seal", "baseplate", "coupling"]) {
      expect(keys).toContain(k);
    }
  });
});

describe("Switching model rebuilds the line", () => {
  it("moves to the new family's sizes and components, keeping quantity", () => {
    const ansi = { ...newAssemblyLine("l1", "1196"), quantity: 4 };
    const sxt = switchFamily(ansi, "SXT");
    expect(sxt.family).toBe("SXT");
    expect(sxt.quantity).toBe(4);
    expect(sxt.size).toMatch(/^SXT-/);
    expect(sxt.components.some((c) => c.key === "seal")).toBe(false);
  });

  it("leaves spares and items untouched", () => {
    const spare = newSpareLine("s1");
    expect(switchFamily(spare, "SXT")).toBe(spare);
  });

  it("every catalogue family can seed a line", () => {
    for (const f of catalogueFamilies()) {
      const line = newAssemblyLine("x", f.familyCode);
      expect(line.size, `${f.familyCode} must seed a size`).toBeTruthy();
      expect(line.components.length, `${f.familyCode} must seed components`).toBeGreaterThan(0);
    }
  });
});

describe("Reference defaults are filled in, per CPQ HEAD behaviour", () => {
  it("prefills trim, flange, SBC, shaft and seal for a standard ANSI line", () => {
    const line = newAssemblyLine("l1", "1196");
    expect(line.fullTrim).toBeGreaterThan(0);
    // CPQ syncPumpDefaults: requested trim defaults to the full diameter.
    expect(line.requestedTrim).toBe(String(line.fullTrim));
    expect(line.sbcType).toBe("STD BORE");
    expect(line.flangeType).toBeTruthy();
    expect(line.shaftType).toBeTruthy();
    // CPQ normalizeLineTypeAndSealDefaults generic ANSI seal defaults.
    expect(line.sealArrangement).toBe("SINGLE CART");
    expect(line.sealMoc).toBe("SSV");
    expect(line.sealManufacturer).toBe("ROTECH CHOICE");
    expect(line.sealPlan).toBe("NO PLAN");
  });

  it("does NOT stamp the generic seal default on a family with its own configurator", () => {
    // CPQ is explicit: seeding this early wins forever and the family-correct
    // default never gets a chance.
    const sxt = newAssemblyLine("l2", "SXT");
    expect(sxt.sealArrangement).toBeUndefined();
    expect(sxt.sealMoc).toBeUndefined();
    expect(sealDefaultsFor("SXT")).toBeNull();
    expect(sealDefaultsFor("1196")).not.toBeNull();
  });

  it("derives seal size from the frame for ANSI families", () => {
    const line = newAssemblyLine("l1", "1196");
    expect(line.sealSize).toBe(sealSizeForFrame("1196", line.frame ?? ""));
    expect([1.375, 1.75, 2.125, 2.5]).toContain(line.sealSize);
  });

  it("omits fields the shape does not configure", () => {
    const sxt = newAssemblyLine("l2", "SXT");
    expect(sxt.sbcType).toBeUndefined();
    expect(sxt.shaftType).toBeUndefined();
  });

  it("clamps a requested trim above the full diameter rather than rejecting it", () => {
    const line = newAssemblyLine("l1", "1196");
    const over = clampTrim({ ...line, requestedTrim: String((line.fullTrim ?? 0) + 5) });
    expect(over.requestedTrim).toBe(String(line.fullTrim));
    const under = clampTrim({ ...line, requestedTrim: "6" });
    expect(under.requestedTrim).toBe("6"); // a real trim is left alone
  });

  it("re-defaulting never overwrites a coordinator's entry", () => {
    let line = newAssemblyLine("l1", "1196");
    line = markEdited({ ...line, sealMoc: "TC/TC/FKM" }, "sealMoc");
    const redefaulted = applyReferenceDefaults(line);
    expect(redefaulted.sealMoc).toBe("TC/TC/FKM");
    // An untouched field still re-derives.
    expect(redefaulted.sealPlan).toBe("NO PLAN");
  });
});

describe("Reference provenance", () => {
  it("records the CPQ commit and source-file checksums it was derived from", () => {
    const p = catalogueProvenance()!;
    expect(p.sourceRepository).toMatch(/CPQ/);
    expect(p.sourceCommit).toMatch(/^6b62b0bc/);
    expect(p.sourceBranch).toBe("codex/rhs-split-case-staging");
    expect(Object.keys(p.sourceFileChecksums ?? {})).toContain("data/ansi-family.seed.json");
    for (const sum of Object.values(p.sourceFileChecksums ?? {})) {
      expect(sum).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("carries the CPQ option vocabulary without any monetary field", () => {
    expect(sealPlans()).toContain("PLAN 11");
    expect(sealArrangements()).toContain("SINGLE CARTRIDGE");
    expect(sealGlandMocOptions()).toContain("316SS");
    expect(testingAdders().length).toBeGreaterThan(0);
    const raw = JSON.stringify(commonOptions());
    expect(raw).not.toMatch(/price|cost|margin|multiplier|currency|discount/i);
  });
});

describe("Option lists cover their own defaults", () => {
  it("unions CPQ's seal-arrangement default into the choice list", () => {
    // CPQ defaults to "SINGLE CART" but lists "SINGLE CARTRIDGE" — without the
    // union the prefilled value would render as a custom entry.
    const options = sealArrangementOptionsFor("1196");
    expect(options).toContain("SINGLE CART");
    expect(options).toContain("SINGLE CARTRIDGE");
    expect(options[0]).toBe("SINGLE CART"); // the default is offered first
    expect(options).toContain(newAssemblyLine("l1", "1196").sealArrangement);
  });

  it("returns the plain vocabulary for a family with no seal default", () => {
    expect(sealArrangementOptionsFor("SXT")).toEqual(sealArrangements());
  });
});
