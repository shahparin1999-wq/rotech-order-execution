"use client";

// Location, department, My Work, Blocked, and Search views. Every view is a
// filter over the same master orders — no duplicate orders per location.

import Link from "next/link";
import { use, useState } from "react";
import { useAppState } from "@/store/StoreProvider";
import {
  applyView,
  employeeName,
  myWork,
  search,
  type ViewId
} from "@/domain/selectors";
import { TaskStatusBadge, UnitStatusBadge } from "@/components/bits";

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

function MyWorkView() {
  const state = useAppState();
  const me = state.employees.find((e) => e.id === state.currentUserId)!;
  const work = myWork(state, me.id);
  return (
    <>
      <p style={{ color: "var(--text-subtle)" }}>
        Assigned, claimable, and resumable work for <b>{me.name}</b>.
      </p>
      {work.length === 0 && <p>Nothing assigned or claimable.</p>}
      {work.map((t) => (
        <Link key={t.id} href={`/tablet/${t.unitId}`} className="record-list-item">
          <b>{t.name}</b> <TaskStatusBadge status={t.status} />
          <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>
            {t.unitId} · owner {employeeName(state, t.ownerId)}
            {t.handoff && <> · handoff recorded by {employeeName(state, t.handoff.byId)}</>}
          </div>
        </Link>
      ))}
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
            <b>{o.orderNumber}</b> — {o.customer} · due {o.dueDate} · {o.facility}
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
