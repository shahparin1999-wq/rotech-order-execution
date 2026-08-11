"use client";

// The Execution tab: a two-pane Order -> Line -> Unit Explorer, plus the
// order-root sections (Overview / Shipping / Documents) that used to be
// separate top-level tabs. Everything a person can reach here is addressed by
// `?node=...&section=...`, so any view is a link.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import {
  employeeName,
  orderByNumber,
  orderProgress,
  unitById,
  unitsForOrder
} from "@/domain/selectors";
import {
  buildOrderTree,
  findLineNode,
  findUnitNode,
  parseNodeId,
  summarizeOrderTree
} from "@/domain/ledger/orderTree";
import type { UnitStatus } from "@/domain/types";
import { UnitStatusBadge } from "@/components/bits";
import { OrderTree } from "@/components/order/OrderTree";
import { RequiredVsActualPanel } from "@/components/RequiredVsActual";
import { FieldGroup } from "@/components/Drawer";
import {
  LINE_SECTIONS,
  LINE_SECTIONS_BASE,
  LineSectionBody,
  lineContextFor,
  AddUnitsControl,
  type LineSectionKey
} from "@/components/order/LineSections";

// ---------------------------------------------------------------------------
// Fraction chip — clickable summary, used in the header and the Overview
// section.
// ---------------------------------------------------------------------------

