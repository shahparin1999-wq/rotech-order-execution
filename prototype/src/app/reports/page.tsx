"use client";

// A lightweight aggregate-stats view, not a full reporting/BI surface -
// consistent with this being a mock-data prototype, not a production system.

import { useAppState } from "@/store/StoreProvider";
import {
  isOrderCompleted,
  isOverdue,
  orderFlags,
  PLANNER_BUCKETS,
  PLANNER_BUCKET_LABELS
} from "@/domain/selectors";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>{label}</div>
    </div>
  );
}

export default function ReportsPage() {
  const state = useAppState();

  const openOrders = state.orders.filter((o) => !isOrderCompleted(state, o.orderNumber));
  const overdueOrders = state.orders.filter((o) => orderFlags(state, o.orderNumber).overdue);
  const blockedOrders = state.orders.filter((o) => orderFlags(state, o.orderNumber).blocked);
  const overdueTasks = state.tasks.filter((t) => t.status !== "Complete" && isOverdue(t.dueDate));
  const blockedUnits = state.units.filter((u) => u.status === "Blocked");
  const blockedTasks = state.tasks.filter((t) => t.status === "Blocked");

  const bucketCounts = PLANNER_BUCKETS.map((b) => ({
    bucket: b,
    count: state.tasks.filter((t) => t.bucket === b).length
  }));

  return (
    <div className="page">
      <div className="command-bar">
        <h1 className="command-bar-title">Reports</h1>
      </div>
      <p style={{ color: "var(--text-subtle)" }}>
        Aggregate counts computed live from mock data. This is a summary view,
        not a production reporting/BI pipeline.
      </p>

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <StatCard label="Open orders" value={openOrders.length} />
        <StatCard label="Overdue orders" value={overdueOrders.length} />
        <StatCard label="Orders with a blocked Unit" value={blockedOrders.length} />
        <StatCard label="Blocked Units" value={blockedUnits.length} />
        <StatCard label="Overdue tasks" value={overdueTasks.length} />
        <StatCard label="Blocked tasks" value={blockedTasks.length} />
        <StatCard label="Customers" value={state.customers.length} />
        <StatCard label="Total Units" value={state.units.length} />
      </div>

      <div className="card">
        <h3>Planner tasks by bucket</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Tasks</th>
              </tr>
            </thead>
            <tbody>
              {bucketCounts.map(({ bucket, count }) => (
                <tr key={bucket}>
                  <td>{PLANNER_BUCKET_LABELS[bucket]}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
