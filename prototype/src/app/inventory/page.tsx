"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppState, usePersistence } from "@/store/StoreProvider";
import { inventoryPositions, MOVEMENT_LABELS } from "@/domain/inventoryActions";
import { historyFor } from "@/domain/inventory/movement";
import { INVENTORY_CATEGORIES, TRACKING_POLICIES, trackingPolicyFor, type InventoryCategory, type TrackingPolicy } from "@/domain/inventory/identity";
import { openPoLines } from "@/domain/purchasing/poReference";
import { Exact } from "@/components/bits";
import type { Facility } from "@/domain/types";
import type { ExpectedShipment } from "@/domain/inventory/contracts";

const TABS = ["stock", "incoming", "receiving", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { stock: "Stock", incoming: "Incoming", receiving: "Receiving", history: "History" };
const FACILITIES: Array<"All" | Facility> = ["All", "Mississauga", "Houston"];

function receivedForLine(state: ReturnType<typeof useAppState>, lineId: string): number {
  return state.inventoryReceiptLines.filter((line) => line.expectedShipmentLineId === lineId).reduce((sum, line) => sum + line.quantity, 0);
}

function incomingFor(state: ReturnType<typeof useAppState>, partNumber: string, facility: Facility): number {
  return state.expectedShipments
    .filter((shipment) => shipment.status === "Confirmed" && shipment.facility === facility)
    .flatMap((shipment) => shipment.lines)
    .filter((line) => line.partNumber === partNumber)
    .reduce((sum, line) => sum + Math.max(0, line.expectedQuantity - receivedForLine(state, line.id)), 0);
}

function qualityClass(quality: string): string {
  return quality === "Accepted" ? "save-saved" : quality === "Rejected" ? "save-error" : "save-pending";
}

function positionStatus(position: ReturnType<typeof inventoryPositions>[number], incoming: number, remote: number): string {
  if (position.quality === "Quarantine") return "Awaiting inspection";
  if (position.quality === "Rejected") return "Rejected";
  if (position.available > 0) return "Available";
  if (position.onHand > 0) return "Reserved";
  if (incoming > 0) return "Incoming";
  if (remote > 0) return "Available at another facility; transfer workflow not enabled";
  return "No available stock";
}

export default function InventoryPage() {
  const state = useAppState();
  const persistence = usePersistence();
  const [tab, setTab] = useState<Tab>("stock");
  const [facility, setFacility] = useState<"All" | Facility>("All");
  const positions = inventoryPositions(state);
  const awaiting = positions.filter((x) => x.quality === "Quarantine").length;
  const incoming = state.expectedShipments.filter((x) => x.status === "Confirmed").reduce((sum, shipment) => sum + shipment.lines.reduce((n, line) => n + Math.max(0, line.expectedQuantity - receivedForLine(state, line.id)), 0), 0);

  return (
    <div className="page">
      <div className="command-bar">
        <h1 className="command-bar-title">Inventory</h1>
        <span style={{ color: "var(--text-subtle)", fontSize: 13 }}>Shared stock pools · Mississauga and Houston · derived from the OEH ledger</span>
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="card" style={{ marginBottom: 0 }}><span className="from-default">Stock lines</span><h2 style={{ margin: "4px 0 0" }}>{positions.length}</h2></div>
        <div className="card" style={{ marginBottom: 0 }}><span className="from-default">Awaiting inspection</span><h2 style={{ margin: "4px 0 0" }}>{awaiting}</h2></div>
        <div className="card" style={{ marginBottom: 0 }}><span className="from-default">Confirmed incoming</span><h2 style={{ margin: "4px 0 0" }}>{incoming}</h2></div>
      </div>

      <nav className="tabs" aria-label="Inventory tabs">
        {TABS.map((item) => <button key={item} type="button" className={`tab ${tab === item ? "active" : ""}`} data-testid={`inventory-tab-${item}`} onClick={() => setTab(item)}>{TAB_LABELS[item]}</button>)}
      </nav>

      {tab === "stock" && <StockTab facility={facility} setFacility={setFacility} />}
      {tab === "incoming" && <IncomingTab />}
      {tab === "receiving" && <ReceivingTab persistenceMode={persistence.mode} />}
      {tab === "history" && <HistoryTab facility={facility} setFacility={setFacility} />}
    </div>
  );
}

function StockTab({ facility, setFacility }: { facility: "All" | Facility; setFacility: (value: "All" | Facility) => void }) {
  const state = useAppState();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const positions = useMemo(() => inventoryPositions(state).filter((position) => {
    const text = `${position.identity.partNumber} ${position.identity.description} ${position.identity.material} ${Object.values(position.identity.attributes ?? {}).join(" ")}`.toLowerCase();
    return (facility === "All" || position.identity.facility === facility) && (category === "All" || position.identity.category === category) && text.includes(query.trim().toLowerCase());
  }), [state, facility, category, query]);

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ flex: "1 1 260px" }}>Search stock<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Part number, description, material, attribute…" aria-label="Search stock" /></label>
        <label>Facility<select value={facility} onChange={(e) => setFacility(e.target.value as "All" | Facility)}>{FACILITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}><option>All</option>{INVENTORY_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <p className="from-default">On hand, reserved, available, location, quality, and incoming are calculated values. They cannot be edited directly; use receiving, inspection, issue/return, or an authorized adjustment.</p>
      <div className="data-grid-wrap">
        <table className="data-grid" data-testid="inventory-stock-grid">
          <thead><tr><th>Facility</th><th>Part number</th><th>Description</th><th>Category / attributes</th><th>Serial / lot / heat</th><th>Location</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Quality</th><th>Incoming</th><th>Status</th><th /></tr></thead>
          <tbody>
            {positions.map((position) => {
              const otherFacility: Facility = position.identity.facility === "Mississauga" ? "Houston" : "Mississauga";
              const remote = inventoryPositions(state).filter((x) => x.identity.partNumber === position.identity.partNumber && x.identity.facility === otherFacility).reduce((n, x) => n + x.available, 0);
              const incoming = incomingFor(state, position.identity.partNumber, position.identity.facility as Facility);
              const attributes = Object.entries(position.identity.attributes ?? {}).map(([key, value]) => `${key}: ${value}`).join(" · ");
              const trace = [position.identity.serialNumber, position.identity.lotNumber, position.identity.heatNumber].filter(Boolean).join(" / ");
              return <tr key={position.identity.id} data-testid={`inventory-stock-row-${position.identity.id}`}>
                <td>{position.identity.facility}</td>
                <td><b>{position.identity.partNumber}</b></td>
                <td>{position.identity.description}</td>
                <td><span className="badge save-pending">{position.identity.category}</span><div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 4 }}>{attributes || "No category-specific attributes"}</div></td>
                <td>{trace || "—"}</td>
                <td>{position.locationLabel}</td>
                <td>{position.onHand}</td>
                <td>{Math.max(0, position.onHand - position.available)}</td>
                <td><b>{position.available}</b></td>
                <td><span className={`badge ${qualityClass(position.quality)}`}>{position.quality}</span></td>
                <td>{incoming || "—"}</td>
                <td style={{ minWidth: 220 }}>{positionStatus(position, incoming, remote)}{position.available === 0 && remote > 0 && <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{otherFacility}: {remote} available</div>}</td>
                <td><Link href={`/r/${position.identity.publicRef}`}>View item</Link></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {positions.length === 0 && <p>No stock lines match the current filters.</p>}
    </div>
  );
}

