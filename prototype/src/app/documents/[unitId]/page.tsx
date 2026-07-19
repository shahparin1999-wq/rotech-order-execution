"use client";

// Browser preview of 26SO00729_1.1_Unit_QC_and_Manufacturing_History.pdf.
// This is a visual outline only — the production PDF pipeline (registered
// assets, manifests, isolated jobs, immutable versions) is out of scope.

import Link from "next/link";
import { use } from "react";
import { useAppState } from "@/store/StoreProvider";
import { buildUnitHistorySnapshot } from "@/domain/documents";
import { employeeName, measurementResult } from "@/domain/selectors";
import { Exact, MockPhoto } from "@/components/bits";

function DocView({ unitId }: { unitId: string }) {
  const state = useAppState();
  let snap;
  try {
    snap = buildUnitHistorySnapshot(state, unitId);
  } catch {
    return (
      <div className="page">
        <h1>Unit not found</h1>
        <Link href="/orders">Back to orders</Link>
      </div>
    );
  }

  const released = snap.unit.status === "Complete";
  const superseded = new Set(
    snap.responses.filter((r) => r.supersedesId).map((r) => r.supersedesId as string)
  );

  return (
    <div className="page">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Link className="btn" href={`/units/${unitId}`}>
          ← Unit {unitId}
        </Link>
        <span className={`badge ${released ? "save-saved" : "save-pending"}`} style={{ alignSelf: "center" }}>
          {released ? "Final (mock release)" : "Draft preview"}
        </span>
      </div>

      <div className="doc-page" data-testid="qc-document">
        {!released && <div className="doc-watermark">Draft — not a quality record</div>}

        {/* Cover page */}
        <h1>Unit QC and Manufacturing History</h1>
        <p style={{ fontSize: 15, lineHeight: 1.9 }} data-testid="doc-cover">
          <b>Document:</b> {snap.documentName}
          <br />
          <b>Unit ID:</b> {snap.unit.unitId}
          <br />
          <b>Serial number:</b> {snap.unit.serial ?? "Serial pending"}
          <br />
          <b>Order:</b> {snap.order.orderNumber} · <b>PO:</b> {snap.order.customerPo}
          <br />
          <b>Customer:</b> {snap.order.customer}
          <br />
          <b>Product:</b> {snap.unit.model} {snap.unit.size} · {snap.order.productFamily} ·{" "}
          {snap.order.orderType}
          <br />
          <b>Facility:</b> {snap.order.facility} · <b>Due:</b> {snap.order.dueDate}
        </p>
        <p style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>
          This preview is generated from a frozen snapshot containing only this
          Unit&apos;s records. No sibling Unit data is queried.
        </p>

        <h2>1. Ordered specification</h2>
        <table className="data">
          <tbody>
            <tr><td><b>Material</b></td><td>{snap.orderedSpecification.material}</td></tr>
            <tr><td><b>Model / size</b></td><td>{snap.orderedSpecification.model} {snap.orderedSpecification.size}</td></tr>
          </tbody>
        </table>

        <h2>2. Approved changes</h2>
        {snap.approvedChanges.length === 0 && <p>No approved changes. As-built matches ordered specification.</p>}
        {snap.approvedChanges.map((mc) => (
          <p key={mc.id} data-testid={`doc-change-${mc.id}`}>
            <b>{mc.orderedMaterial} → {mc.proposedMaterial}</b> · {mc.status}
            <br />
            Reason: {mc.reason}
            <br />
            Requested by {employeeName(state, mc.requestedById)}; approved by{" "}
            {employeeName(state, mc.approvedById)}{" "}
            {mc.approvedAt && <Exact at={mc.approvedAt} />}
            <br />
            Evidence: {mc.evidencePlaceholder}
          </p>
        ))}
        {snap.specialInstructions.map((s) => (
          <p key={s.id}>
            <b>Special work instruction — {s.part}</b>: {s.instruction}
            <br />
            Completion measurement:{" "}
            {s.completionMeasurement ? `${s.completionMeasurement.value} ${s.completionMeasurement.unit}` : "not recorded"} ·
            verification {s.verificationStatus}
          </p>
        ))}

        <h2>3. Final as-built specification</h2>
        <table className="data">
          <tbody>
            <tr><td><b>Material (as-built)</b></td><td data-testid="doc-asbuilt">{snap.asBuiltSpecification.material}</td></tr>
            <tr><td><b>Serial</b></td><td>{snap.asBuiltSpecification.serial ?? "Serial pending"}</td></tr>
            <tr><td><b>Current location</b></td><td>{snap.unit.location}</td></tr>
          </tbody>
        </table>

        <h2>4. Route history</h2>
        <table className="data">
          <thead>
            <tr><th>#</th><th>Operation</th><th>Department</th><th>Status</th></tr>
          </thead>
          <tbody>
            {snap.route.map((op) => (
              <tr key={op.id}>
                <td>{op.seq}</td>
                <td>{op.name}</td>
                <td>{op.department}</td>
                <td>{op.status === "NotStarted" ? "Not started" : op.status === "InProgress" ? "In progress" : op.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>5. Checklist results</h2>
        <table className="data">
          <thead>
            <tr><th>Item</th><th>Result</th><th>Technician</th><th>Recorded</th><th>State</th></tr>
          </thead>
          <tbody>
            {snap.responses
              .filter((r) => !superseded.has(r.id))
              .map((r) => {
                const def = state.checklistDefs.find((d) => d.key === r.itemKey);
                return (
                  <tr key={r.id}>
                    <td>{def?.label ?? r.itemKey}</td>
                    <td>
                      {typeof r.value === "number" ? `${r.value} ${def?.unit ?? ""}` : String(r.value)}
                      {r.note && <div style={{ fontSize: 12 }}>{r.note}</div>}
                    </td>
                    <td>{employeeName(state, r.technicianId)}</td>
                    <td style={{ fontSize: 12 }}><Exact at={r.at} /></td>
                    <td>{r.state}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        <h2>6. Measurements</h2>
        <table className="data">
          <thead>
            <tr><th>Measurement</th><th>Value</th><th>Expected</th><th>Result</th></tr>
          </thead>
          <tbody>
            {snap.responses
              .filter((r) => typeof r.value === "number" && !superseded.has(r.id))
              .map((r) => {
                const def = state.checklistDefs.find((d) => d.key === r.itemKey)!;
                const res = measurementResult(def, r.value as number);
                return (
                  <tr key={r.id}>
                    <td>
                      {def.label}
                      {def.placeholderTolerance && (
                        <div className="placeholder-note">
                          Pilot placeholder - owner approval required
                        </div>
                      )}
                    </td>
                    <td>{String(r.value)} {def.unit}</td>
                    <td>
                      {def.nominal !== null && <>nominal {def.nominal} </>}
                      {def.min !== null && <>min {def.min} </>}
                      {def.max !== null && <>max {def.max}</>}
                    </td>
                    <td>{res === "out-of-range" ? "Outside placeholder range" : res === "in-range" ? "Within placeholder range" : "No limits defined"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        <h2>7. Inspection</h2>
        <p>
          Final quality inspection:{" "}
          {snap.responses.find((r) => r.itemKey === "final-quality")
            ? `${String(snap.responses.find((r) => r.itemKey === "final-quality")!.value)} — ${employeeName(state, snap.responses.find((r) => r.itemKey === "final-quality")!.technicianId)}`
            : "not yet performed"}
        </p>

        <h2>8. Rework</h2>
        <p>No nonconformance or rework recorded for this Unit in the mock fixture.</p>

        <h2>9. Sign-offs</h2>
        <table className="data">
          <thead>
            <tr><th>Task</th><th>Action</th><th>By</th><th>When</th></tr>
          </thead>
          <tbody>
            {snap.tasks.flatMap((t) =>
              t.history.map((h, i) => (
                <tr key={`${t.id}-${i}`}>
                  <td>{t.name}</td>
                  <td>{h.action}</td>
                  <td>{employeeName(state, h.actorId)}</td>
                  <td style={{ fontSize: 12 }}><Exact at={h.at} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <h2>10. Selected photos</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {snap.attachments.filter((a) => a.kind === "photo").length === 0 && (
            <p>No photo evidence captured for this Unit.</p>
          )}
          {snap.attachments
            .filter((a) => a.kind === "photo")
            .map((a) => (
              <MockPhoto key={a.id} art={a.placeholderArt} caption={`${a.category} · ${snap.unit.unitId}`} width={165} height={112} />
            ))}
        </div>

        <h2>11. Nameplate</h2>
        {snap.attachments.find((a) => a.category === "Nameplate") ? (
          <MockPhoto art="nameplate" caption={`Nameplate · ${snap.unit.unitId}`} width={200} height={130} />
        ) : (
          <p>Nameplate photo outstanding.</p>
        )}

        <h2>12. Packaging</h2>
        {snap.attachments.find((a) => a.category === "Packaging") ? (
          <MockPhoto art="crate" caption={`Packaging · ${snap.unit.unitId}`} width={200} height={130} />
        ) : (
          <p>Packaging photo outstanding.</p>
        )}

        <h2>13. Shipping</h2>
        {(() => {
          const pallet = state.pallets.find((p) => p.orderNumber === snap.order.orderNumber);
          return pallet && released ? (
            <p>
              Pallet {pallet.id} → {pallet.destination}
              <br />
              Weight {pallet.weight} · dimensions {pallet.dimensions} · {pallet.packageCount} package(s)
            </p>
          ) : (
            <p>Shipping record not complete for this Unit.</p>
          );
        })()}

        <h2>14. Final remarks</h2>
        <p>
          {released
            ? "Unit released. This mock document would be frozen as an immutable version; corrections would produce a superseding version."
            : "Unit not yet released. A final document may be generated only from a release-ready frozen snapshot."}
        </p>

        <h2>Appendix — audit events for this Unit</h2>
        <table className="data">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {snap.auditEvents.map((e) => (
              <tr key={e.id}>
                <td style={{ fontSize: 12 }}><Exact at={e.at} /></td>
                <td>{employeeName(state, e.actorId)}</td>
                <td><code style={{ fontSize: 12 }}>{e.action}</code></td>
                <td style={{ fontSize: 13 }}>{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DocumentPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  return <DocView unitId={decodeURIComponent(unitId)} />;
}
