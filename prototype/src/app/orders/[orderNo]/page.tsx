"use client";

import Link from "next/link";
import { Suspense, use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import {
  checklistProgress,
  currentResponses,
  customerNameWithCity,
  employeeName,
  orderByNumber,
  orderProgress,
  PLANNER_BUCKETS,
  PLANNER_BUCKET_LABELS,
  tasksForOrder,
  unitsForOrder
} from "@/domain/selectors";
import type { PlannerBucket, Unit, UnitStatus } from "@/domain/types";
import {
  Exact,
  PriorityBadge,
  SaveStateBadge,
  TaskStatusBadge,
  UnitStatusBadge
} from "@/components/bits";
import { ActivityFeed } from "@/components/ActivityFeed";
import { NewTaskDrawer } from "@/components/NewTaskDrawer";
import { FieldGroup } from "@/components/Drawer";
import { PlusIcon } from "@/components/icons";

const TABS = [
  "overview",
  "units",
  "tasks",
  "planner",
  "materials",
  "quality",
  "shipping",
  "documents",
  "activity",
  "audit"
] as const;
type Tab = (typeof TABS)[number];

// Clickable fraction: navigates to the Units tab filtered to the exact set.
function FractionLink({
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

function UnitRow({ unit }: { unit: Unit }) {
  const state = useAppState();
  const cp = checklistProgress(state, unit.unitId);
  return (
    <tr data-testid={`unit-row-${unit.unitId}`}>
      <td>
        <Link href={`/units/${unit.unitId}`}>
          <b>{unit.unitId}</b>
        </Link>
      </td>
      <td>{unit.serial ?? <i>Serial pending</i>}</td>
      <td>
        <UnitStatusBadge status={unit.status} />
        {unit.holdReason && (
          <div style={{ fontSize: 12, color: "var(--danger)" }}>{unit.holdReason}</div>
        )}
      </td>
      <td>{unit.asBuiltMaterial}{unit.asBuiltMaterial !== unit.orderedMaterial ? ` (ordered ${unit.orderedMaterial})` : ""}</td>
      <td>{unit.currentOperation}</td>
      <td>{unit.location}</td>
      <td>
        <div className="progress-track" style={{ width: 90 }}>
          <div className="progress-fill" style={{ width: `${(cp.done / cp.total) * 100}%` }} />
        </div>
        <span style={{ fontSize: 12 }}>{cp.done}/{cp.total} checks</span>
      </td>
    </tr>
  );
}

function UnitsTab({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const params = useSearchParams();
  const statusFilter = params.get("status") as UnitStatus | null;
  const all = unitsForOrder(state, orderNo);
  const units = statusFilter ? all.filter((u) => u.status === statusFilter) : all;
  return (
    <div className="card">
      {statusFilter && (
        <p data-testid="drilldown-note">
          Showing <b>exactly {units.length}</b> Unit{units.length === 1 ? "" : "s"} in
          state <UnitStatusBadge status={statusFilter} /> —{" "}
          <Link href={`/orders/${orderNo}?tab=units`}>show all {all.length}</Link>
        </p>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Serial</th>
              <th>Status</th>
              <th>Material (as-built)</th>
              <th>Current operation</th>
              <th>Location</th>
              <th>Checklist</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <UnitRow key={u.unitId} unit={u} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverviewTab({ orderNo }: { orderNo: string }) {
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
            Quantity {l.quantity} · ordered material {l.orderedMaterial} · template{" "}
            {l.templateName}
          </p>
        ))}
      </div>
      <div className="card">
        <h3>Links</h3>
        <p>
          💬 <span style={{ color: "var(--text-subtle)" }}>{order.teamsLinkPlaceholder}</span>
        </p>
        <Link className="btn btn-primary" href={`/labels?order=${orderNo}`}>
          🖨️ Print Work Order Plan
        </Link>
      </div>
    </div>
  );
}

function TasksTab({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const tasks = state.tasks.filter((t) => t.orderNumber === orderNo);
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Task</th>
              <th>Unit</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Last event</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/units/${t.unitId}`}>{t.name}</Link>
                  {t.blockReason && (
                    <div style={{ fontSize: 12, color: "var(--danger)" }}>{t.blockReason}</div>
                  )}
                </td>
                <td>{t.unitId}</td>
                <td>
                  <TaskStatusBadge status={t.status} />
                </td>
                <td>{employeeName(state, t.ownerId)}</td>
                <td style={{ fontSize: 13 }}>
                  {t.history.length > 0 ? (
                    <>
                      {t.history.at(-1)!.action} · <Exact at={t.history.at(-1)!.at} />
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaterialsTab({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const units = unitsForOrder(state, orderNo);
  const changes = state.materialChanges.filter((m) =>
    units.some((u) => u.unitId === m.unitId)
  );
  return (
    <>
      <div className="card">
        <h3>Material changes (Unit-scoped)</h3>
        {changes.length === 0 && <p>No material changes.</p>}
        {changes.map((mc) => (
          <div key={mc.id} className="record-list-item" data-testid={`mc-${mc.id}`}>
            <b>
              {mc.orderedMaterial} → {mc.proposedMaterial}
            </b>{" "}
            on <Link href={`/units/${mc.unitId}`}>{mc.unitId}</Link>{" "}
            <span className={`badge ${mc.status === "Approved" ? "save-saved" : "save-pending"}`}>
              {mc.status}
            </span>
            <div style={{ fontSize: 13.5, marginTop: 4 }}>
              Reason: {mc.reason}
              <br />
              Requested by {employeeName(state, mc.requestedById)}
              {mc.approvedById && (
                <>
                  {" "}· approved by {employeeName(state, mc.approvedById)}{" "}
                  {mc.approvedAt && <Exact at={mc.approvedAt} />}
                </>
              )}
              <br />
              Evidence: {mc.evidencePlaceholder}
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Per-Unit material state</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Ordered</th>
                <th>As-built</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.unitId} data-testid={`material-${u.unitId}`}>
                  <td>{u.unitId}</td>
                  <td>{u.orderedMaterial}</td>
                  <td>
                    <b>{u.asBuiltMaterial}</b>
                    {u.asBuiltMaterial !== u.orderedMaterial && (
                      <span className="badge save-saved" style={{ marginLeft: 6 }}>
                        approved change
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function QualityTab({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const units = unitsForOrder(state, orderNo);
  return (
    <div className="card">
      <h3>Quality readiness by Unit</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Status</th>
              <th>Checklist</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const cp = checklistProgress(state, u.unitId);
              const flagged = [...currentResponses(state, u.unitId).values()].filter(
                (r) => r.state === "NeedsReview" || r.state === "Error"
              );
              return (
                <tr key={u.unitId}>
                  <td>
                    <Link href={`/units/${u.unitId}`}>{u.unitId}</Link>
                  </td>
                  <td>
                    <UnitStatusBadge status={u.status} />
                  </td>
                  <td>
                    {cp.done}/{cp.total} items complete
                  </td>
                  <td>
                    {flagged.length === 0 && "—"}
                    {flagged.map((r) => (
                      <div key={r.id} style={{ marginBottom: 3 }}>
                        <SaveStateBadge state={r.state} />{" "}
                        <span style={{ fontSize: 13 }}>{r.itemKey}: {r.note}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentsTab({ orderNo }: { orderNo: string }) {
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
              <Link href={`/documents/${u.unitId}`}>
                {u.unitId}_Unit_QC_and_Manufacturing_History.pdf
              </Link>{" "}
              {u.status === "Complete" ? (
                <span className="badge save-saved">Ready (mock final)</span>
              ) : (
                <span className="badge save-pending">Draft preview</span>
              )}
            </li>
          ))}
          <li>
            <Link href={`/documents/order-summary/${orderNo}`}>
              {orderNo}_Order_Completion_Summary.pdf
            </Link>{" "}
            <span className="badge save-pending">Draft preview</span>
          </li>
        </ul>
      </div>
      <div className="card">
        <h3>Source and reference files</h3>
        {files.map((f) => (
          <div key={f.id} className="attachment-card">
            📄 {f.fileName}
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>
              added by {employeeName(state, f.employeeId)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function ShippingTab({ orderNo }: { orderNo: string }) {
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
          Dispatch is blocked until every non-cancelled Unit is released. This mock
          view mirrors that rule: {units.length - shipped.length} Unit(s) not yet
          released.
        </p>
      </div>
    </div>
  );
}

function AuditTab({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const units = new Set(unitsForOrder(state, orderNo).map((u) => u.unitId));
  const events = state.auditEvents
    .filter((e) => e.unitId === null || units.has(e.unitId) || e.targetId === orderNo)
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="card">
      <h3>Append-only audit timeline</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>
                  <Exact at={e.at} />
                </td>
                <td>{employeeName(state, e.actorId)}</td>
                <td>
                  <code style={{ fontSize: 12.5 }}>{e.action}</code>
                  {e.supersedesEventId && (
                    <div className="badge save-needsreview" style={{ marginTop: 3 }}>
                      supersedes {e.supersedesEventId}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 13 }}>
                  {e.targetType} {e.unitId ?? ""}
                </td>
                <td style={{ fontSize: 13.5 }}>{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderPlannerTab({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const tasks = tasksForOrder(state, orderNo);
  return (
    <div className="planner-board" data-testid="order-planner-board">
      {PLANNER_BUCKETS.map((bucket) => {
        const bucketTasks = tasks.filter((t) => t.bucket === bucket);
        return (
          <div key={bucket} className="planner-column" data-testid={`order-planner-column-${bucket}`}>
            <div className="planner-column-header">
              {PLANNER_BUCKET_LABELS[bucket]} ({bucketTasks.length})
            </div>
            {bucketTasks.map((t) => (
              <div key={t.id} className="planner-card" data-testid={`order-planner-card-${t.id}`}>
                <div className="planner-card-title">
                  {t.unitId ? <Link href={`/units/${t.unitId}`}>{t.name}</Link> : t.name}
                </div>
                <div className="planner-card-meta">
                  <TaskStatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="planner-card-meta">
                  <span style={{ fontSize: 11.5 }}>{employeeName(state, t.ownerId)}</span>
                  <select
                    className="move-select"
                    value={t.bucket}
                    aria-label={`Move ${t.name} to bucket`}
                    onChange={(e) => dispatch({ type: "moveTaskBucket", taskId: t.id, bucket: e.target.value as PlannerBucket })}
                  >
                    {PLANNER_BUCKETS.map((b) => (
                      <option key={b} value={b}>{PLANNER_BUCKET_LABELS[b]}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function OrderWorkspace({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const params = useSearchParams();
  const tab = (params.get("tab") ?? "overview") as Tab;
  const order = orderByNumber(state, orderNo);
  const [showUnits, setShowUnits] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showEditOrder, setShowEditOrder] = useState(false);
  const [showUnitNote, setShowUnitNote] = useState(false);
  const [showDueDate, setShowDueDate] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [editPo, setEditPo] = useState("");
  const [editOrderType, setEditOrderType] = useState("");
  const [noteUnitId, setNoteUnitId] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [contactName, setContactName] = useState("");
  if (!order) {
    return (
      <div className="page">
        <h1>Order not found</h1>
        <p>
          No order “{orderNo}” exists in the mock data. <Link href="/orders">Back to orders</Link>
        </p>
      </div>
    );
  }
  const p = orderProgress(state, orderNo);

  return (
    <div className="page">
      <div className="card" style={{ borderTop: "4px solid var(--accent)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "baseline" }}>
          <h1 style={{ margin: 0 }}>{order.orderNumber}</h1>
          <span>
            <b>{customerNameWithCity(state, order.customerId)}</b> · PO {order.customerPo}
          </span>
          <span>Due {order.dueDate}</span>
          <span className="badge s-notstarted">{order.facility}</span>
          <span>
            {order.productFamily} · {order.orderType}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 10, alignItems: "center" }}>
          <span data-testid="header-progress">
            <FractionLink orderNo={orderNo} count={p.complete.length} total={p.total} status="Complete" label="Units complete" />
          </span>
          <span>
            <FractionLink orderNo={orderNo} count={p.blocked.length} total={p.total} status="Blocked" label="blocked" />
          </span>
          <button className="pill-link" onClick={() => setShowUnits((v) => !v)}>
            {showUnits ? "Hide" : "Show"} Unit set
          </button>
        </div>
        {showUnits && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="header-unit-set">
            {unitsForOrder(state, orderNo).map((u) => (
              <Link key={u.unitId} href={`/units/${u.unitId}`} className="attachment-card">
                {u.unitId} <UnitStatusBadge status={u.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="command-bar">
        <Link className="btn" href={`/labels?order=${orderNo}`}>
          Print Work Order Plan
        </Link>
        <button type="button" className="btn btn-primary" data-testid="order-new-task" onClick={() => setShowNewTask(true)}>
          <PlusIcon size={13} /> New task
        </button>
        <button type="button" className="btn" data-testid="order-edit" onClick={() => { setEditPo(order.customerPo); setEditOrderType(order.orderType); setShowEditOrder((v) => !v); }}>
          Edit order
        </button>
        <button type="button" className="btn" data-testid="order-add-unit-note" onClick={() => setShowUnitNote((v) => !v)}>
          Add Unit note
        </button>
        <button type="button" className="btn" data-testid="order-change-duedate" onClick={() => { setNewDueDate(order.dueDate); setShowDueDate((v) => !v); }}>
          Change due date
        </button>
        <button type="button" className="btn" data-testid="order-add-contact" onClick={() => setShowAddContact((v) => !v)}>
          Add customer contact
        </button>
      </div>

      {showEditOrder && (
        <div className="card" data-testid="order-edit-panel">
          <div className="field-row">
            <FieldGroup label="Customer PO">
              <input value={editPo} onChange={(e) => setEditPo(e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Order type">
              <input value={editOrderType} onChange={(e) => setEditOrderType(e.target.value)} />
            </FieldGroup>
          </div>
          <div className="composer-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="order-edit-save"
              onClick={() => {
                dispatch({ type: "editOrder", orderNumber: orderNo, input: { customerPo: editPo, orderType: editOrderType } });
                setShowEditOrder(false);
              }}
            >
              Save
            </button>
            <button type="button" className="btn" onClick={() => setShowEditOrder(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showUnitNote && (
        <div className="card" data-testid="order-unit-note-panel">
          <FieldGroup label="Unit">
            <select value={noteUnitId} onChange={(e) => setNoteUnitId(e.target.value)} data-testid="order-unit-note-select">
              <option value="">Select a Unit…</option>
              {unitsForOrder(state, orderNo).map((u) => (
                <option key={u.unitId} value={u.unitId}>{u.unitId}</option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Note">
            <textarea rows={2} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} data-testid="order-unit-note-body" />
          </FieldGroup>
          <div className="composer-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!noteUnitId || !noteBody.trim()}
              data-testid="order-unit-note-save"
              onClick={() => {
                dispatch({ type: "addPost", orderNumber: orderNo, unitId: noteUnitId, body: noteBody.trim() });
                setNoteBody("");
                setNoteUnitId("");
                setShowUnitNote(false);
              }}
            >
              Save note
            </button>
            <button type="button" className="btn" onClick={() => setShowUnitNote(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showDueDate && (
        <div className="card" data-testid="order-duedate-panel">
          <FieldGroup label="New due date">
            <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} data-testid="order-duedate-input" />
          </FieldGroup>
          <div className="composer-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!newDueDate}
              data-testid="order-duedate-save"
              onClick={() => {
                dispatch({ type: "changeOrderDueDate", orderNumber: orderNo, dueDate: newDueDate });
                setShowDueDate(false);
              }}
            >
              Save
            </button>
            <button type="button" className="btn" onClick={() => setShowDueDate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showAddContact && (
        <div className="card" data-testid="order-add-contact-panel">
          <FieldGroup label="Contact name">
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} data-testid="order-contact-name" />
          </FieldGroup>
          <div className="composer-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!contactName.trim()}
              data-testid="order-contact-save"
              onClick={() => {
                dispatch({ type: "createContact", customerId: order.customerId, input: { name: contactName.trim() } });
                setContactName("");
                setShowAddContact(false);
              }}
            >
              Save contact
            </button>
            <button type="button" className="btn" onClick={() => setShowAddContact(false)}>Cancel</button>
          </div>
        </div>
      )}

      <nav className="tabs" aria-label="Order tabs">
        {TABS.map((t) => (
          <Link
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            href={`/orders/${orderNo}?tab=${t}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab orderNo={orderNo} />}
      {tab === "units" && <UnitsTab orderNo={orderNo} />}
      {tab === "tasks" && <TasksTab orderNo={orderNo} />}
      {tab === "planner" && <OrderPlannerTab orderNo={orderNo} />}
      {tab === "activity" && <ActivityFeed orderNumber={orderNo} />}
      {tab === "materials" && <MaterialsTab orderNo={orderNo} />}
      {tab === "quality" && <QualityTab orderNo={orderNo} />}
      {tab === "documents" && <DocumentsTab orderNo={orderNo} />}
      {tab === "shipping" && <ShippingTab orderNo={orderNo} />}
      {tab === "audit" && <AuditTab orderNo={orderNo} />}

      {showNewTask && (
        <NewTaskDrawer onClose={() => setShowNewTask(false)} defaultOrderNumber={orderNo} />
      )}
    </div>
  );
}

export default function OrderPage({
  params
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = use(params);
  return (
    <Suspense>
      <OrderWorkspace orderNo={decodeURIComponent(orderNo)} />
    </Suspense>
  );
}
