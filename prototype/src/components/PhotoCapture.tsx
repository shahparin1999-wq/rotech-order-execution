"use client";

// Mocked Take Photo / Attach Photo / Attach File. Before saving, the target
// (Order, Unit, task/checklist step, category, employee, timestamp) is shown
// and locked: the target cannot be changed silently once capture starts.

import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { employeeName } from "@/domain/selectors";
import type { AttachmentCategory } from "@/domain/types";
import { MockPhoto } from "./bits";

const CATEGORIES: AttachmentCategory[] = [
  "Nameplate",
  "Packaging",
  "Free rotation",
  "Measurement evidence",
  "Material marking",
  "Before",
  "After",
  "General reference"
];

const ART_FOR_CATEGORY: Record<string, string> = {
  Nameplate: "nameplate",
  Packaging: "crate",
  "Free rotation": "pump",
  "Measurement evidence": "caliper",
  "Material marking": "stamp",
  Before: "shaft",
  After: "shaft",
  "General reference": "pump"
};

export function PhotoCapture({
  orderNumber,
  unitId,
  targetRef,
  targetLabel,
  big = false,
  // When the caller already offered a "Take Photo" control (the tablet's large
  // action grid), open the capture dialog directly instead of asking for a
  // second tap.
  autoStartMode = null
}: {
  orderNumber: string;
  unitId: string;
  targetRef: string | null;
  targetLabel: string;
  big?: boolean;
  autoStartMode?: null | "photo" | "existing" | "file";
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<null | "photo" | "existing" | "file">(autoStartMode);
  const [category, setCategory] = useState<AttachmentCategory>("Measurement evidence");
  const [captured, setCaptured] = useState(false);
  const me = state.employees.find((e) => e.id === state.currentUserId)!;
  const cls = big ? "btn btn-big" : "btn";
  const at = new Date();

  const reset = () => {
    setMode(null);
    setCaptured(false);
  };

  if (!mode) {
    return (
      <div className={big ? "big-actions" : "composer-actions"}>
        <button className={cls} data-testid="take-photo" onClick={() => setMode("photo")}>
          {big && <span className="icon">📷</span>}Take Photo
        </button>
        <button className={cls} onClick={() => setMode("existing")}>
          {big && <span className="icon">🖼️</span>}Attach Existing Photo
        </button>
        <button className={cls} onClick={() => setMode("file")}>
          {big && <span className="icon">📎</span>}Attach File
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ background: "var(--bg-subtle)" }} data-testid="capture-dialog">
      <h3 style={{ marginTop: 0 }}>
        {mode === "photo" ? "Take Photo" : mode === "existing" ? "Attach Existing Photo" : "Attach File"} (mocked)
      </h3>

      <div className="card" style={{ background: "#fff", marginBottom: 10 }} data-testid="capture-target">
        <b>Target — locked for this capture</b>
        <table className="data" style={{ marginTop: 6 }}>
          <tbody>
            <tr><td><b>Order</b></td><td>{orderNumber}</td></tr>
            <tr><td><b>Unit</b></td><td data-testid="capture-target-unit">{unitId}</td></tr>
            <tr><td><b>Task / checklist step</b></td><td>{targetLabel}</td></tr>
            <tr><td><b>Employee</b></td><td>{employeeName(state, me.id)}</td></tr>
            <tr><td><b>Timestamp</b></td><td>{at.toLocaleString("en-CA")}</td></tr>
          </tbody>
        </table>
        {captured && (
          <p style={{ color: "var(--warn)", fontWeight: 600, marginBottom: 0 }} data-testid="target-locked-note">
            🔒 Capture has started — the target cannot be changed. Cancel and start
            again to target a different Unit.
          </p>
        )}
      </div>

      <label style={{ fontSize: 13.5, display: "block", marginBottom: 8 }}>
        Category
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
          disabled={captured}
          data-testid="capture-category"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {!captured ? (
        <div className="composer-actions">
          <button
            className="btn btn-primary"
            data-testid="capture-now"
            onClick={() => setCaptured(true)}
          >
            {mode === "photo" ? "Capture (mock camera)" : mode === "existing" ? "Choose mock photo" : "Choose mock file"}
          </button>
          <button className="btn" onClick={reset}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>
            Preview (generated placeholder — no real camera or customer image):
          </p>
          <MockPhoto art={ART_FOR_CATEGORY[category] ?? "pump"} caption={`${category} · ${unitId}`} />
          <div className="composer-actions" style={{ marginTop: 10 }}>
            <button
              className="btn btn-primary"
              data-testid="capture-save"
              onClick={() => {
                dispatch({
                  type: "addAttachment",
                  input: {
                    kind: mode === "file" ? "file" : "photo",
                    category,
                    orderNumber,
                    unitId,
                    targetRef,
                    fileName: `${category.toLowerCase().replace(/\s+/g, "-")}-${unitId.replace(/[^\w.]/g, "")}.${mode === "file" ? "pdf" : "jpg"}`,
                    placeholderArt: ART_FOR_CATEGORY[category] ?? "pump"
                  }
                });
                reset();
              }}
            >
              Save to {unitId}
            </button>
            <button className="btn" onClick={() => setCaptured(false)}>
              Retake
            </button>
            <button className="btn" onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
