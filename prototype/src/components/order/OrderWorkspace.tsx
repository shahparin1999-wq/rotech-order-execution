"use client";

// The Order workspace — one screen, one scroll.
//
// Replaces eleven top tabs and a two-pane Explorer tree. The rules it follows
// are the frozen ones:
//
//   Exceptions first    Attention sits above the structure.
//   Work first          What is wrong, then what to build, then reference.
//   Detail on demand    Actions, Shipments and Activity are COUNTS here.
//                       Nothing renders expanded by default.
//   No empty sections   A section with nothing in it does not render at all.
//
// Line is not a navigation level: it is a group heading, with its technical
// detail behind a Line details sheet. Tapping a Unit opens the Unit workspace.

import Link from "next/link";
import { useState } from "react";
import { useAppState } from "@/store/StoreProvider";
import {
  checklistProgress,
  customerNameWithCity,
  orderByNumber,
  postsForOrder
} from "@/domain/selectors";
import { buildOrderTree, summarizeOrderTree, type LineTreeNode } from "@/domain/ledger/orderTree";
import { orderAttention, type AttentionKind, type OrderAttentionItem } from "@/domain/ledger/attention";
import { unitDisplayRef } from "@/domain/ids";
import { UnitStatusBadge } from "@/components/bits";
import { Modal } from "@/components/Drawer";
import {
  AddUnitsControl,
  LINE_SECTIONS,
  LINE_SECTIONS_BASE,
  LineSectionBody,
  lineContextFor,
  type LineSectionKey
} from "@/components/order/LineSections";
import { PurchasingPanel } from "@/components/order/PurchasingPanel";

const KIND_LABEL: Record<AttentionKind, string> = {
  Shortage: "Shortage",
  Incoming: "Incoming",
  SubstitutionReview: "Review",
  QualityProblem: "Quality",
  OverdueAction: "Overdue",
  CommercialReview: "Commercial",
  LatePurchase: "Late PO"
};

function AttentionRow({ item }: { item: OrderAttentionItem }) {
  return (
    <div
      className={`attention-row ${item.severity === "Blocker" ? "blocker" : "warning"}`}
      data-testid={`attention-${item.id}`}
    >
      <span className="attention-kind">{KIND_LABEL[item.kind]}</span>
      <div className="attention-body">
        <div className="attention-title">{item.title}</div>
        <div className="attention-detail">{item.detail}</div>
        <div className="attention-meta">
          {item.unitId && <Link href={`/units/${item.unitId}`}>{item.unitId}</Link>}
          {item.ownerLabel && <span>{item.ownerLabel}</span>}
        </div>
      </div>
    </div>
  );
}

function LineDetailsSheet({
  orderNo,
  lineId,
  onClose
}: {
  orderNo: string;
  lineId: string;
  onClose: () => void;
}) {
  const state = useAppState();
  const ctx = lineContextFor(state, orderNo, lineId);
  const visible = ctx?.config1196 ? LINE_SECTIONS : LINE_SECTIONS_BASE;
  const [section, setSection] = useState<LineSectionKey>("config");
  if (!ctx) return null;

  return (
    <Modal
      title={`Line ${ctx.line.lineNumber} — ${ctx.line.product}`}
      subtitle={`${ctx.line.orderedMaterial} · Qty ${ctx.line.quantity} · ${ctx.units.length} Unit${ctx.units.length === 1 ? "" : "s"}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" data-testid="line-sheet-done" onClick={onClose}>
          Done
        </button>
      }
    >
      {/* Provenance. The frozen CPQ checksum and the 1196 rule-set version are
          the traceability that says this configuration cannot drift — they
          belong with the technical detail, not on the everyday landing view. */}
      <div className="line-provenance">
        Source: {ctx.line.sourceSystem} · {ctx.units.length} Unit
        {ctx.units.length === 1 ? "" : "s"}
        {ctx.line.sourceSystem === "CPQ" && ctx.snapshot && (
          <>
            {" "}· CPQ {ctx.line.cpqQuoteId} · checksum{" "}
            <code data-testid={`line-checksum-${ctx.line.lineNumber}`}>{ctx.snapshot.checksum}</code> (frozen)
          </>
        )}
        {ctx.config1196 && (
          <>
            {" "}· 1196 controlled manual configuration · rule set{" "}
            <code data-testid={`line-rules-version-${ctx.line.lineNumber}`}>{ctx.config1196.rulesVersion}</code> (frozen)
          </>
        )}
      </div>

      {/* A spare or bought-out item is packable order scope that never bears
          Units, so it must not offer to add one. */}
      {ctx.line.executionDisposition !== "line-level-scope" && (
        <AddUnitsControl
          orderNo={orderNo}
          lineId={ctx.lineId}
          lineNumber={ctx.line.lineNumber}
          unitCount={ctx.units.length}
        />
      )}

      <nav className="tabs" aria-label="Line detail sections">
        {visible.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${section === key ? "active" : ""}`}
            data-testid={`line-sheet-${key}`}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <LineSectionBody ctx={ctx} section={section} />
    </Modal>
  );
}