function IncomingTab() {
  const state = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploadName(file.name); setUploadError(null);
    const form = new FormData(); form.append("file", file); form.append("idempotencyKey", `shipment-${Date.now()}-${file.name}`);
    const headers: Record<string, string> = {};
    if (process.env.NEXT_PUBLIC_OEH_UAT_MODE === "1") headers["x-oeh-uat-employee-id"] = state.currentUserId;
    try {
      const response = await fetch("/api/oeh/v1/shipment-files", { method: "POST", headers, body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Upload failed (${response.status})`);
      window.location.reload();
    } catch (error) { setUploadError(error instanceof Error ? error.message : String(error)); }
  };
  const drafts = state.expectedShipments.filter((x) => x.status === "Draft");
  const confirmed = state.expectedShipments.filter((x) => x.status === "Confirmed");

  return <>
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Incoming shipment list</h3>
      <p className="from-default">Upload Excel, CSV, text PDF, or a scanned document. The OEH backend stores the original file immutably, parses it in a worker boundary, and returns field-level review results before anything is confirmed.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,.pdf,.jpg,.jpeg,.png" /><button type="button" className="btn btn-primary" onClick={upload}>Upload and parse</button>{uploadName && <span className="from-default">{uploadName}</span>}</div>
      {uploadError && <p role="alert" style={{ color: "var(--danger)" }}>{uploadError}</p>}
    </div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Drafts awaiting review ({drafts.length})</h3>{drafts.length === 0 && <p>No shipment drafts yet.</p>}{drafts.map((shipment) => <ShipmentDraftRow key={shipment.id} shipment={shipment} />)}</div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Confirmed inbound ({confirmed.length})</h3>{confirmed.length === 0 && <p>No confirmed shipments.</p>}{confirmed.map((shipment) => <ConfirmedShipmentRow key={shipment.id} shipment={shipment} />)}</div>
  </>;
}

function ShipmentDraftRow({ shipment }: { shipment: ExpectedShipment }) {
  const dispatch = useAppDispatch();
  const [supplier, setSupplier] = useState(shipment.supplier);
  return <div className="record-list-item" data-testid={`shipment-draft-${shipment.id}`}>
    <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}><label>Supplier<input value={supplier} onChange={(e) => setSupplier(e.target.value)} onBlur={() => dispatch({ type: "editExpectedShipmentDraft", input: { shipmentId: shipment.id, supplier } })} /></label><span>{shipment.facility}</span><span>Revision {shipment.revision}</span><button type="button" className="btn btn-primary" onClick={() => dispatch({ type: "confirmExpectedShipment", shipmentId: shipment.id })}>Confirm shipment</button></div>
    <div style={{ overflowX: "auto", marginTop: 8 }}><table className="data"><thead><tr><th>Source row</th><th>Part number</th><th>Description</th><th>Expected quantity</th><th>UOM</th></tr></thead><tbody>{shipment.lines.map((item) => <DraftLine key={item.id} shipmentId={shipment.id} line={item} />)}</tbody></table></div>
  </div>;
}

function DraftLine({ shipmentId, line }: { shipmentId: string; line: ExpectedShipment["lines"][number] }) {
  const dispatch = useAppDispatch();
  const [quantity, setQuantity] = useState(line.expectedQuantity);
  return <tr><td>{line.sourceRow ?? "—"}</td><td>{line.partNumber || <input aria-label="Part number" defaultValue={line.partNumber} onBlur={(e) => dispatch({ type: "editExpectedShipmentDraft", input: { shipmentId, lineId: line.id, line: { partNumber: e.target.value } } })} />}</td><td>{line.description || <input aria-label="Description" defaultValue={line.description} onBlur={(e) => dispatch({ type: "editExpectedShipmentDraft", input: { shipmentId, lineId: line.id, line: { description: e.target.value } } })} />}</td><td><input type="number" min={0} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} onBlur={() => dispatch({ type: "editExpectedShipmentDraft", input: { shipmentId, lineId: line.id, line: { expectedQuantity: quantity } } })} /></td><td>{line.uom}</td></tr>;
}

function ConfirmedShipmentRow({ shipment }: { shipment: ExpectedShipment }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const outstanding = shipment.lines.reduce((sum, line) => sum + Math.max(0, line.expectedQuantity - receivedForLine(state, line.id)), 0);
  return <div className="record-list-item"><b>{shipment.supplier}</b> · {shipment.facility} · PO {shipment.poNumber ?? "—"} · {outstanding} outstanding <span className="badge save-saved">Confirmed</span><button type="button" className="btn btn-subtle" style={{ marginLeft: 8 }} onClick={() => dispatch({ type: "supersedeExpectedShipment", shipmentId: shipment.id })}>Create correction revision</button></div>;
}

type ReceivingSource = {
  value: string;
  label: string;
  partNumber: string;
  description: string;
  material?: string;
  attributes?: Record<string, string>;
  quantity: number;
  uom: string;
  category: InventoryCategory;
  componentKey?: string;
  expectedShipmentLineId?: string;
  vendorPoLineId?: string;
  serialNumber?: string;
  lotNumber?: string;
  heatNumber?: string;
  vendor?: string;
  poNumber?: string;
  poLine?: string;
};

function ReceivingTab({ persistenceMode }: { persistenceMode: "local" | "server" }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [facility, setFacility] = useState<Facility>("Mississauga");
  const [partNumber, setPartNumber] = useState(""); const [description, setDescription] = useState(""); const [material, setMaterial] = useState(""); const [attributes, setAttributes] = useState<Record<string, string>>({}); const [quantity, setQuantity] = useState(1); const [policy, setPolicy] = useState<TrackingPolicy>("QuantityTracked"); const [serial, setSerial] = useState(""); const [lot, setLot] = useState(""); const [heat, setHeat] = useState(""); const [category, setCategory] = useState<InventoryCategory>("Accessory"); const [sourceId, setSourceId] = useState("");
  const quarantine = inventoryPositions(state).filter((x) => x.quality === "Quarantine");
  const expectedLines = state.expectedShipments.filter((shipment) => shipment.status === "Confirmed" && shipment.facility === facility).flatMap((shipment) => shipment.lines.map((line) => ({ shipment, line })));
  const poLines = openPoLines({ inventoryReceipts: state.inventoryReceipts, inventoryReceiptLines: state.inventoryReceiptLines, vendorPoReferences: state.vendorPoReferences }, new Date().toISOString()).filter(({ po }) => po.facility === facility);
  const sources: ReceivingSource[] = [
    ...expectedLines.map(({ shipment, line }) => ({ value: `shipment:${line.id}`, label: `${shipment.supplier} · PO ${shipment.poNumber ?? "—"} · row ${line.sourceRow ?? "—"} · ${line.partNumber} (${line.expectedQuantity} ${line.uom})`, partNumber: line.partNumber, description: line.description, material: line.material, attributes: line.attributes, quantity: line.expectedQuantity, uom: line.uom, category: line.category, componentKey: line.componentKey, expectedShipmentLineId: line.id, serialNumber: line.serialNumbers?.[0], lotNumber: line.lotNumber, heatNumber: line.heatNumber, vendor: shipment.supplier, poNumber: shipment.poNumber })),
    ...poLines.map(({ po, line }) => ({ value: `po:${line.id}`, label: `${po.vendor} · PO ${po.poNumber} · line ${line.lineNumber} · ${line.partNumber} (${line.orderedQuantity} ${line.uom})`, partNumber: line.partNumber, description: line.description, quantity: line.orderedQuantity, uom: line.uom, category: "Accessory" as InventoryCategory, componentKey: line.componentKey, vendorPoLineId: line.id, vendor: po.vendor, poNumber: po.poNumber, poLine: String(line.lineNumber) }))
  ];
  const selectedSource = sources.find((item) => item.value === sourceId);
  const trackingIsDerived = Boolean(selectedSource?.componentKey);
  const chooseSource = (value: string) => { setSourceId(value); const source = sources.find((item) => item.value === value); if (source) { setPartNumber(source.partNumber); setDescription(source.description); setMaterial(source.material ?? ""); setAttributes(source.attributes ?? {}); setQuantity(source.quantity); setCategory(source.category); setPolicy(source.componentKey ? trackingPolicyFor(source.componentKey) : "QuantityTracked"); setSerial(source.serialNumber ?? ""); setLot(source.lotNumber ?? ""); setHeat(source.heatNumber ?? ""); } };
  const receive = () => { const source = sources.find((item) => item.value === sourceId); dispatch({ type: "receiveInventory", input: { kind: source?.vendorPoLineId || source?.expectedShipmentLineId ? "AgainstPo" : "Stock", poNumber: source?.poNumber, poLine: source?.poLine, vendor: source?.vendor, facility, partNumber, description, material, quantity, uom: source?.uom, category, attributes, componentKey: source?.componentKey, trackingPolicy: policy, serialNumber: serial, lotNumber: lot, heatNumber: heat, vendorPoLineId: source?.vendorPoLineId, expectedShipmentLineId: source?.expectedShipmentLineId } }); setPartNumber(""); setDescription(""); setMaterial(""); setAttributes({}); setSerial(""); setLot(""); setHeat(""); setSourceId(""); };
  return <>
    <div className="card"><h3 style={{ marginTop: 0 }}>Receive material</h3><p className="from-default">Receive creates a movement. Tracked material enters quarantine until Quality accepts it. Accepted material may be put away or issued directly to an active Unit/work allocation.</p>{persistenceMode === "local" && <p className="from-default">Local UAT mode is device-local. Shared commands require the server mode and an OEH identity mapping.</p>}<div className="field-grid"><label>Facility<select value={facility} onChange={(e) => { setFacility(e.target.value as Facility); setSourceId(""); }}><option>Mississauga</option><option>Houston</option></select></label><label>Against confirmed inbound<select data-testid="intake-po-line" value={sourceId} onChange={(e) => chooseSource(e.target.value)}><option value="">Not matched to expected shipment</option>{sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label><label>Part number<input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} /></label><label>Description<input value={description} onChange={(e) => setDescription(e.target.value)} /></label><label>Material<input value={material} onChange={(e) => setMaterial(e.target.value)} /></label><label>Quantity<input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} /></label><label>Category<select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>{INVENTORY_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Tracking<select value={policy} disabled={trackingIsDerived} aria-label="Tracking policy" onChange={(e) => setPolicy(e.target.value as TrackingPolicy)}>{TRACKING_POLICIES.map((value) => <option key={value}>{value}</option>)}</select>{trackingIsDerived && <span className="from-default">Configured by component role</span>}</label>{policy === "Serialized" && <label>Serial number<input value={serial} onChange={(e) => setSerial(e.target.value)} /></label>}{policy === "LotTracked" && <label>Lot number<input value={lot} onChange={(e) => setLot(e.target.value)} /></label>}{policy === "HeatTracked" && <label>Heat number<input data-testid="intake-heat" value={heat} onChange={(e) => setHeat(e.target.value)} /></label>}</div><button type="button" className="btn btn-primary" data-testid="intake-submit" disabled={!partNumber.trim() || !description.trim()} onClick={receive}>Receive</button></div>
    <InspectionQueue positions={quarantine} />
  </>;
}

function InspectionQueue({ positions }: { positions: ReturnType<typeof inventoryPositions> }) {
  const dispatch = useAppDispatch();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return <div className="card"><h3 style={{ marginTop: 0 }}>Receiving queue · quarantine ({positions.length})</h3>{positions.length === 0 && <p>Nothing is waiting for inspection.</p>}{positions.map((position) => <div key={position.identity.id} data-testid={`inventory-quarantine-${position.identity.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}><b style={{ minWidth: 260 }}>{position.identity.partNumber} — {position.identity.description}</b><input value={notes[position.identity.id] ?? ""} onChange={(e) => setNotes((current) => ({ ...current, [position.identity.id]: e.target.value }))} placeholder="Inspection note (required to reject)" data-testid={`inspect-note-${position.identity.id}`} /><button type="button" className="btn btn-ok" data-testid={`inspect-accept-${position.identity.id}`} onClick={() => dispatch({ type: "inspectInventory", identityId: position.identity.id, decision: "Accept", note: notes[position.identity.id] ?? "Accepted in UAT inspection" })}>Accept</button><button type="button" className="btn btn-danger" onClick={() => dispatch({ type: "inspectInventory", identityId: position.identity.id, decision: "Reject", note: notes[position.identity.id] ?? "" })}>Reject</button></div>)}</div>;
}

function HistoryTab({ facility, setFacility }: { facility: "All" | Facility; setFacility: (value: "All" | Facility) => void }) {
  const state = useAppState();
  const identities = state.inventoryIdentities.filter((identity) => facility === "All" || identity.facility === facility);
  return <div className="card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><div><h3 style={{ margin: 0 }}>Movement history</h3><p className="from-default" style={{ marginBottom: 0 }}>Append-only audit trail. Opening movements retain batch, source hash, source row, approver, approval time, and reason.</p></div><label>Facility<select value={facility} onChange={(e) => setFacility(e.target.value as "All" | Facility)}>{FACILITIES.map((value) => <option key={value}>{value}</option>)}</select></label></div>{identities.map((identity) => { const history = historyFor(state.inventoryMovements, identity.id); return <div key={identity.id} style={{ marginTop: 16 }} data-testid={`inventory-history-${identity.id}`}><b>{identity.partNumber} — {identity.description}</b><table className="data"><thead><tr><th>Movement</th><th>Qty</th><th>Unit/location</th><th>Provenance</th><th>Recorded</th></tr></thead><tbody>{history.map((movement) => <tr key={movement.id}><td>{MOVEMENT_LABELS[movement.type]}</td><td>{movement.quantity || ""}</td><td>{movement.unitId ?? movement.toLocationId ?? ""}</td><td style={{ fontSize: 12 }}>{movement.importBatchId ? `${movement.importBatchId} · row ${movement.sourceRow} · approved ${movement.approvedBy}` : movement.reason ?? "—"}</td><td><Exact at={movement.recordedAt} /></td></tr>)}</tbody></table></div>; })}{identities.length === 0 && <p>No movement history in this facility.</p>}</div>;
}
