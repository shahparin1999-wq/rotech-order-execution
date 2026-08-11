"use client";

// Order workspace. The default view (`?tab=execution`, or no tab at all) is
// the Order -> Line -> Unit drill-down in OrderExecutionPane.tsx — replacing
// what used to be eleven flat tabs (Overview / Units / Lines / Tasks /
// Planner / Materials / Quality / Shipping / Documents) with one tree whose
// selected node is the URL.
//
// The legacy tab values (units/lines/tasks/planner/materials/quality/
// shipping/documents) are kept working here, reachable by direct link only —
// not from the nav — so nothing that already links or tests against them
// breaks. They fold into the tree in a later slice.

import Link from "next/link";
import { Suspense, use, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { PlusIcon } from "@/components/icons";
import {
  FractionLink,
  OrderActionsMenu,
  OrderDocumentsSection,
  OrderExecutionExplorer,
  OrderShippingSection
} from "@/components/order/OrderExecutionPane";
import {
  AddUnitsControl,
  lineContextFor,
  LineSectionBody,
  LINE_SECTIONS,
  LINE_SECTIONS_BASE,
  type LineSectionKey
} from "@/components/order/LineSections";

// "execution" is the new drill-down and the default landing tab. The rest are
// legacy surfaces, still reachable by a direct `?tab=` link.
type Tab =
  | "execution"
  | "units"
  | "lines"
  | "tasks"
  | "planner"
  | "materials"
  | "quality"
  | "shipping"
  | "documents"
  | "activity"
  | "audit";
const NAV_TABS: readonly Tab[] = ["execution", "activity", "audit"];
const NAV_LABEL: Partial<Record<Tab, string>> = { execution: "Execution" };

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

function LinesTab({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const order = orderByNumber(state, orderNo);
  if (!order) return <p>Order not found.</p>;
  return (
    <div>
      {order.lines.map((line) => (
        <LineCard key={line.id} orderNo={orderNo} lineId={line.id} />
      ))}
    </div>
  );
}

function LineCard({ orderNo, lineId }: { orderNo: string; lineId: string }) {
  const state = useAppState();
  const [sub, setSub] = useState<LineSectionKey>("config");
  const ctx = lineContextFor(state, orderNo, lineId);
  if (!ctx) return null;
  const { line, units } = ctx;
  const visibleSubtabs = ctx.config1196 ? LINE_SECTIONS : LINE_SECTIONS_BASE;

  return (
    <div className="card" data-testid={`line-card-${line.lineNumber}`} style={{ marginBottom: 16 }}>
      <h3>
        Line {line.lineNumber}: {line.product} — Quantity {line.quantity}
      </h3>
      <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 8 }}>
        Source: {line.sourceSystem} · {units.length} Unit{units.length === 1 ? "" : "s"}
        {line.sourceSystem === "CPQ" && ctx.snapshot && (
          <>
            {" "}· CPQ {line.cpqQuoteId} rev via snapshot · checksum{" "}
            <code data-testid={`line-checksum-${line.lineNumber}`}>{ctx.snapshot.checksum}</code> (frozen)
          </>
        )}
        {ctx.config1196 && (
          <>
            {" "}· 1196 controlled manual configuration · rule set{" "}
            <code data-testid={`line-rules-version-${line.lineNumber}`}>{ctx.config1196.rulesVersion}</code> (frozen)
          </>
        )}
      </div>

      {/* A spare or bought-out item is packable order scope that never bears
          Units, so it must not offer to add one. */}
      {line.executionDisposition !== "line-level-scope" && (
        <AddUnitsControl orderNo={orderNo} lineId={lineId} lineNumber={line.lineNumber} unitCount={units.length} />
      )}

      <nav className="tabs" aria-label={`Line ${line.lineNumber} tabs`}>
        {visibleSubtabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${sub === key ? "active" : ""}`}
            data-testid={`line-${line.lineNumber}-subtab-${key}`}
            onClick={() => setSub(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <LineSectionBody ctx={ctx} section={sub} />
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
  const params = useSearchParams();
  const tab = (params.get("tab") ?? "execution") as Tab;
  const order = orderByNumber(state, orderNo);
  const [showNewTask, setShowNewTask] = useState(false);
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
          <Link className="btn" href={`/labels?order=${orderNo}`}>
            Print Work Order Plan
          </Link>
          <button type="button" className="btn btn-primary" data-testid="order-new-task" onClick={() => setShowNewTask(true)}>
            <PlusIcon size={13} /> New task
          </button>
        </div>
      </div>

      <OrderActionsMenu orderNo={orderNo} />

      <nav className="tabs" aria-label="Order tabs">
        {NAV_TABS.map((t) => (
          <Link
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            href={`/orders/${orderNo}?tab=${t}`}
          >
            {NAV_LABEL[t] ?? t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </nav>

      {tab === "execution" && <OrderExecutionExplorer orderNo={orderNo} />}
      {tab === "units" && <UnitsTab orderNo={orderNo} />}
      {tab === "lines" && <LinesTab orderNo={orderNo} />}
      {tab === "tasks" && <TasksTab orderNo={orderNo} />}
      {tab === "planner" && <OrderPlannerTab orderNo={orderNo} />}
      {tab === "activity" && <ActivityFeed orderNumber={orderNo} />}
      {tab === "materials" && <MaterialsTab orderNo={orderNo} />}
      {tab === "quality" && <QualityTab orderNo={orderNo} />}
      {tab === "documents" && <OrderDocumentsSection orderNo={orderNo} />}
      {tab === "shipping" && <OrderShippingSection orderNo={orderNo} />}
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
