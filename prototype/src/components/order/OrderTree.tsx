"use client";

// The Order -> Line -> Unit drill-down. Replaces the flat Units table (no
// line grouping at all) and the per-line nested tab strip: everything is one
// tree, and the selected node is the URL — `?node=line:1` or
// `?node=unit:26WO00225_1.1` — so any view a person reaches is a link they
// can send someone else.

import Link from "next/link";
import { useState } from "react";
import type { LineRollupStatus, LineTreeNode, OrderTreeNode } from "@/domain/ledger/orderTree";
import { UnitStatusBadge } from "@/components/bits";

const ROLLUP_LABEL: Record<LineRollupStatus, string> = {
  NotStarted: "Not started",
  InProgress: "In progress",
  PartiallyComplete: "Partially complete",
  Blocked: "Blocked",
  Done: "Done"
};

function RollupBadge({ status }: { status: LineRollupStatus }) {
  return <span className={`badge s-${status.toLowerCase()}`}>{ROLLUP_LABEL[status]}</span>;
}

function nodeHref(orderNo: string, nodeId: string): string {
  return `/orders/${orderNo}?tab=execution&node=${encodeURIComponent(nodeId)}`;
}

function LineRow({
  orderNo,
  line,
  selectedNodeId,
  defaultOpen
}: {
  orderNo: string;
  line: LineTreeNode;
  selectedNodeId: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isSelected = selectedNodeId === line.nodeId;
  const hasUnits = line.units.length > 0;

  return (
    <div>
      <div className={`tree-row tree-row-line ${isSelected ? "selected" : ""}`}>
        {hasUnits ? (
          <button
            type="button"
            className="tree-expander"
            aria-label={open ? `Collapse line ${line.line.lineNumber}` : `Expand line ${line.line.lineNumber}`}
            data-testid={`tree-expand-${line.nodeId}`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="tree-expander tree-expander-leaf" aria-hidden>
            ·
          </span>
        )}
        <Link href={nodeHref(orderNo, line.nodeId)} className="tree-label" data-testid={`tree-node-${line.nodeId}`}>
          <b>{line.displayRef}</b> {line.line.product}
          {hasUnits && <span style={{ color: "var(--text-subtle)" }}> ×{line.units.length}</span>}
          {!hasUnits && <span style={{ color: "var(--text-subtle)" }}> (no Units — packable scope)</span>}
        </Link>
        <RollupBadge status={line.rollupStatus} />
      </div>
      {open &&
        line.units.map((u) => (
          <div
            key={u.nodeId}
            className={`tree-row tree-row-unit ${selectedNodeId === u.nodeId ? "selected" : ""}`}
            data-testid={`tree-row-${u.nodeId}`}
          >
            <span className="tree-expander tree-expander-leaf" aria-hidden>
              ·
            </span>
            <Link href={nodeHref(orderNo, u.nodeId)} className="tree-label" data-testid={`tree-node-${u.nodeId}`}>
              {u.displayRef}
            </Link>
            <UnitStatusBadge status={u.unit.status} />
          </div>
        ))}
    </div>
  );
}

export function OrderTree({ orderNo, tree, selectedNodeId }: { orderNo: string; tree: OrderTreeNode; selectedNodeId: string }) {
  return (
    <nav className="order-tree" aria-label="Order structure" data-testid="order-tree">
      <div className={`tree-row tree-row-order ${selectedNodeId === tree.nodeId ? "selected" : ""}`}>
        <span className="tree-expander tree-expander-leaf" aria-hidden>
          ▾
        </span>
        <Link href={nodeHref(orderNo, tree.nodeId)} className="tree-label" data-testid="tree-node-order">
          <b>{tree.order.orderNumber}</b>
        </Link>
        <RollupBadge status={tree.rollupStatus} />
      </div>
      <div style={{ marginLeft: 14 }}>
        {tree.lines.map((line) => (
          <LineRow
            key={line.nodeId}
            orderNo={orderNo}
            line={line}
            selectedNodeId={selectedNodeId}
            defaultOpen={line.units.some((u) => u.nodeId === selectedNodeId) || tree.lines.length === 1}
          />
        ))}
      </div>
    </nav>
  );
}