function LineGroup({
  line,
  onOpenDetails
}: {
  line: LineTreeNode;
  onOpenDetails: (lineId: string) => void;
}) {
  const state = useAppState();

  return (
    <section className="line-group" data-testid={`line-group-${line.line.lineNumber}`}>
      <header className="line-group-head">
        <div>
          <div className="line-group-title">
            {line.displayRef} · {line.line.product}
          </div>
          <div className="line-group-sub">
            {line.line.orderedMaterial} · Qty {line.line.quantity}
            {line.units.length === 0 && " · loose parts, no Units"}
          </div>
        </div>
        <button
          type="button"
          className="btn"
          data-testid={`line-details-${line.line.lineNumber}`}
          onClick={() => onOpenDetails(line.line.id)}
        >
          Line details
        </button>
      </header>

      {line.units.map((node) => {
        const cp = checklistProgress(state, node.unit.unitId);
        return (
          <Link
            key={node.nodeId}
            href={`/units/${node.unit.unitId}`}
            className="unit-row"
            data-testid={`unit-row-${node.unit.unitId}`}
          >
            <span className="unit-row-ref">{unitDisplayRef(node.unit)}</span>
            <UnitStatusBadge status={node.unit.status} />
            <span className="unit-row-meta">
              {node.unit.serial ? `SN ${node.unit.serial}` : "no serial"}
              {" · "}
              {cp.done}/{cp.total} checks
            </span>
            {node.unit.holdReason && (
              <span className="unit-row-hold">{node.unit.holdReason}</span>
            )}
          </Link>
        );
      })}
    </section>
  );
}

export function OrderWorkspace({ orderNo, asOf }: { orderNo: string; asOf: string }) {
  const state = useAppState();
  const [detailsLineId, setDetailsLineId] = useState<string | null>(null);

  const order = orderByNumber(state, orderNo);
  const tree = buildOrderTree(state, orderNo);
  if (!order || !tree) {
    return (
      <div className="page">
        <h1>Order not found</h1>
        <p>
          No order “{orderNo}” exists in the mock data. <Link href="/orders">Back to orders</Link>
        </p>
      </div>
    );
  }

  const summary = summarizeOrderTree(state, tree);
  const attention = orderAttention(state, orderNo, asOf);
  const openActions = state.tasks.filter((t) => t.orderNumber === orderNo && t.status !== "Complete");
  const activityCount = postsForOrder(state, orderNo).length;
  const pallets = state.pallets.filter((p) => p.orderNumber === orderNo);
  const pct = summary.totalUnits > 0 ? (summary.complete / summary.totalUnits) * 100 : 0;

  return (
    <div className="page">
      {/* --- Identity ------------------------------------------------- */}
      <header className="order-head" data-testid="order-head">
        <h1>{order.orderNumber}</h1>
        <div className="order-head-line">
          {customerNameWithCity(state, order.customerId)} · PO {order.customerPo}
          {order.cpqReference && <span data-testid="order-cpq-reference"> · CPQ {order.cpqReference}</span>}
        </div>
        <div className="order-head-line">
          Due {order.dueDate} · {order.facility} · {order.productFamily}
        </div>
        <div className="progress-track" style={{ marginTop: 8 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="order-head-line" data-testid="order-progress">
          {summary.complete} of {summary.totalUnits} Units complete
          {summary.blocked > 0 && ` · ${summary.blocked} blocked`}
          {summary.waitingOnMaterial > 0 && ` · ${summary.waitingOnMaterial} waiting on material`}
        </div>
      </header>

      {/* --- Exceptions first ----------------------------------------- */}
      {attention.length > 0 && (
        <section data-testid="order-attention">
          <h3 className="section-head danger">Attention ({attention.length})</h3>
          {attention.slice(0, 6).map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
          {attention.length > 6 && (
            <p className="more-note" data-testid="attention-more">
              {attention.length - 6} more — resolve the ones above first.
            </p>
          )}
        </section>
      )}

      {/* --- Lines and Units ------------------------------------------ */}
      <section>
        <h3 className="section-head">Lines and Units</h3>
        {tree.lines.map((line) => (
          <LineGroup key={line.nodeId} line={line} onOpenDetails={setDetailsLineId} />
        ))}
      </section>

      {/* --- Material and purchasing: derived, order-scoped ------------- */}
      <PurchasingPanel orderNo={orderNo} asOf={asOf} />

      {/* --- Counts, not expanded lists ------------------------------- */}
      <section className="order-counts" data-testid="order-counts">
        {openActions.length > 0 && (
          <Link className="count-card" href={`/work?view=all&order=${orderNo}`} data-testid="count-actions">
            <span className="count-n">{openActions.length}</span>
            Open actions
          </Link>
        )}
        <Link className="count-card" href={`/orders/${orderNo}?tab=shipments`} data-testid="count-shipments">
          <span className="count-n">{pallets.length}</span>
          Shipments
        </Link>
        {activityCount > 0 && (
          <Link className="count-card" href={`/orders/${orderNo}?tab=activity`} data-testid="count-activity">
            <span className="count-n">{activityCount}</span>
            Activity
          </Link>
        )}
        <Link className="count-card" href={`/orders/${orderNo}?tab=audit`} data-testid="count-audit">
          <span className="count-n">·</span>
          Audit
        </Link>
      </section>

      {detailsLineId && (
        <LineDetailsSheet
          orderNo={orderNo}
          lineId={detailsLineId}
          onClose={() => setDetailsLineId(null)}
        />
      )}
    </div>
  );
}
