// Order -> Line -> Unit as one tree — the read model behind the Explorer-style
// drill-down that replaces the order page's eleven flat tabs. This module
// shapes the master Order/Unit/Requirement records for display; it never
// duplicates or mutates them.
//
// Node ids are the URL contract that makes every view in the drill-down a
// shareable link: "order", "line:<lineNumber>", "unit:<unitId>".
//
// PURE DOMAIN — no React, no localStorage.

import type { AppState, Order, OrderLine, Unit, UnitStatus } from "../types";
import { lineDisplayRef, unitDisplayRef } from "../ids";
import { unitsForOrder } from "../selectors";
import { availabilityForRequirement } from "../inventory/availability";
import { isOpen, isPhysicalCategory } from "./requirement";

export const ORDER_NODE_ID = "order";

export function lineNodeId(lineNumber: number): string {
  return `line:${lineNumber}`;
}

export function unitNodeId(unitId: string): string {
  return `unit:${unitId}`;
}

export type ParsedNode =
  | { kind: "order" }
  | { kind: "line"; lineNumber: number }
  | { kind: "unit"; unitId: string };

/** Falls back to the order root for anything unrecognised — never throws on a stale link. */
export function parseNodeId(nodeId: string | null | undefined): ParsedNode {
  if (!nodeId || nodeId === ORDER_NODE_ID) return { kind: "order" };
  if (nodeId.startsWith("line:")) {
    const lineNumber = Number(nodeId.slice(5));
    if (Number.isFinite(lineNumber)) return { kind: "line", lineNumber };
  }
  if (nodeId.startsWith("unit:")) {
    const unitId = nodeId.slice(5);
    if (unitId) return { kind: "unit", unitId };
  }
  return { kind: "order" };
}

// ---------------------------------------------------------------------------
// Rollup status — Katana's five-value vocabulary, but only ever a DERIVED
// rollup over the existing per-Unit UnitStatus. A single Unit keeps its own
// richer status (AwaitingQuality has no equivalent here); this is what a Line
// or an Order shows when it has more than one Unit underneath it.
// ---------------------------------------------------------------------------

export const LINE_ROLLUP_STATUSES = ["NotStarted", "InProgress", "PartiallyComplete", "Blocked", "Done"] as const;
export type LineRollupStatus = (typeof LINE_ROLLUP_STATUSES)[number];

export function rollupStatusForUnits(statuses: UnitStatus[]): LineRollupStatus {
  if (statuses.length === 0) return "NotStarted";
  if (statuses.some((s) => s === "Blocked")) return "Blocked";
  if (statuses.every((s) => s === "Complete")) return "Done";
  if (statuses.every((s) => s === "NotStarted")) return "NotStarted";
  if (statuses.some((s) => s === "Complete")) return "PartiallyComplete";
  return "InProgress";
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

export interface UnitTreeNode {
  kind: "unit";
  nodeId: string;
  unit: Unit;
  displayRef: string;
}

export interface LineTreeNode {
  kind: "line";
  nodeId: string;
  line: OrderLine;
  displayRef: string;
  /** Empty for a non-unit-bearing line (spare, service, reference-only scope). */
  units: UnitTreeNode[];
  rollupStatus: LineRollupStatus;
}

export interface OrderTreeNode {
  kind: "order";
  nodeId: string;
  order: Order;
  lines: LineTreeNode[];
  rollupStatus: LineRollupStatus;
}

export function buildOrderTree(state: AppState, orderNumber: string): OrderTreeNode | undefined {
  const order = state.orders.find((o) => o.orderNumber === orderNumber);
  if (!order) return undefined;

  const units = unitsForOrder(state, orderNumber);

  const lines: LineTreeNode[] = [...order.lines]
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((line) => {
      const lineUnits: UnitTreeNode[] = units
        .filter((u) => u.lineNumber === line.lineNumber)
        .map((unit) => ({
          kind: "unit",
          nodeId: unitNodeId(unit.unitId),
          unit,
          displayRef: unitDisplayRef(unit)
        }));
      return {
        kind: "line",
        nodeId: lineNodeId(line.lineNumber),
        line,
        displayRef: lineDisplayRef(order.orderNumber, line.lineNumber),
        units: lineUnits,
        rollupStatus: rollupStatusForUnits(lineUnits.map((n) => n.unit.status))
      };
    });

  return {
    kind: "order",
    nodeId: ORDER_NODE_ID,
    order,
    lines,
    rollupStatus: rollupStatusForUnits(units.map((u) => u.status))
  };
}

export function findLineNode(tree: OrderTreeNode, lineNumber: number): LineTreeNode | undefined {
  return tree.lines.find((l) => l.line.lineNumber === lineNumber);
}

export function findUnitNode(tree: OrderTreeNode, unitId: string): UnitTreeNode | undefined {
  for (const line of tree.lines) {
    const found = line.units.find((u) => u.unit.unitId === unitId);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Header summary — "3 of 6 Units complete · 1 blocked · 2 waiting on
// material", replacing the fraction chips and the hand-typed remark that
// currently carries this same information in the spreadsheet.
// ---------------------------------------------------------------------------

export interface OrderTreeSummary {
  totalUnits: number;
  complete: number;
  blocked: number;
  waitingOnMaterial: number;
}

/**
 * Units with at least one open physical requirement whose computed
 * availability is not InStock — the generic, cross-family replacement for a
 * remark like "can't build 6x8-13, holding Knighten orders".
 */
export function unitsWaitingOnMaterial(state: AppState, orderNumber: string): Set<string> {
  const waiting = new Set<string>();
  for (const requirement of state.requirements) {
    if (!requirement.unitId || requirement.executionOrderId !== orderNumber) continue;
    if (!isPhysicalCategory(requirement.category) || !isOpen(requirement)) continue;
    if (availabilityForRequirement(state, requirement.id).state !== "InStock") {
      waiting.add(requirement.unitId);
    }
  }
  return waiting;
}

export function summarizeOrderTree(state: AppState, tree: OrderTreeNode): OrderTreeSummary {
  const allUnits = tree.lines.flatMap((l) => l.units.map((n) => n.unit));
  const waiting = unitsWaitingOnMaterial(state, tree.order.orderNumber);
  return {
    totalUnits: allUnits.length,
    complete: allUnits.filter((u) => u.status === "Complete").length,
    blocked: allUnits.filter((u) => u.status === "Blocked").length,
    waitingOnMaterial: allUnits.filter((u) => waiting.has(u.unitId)).length
  };
}
