"use client";

// Material and purchasing for one order.
//
// The material table is DERIVED: each row is one component role across the
// order's Units, with counts of how many Unit requirements are covered by
// accepted stock, on order (with the earliest expected date), or short. The
// vendor-PO form records a REFERENCE to a PO issued in AIMCOR and links it to
// the exact Unit requirements it was raised for; nothing here prices,
// approves or places a purchase.

import { useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { availabilityForRequirement, componentKeyOf, type MaterialAvailability } from "@/domain/inventory/availability";
import { isOpen, isPhysicalCategory, type ExecutionRequirement } from "@/domain/ledger/requirement";
import { openPoLines } from "@/domain/purchasing/poReference";
import { requiredSpecFromDescription } from "@/domain/ledger/componentUsage";
import { Modal, FieldGroup } from "@/components/Drawer";

interface MaterialRow {
  key: string;
  description: string;
  material?: string;
  requirements: ExecutionRequirement[];
  inStock: number;
  onOrder: number;
  short: number;
  earliestExpected?: string;
  late: boolean;
}

function rowsFor(state: ReturnType<typeof useAppState>, orderNo: string, asOf: string): MaterialRow[] {
  const groups = new Map<string, MaterialRow>();
  for (const r of state.requirements) {
    if (r.executionOrderId !== orderNo || !isPhysicalCategory(r.category) || !isOpen(r)) continue;
    const key = `${componentKeyOf(r) ?? "component"}|${r.description}`;
    const row = groups.get(key) ?? {
      key,
      description: r.description,
      material: requiredSpecFromDescription(r.description).material,
      requirements: [],
      inStock: 0,
      onOrder: 0,
      short: 0,
      late: false
    };
    row.requirements.push(r);
    const availability = availabilityForRequirement(state, r.id);
    const s: MaterialAvailability = availability.state;
    if (s === "InStock") row.inStock += 1;
    else if (s === "OnOrder") {
      row.onOrder += 1;
      if (availability.expectedDate) {
        if (!row.earliestExpected || availability.expectedDate < row.earliestExpected) row.earliestExpected = availability.expectedDate;
        if (availability.expectedDate < asOf.slice(0, 10)) row.late = true;
      }
    } else row.short += 1;
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => b.short - a.short || a.description.localeCompare(b.description));
}

function ReferencePoModal({ orderNo, rows, onClose }: { orderNo: string; rows: MaterialRow[]; onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const order = state.orders.find((o) => o.orderNumber === orderNo)!;
  const shortRows = rows.filter((r) => r.short > 0);
  const [rowKey, setRowKey] = useState(shortRows[0]?.key ?? rows[0]?.key ?? "");
  const row = rows.find((r) => r.key === rowKey);
  // Default to the requirements that have no stock and no PO yet — that is the shortage.
  const candidates = useMemo(() => {
    if (!row) return [];
    return row.requirements.filter((r) => availabilityForRequirement(state, r.id).state !== "InStock" && r.status !== "Planned");
  }, [row, state]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(candidates.map((r) => r.id)));
  const [poNumber, setPoNumber] = useState("");
  const [vendor, setVendor] = useState("");
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [notes, setNotes] = useState("");

  const chosen = candidates.filter((r) => selected.has(r.id));
  const canSubmit = row && chosen.length > 0 && poNumber.trim() && vendor.trim() && /^\d{4}-\d{2}-\d{2}$/.test(expectedDate);

  return (
    <Modal
      title="Reference a vendor PO"
      subtitle="Issued in AIMCOR; recorded here for visibility and linked to the Unit demand it covers."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            data-testid="po-submit"
            onClick={() => {
              if (!row) return;
              dispatch({
                type: "referenceVendorPo",
                input: {
                  poNumber,
                  vendor,
                  poDate,
                  facility: order.facility,
                  notes: notes || undefined,
                  lines: [
                    {
                      partNumber: partNumber.trim(),
                      description: row.description,
                      material: row.material,
                      componentKey: componentKeyOf(row.requirements[0]),
                      orderedQuantity: chosen.length,
                      uom: "EA",
                      expectedDate,
                      requirementIds: chosen.map((r) => r.id)
                    }
                  ]
                }
              });
              onClose();
            }}
          >
            Record PO reference
          </button>
        </>
      }
    >
      <FieldGroup label="Component" required>
        <select
          value={rowKey}
          data-testid="po-component"
          onChange={(e) => {
            setRowKey(e.target.value);
            const next = rows.find((r) => r.key === e.target.value);
            setSelected(
              new Set(
                (next?.requirements ?? [])
                  .filter((r) => availabilityForRequirement(state, r.id).state !== "InStock" && r.status !== "Planned")
                  .map((r) => r.id)
              )
            );
          }}
        >
          {rows.map((r) => (
            <option key={r.key} value={r.key}>
              {r.description} — {r.short} short of {r.requirements.length}
            </option>
          ))}
        </select>
      </FieldGroup>

      {row && (
        <FieldGroup label={`Units this PO line covers (${chosen.length} selected)`}>
          <div style={{ display: "grid", gap: 4 }}>
            {candidates.length === 0 && <span className="from-default">Every Unit requirement for this component already has stock or a PO.</span>}
            {candidates.map((r) => (
              <label key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  data-testid={`po-req-${r.id}`}
                  checked={selected.has(r.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(r.id);
                    else next.delete(r.id);
                    setSelected(next);
                  }}
                />
                {r.unitId ?? "line"} · {availabilityForRequirement(state, r.id).reason}
              </label>
            ))}
          </div>
        </FieldGroup>
      )}

      <div className="field-grid">
        <FieldGroup label="Rotech PO number" required>
          <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} data-testid="po-number" placeholder="e.g. 4500187" />
        </FieldGroup>
        <FieldGroup label="Vendor" required>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} data-testid="po-vendor" />
        </FieldGroup>
        <FieldGroup label="PO date" required>
          <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} data-testid="po-date" />
        </FieldGroup>
        <FieldGroup label="Expected receipt" required>
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} data-testid="po-expected" />
        </FieldGroup>
        <FieldGroup label="Vendor part number">
          <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} data-testid="po-part" />
        </FieldGroup>
        <FieldGroup label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FieldGroup>
      </div>
      <p className="from-default">Ordered quantity = number of Unit requirements selected. Price, terms and approvals stay in AIMCOR.</p>
    </Modal>
  );
}

