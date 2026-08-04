"use client";

// Create a 1196 pump end from a controlled manual configuration (not a CPQ
// import) - the rules-driven slice described in model1196.ts. Size drives
// frame, material and full impeller diameter from the CPQ-sourced catalogue;
// the "other frame" escape hatch stays so the fail-closed rejection
// (R-1196-019) is demonstrable rather than a silently guessed DBSE or
// power-end build list.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import type { Facility, PackageDrawing1196, Priority } from "@/domain/types";
import {
  catalogueBlockers1196,
  defaultShaftType1196,
  materialOptionsForSize,
  PACKAGE_COMPONENT_KEYS,
  PACKAGE_COMPONENT_LABELS,
  pumpSizes1196,
  pumpSizeEntry1196,
  SERVICE_CATALOGUE_1196,
  shaftTypes1196,
  type PackageComponentScope
} from "@/domain/model1196";
import { Drawer, FieldGroup } from "./Drawer";

export function New1196PumpDrawer({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [orderNumber, setOrderNumber] = useState("");
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? "");
  const [customerPo, setCustomerPo] = useState("");
  const [description, setDescription] = useState("");
  const [facility, setFacility] = useState<Facility>("Mississauga");
  const [coordinatorId, setCoordinatorId] = useState(
    state.employees.find((e) => e.department === "Coordination")?.id ?? state.employees[0].id
  );
  const [priority, setPriority] = useState<Priority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [quantity, setQuantity] = useState(1);

  // Options come from the pinned CPQ catalogue release; if it cannot be
  // resolved there is nothing to configure and the drawer says so rather than
  // offering a guessed list.
  const catalogueSizes = pumpSizes1196();
  const catalogueShaftTypes = shaftTypes1196();
  const blockers = catalogueBlockers1196();
  const firstSize = catalogueSizes[0];

  const [size, setSize] = useState(firstSize?.pumpSize ?? "");
  const sizeEntry = pumpSizeEntry1196(size);
  const materials = materialOptionsForSize(size);
  const [frameChoice, setFrameChoice] = useState<string>(firstSize?.defaultFrame ?? "");
  const [frameOther, setFrameOther] = useState("");
  const frame = frameChoice === "__other__" ? frameOther.trim() : frameChoice;
  const [materialBuild, setMaterialBuild] = useState(firstSize?.defaultMoc ?? "");
  const [shaftType, setShaftType] = useState<string>(defaultShaftType1196() ?? "");

  // Selecting a size resets frame and material to that size's own controlled
  // defaults — a frame/material carried over from a previous size would fail
  // validation on submit.
  const selectSize = (next: string) => {
    setSize(next);
    const entry = pumpSizeEntry1196(next);
    if (entry) {
      setFrameChoice(entry.defaultFrame);
      setMaterialBuild(entry.defaultMoc);
    }
  };

  const [trimSelected, setTrimSelected] = useState(false);
  const [trimValue, setTrimValue] = useState<number>(0);
  const [trimReason, setTrimReason] = useState("");

  const [sbcOverride, setSbcOverride] = useState(false);
  const [sbcDescription, setSbcDescription] = useState("");
  const [sbcReason, setSbcReason] = useState("");

  const [buildType, setBuildType] = useState<"BarePumpEnd" | "CompletePackage">("BarePumpEnd");
  const [packageScope, setPackageScope] = useState<Partial<Record<string, PackageComponentScope>>>({
    motor: "RotechSupplied",
    baseplate: "RotechSupplied",
    coupling: "RotechSupplied",
    couplingGuard: "RotechSupplied",
    seal: "RotechSupplied",
    accessories: "NotInScope"
  });

  const [drawingKind, setDrawingKind] = useState<"StandardReference" | "CustomBaseplate">("StandardReference");
  const [drawingReference, setDrawingReference] = useState("");
  const [drawingNote, setDrawingNote] = useState("");
  const [drawingFileName, setDrawingFileName] = useState("");

  const [selectedServiceKeys, setSelectedServiceKeys] = useState<string[]>([]);

  const drawingComplete =
    buildType !== "CompletePackage" ||
    !drawingReference.trim() ||
    drawingKind === "StandardReference" ||
    drawingNote.trim().length > 0;

  const canSubmit =
    catalogueSizes.length > 0 &&
    orderNumber.trim() &&
    customerId &&
    customerPo.trim() &&
    description.trim() &&
    dueDate &&
    size.trim() &&
    frame &&
    materialBuild.trim() &&
    quantity >= 1 &&
    (!trimSelected || (trimValue > 0 && trimReason.trim())) &&
    (!sbcOverride || (sbcDescription.trim() && sbcReason.trim())) &&
    drawingComplete &&
    !state.orders.some((o) => o.orderNumber === orderNumber.trim());

  const orderNumberTaken = orderNumber.trim() && state.orders.some((o) => o.orderNumber === orderNumber.trim());

  return (
    <Drawer
      title="New 1196 pump end (controlled manual configuration)"
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
            data-testid="submit-new-1196"
            onClick={() => {
              const packageDrawing: PackageDrawing1196 | null =
                buildType !== "CompletePackage" || !drawingReference.trim()
                  ? null
                  : drawingKind === "StandardReference"
                    ? { kind: "StandardReference", reference: drawingReference.trim() }
                    : {
                        kind: "CustomBaseplate",
                        reference: drawingReference.trim(),
                        note: drawingNote.trim(),
                        attachmentId: null
                      };
              dispatch({
                type: "create1196PumpEnd",
                input: {
                  orderNumber: orderNumber.trim(),
                  customerId,
                  customerPo: customerPo.trim(),
                  description: description.trim(),
                  facility,
                  coordinatorId,
                  priority,
                  dueDate,
                  quantity,
                  size: size.trim(),
                  frame,
                  materialBuild: materialBuild.trim(),
                  shaftType,
                  hydraulicCondition: trimSelected
                    ? { kind: "Trim", trimValue, reason: trimReason.trim() }
                    : { kind: "MaxDiameter" },
                  stuffingBoxCover: sbcOverride
                    ? { kind: "Override", description: sbcDescription.trim(), reason: sbcReason.trim() }
                    : { kind: "Standard" },
                  buildType,
                  packageScope: buildType === "CompletePackage" ? packageScope : undefined,
                  packageDrawing,
                  selectedServiceKeys
                }
              });
              onClose();
              router.push(`/orders/${orderNumber.trim()}`);
            }}
          >
            Create 1196 pump end
          </button>
        </>
      }
    >
      {blockers.length > 0 && (
        <div
          className="card"
          data-testid="new-1196-catalogue-blockers"
          style={{ background: "var(--bg-subtle)", marginBottom: 12 }}
        >
          <b>Catalogue status</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <FieldGroup label="Order number" required>
        <input
          data-testid="new-1196-order-number"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="e.g. 1196-DEMO-01"
        />
        {orderNumberTaken && (
          <span style={{ fontSize: 12, color: "var(--danger)" }}>An order with this number already exists.</span>
        )}
      </FieldGroup>

      <FieldGroup label="Customer" required>
        <select data-testid="new-1196-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          {state.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FieldGroup>

      <FieldGroup label="Customer PO" required>
        <input data-testid="new-1196-po" value={customerPo} onChange={(e) => setCustomerPo(e.target.value)} />
      </FieldGroup>

      <FieldGroup label="Description" required>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Order description" />
      </FieldGroup>

      <div className="field-row">
        <FieldGroup label="Location">
          <select value={facility} onChange={(e) => setFacility(e.target.value as Facility)}>
            <option value="Mississauga">Mississauga</option>
            <option value="Houston">Houston</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Due date" required>
          <input type="date" data-testid="new-1196-duedate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FieldGroup>
      </div>

      <div className="field-row">
        <FieldGroup label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Coordinator">
          <select value={coordinatorId} onChange={(e) => setCoordinatorId(e.target.value)}>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </FieldGroup>
      </div>

      <FieldGroup label="Quantity" required>
        <input
          type="number"
          min={1}
          data-testid="new-1196-quantity"
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
        />
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
          Creates {quantity} independent Unit{quantity === 1 ? "" : "s"}.
        </span>
      </FieldGroup>

      <h3 style={{ marginTop: 18 }}>1196 identity</h3>
      <p style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: -6 }}>
        Size, frame options, standard material and full impeller diameter come from the CPQ product catalogue —
        selecting a size fills in that size&apos;s own controlled defaults.
      </p>
      <div className="field-row">
        <FieldGroup label="Size" required>
          <select data-testid="new-1196-size" value={size} onChange={(e) => selectSize(e.target.value)}>
            {catalogueSizes.map((entry) => (
              <option key={entry.pumpSize} value={entry.pumpSize}>
                {entry.pumpSize}
              </option>
            ))}
          </select>
        </FieldGroup>
        <FieldGroup label="Frame" required>
          <select data-testid="new-1196-frame" value={frameChoice} onChange={(e) => setFrameChoice(e.target.value)}>
            {(sizeEntry?.frameOptions ?? []).map((f) => (
              <option key={f} value={f}>
                {f}
                {f === sizeEntry?.defaultFrame ? " (standard)" : ""}
              </option>
            ))}
            <option value="__other__">Other / unknown frame…</option>
          </select>
          {frameChoice === "__other__" && (
            <>
              <input
                data-testid="new-1196-frame-other"
                value={frameOther}
                onChange={(e) => setFrameOther(e.target.value)}
                placeholder="Type frame (will fail closed - not a controlled frame)"
                style={{ marginTop: 6 }}
              />
              <span style={{ fontSize: 12, color: "var(--danger)" }}>
                Not a controlled frame for size {size} - creation will be rejected (fails closed, D-1196-001).
              </span>
            </>
          )}
        </FieldGroup>
      </div>
      <div className="field-row">
        <FieldGroup label="Material build" required>
          <select data-testid="new-1196-material" value={materialBuild} onChange={(e) => setMaterialBuild(e.target.value)}>
            {(materials?.options ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
                {m === materials?.default ? " (standard)" : ""}
              </option>
            ))}
          </select>
        </FieldGroup>
        <FieldGroup label="Shaft type">
          <select data-testid="new-1196-shafttype" value={shaftType} onChange={(e) => setShaftType(e.target.value)}>
            {catalogueShaftTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            Determines the power-end frame and shaft-kit part numbers if a build is required.
          </span>
        </FieldGroup>
      </div>

      <h3 style={{ marginTop: 18 }}>Standard baseline (150# FF casing, AISI 4140 shaft, sleeve/bearings/sight glass/labyrinth seals included by default)</h3>
      <FieldGroup label="Impeller condition">
        <label style={{ display: "block", fontWeight: 400 }}>
          <input type="radio" checked={!trimSelected} onChange={() => setTrimSelected(false)} /> Maximum diameter (standard)
        </label>
        <label style={{ display: "block", fontWeight: 400 }}>
          <input type="radio" checked={trimSelected} onChange={() => setTrimSelected(true)} data-testid="new-1196-trim-toggle" /> Explicit trim (override)
        </label>
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }} data-testid="new-1196-full-trim">
          Full diameter for {size}: {sizeEntry?.fullImpellerTrim} in. Trimming is a machining step on the impeller
          only — the rest of the build is not gated on it.
        </span>
        {trimSelected && (
          <div className="field-row" style={{ marginTop: 6 }}>
            <input
              type="number"
              step="0.01"
              data-testid="new-1196-trim-value"
              value={trimValue}
              onChange={(e) => setTrimValue(Number(e.target.value) || 0)}
              placeholder="Trim diameter (in)"
            />
            <input
              data-testid="new-1196-trim-reason"
              value={trimReason}
              onChange={(e) => setTrimReason(e.target.value)}
              placeholder="Reason"
            />
          </div>
        )}
      </FieldGroup>
      <FieldGroup label="Stuffing-box cover">
        <label style={{ display: "block", fontWeight: 400 }}>
          <input type="radio" checked={!sbcOverride} onChange={() => setSbcOverride(false)} /> Standard bore, casing MOC (standard)
        </label>
        <label style={{ display: "block", fontWeight: 400 }}>
          <input type="radio" checked={sbcOverride} onChange={() => setSbcOverride(true)} data-testid="new-1196-sbc-toggle" /> Explicit override
        </label>
        {sbcOverride && (
          <div className="field-row" style={{ marginTop: 6 }}>
            <input
              data-testid="new-1196-sbc-description"
              value={sbcDescription}
              onChange={(e) => setSbcDescription(e.target.value)}
              placeholder="e.g. Large-bore stuffing-box cover"
            />
            <input
              data-testid="new-1196-sbc-reason"
              value={sbcReason}
              onChange={(e) => setSbcReason(e.target.value)}
              placeholder="Reason"
            />
          </div>
        )}
      </FieldGroup>

      <h3 style={{ marginTop: 18 }}>Package scope</h3>
      <FieldGroup label="Build type">
        <select data-testid="new-1196-buildtype" value={buildType} onChange={(e) => setBuildType(e.target.value as "BarePumpEnd" | "CompletePackage")}>
          <option value="BarePumpEnd">Bare pump end</option>
          <option value="CompletePackage">Complete package</option>
        </select>
      </FieldGroup>
      {buildType === "CompletePackage" && (
        <div style={{ marginBottom: 8 }}>
          {PACKAGE_COMPONENT_KEYS.map((key) => (
            <FieldGroup key={key} label={PACKAGE_COMPONENT_LABELS[key]}>
              <select
                data-testid={`new-1196-scope-${key}`}
                value={packageScope[key] ?? "NotInScope"}
                onChange={(e) => setPackageScope((p) => ({ ...p, [key]: e.target.value as PackageComponentScope }))}
              >
                <option value="RotechSupplied">Rotech supplied</option>
                <option value="CustomerSupplied">Customer supplied</option>
                <option value="NotInScope">Not in scope</option>
              </select>
            </FieldGroup>
          ))}
        </div>
      )}
      {buildType === "CompletePackage" && (
        <>
          <h4 style={{ marginTop: 12 }}>Package drawing</h4>
          <FieldGroup label="Drawing standard">
            <label style={{ display: "block", fontWeight: 400 }}>
              <input
                type="radio"
                checked={drawingKind === "StandardReference"}
                onChange={() => setDrawingKind("StandardReference")}
              />{" "}
              Standard drawing reference
            </label>
            <label style={{ display: "block", fontWeight: 400 }}>
              <input
                type="radio"
                data-testid="new-1196-drawing-custom"
                checked={drawingKind === "CustomBaseplate"}
                onChange={() => setDrawingKind("CustomBaseplate")}
              />{" "}
              Custom baseplate drawing
            </label>
            <input
              data-testid="new-1196-drawing-reference"
              value={drawingReference}
              onChange={(e) => setDrawingReference(e.target.value)}
              placeholder={drawingKind === "StandardReference" ? "e.g. MTR standard baseplate" : "e.g. BP-2026-114"}
              style={{ marginTop: 6 }}
            />
          </FieldGroup>
          {drawingKind === "CustomBaseplate" && (
            <FieldGroup label="What the custom drawing changes" required>
              <input
                data-testid="new-1196-drawing-note"
                value={drawingNote}
                onChange={(e) => setDrawingNote(e.target.value)}
                placeholder="e.g. Extended baseplate with drip rim; supersedes the MTR standard"
              />
              <button
                type="button"
                className="btn"
                data-testid="new-1196-drawing-attach"
                style={{ marginTop: 6 }}
                onClick={() => setDrawingFileName(`baseplate-${drawingReference.trim() || "drawing"}.pdf`)}
              >
                Attach drawing (mock file)
              </button>
              {drawingFileName && (
                <span style={{ fontSize: 12, color: "var(--text-subtle)" }} data-testid="new-1196-drawing-filename">
                  Attached: {drawingFileName} (placeholder — no real file is stored)
                </span>
              )}
            </FieldGroup>
          )}
        </>
      )}

      <h3 style={{ marginTop: 18 }}>Additional services</h3>
      {SERVICE_CATALOGUE_1196.map((svc) => (
        <label key={svc.key} style={{ display: "block", fontWeight: 400 }}>
          <input
            type="checkbox"
            data-testid={`new-1196-service-${svc.key}`}
            checked={selectedServiceKeys.includes(svc.key)}
            onChange={(e) =>
              setSelectedServiceKeys((keys) =>
                e.target.checked ? [...keys, svc.key] : keys.filter((k) => k !== svc.key)
              )
            }
          />{" "}
          {svc.label}
        </label>
      ))}
    </Drawer>
  );
}
