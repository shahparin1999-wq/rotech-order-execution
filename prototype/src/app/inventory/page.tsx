"use client";

// Inventory — intake, outtake and what is on hand.
//
// Quantity and location are never edited directly: every number here is derived
// from the append-only movement log, and every button appends a movement. That
// is why an item can be traced from the dock to the pump it ended up in.

import Link from "next/link";
import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import {
  acceptedNotPutAway,
  awaitingInspection,
  inventoryPositions,
  MOVEMENT_LABELS
} from "@/domain/inventoryActions";
import { historyFor } from "@/domain/inventory/movement";
import { locationLabel, TRACKING_POLICIES, type TrackingPolicy } from "@/domain/inventory/identity";
import { RECEIPT_KINDS, type ReceiptKind } from "@/domain/inventory/receipt";
import { Exact } from "@/components/bits";
import { FieldGroup } from "@/components/Drawer";

const RECEIPT_KIND_LABELS: Record<ReceiptKind, string> = {
  AgainstPo: "Against PO",
  CustomerSupplied: "Customer supplied",
  Transfer: "Inter-facility transfer",
  Stock: "For stock",
  Return: "Return"
};

const TABS = ["intake", "outtake", "onhand", "movements"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  intake: "Intake",
  outtake: "Outtake",
  onhand: "On hand",
  movements: "Movement log"
};

