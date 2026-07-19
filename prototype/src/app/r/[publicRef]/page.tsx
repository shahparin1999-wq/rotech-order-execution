"use client";

// QR resolver landing. In production this route validates the reference,
// requires Entra sign-in, checks permission, and redirects. Here it renders a
// scanned-identity confirmation plus the next available actions.

import Link from "next/link";
import { use } from "react";
import { useAppState } from "@/store/StoreProvider";
import { employeeName, resolveScan, unitById } from "@/domain/selectors";
import { IdentityBanner } from "@/components/IdentityBanner";
import { QrSvg } from "@/components/bits";

function Resolver({ publicRef }: { publicRef: string }) {
  const state = useAppState();
  const qr = resolveScan(state, publicRef);

  if (!qr) {
    return (
      <div className="page">
        <div className="card" style={{ borderLeft: "5px solid var(--danger)" }}>
          <h1>Reference not recognised</h1>
          <p>
            The scanned reference <code>{publicRef}</code> is unknown or retired.
            No order or customer details are disclosed for an unrecognised scan.
          </p>
          <p style={{ fontSize: 13.5, color: "var(--text-subtle)" }}>
            Recovery: check for a damaged label, use the human-readable
            identifier printed beside the QR, or search for the record.
          </p>
          <Link className="btn btn-primary" href="/views/search">
            Search by identifier
          </Link>{" "}
          <Link className="btn" href="/scan">
            Back to scan simulation
          </Link>
        </div>
      </div>
    );
  }

  const unit = qr.recordType === "Unit" ? unitById(state, qr.targetId) : undefined;

  return (
    <>
      {unit && <IdentityBanner unit={unit} />}
      <div className="page">
        <div className="card" style={{ borderLeft: "5px solid var(--ok)" }} data-testid="scan-confirmation">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <QrSvg value={qr.publicRef} size={80} />
            <div>
              <h1 style={{ margin: 0 }}>Scanned identity confirmed</h1>
              <p style={{ margin: "4px 0" }}>
                <b>{qr.recordType}</b> · <b data-testid="scan-target">{qr.targetId}</b> — {qr.label}
              </p>
              <code style={{ fontSize: 12 }}>{qr.publicRef}</code>
              <p style={{ fontSize: 12.5, color: "var(--text-subtle)", marginBottom: 0 }}>
                Viewing a record does not create a manufacturing event.
              </p>
            </div>
          </div>
        </div>

        {unit && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Next available operation</h3>
            <p style={{ fontSize: 18, fontWeight: 700 }} data-testid="scan-next-op">
              {unit.currentOperation}
            </p>
            <div className="big-actions">
              <Link className="btn btn-big btn-primary" href={`/tablet/${unit.unitId}`} data-testid="scan-open-unit">
                <span className="icon">▶️</span>Open work screen
              </Link>
              <Link className="btn btn-big" href={`/tablet/${unit.unitId}`}>
                <span className="icon">📷</span>Take Photo
              </Link>
              <Link className="btn btn-big" href={`/units/${unit.unitId}?tab=evidence`}>
                <span className="icon">🔩</span>Add Component
              </Link>
              <Link className="btn btn-big" href={`/units/${unit.unitId}?tab=checklist`} data-testid="scan-checklist">
                <span className="icon">☑️</span>Complete Checklist
              </Link>
              <Link className="btn btn-big btn-danger" href={`/units/${unit.unitId}`}>
                <span className="icon">🚩</span>Report Problem
              </Link>
            </div>
          </div>
        )}

        {qr.recordType === "Order" && (
          <div className="card">
            <Link className="btn btn-primary" href={`/orders/${qr.targetId}`}>
              Open order workspace {qr.targetId}
            </Link>
          </div>
        )}

        {qr.recordType === "Component" && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Component</h3>
            {state.components
              .filter((c) => c.id === qr.targetId)
              .map((c) => (
                <p key={c.id}>
                  {c.description} · {c.material} · {c.heatLot}
                  <br />
                  Allocated to:{" "}
                  {c.allocatedUnitId ? (
                    <Link href={`/units/${c.allocatedUnitId}`}>{c.allocatedUnitId}</Link>
                  ) : (
                    "unallocated"
                  )}
                </p>
              ))}
          </div>
        )}

        {qr.recordType === "MaterialLot" && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Material lot</h3>
            {state.materialLots
              .filter((l) => l.id === qr.targetId)
              .map((l) => (
                <p key={l.id}>
                  {l.part} · grade {l.grade} · {l.heatLot} · {l.quantity} · supplier {l.supplier}
                </p>
              ))}
            <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>
              Allocation would show source, destination, quantity, and expected
              effect before confirmation.
            </p>
          </div>
        )}

        {qr.recordType === "Transfer" && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Internal transfer</h3>
            {state.transfers
              .filter((t) => t.id === qr.targetId)
              .map((t) => (
                <p key={t.id}>
                  {t.origin} → {t.destination} · {t.contents} · status {t.status}
                </p>
              ))}
          </div>
        )}

        {qr.recordType === "Pallet" && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Pallet / crate</h3>
            {state.pallets
              .filter((p) => p.id === qr.targetId)
              .map((p) => (
                <p key={p.id}>
                  Order {p.orderNumber} → {p.destination}
                  <br />
                  {p.weight} · {p.dimensions} · {p.packageCount} package(s)
                </p>
              ))}
          </div>
        )}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Label print history</h3>
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {qr.printEvents.map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.at).toLocaleString("en-CA")}</td>
                  <td>{employeeName(state, e.byId)}</td>
                  <td>{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12.5, color: "var(--text-subtle)", marginBottom: 0 }}>
            Reprints append a print event. They never create a new Unit or a new
            QR identity.
          </p>
        </div>
      </div>
    </>
  );
}

export default function ResolverPage({ params }: { params: Promise<{ publicRef: string }> }) {
  const { publicRef } = use(params);
  return <Resolver publicRef={decodeURIComponent(publicRef)} />;
}
