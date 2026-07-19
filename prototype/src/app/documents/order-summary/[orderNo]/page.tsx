"use client";

// Browser preview of the order completion summary covering all five Units.

import Link from "next/link";
import { use } from "react";
import { useAppState } from "@/store/StoreProvider";
import { buildOrderSummarySnapshot } from "@/domain/documents";
import { orderByNumber, orderProgress } from "@/domain/selectors";
import { QrSvg } from "@/components/bits";

function SummaryView({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const order = orderByNumber(state, orderNo);
  if (!order) {
    return (
      <div className="page">
        <h1>Order not found</h1>
        <Link href="/orders">Back to orders</Link>
      </div>
    );
  }
  const snap = buildOrderSummarySnapshot(state, orderNo);
  const p = orderProgress(state, orderNo);

  return (
    <div className="page">
      <div style={{ marginBottom: 14 }}>
        <Link className="btn" href={`/orders/${orderNo}`}>
          ← Order {orderNo}
        </Link>
      </div>
      <div className="doc-page" data-testid="order-summary-document">
        <div className="doc-watermark">Draft — order not yet complete</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ marginTop: 0 }}>Order Completion Summary</h1>
            <p style={{ fontSize: 15, lineHeight: 1.85 }}>
              <b>Order:</b> {snap.orderNumber}
              <br />
              <b>Customer:</b> {snap.customer}
              <br />
              <b>Customer PO:</b> {snap.customerPo}
              <br />
              <b>Due date:</b> {order.dueDate}
              <br />
              <b>Facility:</b> {order.facility}
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <QrSvg value={order.publicRef} size={110} />
            <div style={{ fontSize: 11 }}>{order.publicRef}</div>
          </div>
        </div>

        <h2>Unit register ({snap.units.length} Units)</h2>
        <table className="data" data-testid="summary-units">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Serial</th>
              <th>Status</th>
              <th>As-built material</th>
              <th>Unit document</th>
            </tr>
          </thead>
          <tbody>
            {snap.units.map((u) => (
              <tr key={u.unitId}>
                <td>
                  <Link href={`/documents/${u.unitId}`}>{u.unitId}</Link>
                </td>
                <td>{u.serial ?? "Serial pending"}</td>
                <td>{u.status}</td>
                <td>{u.asBuiltMaterial}</td>
                <td style={{ fontSize: 11.5 }}>{u.documentName}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Progress</h2>
        <p>
          {p.complete.length} of {p.total} Units complete · {p.blocked.length} blocked ·{" "}
          {p.awaitingQuality.length} awaiting quality · {p.inProgress.length} in assembly ·{" "}
          {p.notStarted.length} not started
        </p>

        <h2>Changes across the order</h2>
        {state.materialChanges.filter((m) => snap.units.some((u) => u.unitId === m.unitId)).map((mc) => (
          <p key={mc.id}>
            {mc.unitId}: {mc.orderedMaterial} → {mc.proposedMaterial} ({mc.status})
          </p>
        ))}
        {state.specialInstructions.filter((s) => snap.units.some((u) => u.unitId === s.unitId)).map((s) => (
          <p key={s.id}>
            {s.unitId}: {s.part} — {s.instruction} ({s.verificationStatus})
          </p>
        ))}

        <h2>Release status</h2>
        <p>
          The order closes only when every non-cancelled Unit is released and every
          required Unit document is successfully generated. {p.total - p.complete.length}{" "}
          Unit(s) remain outstanding.
        </p>
      </div>
    </div>
  );
}

export default function OrderSummaryPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = use(params);
  return <SummaryView orderNo={decodeURIComponent(orderNo)} />;
}
