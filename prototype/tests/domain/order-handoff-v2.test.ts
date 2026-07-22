import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  validateOrderHandoffPackage,
  computeHandoffChecksum,
  findMonetaryLeaks,
  ORDER_HANDOFF_SCHEMA,
  type OrderHandoffPackageV2
} from "@/domain/orderHandoffV2";

function loadSample(): OrderHandoffPackageV2 {
  const raw = readFileSync("sample-data/cpq-order-handoff-v2.sample.json", "utf8");
  return JSON.parse(raw) as OrderHandoffPackageV2;
}

// Re-hash after mutating a package so a test that changes content but wants a
// still-valid package keeps a matching checksum.
function reseal(pkg: OrderHandoffPackageV2): OrderHandoffPackageV2 {
  return { ...pkg, checksum: computeHandoffChecksum(pkg) };
}

describe("order handoff v2 — package validation", () => {
  it("accepts the sanitized mixed-scope fixture and verifies its checksum", () => {
    const result = validateOrderHandoffPackage(loadSample());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.package?.schema).toBe(ORDER_HANDOFF_SCHEMA);
    expect(result.package?.lines).toHaveLength(6);
    expect(result.monetaryLeaks).toEqual([]);
  });

  it("carries a full mix of dispositions (units, packable non-unit scope, reference, review)", () => {
    const pkg = loadSample();
    const byDisposition = pkg.lines.reduce<Record<string, number>>((acc, l) => {
      acc[l.executionDisposition] = (acc[l.executionDisposition] ?? 0) + 1;
      return acc;
    }, {});
    expect(byDisposition).toEqual({
      "unit-bearing": 2,
      "line-level-scope": 2,
      "reference-only": 1,
      "review-required": 1
    });
    // A spare line is its own separate item that still ships/packs — present,
    // not rejected, and NOT unit-bearing.
    const spare = pkg.lines.find((l) => l.lineType === "spare");
    expect(spare?.executionDisposition).toBe("line-level-scope");
  });

  it("keeps RFQ lines present with their known scope (RFQ never deletes a line)", () => {
    const pkg = loadSample();
    const rfqLine = pkg.lines.find((l) => l.commercialState === "rfq" && l.executionDisposition === "unit-bearing");
    expect(rfqLine).toBeDefined();
    expect(rfqLine?.executionState).toBe("awaiting-decision");
    expect(rfqLine?.attentionItems?.length).toBeGreaterThan(0);
    // Still fully described despite being RFQ.
    expect(rfqLine?.pumpBuild?.materialBuild).toBe("CD4MCU/CD4MCU");
  });

  it("rejects an unsupported schema", () => {
    const bad = { ...loadSample(), schema: "rotech-cpq-order-handoff/9.9" };
    const result = validateOrderHandoffPackage(bad);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Unsupported schema/);
  });

  it("rejects a missing required source field with a structured error", () => {
    const bad = loadSample();
    // @ts-expect-error deliberately removing a required field
    delete bad.source.revisionToken;
    const result = validateOrderHandoffPackage(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("source.revisionToken"))).toBe(true);
  });

  it("requires a positive quantity on a unit-bearing line", () => {
    const pkg = loadSample();
    pkg.lines[0].quantity = 0;
    const result = validateOrderHandoffPackage(reseal(pkg));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("quantity") && e.includes("unit-bearing"))).toBe(true);
  });

  it("allows a line-level-scope line without a quantity", () => {
    const pkg = loadSample();
    const svc = pkg.lines.find((l) => l.lineType === "service")!;
    delete svc.quantity;
    const result = validateOrderHandoffPackage(reseal(pkg));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid note classification", () => {
    const pkg = loadSample();
    (pkg.lines[0].internalContext![0] as { classification: string }).classification = "totally-made-up";
    const result = validateOrderHandoffPackage(reseal(pkg));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("classification"))).toBe(true);
  });

  it("rejects a checksum mismatch (tampered after publishing)", () => {
    const bad = loadSample();
    bad.checksum = "0".repeat(64);
    const result = validateOrderHandoffPackage(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("checksum mismatch"))).toBe(true);
  });
});

describe("order handoff v2 — monetary allowlist (invariant 5)", () => {
  it("the fixture contains zero monetary fields", () => {
    expect(findMonetaryLeaks(loadSample())).toEqual([]);
  });

  it("rejects a monetary key buried anywhere, reporting its path", () => {
    const pkg = loadSample();
    (pkg.lines[0].bom![0] as unknown as Record<string, unknown>).listPrice = 2824.29;
    const result = validateOrderHandoffPackage(reseal(pkg));
    expect(result.ok).toBe(false);
    expect(result.monetaryLeaks).toContain("lines[0].bom[0].listPrice");
    expect(result.errors.some((e) => e.includes("monetary field not allowed"))).toBe(true);
  });

  it("catches monetary synonyms regardless of case/underscores", () => {
    const leaks = findMonetaryLeaks({
      a: { unit_price: 1 },
      b: [{ Margin: 2 }],
      c: { CostPrice: 3 },
      d: { taxGroup: "x" },
      e: { total: 9 }
    });
    expect(leaks.sort()).toEqual(
      ["a.unit_price", "b[0].Margin", "c.CostPrice", "d.taxGroup", "e.total"].sort()
    );
  });

  it("does not false-positive on legitimate descriptive keys", () => {
    const leaks = findMonetaryLeaks({
      description: "a pump",
      selection: { staticHead: "10 ft", head: "120 ft" },
      productName: "1196"
    });
    expect(leaks).toEqual([]);
  });
});
