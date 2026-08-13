"use client";

// Order route.
//
// The landing view is the Order workspace: identity, attention, lines with
// compact Unit rows, and counts for actions/shipments/activity. It replaced
// eleven top tabs (overview / units / lines / tasks / planner / materials /
// quality / shipping / documents / activity / audit) and the two-pane
// Explorer tree.
//
// Three secondary views survive as `?tab=` destinations, reached from the
// count cards rather than from a permanent tab strip — they are genuinely
// order-wide logs, not part of the everyday drill-in.

import Link from "next/link";
import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { useAppState } from "@/store/StoreProvider";
import { employeeName, orderByNumber, unitsForOrder } from "@/domain/selectors";
import { Exact } from "@/components/bits";
import { ActivityFeed } from "@/components/ActivityFeed";
import { OrderWorkspace } from "@/components/order/OrderWorkspace";

type Tab = "activity" | "audit" | "shipments";

function BackToOrder({ orderNo, label }: { orderNo: string; label: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Link className="btn" href={`/orders/${orderNo}`}>
        ← {orderNo}
      </Link>
      <h1 style={{ marginTop: 12, marginBottom: 0 }}>{label}</h1>
    </div>
  );
}

function ShipmentsTab({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const units = unitsForOrder(state, orderNo);
  const pallets = state.pallets.filter((p) => p.orderNumber === orderNo);
  const shipped = new Set(pallets.flatMap((p) => p.unitIds));

  return (
    <>
      <div className="card">
        <h3>Shipped</h3>
        {pallets.length === 0 && <p>Nothing shipped yet.</p>}
        {pallets.map((p) => (
          <div key={p.id} className="record-list-item" data-testid={`shipment-${p.id}`}>
            <b>{p.id}</b> → {p.destination}
            <div style={{ fontSize: 13.5, marginTop: 4 }}>
              {p.unitIds.join(", ")}
              <br />
              {p.weight} · {p.dimensions} · {p.packageCount} package(s)
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Remaining</h3>
        {/* Partial shipment as a real state: an order is not simply Open or
            Shipped. The full FulfillmentContent model (which also covers
            loose line quantities with no Unit) lands in a later step. */}
        <ul style={{ paddingLeft: 18, lineHeight: 1.9 }}>
          {units
            .filter((u) => !shipped.has(u.unitId))
            .map((u) => (
              <li key={u.unitId}>
                <Link href={`/units/${u.unitId}`}>{u.unitId}</Link> — {u.status}
              </li>
            ))}
        </ul>
      </div>
    </>
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

function OrderRoute({ orderNo }: { orderNo: string }) {
  const state = useAppState();
  const params = useSearchParams();
  const tab = params.get("tab") as Tab | null;
  const order = orderByNumber(state, orderNo);

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

  if (tab === "activity") {
    return (
      <div className="page">
        <BackToOrder orderNo={orderNo} label="Activity" />
        <ActivityFeed orderNumber={orderNo} />
      </div>
    );
  }

  if (tab === "audit") {
    return (
      <div className="page">
        <BackToOrder orderNo={orderNo} label="Audit" />
        <AuditTab orderNo={orderNo} />
      </div>
    );
  }

  if (tab === "shipments") {
    return (
      <div className="page">
        <BackToOrder orderNo={orderNo} label="Shipments" />
        <ShipmentsTab orderNo={orderNo} />
      </div>
    );
  }

  // `asOf` is passed in rather than read inside the pure domain, which has no
  // ambient clock by design.
  return <OrderWorkspace orderNo={orderNo} asOf={new Date().toISOString()} />;
}

export default function OrderPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = use(params);
  return (
    <Suspense>
      <OrderRoute orderNo={decodeURIComponent(orderNo)} />
    </Suspense>
  );
}
