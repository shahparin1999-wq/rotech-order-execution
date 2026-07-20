"use client";

// Digital 1196 checklist. Supports checkbox / pass-fail / measurement entry
// with units, expected range, required note and required-photo indicators,
// mocked photo attachment, technician, timestamp, and
// Saved / Pending / Error / Needs Review states.
//
// Numeric limits are NOT approved engineering tolerances; every placeholder
// is labelled for owner approval (decision D-013 is still Proposed).

import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import {
  checklistProgress,
  currentResponses,
  employeeName,
  measurementResult,
  responsesForUnit
} from "@/domain/selectors";
import type { ChecklistItemDef } from "@/domain/types";
import { Exact, MockPhoto, SaveStateBadge } from "./bits";
import { PhotoCapture } from "./PhotoCapture";

// An unapproved criterion must be flagged whatever its response type. The
// hydrotest step is pass/fail and still carries unapproved pressure and
// duration rules, so the flag cannot live inside the measurement range.
function PlaceholderFlag({ def }: { def: ChecklistItemDef }) {
  if (!def.placeholderTolerance) return null;
  return (
    <span className="placeholder-note" data-testid={`placeholder-${def.key}`}>
      Pilot placeholder - owner approval required
    </span>
  );
}

function ExpectedRange({ def }: { def: ChecklistItemDef }) {
  if (def.responseType !== "measurement") return null;
  const parts: string[] = [];
  if (def.nominal !== null) parts.push(`nominal ${def.nominal}`);
  if (def.min !== null) parts.push(`min ${def.min}`);
  if (def.max !== null) parts.push(`max ${def.max}`);
  return (
    <div style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>
      Expected: {parts.join(" · ")} {def.unit}
    </div>
  );
}