function ExpectedDateEditor({ poId, lineId, current }: { poId: string; lineId: string; current: string }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button type="button" className="btn btn-subtle" data-testid={`po-line-change-${lineId}`} onClick={() => setOpen(true)}>
        Change
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid={`po-line-date-${lineId}`} />
      <input value={reason} placeholder="Reason" onChange={(e) => setReason(e.target.value)} data-testid={`po-line-reason-${lineId}`} style={{ width: 160 }} />
      <button
        type="button"
        className="btn"
        disabled={!reason.trim() || !date}
        data-testid={`po-line-save-${lineId}`}
        onClick={() => {
          dispatch({ type: "updateVendorPoExpectedDate", poId, lineId, expectedDate: date, reason });
          setOpen(false);
          setReason("");
        }}
      >
        Save
      </button>
    </span>
  );
}

export function PurchasingPanel({ orderNo, asOf }: { orderNo: string; asOf: string }) {
  const state = useAppState();
  const [showPo, setShowPo] = useState(false);
  const rows = useMemo(() => rowsFor(state, orderNo, asOf), [state, orderNo, asOf]);
  const poLines = useMemo(
    () =>
      openPoLines(state, asOf).filter(
        (row) =>
          row.po.sourceOrderNumbers.includes(orderNo) ||
          row.line.requirementIds.some((id) => state.requirements.find((r) => r.id === id)?.executionOrderId === orderNo)
      ),
    [state, orderNo, asOf]
  );

  if (rows.length === 0 && poLines.length === 0) return null;

  const totalShort = rows.reduce((n, r) => n + r.short, 0);

  return (
    <section data-testid="purchasing-panel">
      <h3 className="section-head">
        Material and purchasing
        {totalShort > 0 && <span className="badge save-error" style={{ marginLeft: 8 }} data-testid="material-short-total">{totalShort} short</span>}
      </h3>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="data" data-testid="material-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Required</th>
                <th>In stock</th>
                <th>On order</th>
                <th>Short</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-testid={`material-row-${componentKeyOf(r.requirements[0]) ?? "component"}`}>
                  <td>{r.description}</td>
                  <td>{r.requirements.length}</td>
                  <td>{r.inStock}</td>
                  <td>
                    {r.onOrder}
                    {r.earliestExpected && (
                      <span style={{ fontSize: 12, color: r.late ? "var(--danger)" : "var(--text-subtle)" }}>
                        {" "}
                        · expected {r.earliestExpected}
                        {r.late ? " (late)" : ""}
                      </span>
                    )}
                  </td>
                  <td>{r.short > 0 ? <b style={{ color: "var(--danger)" }}>{r.short}</b> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totalShort > 0 && (
        <button type="button" className="btn btn-primary" data-testid="reference-po-open" onClick={() => setShowPo(true)} style={{ marginTop: 8 }}>
          Reference vendor PO for a shortage
        </button>
      )}
      {poLines.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data" data-testid="po-lines-table">
            <thead>
              <tr>
                <th>Rotech PO</th>
                <th>Vendor</th>
                <th>Item</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Pending</th>
                <th>Expected</th>
              </tr>
            </thead>
            <tbody>
              {poLines.map(({ po, line, received, pending, late }) => (
                <tr key={line.id} data-testid={`po-line-${line.id}`}>
                  <td>
                    <b>{po.poNumber}</b> / {line.lineNumber}
                  </td>
                  <td>{po.vendor}</td>
                  <td>
                    {line.description}
                    {line.partNumber && <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{line.partNumber}</div>}
                  </td>
                  <td>{line.orderedQuantity}</td>
                  <td>{received}</td>
                  <td>{pending}</td>
                  <td>
                    <span style={late ? { color: "var(--danger)", fontWeight: 600 } : undefined} data-testid={`po-line-expected-${line.id}`}>
                      {line.expectedDate}
                      {late ? " (late)" : ""}
                    </span>{" "}
                    <ExpectedDateEditor poId={po.id} lineId={line.id} current={line.expectedDate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showPo && <ReferencePoModal orderNo={orderNo} rows={rows} onClose={() => setShowPo(false)} />}
    </section>
  );
}
