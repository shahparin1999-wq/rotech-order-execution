"use client";

import Link from "next/link";
import { useAppState } from "@/store/StoreProvider";
import {
  continueLastJob,
  employeeName,
  myWork,
  orderProgress,
  postsForOrder,
  unreadCountForOrder
} from "@/domain/selectors";
import { Exact, TaskStatusBadge, UnitStatusBadge } from "@/components/bits";

export default function HomePage() {
  const state = useAppState();
  const me = state.employees.find((e) => e.id === state.currentUserId)!;
  const work = myWork(state, me.id);
  const lastJob = continueLastJob(state, me.id);
  const blockedUnits = state.units.filter((u) => u.status === "Blocked");

  return (
    <div className="page">
      <h1>Home</h1>
      <p style={{ color: "var(--text-subtle)" }}>
        Signed in as <b>{me.name}</b> ({me.role}, {me.facility}) — mock identity,
        no real authentication.
      </p>

      {lastJob && (
        <div className="card" style={{ background: "var(--accent-soft)" }}>
          <h3 style={{ marginBottom: 6 }}>Continue last job</h3>
          <p style={{ margin: "4px 0 10px" }}>
            <b>{lastJob.name}</b> on <b>{lastJob.unitId}</b>{" "}
            <TaskStatusBadge status={lastJob.status} />
          </p>
          <Link className="btn btn-primary" href={`/tablet/${lastJob.unitId}`}>
            Continue Last Job
          </Link>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3>My Work</h3>
          {work.length === 0 && <p>No assigned or claimable work. Check the location queues.</p>}
          {work.map((t) => (
            <Link key={t.id} className="record-list-item" href={`/units/${t.unitId}`}>
              <b>{t.name}</b> <TaskStatusBadge status={t.status} />
              <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>
                {t.unitId} · owner {employeeName(state, t.ownerId)}
              </div>
            </Link>
          ))}
        </div>

        <div className="card">
          <h3>Blocked work</h3>
          {blockedUnits.length === 0 && <p>Nothing is blocked.</p>}
          {blockedUnits.map((u) => (
            <Link key={u.unitId} className="record-list-item" href={`/units/${u.unitId}`}>
              <b>{u.unitId}</b> <UnitStatusBadge status={u.status} />
              <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>{u.holdReason}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Active orders</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Due</th>
                <th>Facility</th>
                <th>Progress</th>
                <th>Unread</th>
              </tr>
            </thead>
            <tbody>
              {state.orders.map((o) => {
                const p = orderProgress(state, o.orderNumber);
                const unread = unreadCountForOrder(state, o.orderNumber);
                const latest = postsForOrder(state, o.orderNumber)[0];
                return (
                  <tr key={o.orderNumber}>
                    <td>
                      <Link href={`/orders/${o.orderNumber}`}>
                        <b>{o.orderNumber}</b>
                      </Link>
                      {latest && (
                        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                          Latest: {latest.body.slice(0, 60)}… <Exact at={latest.at} />
                        </div>
                      )}
                    </td>
                    <td>{o.customer}</td>
                    <td>{o.dueDate}</td>
                    <td>{o.facility}</td>
                    <td>
                      {p.complete.length}/{p.total} complete
                      {p.blocked.length > 0 && <> · {p.blocked.length} blocked</>}
                    </td>
                    <td>{unread > 0 ? <span className="badge save-error">{unread} new</span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
