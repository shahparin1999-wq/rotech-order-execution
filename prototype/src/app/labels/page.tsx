"use client";

// Visual print previews for the seven label profiles in Document 04.
// Every label shows the QR beside a human-readable identifier and a label
// revision. Reprint appends a print event; it never creates a new identity.

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { ORDER_NO } from "@/domain/fixtures";
import { orderByNumber, orderProgress, unitStatusLabel, unitsForOrder } from "@/domain/selectors";
import { QrSvg } from "@/components/bits";

const LABEL_REV = "Label rev 1 (mock)";

function LabelFrame({
  title,
  size,
  publicRef,
  children,
  testId
}: {
  title: string;
  size: string;
  publicRef: string;
  children: React.ReactNode;
  testId: string;
}) {
  const dispatch = useAppDispatch();
  return (
    <div>
      <div className="print-label" data-testid={testId}>
        <div className="label-title">
          <span>{title}</span>
          <span>{size}</span>
        </div>
        <div className="label-body">
          <div className="label-fields">{children}</div>
          <div style={{ textAlign: "center" }}>
            <QrSvg value={publicRef} size={94} />
            <div style={{ fontSize: 9.5, marginTop: 2 }}>{LABEL_REV}</div>
          </div>
        </div>
        <div className="label-ref">
          Human-readable reference: <b>{publicRef}</b>
        </div>
      </div>
      <button
        className="btn"
        style={{ minHeight: 38, marginTop: 6 }}
        data-testid={`reprint-${testId}`}
        onClick={() => dispatch({ type: "reprintLabel", publicRef, reason: "Reprint from label preview (mock)" })}
      >
        🖨️ Reprint label
      </button>
    </div>
  );
}