function ItemRow({
  def,
  unitId,
  orderNumber
}: {
  def: ChecklistItemDef;
  unitId: string;
  orderNumber: string;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [entry, setEntry] = useState("");
  const [note, setNote] = useState("");
  const [capturing, setCapturing] = useState(false);
  const current = currentResponses(state, unitId).get(def.key);
  const history = responsesForUnit(state, unitId).filter((r) => r.itemKey === def.key);
  const superseded = history.filter((r) => current && r.id !== current.id);

  const record = (value: boolean | "pass" | "fail" | number) => {
    if (def.requiresNote && !note.trim() && !(current?.note)) {
      window.alert("This item requires a note before it can be recorded.");
      return;
    }
    dispatch({
      type: "addResponse",
      unitId,
      input: {
        itemKey: def.key,
        value,
        enteredText: typeof value === "number" ? entry : null,
        note: note.trim() || null,
        supersedesId: current?.id ?? null
      }
    });
    setEntry("");
    setNote("");
  };

  const photo = current?.photoAttachmentId
    ? state.attachments.find((a) => a.id === current.photoAttachmentId)
    : state.attachments.find((a) => a.unitId === unitId && a.targetRef === def.key);

  return (
    <div className="card" data-testid={`checklist-item-${def.key}`} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <b style={{ flex: "1 1 240px" }}>{def.label}</b>
        {def.requiresPhoto && (
          <span className="badge save-pending" title="Photo evidence required">
            📷 photo required
          </span>
        )}
        {def.requiresNote && <span className="badge save-pending">note required</span>}
        <PlaceholderFlag def={def} />
        {current && <SaveStateBadge state={current.state} />}
      </div>
      <ExpectedRange def={def} />

      {current && (
        <div style={{ fontSize: 13.5, marginTop: 6 }} data-testid={`response-${def.key}`}>
          Recorded:{" "}
          <b>
            {typeof current.value === "number"
              ? `${current.value} ${def.unit ?? ""}`
              : String(current.value)}
          </b>
          {typeof current.value === "number" && (
            <>
              {" "}
              {measurementResult(def, current.value) === "out-of-range" ? (
                <span className="badge save-error">outside placeholder range</span>
              ) : measurementResult(def, current.value) === "in-range" ? (
                <span className="badge save-saved">within placeholder range</span>
              ) : null}
            </>
          )}
          <div style={{ color: "var(--text-subtle)" }}>
            {employeeName(state, current.technicianId)} · <Exact at={current.at} />
          </div>
          {current.note && <div>Note: {current.note}</div>}
          {current.supersedesId && (
            <div className="badge save-needsreview" style={{ marginTop: 4 }}>
              corrected — supersedes {current.supersedesId}
            </div>
          )}
        </div>
      )}

      {superseded.length > 0 && (
        <details style={{ fontSize: 12.5, marginTop: 6 }}>
          <summary>Superseded entries ({superseded.length}) — retained</summary>
          {superseded.map((r) => (
            <div key={r.id} style={{ color: "var(--text-subtle)", marginTop: 4 }}>
              {String(r.value)} {def.unit ?? ""} by {employeeName(state, r.technicianId)}{" "}
              <Exact at={r.at} /> {r.note && <>— {r.note}</>}
            </div>
          ))}
        </details>
      )}

      {photo && (
        <div style={{ marginTop: 8 }}>
          <MockPhoto art={photo.placeholderArt} caption={`${photo.fileName} · ${photo.category}`} width={150} height={100} />
        </div>
      )}

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {def.responseType === "checkbox" && (
          <button className="btn btn-ok" onClick={() => record(true)}>
            ✔️ Mark done
          </button>
        )}
        {def.responseType === "passfail" && (
          <>
            <button className="btn btn-ok" data-testid={`pass-${def.key}`} onClick={() => record("pass")}>
              Pass
            </button>
            <button className="btn btn-danger" onClick={() => record("fail")}>
              Fail
            </button>
            <button
              className="btn"
              onClick={() =>
                dispatch({
                  type: "addResponse",
                  unitId,
                  input: { itemKey: def.key, value: null, note: note.trim() || "Needs quality review", state: "NeedsReview", supersedesId: current?.id ?? null }
                })
              }
            >
              Needs Review
            </button>
          </>
        )}
        {def.responseType === "measurement" && (
          <>
            <label style={{ fontSize: 13 }}>
              Measurement ({def.unit})
              <input
                type="number"
                step="0.001"
                inputMode="decimal"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                style={{ width: 140 }}
                data-testid={`measure-input-${def.key}`}
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={!entry.trim()}
              data-testid={`measure-save-${def.key}`}
              onClick={() => record(Number(entry))}
            >
              Enter Measurement
            </button>
          </>
        )}
        {def.requiresNote && (
          <label style={{ fontSize: 13, flex: "1 1 220px" }}>
            Note (required)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        {def.requiresPhoto && !capturing && (
          <button className="btn" onClick={() => setCapturing(true)}>
            📷 Add photo evidence
          </button>
        )}
      </div>

      {capturing && (
        <div style={{ marginTop: 10 }}>
          <PhotoCapture
            orderNumber={orderNumber}
            unitId={unitId}
            targetRef={def.key}
            targetLabel={`Checklist step: ${def.label}`}
          />
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setCapturing(false)}>
            Close capture
          </button>
        </div>
      )}
    </div>
  );
}

export function Checklist({
  unitId,
  orderNumber
}: {
  unitId: string;
  orderNumber: string;
}) {
  const state = useAppState();
  const cp = checklistProgress(state, unitId);
  return (
    <div data-testid="checklist">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          1196 checklist — {cp.done}/{cp.total} complete
        </h3>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(cp.done / cp.total) * 100}%` }} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-subtle)", marginBottom: 0 }}>
          Responses are recorded against <b>{unitId}</b> only. Corrections supersede
          the prior response; nothing is overwritten.
        </p>
      </div>
      {state.checklistDefs.map((def) => (
        <ItemRow key={def.key} def={def} unitId={unitId} orderNumber={orderNumber} />
      ))}
    </div>
  );
}
