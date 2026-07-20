"use client";

// Location, department, My Work, Blocked, and Search views. Every view is a
// filter over the same master orders — no duplicate orders per location.

import Link from "next/link";
import { use, useState } from "react";
import { useAppState } from "@/store/StoreProvider";
import {
  applyView,
  currentHandoff,
  customerName,
  employeeName,
  myWorkSections,
  search,
  type ViewId
} from "@/domain/selectors";
import type { Task } from "@/domain/types";
import { PriorityBadge, TaskStatusBadge, UnitStatusBadge } from "@/components/bits";

const TITLES: Record<string, string> = {
  "my-work": "My Work",
  mississauga: "Mississauga",
  houston: "Houston",
  machining: "Machining",
  assembly: "Assembly",
  quality: "Quality",
  shipping: "Shipping",
  blocked: "Blocked Work",
  search: "Search"
};

function SearchView() {
  const state = useAppState();
  const [q, setQ] = useState("");
  const hits = search(state, q);
  return (
    <>
      <input
        placeholder="Search orders, Units, serials, tasks, comments, file names…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 520 }}
        aria-label="Search"
        data-testid="search-input"
      />
      <div style={{ marginTop: 14 }} data-testid="search-results">
        {q.trim() && hits.length === 0 && <p>No results for “{q}”.</p>}
        {hits.map((h) => (
          <Link key={`${h.type}-${h.id}`} href={h.href} className="record-list-item">
            <span className="badge s-notstarted">{h.type}</span> <b>{h.title}</b>
            <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>{h.subtitle}</div>
          </Link>
        ))}
      </div>
    </>
  );
}

function TaskRow({ t }: { t: Task }) {
  const state = useAppState();
  // A Unit-linked task keeps its dedicated shop-floor operation view; other
  // tasks route to Planner, where they can be worked from the board/grid.
  const href = t.unitId ? `/tablet/${t.unitId}` : "/planner";
  return (
    <Link href={href} className="record-list-item" data-testid={`my-work-task-${t.id}`}>
      <b>{t.name}</b> <TaskStatusBadge status={t.status} /> <PriorityBadge priority={t.priority} />
      <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>
        {t.unitId ?? t.orderNumber ?? "Planner"} · owner {employeeName(state, t.ownerId)}
        {t.dueDate && <> · due {new Date(t.dueDate).toLocaleDateString("en-CA")}</>}
        {currentHandoff(t) && (
          <> · handoff recorded by {employeeName(state, currentHandoff(t)!.byId)}</>
        )}
      </div>
    </Link>
  );
}

function MyWorkSection({ title, tasks }: { title: string; tasks: Task[] }) {
  if (tasks.length === 0) return null;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title} ({tasks.length})</h3>
      {tasks.map((t) => (
        <TaskRow key={t.id} t={t} />
      ))}
    </div>
  );
}

function MyWorkView() {
  const state = useAppState();
  const me = state.employees.find((e) => e.id === state.currentUserId)!;
  const sections = myWorkSections(state, me.id);
  const total =
    sections.overdue.length + sections.dueToday.length + sections.dueThisWeek.length +
    sections.inProgress.length + sections.blocked.length;
  return (
    <>
      <p style={{ color: "var(--text-subtle)" }}>
        Work assigned to <b>{me.name}</b>, grouped by urgency. Unit-linked tasks open
        the dedicated shop-floor operation view; other tasks open in Planner.
      </p>
      {total === 0 && (
        <p>Nothing overdue, due soon, in progress, or blocked. Check Planner for the full backlog.</p>
      )}
      <MyWorkSection title="Overdue" tasks={sections.overdue} />
      <MyWorkSection title="Due today" tasks={sections.dueToday} />
      <MyWorkSection title="Due this week" tasks={sections.dueThisWeek} />
      <MyWorkSection title="In progress" tasks={sections.inProgress} />
      <MyWorkSection title="Blocked" tasks={sections.blocked} />
      <MyWorkSection title="Recently completed" tasks={sections.recentlyCompleted} />
    </>
  );
}

function FilteredView({ view }: { view: ViewId }) {
  const state = useAppState();
  const { orders, units } = applyView(state, view);
  return (
    <>
      <p style={{ color: "var(--text-subtle)" }}>
        This view is a <b>filter</b> over the master orders. Orders are never
        duplicated per location or department.
      </p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Orders in view ({orders.length})</h3>
        {orders.length === 0 && <p>No orders match this view.</p>}
        {orders.map((o) => (
          <Link key={o.orderNumber} href={`/orders/${o.orderNumber}`} className="record-list-item">
            <b>{o.orderNumber}</b> — {customerName(state, o.customerId)} · due {o.dueDate} · {o.facility}
          </Link>
        ))}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Units in view ({units.length})</h3>
        {units.length === 0 && <p>No Units match this view.</p>}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Status</th>
                <th>Current operation</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.unitId}>
                  <td>
                    <Link href={`/units/${u.unitId}`}>{u.unitId}</Link>
                  </td>
                  <td>
                    <UnitStatusBadge status={u.status} />
                    {u.holdReason && (
                      <div style={{ fontSize: 12, color: "var(--danger)" }}>{u.holdReason}</div>
                    )}
                  </td>
                  <td>{u.currentOperation}</td>
                  <td>{u.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = use(params);
  const title = TITLES[view] ?? view;
  return (
    <div className="page">
      <h1>{title}</h1>
      {view === "search" ? (
        <SearchView />
      ) : view === "my-work" ? (
        <MyWorkView />
      ) : (
        <FilteredView view={view as ViewId} />
      )}
    </div>
  );
}