function LabelsView() {
  const state = useAppState();
  const params = useSearchParams();
  const orderNo = params.get("order") ?? ORDER_NO;
  const order = orderByNumber(state, orderNo) ?? state.orders[0];
  const units = unitsForOrder(state, order.orderNumber);
  const progress = orderProgress(state, order.orderNumber);
  const unit12 = units.find((u) => u.sequence === 2) ?? units[0];
  const component = state.components[0];
  const lot = state.materialLots[0];
  const transfer = state.transfers[0];
  const pallet = state.pallets[0];
  const qrFor = (targetId: string) =>
    state.qrIdentities.find((q) => q.targetId === targetId)?.publicRef ?? "UNKNOWN";

  return (
    <div className="page">
      <h1>Label and print previews</h1>
      <p style={{ color: "var(--text-subtle)" }}>
        Browser previews only — no printer integration. QR graphics are
        deterministic mock renderings of the stored opaque reference.
      </p>

      <h2>1. Master Work Order Plan</h2>
      <div className="doc-page" data-testid="work-order-plan">
        <div className="doc-watermark">Draft preview — mock data</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ marginTop: 0 }}>Work Order Plan</h1>
            <p style={{ fontSize: 15, lineHeight: 1.8 }}>
              <b>Order:</b> {order.orderNumber}
              <br />
              <b>Customer:</b> {order.customer}
              <br />
              <b>Customer PO:</b> {order.customerPo}
              <br />
              <b>Due date:</b> {order.dueDate}
              <br />
              <b>Product family:</b> {order.productFamily}
              <br />
              <b>Order type:</b> {order.orderType}
              <br />
              <b>Facility:</b> {order.facility}
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <QrSvg value={order.publicRef} size={120} />
            <div style={{ fontSize: 11 }}>{order.publicRef}</div>
          </div>
        </div>
        <h2>Unit summary</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Serial</th>
              <th>Status</th>
              <th>As-built material</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.unitId}>
                <td>{u.unitId}</td>
                <td>{u.serial ?? "Serial pending"}</td>
                <td>{unitStatusLabel(u.status)}</td>
                <td>{u.asBuiltMaterial}</td>
                <td style={{ fontSize: 11 }}>{u.publicRef}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {progress.complete.length} of {progress.total} Units complete ·{" "}
          {progress.blocked.length} blocked
        </p>
        <h2>Notes (handwritten space)</h2>
        <div style={{ border: "1px dashed #999", height: 90 }} />
      </div>

      <h2>Tag sheet</h2>
      <div className="label-sheet">
        <LabelFrame
          title="2. Individual Unit tag"
          size="4 x 6"
          publicRef={unit12.publicRef}
          testId="label-unit"
        >
          <b>{unit12.unitId}</b>
          <br />
          Order {unit12.orderNumber}
          <br />
          {order.customer}
          <br />
          {unit12.model} {unit12.size}
          <br />
          Serial: {unit12.serial ?? "Serial pending"}
          <br />
          Unit {unit12.sequence} of {units.length}
          <br />
          Due {order.dueDate}
        </LabelFrame>

        <LabelFrame
          title="3. Complete package tag"
          size="4 x 6"
          publicRef={qrFor(pallet.id)}
          testId="label-package"
        >
          <b>PKG-{order.orderNumber}-1</b>
          <br />
          Order {order.orderNumber}
          <br />
          {order.customer}
          <br />
          Package 1 of 1
          <br />
          Components: pump end, crate, documents
          <br />
          Destination: {pallet.destination}
        </LabelFrame>

        <LabelFrame
          title="4. Component tag"
          size="2 x 1 min"
          publicRef={component.publicRef}
          testId="label-component"
        >
          <b>{component.id}</b>
          <br />
          {component.description}
          <br />
          Material: {component.material}
          <br />
          {component.heatLot}
          <br />
          Assigned Unit: {component.allocatedUnitId ?? "unallocated"}
        </LabelFrame>

        <LabelFrame
          title="5. Material-lot tag"
          size="4 x 2"
          publicRef={lot.publicRef}
          testId="label-lot"
        >
          <b>{lot.id}</b>
          <br />
          {lot.part}
          <br />
          Grade {lot.grade} · {lot.heatLot}
          <br />
          Quantity {lot.quantity}
          <br />
          Supplier {lot.supplier}
        </LabelFrame>

        <LabelFrame
          title="6. Internal-transfer tag"
          size="4 x 6"
          publicRef={transfer.publicRef}
          testId="label-transfer"
        >
          <b>{transfer.id}</b>
          <br />
          Origin: {transfer.origin}
          <br />
          Destination: {transfer.destination}
          <br />
          Contents: {transfer.contents}
          <br />
          Status: {transfer.status}
        </LabelFrame>

        <LabelFrame
          title="7. Pallet / crate tag"
          size="4 x 6"
          publicRef={pallet.publicRef}
          testId="label-pallet"
        >
          <b>{pallet.id}</b>
          <br />
          Order {pallet.orderNumber}
          <br />
          {order.customer}
          <br />
          Destination: {pallet.destination}
          <br />
          Weight {pallet.weight}
          <br />
          Dimensions {pallet.dimensions}
          <br />
          Packages: {pallet.packageCount}
        </LabelFrame>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Print history</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Record</th>
                <th>Type</th>
                <th>Print events</th>
              </tr>
            </thead>
            <tbody>
              {state.qrIdentities.map((q) => (
                <tr key={q.publicRef}>
                  <td>
                    {q.recordType === "Unit" ? (
                      <Link href={`/units/${q.targetId}`}>{q.targetId}</Link>
                    ) : (
                      q.targetId
                    )}
                  </td>
                  <td>{q.recordType}</td>
                  <td data-testid={`print-count-${q.targetId}`}>{q.printEvents.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-subtle)", marginBottom: 0 }}>
          Unit count remains {state.units.length} regardless of reprints.
        </p>
      </div>
    </div>
  );
}

export default function LabelsPage() {
  return (
    <Suspense>
      <LabelsView />
    </Suspense>
  );
}
