"use client";

// Ordered / Required / Actual for one Unit, on one screen.
//
// The point of this panel is that the technician is never shown two different
// values and left to carry on. Where actual disagrees with ordered, the row
// states the difference in words and offers the only two honest ways forward:
// fit the right part, or have the substitution approved by someone who will
// answer for it.
//
// Nothing here writes back to the ordered configuration.

import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { requiredVsActual, type RequiredVsActualRow } from "@/domain/ledger/requiredVsActual";
import { USAGE_SOURCES, type UsageSource } from "@/domain/ledger/componentUsage";
import { employeeName } from "@/domain/selectors";

const STATE_STYLE: Record<string, { label: string; tone: string }> = {
  Matched: { label: "Matches order", tone: "var(--ok, #1a7f37)" },
  ApprovedSubstitution: { label: "Approved substitution", tone: "var(--warn, #9a6700)" },
  PendingReview: { label: "Review required", tone: "var(--danger, #b42318)" },
  Rejected: { label: "Rejected", tone: "var(--danger, #b42318)" },
  NotRecorded: { label: "Not recorded yet", tone: "var(--text-subtle)" }
};

function MatchBadge({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.NotRecorded;
  return (
    <span className="badge" style={{ color: s.tone, borderColor: s.tone }} data-testid={`match-${state}`}>
      {s.label}
    </span>
  );
}

function describe(u: { partNumber?: string; material?: string; heatLot?: string; serial?: string }): string {
  return (
    [u.partNumber, u.material, u.serial ? `serial ${u.serial}` : null, u.heatLot ? `heat/lot ${u.heatLot}` : null]
      .filter(Boolean)
      .join(" · ") || "no identifying detail recorded"
  );
}

function RecordActualForm({ row, unitId }: { row: RequiredVsActualRow; unitId: string }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [partNumber, setPartNumber] = useState("");
  const [material, setMaterial] = useState("");
  const [heatLot, setHeatLot] = useState("");
  const [serial, setSerial] = useState("");
  const [source, setSource] = useState<UsageSource>("Inventory");

  if (!open) {
    return (
      <button type="button" className="btn" data-testid={`record-actual-${row.requirementId}`} onClick={() => setOpen(true)}>
        Record what was used
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          style={{ width: 150 }}
          placeholder={row.required.partNumber ?? "Part number"}
          value={partNumber}
          onChange={(e) => setPartNumber(e.target.value)}
          data-testid={`actual-part-${row.requirementId}`}
        />
        <input
          style={{ width: 110 }}
          placeholder={row.required.material ?? "Material"}
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          data-testid={`actual-material-${row.requirementId}`}
        />
        <input
          style={{ width: 110 }}
          placeholder="Heat / lot"
          value={heatLot}
          onChange={(e) => setHeatLot(e.target.value)}
          data-testid={`actual-heat-${row.requirementId}`}
        />
        <input
          style={{ width: 110 }}
          placeholder="Serial"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          data-testid={`actual-serial-${row.requirementId}`}
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as UsageSource)}
          data-testid={`actual-source-${row.requirementId}`}
        >
          {USAGE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === "ManualUntracked" ? "Manual (not from stock)" : s === "CustomerSupplied" ? "Customer supplied" : s === "BuiltInternally" ? "Built internally" : "From inventory"}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="btn btn-primary"
          data-testid={`actual-save-${row.requirementId}`}
          onClick={() => {
            dispatch({
              type: "recordComponentUsage",
              input: {
                requirementId: row.requirementId,
                unitId,
                componentRole: row.componentRole,
                source,
                partNumber: partNumber || undefined,
                material: material || undefined,
                heatLot: heatLot || undefined,
                serial: serial || undefined
              }
            });
            setOpen(false);
            setPartNumber("");
            setMaterial("");
            setHeatLot("");
            setSerial("");
          }}
        >
          Save actual part
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: 0 }}>
        Leave a field blank if it is not known — a blank cannot contradict the order. What you enter is compared
        against the ordered specification; a difference raises a review rather than changing the order.
      </p>
    </div>
  );
}

function ApproveSubstitution({ usageId }: { usageId: string }) {
  const dispatch = useAppDispatch();
  const [reason, setReason] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
      <input
        style={{ width: 260 }}
        placeholder="Reason for accepting this part"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        data-testid={`approve-reason-${usageId}`}
      />
      <button
        type="button"
        className="btn"
        disabled={!reason.trim()}
        data-testid={`approve-substitution-${usageId}`}
        onClick={() => {
          dispatch({ type: "approveUsageSubstitution", usageId, reason });
          setReason("");
        }}
      >
        Approve substitution
      </button>
    </div>
  );
}

export function RequiredVsActualPanel({ unitId }: { unitId: string }) {
  const state = useAppState();
  const rows = requiredVsActual(state.requirements, state.componentUsages, unitId);

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13.5 }} data-testid="required-vs-actual-empty">
        No component or material requirements are recorded against this Unit yet.
      </p>
    );
  }

  return (
    <div className="table-wrap" data-testid="required-vs-actual">
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: "32%" }}>Ordered</th>
            <th style={{ width: "36%" }}>Actually used</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.requirementId} data-testid={`rva-${row.requirementId}`}>
              <td>
                {row.orderedDescription}
                {row.blocksRelease && (
                  <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>Blocks release</div>
                )}
              </td>
              <td>
                {row.actual.length === 0 && <em style={{ color: "var(--text-subtle)" }}>Nothing recorded</em>}
                {row.actual.map((u) => (
                  <div key={u.id} style={{ marginBottom: 4 }}>
                    {describe(u)}
                    <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                      {u.usageStatus} · {u.source === "ManualUntracked" ? "manual entry — verification required" : u.source} ·{" "}
                      {employeeName(state, u.recordedBy)}
                    </div>
                    {u.approvedReason && (
                      <div style={{ fontSize: 12 }}>
                        Approved by {employeeName(state, u.approvedBy ?? "")}: {u.approvedReason}
                      </div>
                    )}
                    {(u.matchStatus === "PendingReview" || u.matchStatus === "Rejected") && (
                      <ApproveSubstitution usageId={u.id} />
                    )}
                  </div>
                ))}
                {row.history.length > 0 && (
                  <details style={{ fontSize: 12 }}>
                    <summary>{row.history.length} earlier record(s) — removed or replaced</summary>
                    {row.history.map((u) => (
                      <div key={u.id}>
                        {u.usageStatus}: {describe(u)}
                      </div>
                    ))}
                  </details>
                )}
                <RecordActualForm row={row} unitId={unitId} />
              </td>
              <td>
                <MatchBadge state={row.matchState} />
                {row.matchNote && row.needsReview && (
                  <div style={{ fontSize: 12, marginTop: 4 }} data-testid={`match-note-${row.requirementId}`}>
                    {row.matchNote}
                  </div>
                )}
                {row.needsVerification && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Entered manually — needs verification against a document or stock record.
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
