"use client";

// Work — every Action a person owns or is assigned, in one place.
//
// This is the interim version: it reads the existing Task records directly.
// Step 6 of the frozen plan generalises Task into the unified Action concept
// (Production / PurchasingFollowUp / Receiving / Quality / Engineering /
// Shipping / CustomerFollowUp / InternalJob) and generates Actions from
// shortages, expectations, receipts and reservations — which stay their own
// structured records rather than becoming Actions themselves.
//
// The five views and their derivation rules are already the frozen ones, so
// the screen does not move under people when the domain lands.

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppState } from "@/store/StoreProvider";
import { employeeName, isAssignedTo, isOverdue } from "@/domain/selectors";
import type { AppState, Task } from "@/domain/types";
import { PriorityBadge, TaskStatusBadge } from "@/components/bits";
import { unitDisplayRef } from "@/domain/ids";

const VIEWS = [
  ["mine", "Mine"],
  ["ready", "Ready"],
  ["incoming", "Incoming"],
  ["waiting", "Waiting"],
  ["all", "All"]
] as const;
type ViewKey = (typeof VIEWS)[number][0];

function isOpen(task: Task): boolean {
  return task.status !== "Complete";
}

/** Frozen view rules. All derived — none of this is a stored field. */
function tasksForView(state: AppState, view: ViewKey, me: string): Task[] {
  const open = state.tasks.filter(isOpen);
  switch (view) {
    case "mine":
      return open.filter((t) => isAssignedTo(t, me) || t.ownerId === me);
    case "ready":
      return open.filter((t) => t.status === "Ready" || t.status === "InProgress");
    case "incoming":
      // Until the Receiving action type exists, this is work whose department
      // is Shipping/receiving-facing. Step 6 replaces it with the real type.
      return open.filter((t) => t.department === "Shipping");
    case "waiting":
      return open.filter((t) => t.status === "Blocked" || t.status === "WaitingInspection");
    case "all":
      return open;
  }
}

function ActionRow({ task }: { task: Task }) {
  const state = useAppState();
  const unit = task.unitId ? state.units.find((u) => u.unitId === task.unitId) : undefined;
  const overdue = isOverdue(task.dueDate);

  return (
    <div className="action-row" data-testid={`action-${task.id}`}>
      <div className="action-main">
        <div className="action-title">
          {task.unitId ? <Link href={`/units/${task.unitId}`}>{task.name}</Link> : task.name}
        </div>
        <div className="action-meta">
          {task.department && <span>{task.department}</span>}
          {task.orderNumber && (
            <Link href={`/orders/${task.orderNumber}`}>{task.orderNumber}</Link>
          )}
          {unit && <span>{unitDisplayRef(unit)}</span>}
          <span>{employeeName(state, task.ownerId)}</span>
          {task.dueDate && (
            <span style={overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
              {overdue ? "overdue " : "due "}
              {/* dueDate is stored full-ISO; only the date part is meaningful. */}
              {task.dueDate.slice(0, 10)}
            </span>
          )}
        </div>
        {task.blockReason && (
          <div className="action-blocker">blocked by: {task.blockReason}</div>
        )}
      </div>
      <div className="action-side">
        <TaskStatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>
    </div>
  );
}

function WorkView() {
  const state = useAppState();
  const params = useSearchParams();
  const router = useRouter();
  const me = state.currentUserId;
  const view = (params.get("view") ?? "mine") as ViewKey;
  const tasks = tasksForView(state, view, me);

  const overdue = tasks.filter((t) => isOverdue(t.dueDate));
  const waiting = tasks.filter(
    (t) => !isOverdue(t.dueDate) && (t.status === "Blocked" || t.status === "WaitingInspection")
  );
  const readyNow = tasks.filter((t) => !overdue.includes(t) && !waiting.includes(t));

  return (
    <div className="page">
      <h1 style={{ marginTop: 0 }}>Work</h1>

      <nav className="tabs" aria-label="Work views">
        {VIEWS.map(([key, label]) => {
          const count = tasksForView(state, key, me).length;
          return (
            <button
              key={key}
              type="button"
              className={`tab ${view === key ? "active" : ""}`}
              data-testid={`work-view-${key}`}
              onClick={() => router.push(`/work?view=${key}`)}
            >
              {label} {count > 0 && <span className="count-pill">{count}</span>}
            </button>
          );
        })}
      </nav>

      {tasks.length === 0 && (
        <p style={{ color: "var(--text-subtle)" }}>Nothing in this view.</p>
      )}

      {/* No empty sections — a heading with no rows never renders. */}
      {overdue.length > 0 && (
        <section>
          <h3 className="section-head danger">Overdue ({overdue.length})</h3>
          {overdue.map((t) => (
            <ActionRow key={t.id} task={t} />
          ))}
        </section>
      )}

      {readyNow.length > 0 && (
        <section>
          <h3 className="section-head">Ready now ({readyNow.length})</h3>
          {readyNow.map((t) => (
            <ActionRow key={t.id} task={t} />
          ))}
        </section>
      )}

      {waiting.length > 0 && (
        <section>
          <h3 className="section-head">Waiting ({waiting.length})</h3>
          {waiting.map((t) => (
            <ActionRow key={t.id} task={t} />
          ))}
        </section>
      )}
    </div>
  );
}

export default function WorkPage() {
  return (
    <Suspense>
      <WorkView />
    </Suspense>
  );
}