export function FractionLink({
  orderNo,
  count,
  total,
  status,
  label
}: {
  orderNo: string;
  count: number;
  total: number;
  status: UnitStatus;
  label: string;
}) {
  const router = useRouter();
  return (
    <button
      className="pill-link"
      data-testid={`fraction-${status}`}
      onClick={() => router.push(`/orders/${orderNo}?tab=units&status=${status}`)}
      title={`Show exactly which Units are ${label}`}
    >
      {count}/{total} {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Order-root sections
// ---------------------------------------------------------------------------

export function OrderOverviewSection({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const order = orderByNumber(state, orderNo)!;
  const p = orderProgress(state, orderNo);
  return (
    <div className="grid-2">
      <div className="card">
        <h3>Unit progress</h3>
        <ul style={{ paddingLeft: 18, lineHeight: 2 }}>
          <li>
            <FractionLink orderNo={orderNo} count={p.complete.length} total={p.total} status="Complete" label="complete" />
          </li>
          <li>
            <FractionLink orderNo={orderNo} count={p.inProgress.length} total={p.total} status="InAssembly" label="in assembly" />
          </li>
          <li>
            <FractionLink orderNo={orderNo} count={p.awaitingQuality.length} total={p.total} status="AwaitingQuality" label="awaiting quality" />
          </li>
          <li>
            <FractionLink orderNo={orderNo} count={p.blocked.length} total={p.total} status="Blocked" label="blocked" />
          </li>
          <li>
            <FractionLink orderNo={orderNo} count={p.notStarted.length} total={p.total} status="NotStarted" label="not started" />
          </li>
        </ul>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(p.complete.length / p.total) * 100}%` }} />
        </div>
      </div>
      <div className="card">
        <h3>Risks and next decisions</h3>
        {order.risks.length === 0 && <p>No open risks.</p>}
        <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          {order.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>Line summary</h3>
        {order.lines.map((l) => (
          <p key={l.lineNumber}>
            Line {l.lineNumber}: <b>{l.product}</b> — {l.description}
            <br />
            Quantity {l.quantity} · ordered material {l.orderedMaterial} · template {l.templateName}
          </p>
        ))}
      </div>
      <div className="card">
        <h3>Links</h3>
        <p>
          <span style={{ color: "var(--text-subtle)" }}>{order.teamsLinkPlaceholder}</span>
        </p>
        <Link className="btn btn-primary" href={`/labels?order=${orderNo}`}>
          Print Work Order Plan
        </Link>
      </div>
    </div>
  );
}

export function OrderShippingSection({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const pallet = state.pallets.find((p) => p.orderNumber === orderNo);
  const units = unitsForOrder(state, orderNo);
  const shipped = units.filter((u) => u.status === "Complete");
  return (
    <div className="grid-2">
      <div className="card">
        <h3>Packaging and shipment (mock)</h3>
        <p>
          {shipped.length}/{units.length} Units packaged and staged for shipment.
        </p>
        {pallet ? (
          <p>
            Pallet <b>{pallet.id}</b> → {pallet.destination}
            <br />
            Weight {pallet.weight} · dimensions {pallet.dimensions} · {pallet.packageCount} package(s)
            <br />
            <Link href="/labels">View pallet label preview</Link>
          </p>
        ) : (
          <p>No pallet record yet.</p>
        )}
      </div>
      <div className="card">
        <h3>Dispatch readiness</h3>
        <p style={{ color: "var(--text-subtle)" }}>
          Dispatch is blocked until every non-cancelled Unit is released. This mock view mirrors that rule:{" "}
          {units.length - shipped.length} Unit(s) not yet released.
        </p>
      </div>
    </div>
  );
}

export function OrderDocumentsSection({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const units = unitsForOrder(state, orderNo);
  const files = state.attachments.filter((a) => a.orderNumber === orderNo && a.kind === "file");
  return (
    <>
      <div className="card">
        <h3>Final documents (browser preview only)</h3>
        <ul style={{ lineHeight: 2, paddingLeft: 18 }}>
          {units.map((u) => (
            <li key={u.unitId}>
              <Link href={`/documents/${u.unitId}`}>{u.unitId}_Unit_QC_and_Manufacturing_History.pdf</Link>{" "}
              {u.status === "Complete" ? (
                <span className="badge save-saved">Ready (mock final)</span>
              ) : (
                <span className="badge save-pending">Draft preview</span>
              )}
            </li>
          ))}
          <li>
            <Link href={`/documents/order-summary/${orderNo}`}>{orderNo}_Order_Completion_Summary.pdf</Link>{" "}
            <span className="badge save-pending">Draft preview</span>
          </li>
        </ul>
      </div>
      <div className="card">
        <h3>Source and reference files</h3>
        {files.map((f) => (
          <div key={f.id} className="attachment-card">
            {f.fileName}
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}> added by {employeeName(state, f.employeeId)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const ORDER_SECTIONS = [
  ["overview", "Overview"],
  ["shipping", "Shipping"],
  ["documents", "Documents"]
] as const;
type OrderSectionKey = (typeof ORDER_SECTIONS)[number][0];

function OrderDetailPane({ orderNo, section }: { orderNo: string; section: string | null }) {
  const active: OrderSectionKey = ORDER_SECTIONS.some(([k]) => k === section) ? (section as OrderSectionKey) : "overview";
  return (
    <div>
      <nav className="tabs" aria-label="Order root sections" data-testid="order-node-sections">
        {ORDER_SECTIONS.map(([key, label]) => (
          <Link
            key={key}
            className={`tab ${active === key ? "active" : ""}`}
            href={`/orders/${orderNo}?tab=execution&node=order&section=${key}`}
            data-testid={`order-section-${key}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {active === "overview" && <OrderOverviewSection orderNo={orderNo} />}
      {active === "shipping" && <OrderShippingSection orderNo={orderNo} />}
      {active === "documents" && <OrderDocumentsSection orderNo={orderNo} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line node pane
// ---------------------------------------------------------------------------

function LineDetailPane({ orderNo, lineNumber, section }: { orderNo: string; lineNumber: number; section: string | null }) {
  const state = useAppState();
  const order = orderByNumber(state, orderNo);
  const line = order?.lines.find((l) => l.lineNumber === lineNumber);
  const ctx = line ? lineContextFor(state, orderNo, line.id) : undefined;

  if (!order || !line || !ctx) {
    return <p>Line {lineNumber} not found.</p>;
  }

  const visible = ctx.config1196 ? LINE_SECTIONS : LINE_SECTIONS_BASE;
  const active: LineSectionKey = visible.some(([k]) => k === section) ? (section as LineSectionKey) : visible[0][0];

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>
        {orderNo}-{lineNumber}: {line.product} — Quantity {line.quantity}
      </h3>
      <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 8 }}>
        Source: {line.sourceSystem} · {ctx.units.length} Unit{ctx.units.length === 1 ? "" : "s"}
        {line.sourceSystem === "CPQ" && ctx.snapshot && (
          <>
            {" "}· CPQ {line.cpqQuoteId} rev via snapshot · checksum <code>{ctx.snapshot.checksum}</code> (frozen)
          </>
        )}
        {ctx.config1196 && (
          <>
            {" "}· 1196 controlled manual configuration · rule set <code>{ctx.config1196.rulesVersion}</code> (frozen)
          </>
        )}
      </div>

      {line.executionDisposition !== "line-level-scope" && (
        <AddUnitsControl orderNo={orderNo} lineId={line.id} lineNumber={line.lineNumber} unitCount={ctx.units.length} />
      )}

      <nav className="tabs" aria-label={`Line ${lineNumber} sections`} data-testid="line-node-sections">
        {visible.map(([key, label]) => (
          <Link
            key={key}
            className={`tab ${active === key ? "active" : ""}`}
            href={`/orders/${orderNo}?tab=execution&node=line:${lineNumber}&section=${key}`}
            data-testid={`line-section-${key}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <LineSectionBody ctx={ctx} section={active} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unit node pane — a working summary plus the full Unit page for everything
// else (checklist, evidence, 1196 build, activity, audit), so this stays a
// narrow slice rather than re-implementing the Unit page inside the tree.
// ---------------------------------------------------------------------------

const UNIT_SECTIONS = [
  ["summary", "Summary"],
  ["parts", "Parts"]
] as const;
type UnitSectionKey = (typeof UNIT_SECTIONS)[number][0];

function UnitDetailPane({ unitId, section }: { unitId: string; section: string | null }) {
  const state = useAppState();
  const unit = unitById(state, unitId);
  if (!unit) return <p>Unit {unitId} not found.</p>;
  const active: UnitSectionKey = UNIT_SECTIONS.some(([k]) => k === section) ? (section as UnitSectionKey) : "summary";

  return (
    <div>
      <h3 style={{ marginTop: 0, display: "flex", gap: 10, alignItems: "center" }}>
        {unit.orderNumber}-{unit.lineNumber}.{unit.sequence}
        <UnitStatusBadge status={unit.status} />
      </h3>
      <p style={{ fontSize: 13.5, color: "var(--text-subtle)" }}>
        Serial {unit.serial ?? "pending"} · {unit.currentOperation} · {unit.location}
      </p>
      <nav className="tabs" aria-label="Unit node sections" data-testid="unit-node-sections">
        {UNIT_SECTIONS.map(([key, label]) => (
          <Link
            key={key}
            className={`tab ${active === key ? "active" : ""}`}
            href={`/orders/${unit.orderNumber}?tab=execution&node=unit:${unitId}&section=${key}`}
            data-testid={`unit-section-${key}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {active === "summary" && (
        <div className="card">
          <p>
            Ordered material {unit.orderedMaterial}
            {unit.asBuiltMaterial !== unit.orderedMaterial && <> — as-built {unit.asBuiltMaterial}</>}
          </p>
          {unit.holdReason && <p style={{ color: "var(--danger)" }}>{unit.holdReason}</p>}
          <Link className="btn btn-primary" href={`/units/${unitId}`}>
            Open full Unit page (checklist, evidence, activity, audit)
          </Link>
        </div>
      )}
      {active === "parts" && (
        <div className="card">
          <p style={{ fontSize: 13.5, color: "var(--text-subtle)" }}>
            Belongs to {unitId} alone and never appears on a sibling Unit.
          </p>
          <RequiredVsActualPanel unitId={unitId} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level explorer
// ---------------------------------------------------------------------------

export function OrderExecutionExplorer({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const params = useSearchParams();
  const tree = buildOrderTree(state, orderNo);
  if (!tree) return <p>Order not found.</p>;

  const nodeId = params.get("node");
  const section = params.get("section");
  const parsed = parseNodeId(nodeId);
  const summary = summarizeOrderTree(state, tree);

  let pane: React.ReactNode;
  let selectedNodeId = tree.nodeId;
  if (parsed.kind === "line") {
    const found = findLineNode(tree, parsed.lineNumber);
    selectedNodeId = found?.nodeId ?? tree.nodeId;
    pane = found ? (
      <LineDetailPane orderNo={orderNo} lineNumber={parsed.lineNumber} section={section} />
    ) : (
      <OrderDetailPane orderNo={orderNo} section={section} />
    );
  } else if (parsed.kind === "unit") {
    const found = findUnitNode(tree, parsed.unitId);
    selectedNodeId = found?.nodeId ?? tree.nodeId;
    pane = found ? (
      <UnitDetailPane unitId={parsed.unitId} section={section} />
    ) : (
      <OrderDetailPane orderNo={orderNo} section={section} />
    );
  } else {
    pane = <OrderDetailPane orderNo={orderNo} section={section} />;
  }

  return (
    <div>
      <p data-testid="order-tree-summary" style={{ fontSize: 13.5, color: "var(--text-subtle)", margin: "0 0 10px" }}>
        {summary.complete} of {summary.totalUnits} Units complete
        {summary.blocked > 0 && ` · ${summary.blocked} blocked`}
        {summary.waitingOnMaterial > 0 && ` · ${summary.waitingOnMaterial} waiting on material`}
      </p>
      <div className="order-explorer">
        <div className="card order-explorer-tree">
          <OrderTree orderNo={orderNo} tree={tree} selectedNodeId={selectedNodeId} />
        </div>
        <div className="card" data-testid="order-detail-pane">
          {pane}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions menu — replaces the six-button command bar and its four separately
// toggled inline forms with one entry point.
// ---------------------------------------------------------------------------

export function OrderActionsMenu({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const order = orderByNumber(state, orderNo)!;
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"edit" | "unitNote" | "dueDate" | "contact" | null>(null);

  const [editPo, setEditPo] = useState(order.customerPo);
  const [editOrderType, setEditOrderType] = useState(order.orderType);
  const [noteUnitId, setNoteUnitId] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [newDueDate, setNewDueDate] = useState(order.dueDate);
  const [contactName, setContactName] = useState("");

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        className="btn"
        data-testid="order-actions-toggle"
        onClick={() => {
          setOpen((v) => !v);
          setAction(null);
        }}
      >
        Actions ⋯
      </button>

      {open && (
        <div className="card" style={{ marginTop: 8 }} data-testid="order-actions-panel">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: action ? 10 : 0 }}>
            <button type="button" className="btn" data-testid="order-edit" onClick={() => setAction("edit")}>
              Edit order
            </button>
            <button type="button" className="btn" data-testid="order-add-unit-note" onClick={() => setAction("unitNote")}>
              Add Unit note
            </button>
            <button type="button" className="btn" data-testid="order-change-duedate" onClick={() => setAction("dueDate")}>
              Change due date
            </button>
            <button type="button" className="btn" data-testid="order-add-contact" onClick={() => setAction("contact")}>
              Add customer contact
            </button>
          </div>

          {action === "edit" && (
            <div data-testid="order-edit-panel">
              <div className="field-row">
                <FieldGroup label="Customer PO">
                  <input value={editPo} onChange={(e) => setEditPo(e.target.value)} />
                </FieldGroup>
                <FieldGroup label="Order type">
                  <input value={editOrderType} onChange={(e) => setEditOrderType(e.target.value)} />
                </FieldGroup>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="order-edit-save"
                onClick={() => {
                  dispatch({ type: "editOrder", orderNumber: orderNo, input: { customerPo: editPo, orderType: editOrderType } });
                  setOpen(false);
                }}
              >
                Save
              </button>
            </div>
          )}

          {action === "unitNote" && (
            <div data-testid="order-unit-note-panel">
              <FieldGroup label="Unit">
                <select value={noteUnitId} onChange={(e) => setNoteUnitId(e.target.value)} data-testid="order-unit-note-select">
                  <option value="">Select a Unit…</option>
                  {unitsForOrder(state, orderNo).map((u) => (
                    <option key={u.unitId} value={u.unitId}>
                      {u.unitId}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Note">
                <textarea rows={2} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} data-testid="order-unit-note-body" />
              </FieldGroup>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!noteUnitId || !noteBody.trim()}
                data-testid="order-unit-note-save"
                onClick={() => {
                  dispatch({ type: "addPost", orderNumber: orderNo, unitId: noteUnitId, body: noteBody.trim() });
                  setOpen(false);
                }}
              >
                Save note
              </button>
            </div>
          )}

          {action === "dueDate" && (
            <div data-testid="order-duedate-panel">
              <FieldGroup label="New due date">
                <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} data-testid="order-duedate-input" />
              </FieldGroup>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!newDueDate}
                data-testid="order-duedate-save"
                onClick={() => {
                  dispatch({ type: "changeOrderDueDate", orderNumber: orderNo, dueDate: newDueDate });
                  setOpen(false);
                }}
              >
                Save
              </button>
            </div>
          )}

          {action === "contact" && (
            <div data-testid="order-add-contact-panel">
              <FieldGroup label="Contact name">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} data-testid="order-contact-name" />
              </FieldGroup>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!contactName.trim()}
                data-testid="order-contact-save"
                onClick={() => {
                  dispatch({ type: "createContact", customerId: order.customerId, input: { name: contactName.trim() } });
                  setOpen(false);
                }}
              >
                Save contact
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
