import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import {
  addConfigurationAdjustment,
  addManufacturingNote,
  importExecutionPackage
} from "@/domain/actions";
import {
  validateExecutionPackage,
  computeChecksum,
  type ExecutionPackageV1
} from "@/domain/executionPackage";

function loadSample(): ExecutionPackageV1 {
  const raw = readFileSync("sample-data/cpq-execution-package-v1.json", "utf8");
  return JSON.parse(raw) as ExecutionPackageV1;
}

function orderNumberFor(pkg: ExecutionPackageV1): string {
  return `${pkg.source.quoteNumber}-R${pkg.source.revisionNumber}`;
}

const importInput = (pkg: unknown, orderNumber: string) => ({
  package: pkg,
  orderNumber,
  facility: "Mississauga" as const,
  coordinatorId: "e-alex"
});

describe("execution package validation", () => {
  it("accepts the sample package and verifies its checksum", () => {
    const result = validateExecutionPackage(loadSample());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.package?.lines).toHaveLength(2);
  });

  it("rejects an unsupported schema version", () => {
    const bad = { ...loadSample(), schemaVersion: "9.9" };
    const result = validateExecutionPackage(bad);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/schemaVersion/);
  });

  it("rejects a missing required field with a structured error", () => {
    const bad = loadSample();
    // @ts-expect-error deliberately removing a required field
    delete bad.source.quoteNumber;
    const result = validateExecutionPackage(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("source.quoteNumber"))).toBe(true);
  });

  it("rejects quantity below one", () => {
    const bad = loadSample();
    bad.lines[0].quantity = 0;
    const result = validateExecutionPackage(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("quantity"))).toBe(true);
  });

  it("rejects a tampered package (checksum mismatch)", () => {
    const bad = loadSample();
    bad.lines[0].configuration.casingMaterial = "TamperedMaterial";
    const result = validateExecutionPackage(bad);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Checksum mismatch/);
  });

  it("computes a stable checksum matching the published value", () => {
    const pkg = loadSample();
    expect(computeChecksum(pkg)).toBe(pkg.checksum);
  });
});

describe("importExecutionPackage", () => {
  it("creates one order, two lines, and three isolated units", () => {
    const pkg = loadSample();
    const on = orderNumberFor(pkg);
    const state = importExecutionPackage(buildInitialState(), "e-alex", importInput(pkg, on));

    const order = state.orders.find((o) => o.orderNumber === on);
    expect(order).toBeTruthy();
    expect(order!.lines).toHaveLength(2);

    const units = state.units.filter((u) => u.orderNumber === on);
    expect(units).toHaveLength(3); // qty 2 + qty 1
    const ids = units.map((u) => u.unitId).sort();
    expect(ids).toEqual([`${on}_1.1`, `${on}_1.2`, `${on}_2.1`]);

    // Each unit references exactly one existing line by lineNumber.
    for (const u of units) {
      expect(order!.lines.some((l) => l.lineNumber === u.lineNumber)).toBe(true);
    }
    // Unit publicRefs are all distinct (no shared identity).
    expect(new Set(units.map((u) => u.publicRef)).size).toBe(3);
  });

  it("freezes an immutable snapshot per line, unaffected by later edits to the source object", () => {
    const pkg = loadSample();
    const on = orderNumberFor(pkg);
    const state = importExecutionPackage(buildInitialState(), "e-alex", importInput(pkg, on));

    expect(state.configurationSnapshots).toHaveLength(2);
    const snap1 = state.configurationSnapshots.find((s) => s.lineNumber === 1)!;
    const payload = snap1.payload as ExecutionPackageV1["lines"][number];
    expect(payload.configuration.casingMaterial).toBe("316SS");

    // Mutating the original in-memory object must not change the stored snapshot.
    pkg.lines[0].configuration.casingMaterial = "MUTATED";
    const after = state.configurationSnapshots.find((s) => s.lineNumber === 1)!;
    expect((after.payload as typeof payload).configuration.casingMaterial).toBe("316SS");
  });

  it("rejects a duplicate import of the same order number", () => {
    const pkg = loadSample();
    const on = orderNumberFor(pkg);
    const state = importExecutionPackage(buildInitialState(), "e-alex", importInput(pkg, on));
    expect(() => importExecutionPackage(state, "e-alex", importInput(pkg, on))).toThrow(/already exists/);
  });

  it("rejects an invalid package before creating anything", () => {
    const bad = { ...loadSample(), schemaVersion: "9.9" };
    expect(() => importExecutionPackage(buildInitialState(), "e-alex", importInput(bad, "X-1"))).toThrow(
      /Execution package rejected/
    );
  });
});