export default function InventoryPage() {
  const state = useAppState();
  const [tab, setTab] = useState<Tab>("intake");

  const positions = inventoryPositions(state);
  const quarantine = awaitingInspection(state);
  const notPutAway = acceptedNotPutAway(state);

  return (
    <div className="page">
      <div className="command-bar">
        <h1 className="command-bar-title">Inventory</h1>
        <span style={{ color: "var(--text-subtle)", fontSize: 13 }}>
          {positions.length} tracked item{positions.length === 1 ? "" : "s"} ·{" "}
          {quarantine.length} awaiting inspection · {notPutAway.length} to put away
        </span>
      </div>

      <nav className="tabs" aria-label="Inventory tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tab ${tab === t ? "active" : ""}`}
            data-testid={`inventory-tab-${t}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      {tab === "intake" && <IntakeTab />}
      {tab === "outtake" && <OuttakeTab />}
      {tab === "onhand" && <OnHandTab />}
      {tab === "movements" && <MovementLogTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

function IntakeTab() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const quarantine = awaitingInspection(state);
  const notPutAway = acceptedNotPutAway(state);

  const [kind, setKind] = useState<ReceiptKind>("AgainstPo");
  const [poNumber, setPoNumber] = useState("");
  const [poLine, setPoLine] = useState("");
  const [vendor, setVendor] = useState("");
  const [packingSlip, setPackingSlip] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [material, setMaterial] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [policy, setPolicy] = useState<TrackingPolicy>("HeatTracked");
  const [serialNumber, setSerial] = useState("");
  const [lotNumber, setLot] = useState("");
  const [heatNumber, setHeat] = useState("");
  const [facility, setFacility] = useState("Mississauga");
  const [requirementId, setRequirementId] = useState("");
  const [note, setNote] = useState("");

  // Open demand a receipt could satisfy. The receiver picks one — nothing is
  // auto-allocated, because a wrong allocation looks correct (INV-005).
  const openDemand = state.requirements.filter(
    (r) => (r.category === "Component" || r.category === "Material") && r.status !== "Satisfied"
  );

  const canReceive = partNumber.trim() && description.trim() && quantity > 0;

  const submit = () => {
    dispatch({
      type: "receiveInventory",
      input: {
        kind,
        poNumber,
        poLine,
        vendor,
        packingSlip,
        facility,
        partNumber,
        description,
        material,
        quantity,
        trackingPolicy: policy,
        serialNumber,
        lotNumber,
        heatNumber,
        matchedRequirementId: requirementId || undefined,
        notes: note
      }
    });
    setPartNumber("");
    setDescription("");
    setMaterial("");
    setSerial("");
    setLot("");
    setHeat("");
    setRequirementId("");
    setNote("");
    setQuantity(1);
  };

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Receive goods</h3>
        <p className="from-default" style={{ marginTop: 0 }}>
          Everything lands in quarantine unless it is an untracked consumable. The dock is not
          acceptance — material becomes issuable only after incoming inspection passes.
        </p>

        <div className="field-grid">
          <FieldGroup label="Receipt type">
            <select value={kind} onChange={(e) => setKind(e.target.value as ReceiptKind)} data-testid="intake-kind">
              {RECEIPT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {RECEIPT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Facility">
            <select value={facility} onChange={(e) => setFacility(e.target.value)}>
              <option>Mississauga</option>
              <option>Houston</option>
            </select>
          </FieldGroup>
          {kind === "AgainstPo" && (
            <>
              <FieldGroup label="AIMCOR PO">
                <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} data-testid="intake-po" placeholder="e.g. 4500187" />
                <span className="from-default">AIMCOR stays the PO system of record.</span>
              </FieldGroup>
              <FieldGroup label="PO line">
                <input value={poLine} onChange={(e) => setPoLine(e.target.value)} data-testid="intake-poline" />
              </FieldGroup>
              <FieldGroup label="Vendor">
                <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </FieldGroup>
            </>
          )}
          <FieldGroup label="Packing slip">
            <input value={packingSlip} onChange={(e) => setPackingSlip(e.target.value)} />
          </FieldGroup>
        </div>

        <div className="field-grid">
          <FieldGroup label="Part number" required>
            <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} data-testid="intake-partnumber" placeholder="e.g. 101-AT-M-A-S6" />
          </FieldGroup>
          <FieldGroup label="Description" required>
            <input value={description} onChange={(e) => setDescription(e.target.value)} data-testid="intake-description" placeholder="e.g. 1196 MTR 316SS Impeller" />
          </FieldGroup>
          <FieldGroup label="Material">
            <input value={material} onChange={(e) => setMaterial(e.target.value)} data-testid="intake-material" />
          </FieldGroup>
          <FieldGroup label="Quantity" required>
            <input type="number" min={1} value={quantity} data-testid="intake-quantity" onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
          </FieldGroup>
          <FieldGroup label="Tracking">
            <select value={policy} onChange={(e) => setPolicy(e.target.value as TrackingPolicy)} data-testid="intake-policy">
              {TRACKING_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </FieldGroup>
          {policy === "Serialized" && (
            <FieldGroup label="Serial number" required>
              <input value={serialNumber} onChange={(e) => setSerial(e.target.value)} data-testid="intake-serial" />
            </FieldGroup>
          )}
          {policy === "LotTracked" && (
            <FieldGroup label="Lot number" required>
              <input value={lotNumber} onChange={(e) => setLot(e.target.value)} data-testid="intake-lot" />
            </FieldGroup>
          )}
          {policy === "HeatTracked" && (
            <FieldGroup label="Heat number" required>
              <input value={heatNumber} onChange={(e) => setHeat(e.target.value)} data-testid="intake-heat" />
            </FieldGroup>
          )}
        </div>

        <FieldGroup label="Satisfies which demand?">
          <select value={requirementId} onChange={(e) => setRequirementId(e.target.value)} data-testid="intake-demand">
            <option value="">No demand confirmed — receive to stock</option>
            {openDemand.map((r) => (
              <option key={r.id} value={r.id}>
                {r.executionOrderId} {r.unitId ? `· ${r.unitId}` : ""} — {r.description}
              </option>
            ))}
          </select>
          <span className="from-default">
            Pick the demand explicitly. Nothing is matched automatically — a wrong allocation looks
            correct, which is worse than an unmatched receipt.
          </span>
        </FieldGroup>

        <FieldGroup label="Notes">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition, damage, missing paperwork…" />
        </FieldGroup>

        <button type="button" className="btn btn-primary" disabled={!canReceive} data-testid="intake-submit" onClick={submit}>
          Receive
        </button>
      </div>

      <div className="card">
        <h3>Awaiting incoming inspection ({quarantine.length})</h3>
        {quarantine.length === 0 && <p>Nothing in quarantine.</p>}
        {quarantine.map((p) => (
          <InspectRow key={p.identity.id} identityId={p.identity.id} label={`${p.identity.partNumber} — ${p.identity.description}`} />
        ))}
      </div>

      {notPutAway.length > 0 && (
        <div className="card">
          <h3>Accepted, not yet put away ({notPutAway.length})</h3>
          {notPutAway.map((p) => (
            <PutAwayRow key={p.identity.id} identityId={p.identity.id} label={`${p.identity.partNumber} — ${p.identity.description}`} />
          ))}
        </div>
      )}
    </>
  );
}

function InspectRow({ identityId, label }: { identityId: string; label: string }) {
  const dispatch = useAppDispatch();
  const [note, setNote] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
      <b style={{ minWidth: 260 }}>{label}</b>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Inspection note (required to reject)" style={{ width: 260 }} data-testid={`inspect-note-${identityId}`} />
      <button type="button" className="btn btn-ok" data-testid={`inspect-accept-${identityId}`} onClick={() => dispatch({ type: "inspectInventory", identityId, decision: "Accept", note })}>
        Accept
      </button>
      <button type="button" className="btn btn-danger" data-testid={`inspect-reject-${identityId}`} onClick={() => dispatch({ type: "inspectInventory", identityId, decision: "Reject", note })}>
        Reject
      </button>
    </div>
  );
}

function PutAwayRow({ identityId, label }: { identityId: string; label: string }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [locationId, setLocationId] = useState(state.inventoryLocations[2]?.id ?? "");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
      <b style={{ minWidth: 260 }}>{label}</b>
      <select value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid={`putaway-location-${identityId}`}>
        {state.inventoryLocations.map((l) => (
          <option key={l.id} value={l.id}>
            {locationLabel(l)}
          </option>
        ))}
      </select>
      <button type="button" className="btn" data-testid={`putaway-${identityId}`} onClick={() => dispatch({ type: "putAwayInventory", identityId, locationId })}>
        Put away
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outtake
// ---------------------------------------------------------------------------

function OuttakeTab() {
  const state = useAppState();
  const positions = inventoryPositions(state).filter((p) => p.quality === "Accepted" && p.onHand > 0);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Issue to a Unit</h3>
      <p className="from-default" style={{ marginTop: 0 }}>
        Every issue is checked against the Unit&apos;s requirement, its reservation, the material
        spec and inspection state. A mismatch is blocked and reported — it never becomes the
        as-built record silently.
      </p>

      {error && (
        <div className="card" data-testid="outtake-error" style={{ background: "var(--danger-soft)" }}>
          <b>Blocked</b>
          <p style={{ margin: "4px 0 0", fontSize: 13 }}>{error}</p>
        </div>
      )}

      {positions.length === 0 && <p>No accepted stock on hand. Receive and inspect something first.</p>}

      <table className="data">
        <thead>
          <tr>
            <th>Part</th>
            <th>Trace</th>
            <th>Location</th>
            <th>On hand</th>
            <th>Available</th>
            <th>Reserved for</th>
            <th>Issue to Unit</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <IssueRow key={p.identity.id} position={p} onError={setError} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssueRow({
  position,
  onError
}: {
  position: ReturnType<typeof inventoryPositions>[number];
  onError: (m: string | null) => void;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [unitId, setUnitId] = useState("");
  const id = position.identity.id;
  const trace = [position.identity.serialNumber, position.identity.lotNumber, position.identity.heatNumber]
    .filter(Boolean)
    .join(" / ");

  const act = (type: "reserveInventory" | "issueInventoryToUnit" | "installInventory") => {
    onError(null);
    try {
      dispatch({ type, identityId: id, unitId, quantity: 1 } as never);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <tr data-testid={`outtake-row-${id}`}>
      <td>
        <b>{position.identity.partNumber}</b>
        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{position.identity.description}</div>
      </td>
      <td style={{ fontSize: 12 }}>{trace || "—"}</td>
      <td style={{ fontSize: 12 }}>{position.locationLabel}</td>
      <td>{position.onHand}</td>
      <td>{position.available}</td>
      <td style={{ fontSize: 12 }}>{position.allocatedUnitId ?? "—"}</td>
      <td>
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} data-testid={`outtake-unit-${id}`} style={{ width: 160 }}>
          <option value="">Select Unit…</option>
          {state.units.map((u) => (
            <option key={u.unitId} value={u.unitId}>
              {u.unitId}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <button type="button" className="btn btn-subtle" disabled={!unitId} data-testid={`outtake-reserve-${id}`} onClick={() => act("reserveInventory")}>
            Reserve
          </button>
          <button type="button" className="btn" disabled={!unitId} data-testid={`outtake-issue-${id}`} onClick={() => act("issueInventoryToUnit")}>
            Issue
          </button>
          <button type="button" className="btn btn-ok" disabled={!unitId} data-testid={`outtake-install-${id}`} onClick={() => act("installInventory")}>
            Install
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// On hand / movements
// ---------------------------------------------------------------------------

function OnHandTab() {
  const state = useAppState();
  const positions = inventoryPositions(state);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>On hand</h3>
      <p className="from-default" style={{ marginTop: 0 }}>
        Every quantity below is derived from the movement log. There is no editable stock figure.
      </p>
      {positions.length === 0 && <p>Nothing received yet.</p>}
      <table className="data">
        <thead>
          <tr>
            <th>Part</th>
            <th>Trace</th>
            <th>Quality</th>
            <th>On hand</th>
            <th>Available</th>
            <th>Location</th>
            <th>Allocated to</th>
            <th>Label</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.identity.id} data-testid={`onhand-${p.identity.id}`}>
              <td>
                <b>{p.identity.partNumber}</b>
                <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{p.identity.description}</div>
              </td>
              <td style={{ fontSize: 12 }}>
                {[p.identity.serialNumber, p.identity.lotNumber, p.identity.heatNumber].filter(Boolean).join(" / ") || "—"}
              </td>
              <td>
                <span className={`badge ${p.quality === "Accepted" ? "save-saved" : p.quality === "Rejected" ? "save-error" : "save-pending"}`}>
                  {p.quality}
                </span>
              </td>
              <td>{p.onHand}</td>
              <td>{p.available}</td>
              <td style={{ fontSize: 12 }}>{p.locationLabel}</td>
              <td style={{ fontSize: 12 }}>{p.allocatedUnitId ?? "—"}</td>
              <td>
                <Link href={`/r/${p.identity.publicRef}`} style={{ fontSize: 12 }}>
                  {p.identity.publicRef.slice(0, 12)}…
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementLogTab() {
  const state = useAppState();
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Movement log</h3>
      <p className="from-default" style={{ marginTop: 0 }}>
        Append-only. Nothing here is ever edited or removed — this is how a part is traced from the
        dock to the pump it ended up in.
      </p>
      {state.inventoryIdentities.map((identity) => {
        const history = historyFor(state.inventoryMovements, identity.id);
        return (
          <div key={identity.id} style={{ marginBottom: 14 }} data-testid={`movements-${identity.id}`}>
            <b>
              {identity.partNumber} — {identity.description}
            </b>
            <table className="data" style={{ marginTop: 4 }}>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id}>
                    <td style={{ width: 170 }}>{MOVEMENT_LABELS[m.type]}</td>
                    <td style={{ width: 60 }}>{m.quantity !== 0 ? m.quantity : ""}</td>
                    <td style={{ fontSize: 12 }}>
                      {m.unitId ?? m.toLocationId ?? ""} {m.reason ? `· ${m.reason}` : ""}
                    </td>
                    <td style={{ width: 190, fontSize: 12 }}>
                      <Exact at={m.recordedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {state.inventoryIdentities.length === 0 && <p>No movements yet.</p>}
    </div>
  );
}
