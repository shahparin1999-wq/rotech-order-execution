"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppState } from "@/store/StoreProvider";
import { orderProgress, unreadCountForOrder } from "@/domain/selectors";
import { UnitStatusBadge } from "@/components/bits";

export default function OrdersPage() {
  const state = useAppState();
  const [q, setQ] = useState("");
  const orders = state.orders.filter(
    (o) =>
      !q.trim() ||
      o.orderNumber.toLowerCase().includes(q.toLowerCase()) ||
      o.customer.toLowerCase().includes(q.toLowerCase()) ||
      o.customerPo.includes(q)
  );

  return (
    <div className="page">
      <h1>Orders</h1>
      <input
        placeholder="Search order number, customer, or PO…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 420, marginBottom: 14 }}
        aria-label="Search orders"
      />
      {orders.map((o) => {
        const p = orderProgress(state, o.orderNumber);
        const unread = unreadCountForOrder(state, o.orderNumber);
        return (
          <Link key={o.orderNumber} href={`/orders/${o.orderNumber}`} className="record-list-item">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <b style={{ fontSize: 16 }}>{o.orderNumber}</b>
              <span>{o.customer}</span>
              <span style={{ color: "var(--text-subtle)" }}>PO {o.customerPo}</span>
              <span style={{ color: "var(--text-subtle)" }}>Due {o.dueDate}</span>
              <span className="badge s-notstarted">{o.facility}</span>
              {unread > 0 && <span className="badge save-error">{unread} unread</span>}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span>
                {p.complete.length}/{p.total} complete
              </span>
              {p.blocked.length > 0 && <UnitStatusBadge status="Blocked" />}
              {p.awaitingQuality.length > 0 && <UnitStatusBadge status="AwaitingQuality" />}
            </div>
          </Link>
        );
      })}
      {orders.length === 0 && <p>No orders match “{q}”.</p>}
    </div>
  );
}