describe("manufacturing notes", () => {
  it("a line note applies to every unit on the line; a unit note stays isolated", () => {
    const pkg = loadSample();
    const on = orderNumberFor(pkg);
    let state = importExecutionPackage(buildInitialState(), "e-alex", importInput(pkg, on));
    const line1Id = `${on}-L1`;

    state = addManufacturingNote(state, "e-alex", {
      scopeType: "WorkOrderLine",
      scopeId: line1Id,
      orderNumber: on,
      category: "ShopInstruction",
      title: "Deburr all edges",
      description: "Applies to the whole line."
    });
    state = addManufacturingNote(state, "e-alex", {
      scopeType: "Unit",
      scopeId: `${on}_1.2`,
      orderNumber: on,
      category: "QualityRequirement",
      title: "Extra witness point",
      description: "Only for unit 1.2."
    });

    const lineNotes = state.manufacturingNotes.filter(
      (n) => n.scopeType === "WorkOrderLine" && n.scopeId === line1Id
    );
    expect(lineNotes).toHaveLength(1);
    expect(lineNotes[0].lineNumber).toBe(1); // resolved to all units on line 1

    const unit12Notes = state.manufacturingNotes.filter(
      (n) => n.scopeType === "Unit" && n.scopeId === `${on}_1.2`
    );
    expect(unit12Notes).toHaveLength(1);
    // The unit note never attaches to sibling 1.1.
    expect(state.manufacturingNotes.some((n) => n.scopeId === `${on}_1.1`)).toBe(false);
  });

  it("rejects a note whose scope is not on the named order (inconsistent ancestors)", () => {
    const pkg = loadSample();
    const on = orderNumberFor(pkg);
    const state = importExecutionPackage(buildInitialState(), "e-alex", importInput(pkg, on));
    expect(() =>
      addManufacturingNote(state, "e-alex", {
        scopeType: "Unit",
        scopeId: "SAMPLE1001_1.1", // a unit on a different order
        orderNumber: on,
        category: "ShopInstruction",
        title: "x",
        description: "y"
      })
    ).toThrow(/Inconsistent ancestors/);
  });
});

describe("configuration adjustments", () => {
  it("are stored separately and never mutate the frozen snapshot", () => {
    const pkg = loadSample();
    const on = orderNumberFor(pkg);
    let state = importExecutionPackage(buildInitialState(), "e-alex", importInput(pkg, on));
    const snapBefore = JSON.stringify(state.configurationSnapshots);

    state = addConfigurationAdjustment(state, "e-alex", {
      scopeType: "WorkOrderLine",
      scopeId: `${on}-L1`,
      orderNumber: on,
      configurationPath: "configuration.impellerMaterial",
      originalValue: "316SS",
      proposedValue: "CD4MCu",
      reason: "Customer upgrade request",
    });

    expect(state.configurationAdjustments).toHaveLength(1);
    expect(state.configurationAdjustments[0].approvalStatus).toBe("Pending");
    // Material path defaults to requiring commercial review.
    expect(state.configurationAdjustments[0].commercialReviewRequired).toBe(true);
    // The frozen snapshot is untouched.
    expect(JSON.stringify(state.configurationSnapshots)).toBe(snapBefore);
  });
});
