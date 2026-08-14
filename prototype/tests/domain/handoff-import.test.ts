import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import { importOrderHandoffV2 } from "@/domain/actions";
import {
  attentionItemsForOrder,
  orderReleaseBlocked,
  nonUnitScopeLines
} from "@/domain/selectors";
import { computeHandoffChecksum, type OrderHandoffPackageV2 } from "@/domain/orderHandoffV2";

function loadSample(): OrderHandoffPackageV2 {
  const raw = readFileSync("sample-data/cpq-order-handoff-v2.sample.json", "utf8");
  return JSON.parse(raw) as OrderHandoffPackageV2;
}

function reseal(pkg: OrderHandoffPackageV2): OrderHandoffPackageV2 {
  return { ...pkg, checksum: computeHandoffChecksum(pkg) };
}

const importInput = (pkg: unknown) => ({
  package: pkg,
  facility: "Mississauga" as const,
  coordinatorId: "e-alex"
});

const ORDER_NO = "Q-DEMO-2044-R2"; // derived from quoteNumber + revisionNumber

describe("CPQ handoff v2 import — units vs non-unit scope", () => {
  it("creates the order with a derived number and all 6 lines", () => {
    const s = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const order = s.orders.find((o) => o.orderNumber === ORDER_NO);
    expect(order).toBeDefined();
    expect(order?.orderType).toBe("CPQ handoff (v2)");
    expect(order?.lines).toHaveLength(6);
  });

  it("only unit-bearing lines create Units (2+1 = 3); scope lines create none", () => {
    const s = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const units = s.units.filter((u) => u.orderNumber === ORDER_NO);
    expect(units).toHaveLength(3);
    // Units only under lines 1 and 2 (the pump/pump-package lines).
    expect(new Set(units.map((u) => u.lineNumber))).toEqual(new Set([1, 2]));
    // The spare/service/doc/review lines are visible non-Unit scope.
    expect(nonUnitScopeLines(s, ORDER_NO).map((l) => l.lineNumber)).toEqual([3, 4, 5, 6]);
  });

  it("preserves per-line disposition and commercial/execution state", () => {
    const s = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const line = (n: number) => s.orders.find((o) => o.orderNumber === ORDER_NO)!.lines.find((l) => l.lineNumber === n)!;
    expect(line(3).executionDisposition).toBe("line-level-scope");
    expect(line(2).commercialState).toBe("rfq");
    expect(line(2).executionState).toBe("awaiting-decision");
    expect(line(6).executionDisposition).toBe("review-required");
  });

  it("seeds a money-free working BOM for built and packable lines only", () => {
    const s = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const rowsFor = (lineNo: number) =>
      s.workingBomRows.filter((r) => r.orderNumber === ORDER_NO && r.lineNumber === lineNo);
    expect(rowsFor(1).length).toBeGreaterThan(0); // unit-bearing (from componentBreakdown)
    expect(rowsFor(2).length).toBeGreaterThan(0); // unit-bearing (from bom)
    expect(rowsFor(3).length).toBeGreaterThan(0); // spare — packable, gets a BOM
    expect(rowsFor(5)).toHaveLength(0); // reference-only — nothing until dispositioned
    expect(rowsFor(6)).toHaveLength(0); // review-required — nothing until dispositioned
    // Every seeded row is CPQ-sourced and carries no price field.
    for (const r of s.workingBomRows) {
      expect(r.seededFrom).toBe("CPQ");
      expect(Object.keys(r)).not.toContain("price");
    }
  });
});

describe("CPQ handoff v2 import — RFQ / attention items (never deletes a line)", () => {
  it("surfaces attention items and blocks release without dropping any line", () => {
    const s = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const items = attentionItemsForOrder(s, ORDER_NO);
    // line2: 2 explicit + 1 blocking note; line4: 1 non-blocking; line6: 1 review + 1 blocking note; order: 1.
    expect(items).toHaveLength(7);
    expect(items.filter((a) => a.blocksRelease)).toHaveLength(5);
    expect(orderReleaseBlocked(s, ORDER_NO)).toBe(true);
    // The RFQ line itself is still present and fully built into a Unit.
    expect(s.units.filter((u) => u.orderNumber === ORDER_NO && u.lineNumber === 2)).toHaveLength(1);
    // Blocking items sort first.
    expect(items[0].blocksRelease).toBe(true);
  });

  it("seeds ManufacturingNotes only for actionable classifications", () => {
    const s = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const notes = s.manufacturingNotes.filter((n) => n.orderNumber === ORDER_NO);
    // line1 machining+packaging, line2 engineering, line3 packaging, line4 service → 5.
    // provenance / rfq-resolution / commercial-context notes are NOT seeded.
    expect(notes).toHaveLength(5);
    expect(notes.every((n) => n.source === "CPQ")).toBe(true);
  });

  it("captures order-level inclusion/exclusion scope", () => {
    const s = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const order = s.orders.find((o) => o.orderNumber === ORDER_NO)!;
    expect(order.scopeItems).toHaveLength(3);
    expect(order.scopeItems?.map((x) => x.kind)).toEqual(["inclusion", "exclusion", "customer-supplied"]);
  });
});

describe("CPQ handoff v2 import — freeze, idempotency, invariants", () => {
  it("freezes an immutable per-line snapshot per line", () => {
    const s = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const snaps = s.configurationSnapshots.filter((snap) => snap.orderNumber === ORDER_NO);
    expect(snaps).toHaveLength(6);
    expect(snaps.every((snap) => snap.checksum === loadSample().checksum)).toBe(true);
  });

  it("is a no-op on a byte-identical retry", () => {
    const s1 = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const s2 = importOrderHandoffV2(s1, "e-alex", importInput(loadSample()), "2026-07-22T11:00:00Z");
    expect(s2).toBe(s1); // same reference — nothing changed
    expect(s2.orders.filter((o) => o.orderNumber === ORDER_NO)).toHaveLength(1);
  });

  it("rejects a changed payload for an already-imported revision (needs supersession)", () => {
    const s1 = importOrderHandoffV2(buildInitialState(), "e-alex", importInput(loadSample()), "2026-07-22T10:00:00Z");
    const changed = loadSample();
    changed.customer.customerPo = "PO-NW-CHANGED";
    expect(() => importOrderHandoffV2(s1, "e-alex", importInput(reseal(changed)), "2026-07-22T12:00:00Z")).toThrow(
      /already imported/i
    );
  });

  it("rejects a package that leaks a monetary field", () => {
    const bad = loadSample();
    (bad.lines[2].bom![0] as unknown as Record<string, unknown>).listPrice = 420;
    expect(() => importOrderHandoffV2(buildInitialState(), "e-alex", importInput(reseal(bad)), "2026-07-22T10:00:00Z")).toThrow(
      /monetary field not allowed/i
    );
  });
});
