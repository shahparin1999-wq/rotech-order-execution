"use client";

// One Line's detail, broken into the same sections either the legacy
// per-line tab strip (`orders/[orderNo]/page.tsx`, `?tab=lines`) or the new
// Order -> Line -> Unit tree (`OrderExecutionPane.tsx`, `?node=line:N`) can
// host. The rendering is written once here; the two callers differ only in
// how they pick which section is showing (local tab state vs a URL param).

import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import {
  currentConfirmations1196,
  employeeName,
  pump1196ConfigForLine,
  releaseBlockers1196,
  serviceRequirementsForLine
} from "@/domain/selectors";
import type {
  AppState,
  ConfiguredLineRecord,
  ManufacturingNoteCategory,
  OrderLine,
  Pump1196LineConfig,
  Unit
} from "@/domain/types";
import type { ExecutionLineV1 } from "@/domain/executionPackage";
import { getModelTemplate } from "@/domain/modelTemplates";
import { CONFIRMATION_GATE_ITEMS_1196 } from "@/domain/model1196";
import { Exact } from "@/components/bits";
import { Pump1196RequirementTable } from "@/components/Pump1196Requirement";
import { FieldGroup } from "@/components/Drawer";

const NOTE_CATEGORIES: ManufacturingNoteCategory[] = [
  "ShopInstruction",
  "EngineeringNote",
  "MachiningInstruction",
  "QualityRequirement",
  "PackagingInstruction"
];

// ---------------------------------------------------------------------------
// Shared line context — computed once, read by whichever section is showing.
// ---------------------------------------------------------------------------

export interface LineContext {
  orderNo: string;
  line: OrderLine;
  lineId: string;
  units: Unit[];
  snapshot: AppState["configurationSnapshots"][number] | undefined;
  payload: ExecutionLineV1 | undefined;
  template: ReturnType<typeof getModelTemplate>;
  notes: AppState["manufacturingNotes"];
  adjustments: AppState["configurationAdjustments"];
  config1196: Pump1196LineConfig | undefined;
  configured: ConfiguredLineRecord | undefined;
}

export function lineContextFor(state: AppState, orderNo: string, lineId: string): LineContext | undefined {
  const order = state.orders.find((o) => o.orderNumber === orderNo);
  const line = order?.lines.find((l) => l.id === lineId);
  if (!order || !line) return undefined;

  const snapshot = state.configurationSnapshots.find((s) => s.id === line.configurationSnapshotId);
  const payload = snapshot?.payload as ExecutionLineV1 | undefined;
  const template = line.templateId ? getModelTemplate(line.templateId) : undefined;
  const units = state.units
    .filter((u) => u.orderNumber === orderNo && u.lineNumber === line.lineNumber)
    .sort((a, b) => a.sequence - b.sequence);
  const notes = state.manufacturingNotes.filter((n) => n.orderNumber === orderNo && n.lineNumber === line.lineNumber);
  const adjustments = state.configurationAdjustments.filter(
    (a) => a.orderNumber === orderNo && a.lineNumber === line.lineNumber
  );
  const config1196 = pump1196ConfigForLine(state, lineId);
  const configured = state.configuredLines.find((c) => c.lineId === lineId);

  return { orderNo, line, lineId, units, snapshot, payload, template, notes, adjustments, config1196, configured };
}

function summarize(obj: Record<string, unknown> | undefined): string {
  if (!obj || Object.keys(obj).length === 0) return "—";
  const supply = typeof obj.supply === "string" ? obj.supply : "";
  const power = typeof obj.power === "string" ? obj.power : "";
  return [supply, power].filter(Boolean).join(", ") || "See configuration";
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function ConfiguredLineTable({ configured }: { configured: ConfiguredLineRecord }) {
  const customCount = configured.components.filter((c) => c.isCustom).length;
  return (
    <div data-testid="configured-line-table">
      <table className="data">
        <tbody>
          <tr><td>Line type</td><td>{configured.kind === "ConfiguredAssembly" ? "Configured assembly" : configured.kind === "Spare" ? "Spare part" : "Bought-out item"}</td></tr>
          {configured.size && <tr><td>Size / frame</td><td>{configured.size} / {configured.frame}</td></tr>}
          {configured.materialBuild && <tr><td>Material build</td><td>{configured.materialBuild}</td></tr>}
          {configured.buildType && (
            <tr><td>Build type</td><td>{configured.buildType === "CompletePackage" ? "Complete package" : "Bare pump end"}</td></tr>
          )}
          {configured.partNumber && <tr><td>Part number</td><td>{configured.partNumber}</td></tr>}
          {configured.brand && <tr><td>Brand</td><td>{configured.brand}</td></tr>}
          {configured.notes && <tr><td>Notes</td><td>{configured.notes}</td></tr>}
        </tbody>
      </table>

      {(configured.testingRequirements ?? []).length > 0 && (
        <>
          <h4 style={{ marginBottom: 4 }}>Testing and special requirements</h4>
          <table className="data" data-testid="configured-testing">
            <thead>
              <tr><th>#</th><th>Requirement</th></tr>
            </thead>
            <tbody>
              {(configured.testingRequirements ?? []).map((t, i) => (
                <tr key={t} data-testid={`configured-test-${i + 1}`}>
                  <td>{i + 1}</td>
                  <td>{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {configured.components.length > 0 && (
        <>
          <h4 style={{ marginBottom: 4 }}>
            Components{" "}
            {customCount > 0 && (
              <span className="badge save-pending" data-testid="configured-custom-count">
                {customCount} manually entered
              </span>
            )}
          </h4>
          <table className="data">
            <thead>
              <tr>
                <th>Component</th>
                <th>Part number</th>
                <th>Brand</th>
                <th>Material</th>
                <th>Reference</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {configured.components.map((c) => (
                <tr key={c.key} data-testid={`configured-component-${c.key}`}>
                  <td>
                    {c.label}
                    {c.isCustom && <span className="badge save-pending" style={{ marginLeft: 4 }}>custom</span>}
                  </td>
                  <td>{c.partNumber || "—"}</td>
                  <td>{c.brand || "—"}</td>
                  <td>{c.material || "—"}</td>
                  <td>{c.reference ? `${c.referenceLabel}: ${c.reference}` : "—"}</td>
                  <td>{c.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p style={{ fontSize: 12, color: "var(--text-subtle)" }}>
        Configured internally. Values marked <b>custom</b> were typed rather than resolved from the
        pinned catalogue release, and should be reviewed before release.
      </p>
    </div>
  );
}

export function Pump1196ConfigTable({ config }: { config: Pump1196LineConfig }) {
  const hydraulic =
    config.hydraulicCondition.kind === "MaxDiameter"
      ? "Maximum diameter (standard)"
      : `Trim to ${config.hydraulicCondition.trimValue} in — ${config.hydraulicCondition.reason}`;
  const sbc =
    config.stuffingBoxCover.kind === "Standard"
      ? "Standard bore, casing MOC (standard)"
      : `${config.stuffingBoxCover.description} — ${config.stuffingBoxCover.reason}`;
  return (
    <div data-testid="pump1196-config-table">
      <table className="data">
        <thead>
          <tr><th>Field</th><th>Standard / ordered</th><th>Override</th></tr>
        </thead>
        <tbody>
          <tr><td>Casing flange</td><td>150# FF</td><td>None</td></tr>
          <tr>
            <td>Impeller</td>
            <td>Maximum diameter ({config.fullImpellerTrim} in)</td>
            <td>{config.hydraulicCondition.kind === "Trim" ? hydraulic : "None"}</td>
          </tr>
          <tr><td>Shaft</td><td>AISI 4140</td><td>None</td></tr>
          <tr><td>Shaft sleeve</td><td>Same MOC as casing</td><td>None</td></tr>
          <tr><td>Bearings, sight glass, labyrinth seals</td><td>Included</td><td>—</td></tr>
          <tr>
            <td>Stuffing-box cover</td>
            <td>Standard bore, same MOC as casing</td>
            <td>{config.stuffingBoxCover.kind === "Override" ? sbc : "None"}</td>
          </tr>
        </tbody>
      </table>
      <table className="data" style={{ marginTop: 10 }}>
        <tbody>
          <tr><td>Size / Frame</td><td>{config.size} / {config.frame}</td></tr>
          <tr><td>Material build</td><td>{config.materialBuild}</td></tr>
          <tr><td>Build type</td><td>{config.buildType === "BarePumpEnd" ? "Bare pump end" : "Complete package"}</td></tr>
          <tr>
            <td>DBSE</td>
            <td>
              {config.dbse
                ? `${config.dbse.value} in${config.dbse.isDefault ? " (default)" : ""}`
                : config.buildType === "CompletePackage"
                  ? "Unresolved — requires controlled data"
                  : "Not applicable (bare pump end)"}
            </td>
          </tr>
          {config.buildType === "CompletePackage" && (
            <tr>
              <td>Package drawing</td>
              <td data-testid="pump1196-package-drawing">
                {config.packageDrawing ? (
                  <>
                    {config.packageDrawing.kind === "CustomBaseplate" ? "Custom baseplate" : "Standard reference"}:{" "}
                    <strong>{config.packageDrawing.reference}</strong>
                    {config.packageDrawing.kind === "CustomBaseplate" && <> — {config.packageDrawing.note}</>}
                  </>
                ) : (
                  "Not set"
                )}
              </td>
            </tr>
          )}
          <tr><td>Shaft type</td><td>{config.shaftType}</td></tr>
          <tr><td>Rule-set version</td><td>{config.rulesVersion}</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "var(--text-subtle)" }}>
        This is a controlled manual configuration (not a CPQ import) — read-only; the imported values cannot be
        edited in place. Manufacturing intent is captured under Manufacturing notes and Approved changes.
      </p>
    </div>
  );
}

export function LineConfigurationSection({ ctx }: { ctx: LineContext }) {
  const { line, payload, template, configured, config1196 } = ctx;
  return (
    <div style={{ marginTop: 10 }}>
      {configured ? (
        <ConfiguredLineTable configured={configured} />
      ) : config1196 ? (
        <Pump1196ConfigTable config={config1196} />
      ) : payload ? (
        <table className="data">
          <tbody>
            <tr><td>Material build</td><td>{payload.configuration.materialBuild ?? "—"}</td></tr>
            <tr><td>Casing</td><td>{payload.configuration.casingMaterial ?? "—"}</td></tr>
            <tr><td>Impeller</td><td>{payload.configuration.impellerMaterial ?? "—"}</td></tr>
            <tr><td>Shaft</td><td>{payload.configuration.shaftMaterial ?? "—"}</td></tr>
            <tr><td>Seal</td><td>{JSON.stringify(payload.configuration.seal ?? {})}</td></tr>
            <tr><td>Motor</td><td>{JSON.stringify(payload.configuration.motor ?? {})}</td></tr>
            <tr><td>Testing</td><td>{payload.configuration.testingRequirements.join(", ") || "—"}</td></tr>
            <tr><td>Customer-supplied</td><td>{payload.configuration.customerSuppliedItems.join(", ") || "None"}</td></tr>
            <tr>
              <td>Selected options</td>
              <td>{payload.configuration.selectedOptions.map((o) => `${o.description}: ${o.value ?? ""}`).join("; ") || "—"}</td>
            </tr>
            <tr><td>Config rules version</td><td>{payload.versions.configurationRulesVersion}</td></tr>
          </tbody>
        </table>
      ) : template ? (
        <div data-testid={`line-template-${line.lineNumber}`}>
          <table className="data">
            <tbody>
              <tr><td>Model template</td><td>{template.displayName} (pilot placeholder)</td></tr>
              <tr><td>Ordered material</td><td>{line.orderedMaterial}</td></tr>
              <tr>
                <td>Master routing</td>
                <td>{template.route.map((r) => r.name).join(" → ")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p>Manually created line — no template. Ordered material: {line.orderedMaterial}.</p>
      )}
      <p style={{ fontSize: 12, color: "var(--text-subtle)" }}>
        {payload
          ? "The CPQ configuration is read-only. Manufacturing intent is captured under Manufacturing notes and Approved changes."
          : "Master routing/BOM come from the model template (pilot placeholder). Specific values are filled in per order."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function AddNoteForm({
  orderNo,
  lineId,
  lineNumber,
  units
}: {
  orderNo: string;
  lineId: string;
  lineNumber: number;
  units: Unit[];
}) {
  const dispatch = useAppDispatch();
  const [scope, setScope] = useState<string>("line");
  const [category, setCategory] = useState<ManufacturingNoteCategory>("ShopInstruction");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div className="field-row">
        <FieldGroup label="Scope">
          <select data-testid={`note-scope-${lineNumber}`} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="line">Whole line (all Units)</option>
            {units.map((u) => (
              <option key={u.unitId} value={u.unitId}>
                {u.unitId}
              </option>
            ))}
          </select>
        </FieldGroup>
        <FieldGroup label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as ManufacturingNoteCategory)}>
            {NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FieldGroup>
      </div>
      <FieldGroup label="Title">
        <input data-testid={`note-title-${lineNumber}`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Description">
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </FieldGroup>
      <button
        type="button"
        className="btn btn-primary"
        data-testid={`note-add-${lineNumber}`}
        disabled={!title.trim() || !description.trim()}
        onClick={() => {
          dispatch({
            type: "addManufacturingNote",
            input: {
              scopeType: scope === "line" ? "WorkOrderLine" : "Unit",
              scopeId: scope === "line" ? lineId : scope,
              orderNumber: orderNo,
              category,
              title: title.trim(),
              description: description.trim()
            }
          });
          setTitle("");
          setDescription("");
        }}
      >
        Add note
      </button>
    </div>
  );
}

export function LineNotesSection({ ctx }: { ctx: LineContext }) {
  const { orderNo, lineId, line, units, notes } = ctx;
  return (
    <div style={{ marginTop: 10 }}>
      <AddNoteForm orderNo={orderNo} lineId={lineId} lineNumber={line.lineNumber} units={units} />
      {notes.length === 0 && <p>No manufacturing notes yet.</p>}
      {notes.map((n) => {
        const scopeLabel =
          n.scopeType === "WorkOrderLine"
            ? `Line ${line.lineNumber} (applies to all ${units.length} Unit(s))`
            : `Unit ${n.scopeId}`;
        return (
          <div key={n.id} className="card" data-testid={`mnote-${n.id}`} style={{ marginTop: 8 }}>
            <strong>{n.title}</strong> <span className="badge">{n.category}</span>
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{scopeLabel}</div>
            <p style={{ margin: "4px 0 0" }}>{n.description}</p>
          </div>
        );
      })}
      {units.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4>Per-Unit view (line notes inherited)</h4>
          {units.map((u) => {
            const inherited = notes.filter((n) => n.scopeType === "WorkOrderLine");
            const own = notes.filter((n) => n.scopeType === "Unit" && n.scopeId === u.unitId);
            return (
              <div key={u.unitId} data-testid={`unit-notes-${u.unitId}`} style={{ fontSize: 13, marginBottom: 4 }}>
                <b>{u.unitId}</b>: {[...inherited, ...own].map((n) => n.title).join(", ") || "—"}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approved changes
// ---------------------------------------------------------------------------

export function AddAdjustmentForm({
  orderNo,
  lineId,
  lineNumber,
  units
}: {
  orderNo: string;
  lineId: string;
  lineNumber: number;
  units: Unit[];
}) {
  const dispatch = useAppDispatch();
  const [scope, setScope] = useState<string>("line");
  const [path, setPath] = useState("");
  const [original, setOriginal] = useState("");
  const [proposed, setProposed] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div className="field-row">
        <FieldGroup label="Scope">
          <select data-testid={`adj-scope-${lineNumber}`} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="line">Whole line (all Units)</option>
            {units.map((u) => (
              <option key={u.unitId} value={u.unitId}>
                {u.unitId}
              </option>
            ))}
          </select>
        </FieldGroup>
        <FieldGroup label="Configuration path">
          <input
            data-testid={`adj-path-${lineNumber}`}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="e.g. configuration.impellerMaterial"
          />
        </FieldGroup>
      </div>
      <div className="field-row">
        <FieldGroup label="Original value">
          <input value={original} onChange={(e) => setOriginal(e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Proposed value">
          <input data-testid={`adj-proposed-${lineNumber}`} value={proposed} onChange={(e) => setProposed(e.target.value)} />
        </FieldGroup>
      </div>
      <FieldGroup label="Reason">
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </FieldGroup>
      <button
        type="button"
        className="btn btn-primary"
        data-testid={`adj-add-${lineNumber}`}
        disabled={!path.trim() || !reason.trim()}
        onClick={() => {
          dispatch({
            type: "addConfigurationAdjustment",
            input: {
              scopeType: scope === "line" ? "WorkOrderLine" : "Unit",
              scopeId: scope === "line" ? lineId : scope,
              orderNumber: orderNo,
              configurationPath: path.trim(),
              originalValue: original,
              proposedValue: proposed,
              reason: reason.trim()
            }
          });
          setPath("");
          setOriginal("");
          setProposed("");
          setReason("");
        }}
      >
        Propose adjustment
      </button>
    </div>
  );
}

export function LineChangesSection({ ctx }: { ctx: LineContext }) {
  const { orderNo, lineId, line, units, adjustments } = ctx;
  return (
    <div style={{ marginTop: 10 }}>
      <AddAdjustmentForm orderNo={orderNo} lineId={lineId} lineNumber={line.lineNumber} units={units} />
      {adjustments.length === 0 && <p>No configuration adjustments proposed.</p>}
      {adjustments.map((a) => (
        <div key={a.id} className="card" data-testid={`cfgadj-${a.id}`} style={{ marginTop: 8 }}>
          <code>{a.configurationPath}</code>: {JSON.stringify(a.originalValue)} → {JSON.stringify(a.proposedValue)}
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            {a.scopeType === "WorkOrderLine" ? `Line ${line.lineNumber}` : `Unit ${a.scopeId}`} · {a.approvalStatus}
            {a.commercialReviewRequired && " · commercial review required"}
          </div>
          <p style={{ margin: "4px 0 0" }}>{a.reason}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------

export function WorkingBomEditor({ orderNo, lineId, lineNumber }: { orderNo: string; lineId: string; lineNumber: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const rows = state.workingBomRows.filter((r) => r.orderNumber === orderNo && r.lineId === lineId);
  const [desc, setDesc] = useState("");
  const [part, setPart] = useState("");
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState(1);

  return (
    <div style={{ marginTop: 14 }} data-testid={`working-bom-${lineNumber}`}>
      <h4>Working BOM (editable)</h4>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13 }}>
          <button
            type="button"
            className="btn"
            data-testid={`working-bom-seed-${lineNumber}`}
            onClick={() => dispatch({ type: "seedWorkingBom", orderNumber: orderNo, lineId })}
          >
            Start working BOM from as-ordered
          </button>{" "}
          <span style={{ color: "var(--text-subtle)" }}>then fill in specific part numbers and materials.</span>
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr><th>Description</th><th>Part number</th><th>Material</th><th>Qty</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`working-bom-row-${r.id}`}>
                <td>
                  <input
                    defaultValue={r.description}
                    onBlur={(e) => dispatch({ type: "updateWorkingBomRow", rowId: r.id, patch: { description: e.target.value } })}
                  />
                </td>
                <td>
                  <input
                    data-testid={`working-bom-part-${r.id}`}
                    defaultValue={r.partNumber ?? ""}
                    placeholder="part #"
                    onBlur={(e) => dispatch({ type: "updateWorkingBomRow", rowId: r.id, patch: { partNumber: e.target.value || null } })}
                  />
                </td>
                <td>
                  <input
                    data-testid={`working-bom-material-${r.id}`}
                    defaultValue={r.material ?? ""}
                    placeholder="material"
                    onBlur={(e) => dispatch({ type: "updateWorkingBomRow", rowId: r.id, patch: { material: e.target.value || null } })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    defaultValue={r.quantity}
                    style={{ width: 60 }}
                    onBlur={(e) => dispatch({ type: "updateWorkingBomRow", rowId: r.id, patch: { quantity: Math.max(1, Number(e.target.value) || 1) } })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => dispatch({ type: "removeWorkingBomRow", rowId: r.id })}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="field-row" style={{ marginTop: 8 }}>
        <FieldGroup label="Add row — description">
          <input data-testid={`working-bom-new-desc-${lineNumber}`} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Part number">
          <input value={part} onChange={(e) => setPart(e.target.value)} />
        </FieldGroup>
      </div>
      <div className="field-row">
        <FieldGroup label="Material">
          <input value={material} onChange={(e) => setMaterial(e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Qty">
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
        </FieldGroup>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        data-testid={`working-bom-add-${lineNumber}`}
        disabled={!desc.trim()}
        onClick={() => {
          dispatch({
            type: "addWorkingBomRow",
            input: { orderNumber: orderNo, lineId, description: desc.trim(), partNumber: part.trim() || undefined, material: material.trim() || undefined, quantity: qty }
          });
          setDesc("");
          setPart("");
          setMaterial("");
          setQty(1);
        }}
      >
        Add BOM row
      </button>
    </div>
  );
}

export function LineBomSection({ ctx }: { ctx: LineContext }) {
  const { orderNo, lineId, line, payload, template } = ctx;
  return (
    <div style={{ marginTop: 10 }}>
      <h4>As ordered {payload ? "(frozen CPQ, read-only)" : "(template skeleton, read-only)"}</h4>
      {payload && payload.bom.length > 0 ? (
        <table className="data">
          <thead><tr><th>Part</th><th>Description</th><th>Qty</th><th>Material</th></tr></thead>
          <tbody>
            {payload.bom.map((b, i) => (
              <tr key={i}>
                <td>{b.partNumber ?? "—"}</td>
                <td>{b.description}</td>
                <td>{b.quantity}</td>
                <td>{b.material ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : template && template.bomSkeleton.length > 0 ? (
        <table className="data">
          <thead><tr><th>Component</th><th>Qty</th><th>Material</th></tr></thead>
          <tbody>
            {template.bomSkeleton.map((b, i) => (
              <tr key={i}>
                <td>{b.description}</td>
                <td>{b.quantity}</td>
                <td>{b.material ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No as-ordered BOM.</p>
      )}

      <WorkingBomEditor orderNo={orderNo} lineId={lineId} lineNumber={line.lineNumber} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents / As built
// ---------------------------------------------------------------------------

export function LineDocumentsSection({ ctx }: { ctx: LineContext }) {
  const { payload } = ctx;
  return (
    <div style={{ marginTop: 10 }}>
      {payload && payload.documents.length > 0 ? (
        <table className="data">
          <thead><tr><th>Type</th><th>Document</th><th>Title</th><th>Rev</th></tr></thead>
          <tbody>
            {payload.documents.map((d, i) => (
              <tr key={i}>
                <td>{d.type}</td>
                <td>{d.documentId}</td>
                <td>{d.title}</td>
                <td>{d.revision ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No document references in the imported package.</p>
      )}
    </div>
  );
}

export function LineAsBuiltSection({ ctx }: { ctx: LineContext }) {
  const { payload, line, adjustments } = ctx;
  return (
    <div style={{ marginTop: 10 }}>
      <table className="data">
        <thead>
          <tr><th>Field</th><th>CPQ ordered</th><th>Manufacturing adjustment</th><th>As built</th></tr>
        </thead>
        <tbody>
          {[
            ["configuration.casingMaterial", "Casing", payload?.configuration.casingMaterial],
            ["configuration.impellerMaterial", "Impeller", payload?.configuration.impellerMaterial],
            ["configuration.shaftMaterial", "Shaft", payload?.configuration.shaftMaterial],
            ["configuration.motor", "Motor", payload ? summarize(payload.configuration.motor) : line.orderedMaterial]
          ].map(([path, label, ordered]) => {
            const adj = adjustments.find((a) => a.configurationPath === path);
            return (
              <tr key={path as string}>
                <td>{label}</td>
                <td>{(ordered as string | undefined) ?? "—"}</td>
                <td>{adj ? `${JSON.stringify(adj.proposedValue)} (${adj.approvalStatus})` : "No change"}</td>
                <td>Pending</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "var(--text-subtle)" }}>
        As-built capture is not yet implemented in the prototype; values remain Pending.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1196: parts, services, confirmation gate
// ---------------------------------------------------------------------------

export function Pump1196PartsTab({ units }: { units: Unit[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      {units.map((u) => (
        <div key={u.unitId} className="card" data-testid={`pump1196-parts-${u.unitId}`} style={{ marginBottom: 10 }}>
          <h4>{u.unitId}</h4>
          <Pump1196RequirementTable unitId={u.unitId} />
        </div>
      ))}
    </div>
  );
}

export function Pump1196ServicesTab({ lineId }: { lineId: string }) {
  const state = useAppState();
  const services = serviceRequirementsForLine(state, lineId);
  return (
    <div style={{ marginTop: 10 }}>
      {services.length === 0 && <p>No services selected — an unselected service creates no work.</p>}
      {services.map((s) => (
        <div key={s.id} className="card" data-testid={`svc1196-${s.id}`} style={{ marginBottom: 8 }}>
          <strong>{s.label}</strong>{" "}
          <span className={`badge ${s.status === "Complete" ? "save-saved" : "save-pending"}`}>{s.status}</span>
          {s.blocksRelease && s.status !== "Complete" && (
            <span className="badge save-pending" style={{ marginLeft: 6 }}>
              blocks release
            </span>
          )}
          <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 4 }}>
            Result fields: {Object.keys(s.resultFields).join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Pump1196GateTab({ lineId }: { lineId: string }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const confirmed = currentConfirmations1196(state, lineId);
  const blockers = releaseBlockers1196(state, lineId);
  return (
    <div style={{ marginTop: 10 }}>
      <p data-testid="pump1196-release-status">
        {blockers.blocked ? (
          <span className="badge save-pending">Release blocked</span>
        ) : (
          <span className="badge save-saved">Ready to release</span>
        )}
      </p>
      <table className="data">
        <tbody>
          {CONFIRMATION_GATE_ITEMS_1196.map((item) => {
            const record = confirmed.get(item.key);
            return (
              <tr key={item.key} data-testid={`gate1196-${item.key}`}>
                <td>{item.label}</td>
                <td>
                  {record ? (
                    <span className="badge save-saved">
                      Confirmed by {employeeName(state, record.confirmedBy)} <Exact at={record.confirmedAt} />
                    </span>
                  ) : (
                    <span className="badge save-pending">Not confirmed</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    data-testid={`gate1196-confirm-${item.key}`}
                    onClick={() => dispatch({ type: "confirmGateItem1196", lineId, gateKey: item.key, note: null })}
                  >
                    {record ? "Re-confirm" : "Confirm"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add units
// ---------------------------------------------------------------------------

export function AddUnitsControl({
  orderNo,
  lineId,
  lineNumber,
  unitCount
}: {
  orderNo: string;
  lineId: string;
  lineNumber: number;
  unitCount: number;
}) {
  const dispatch = useAppDispatch();
  const [count, setCount] = useState(1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <input
        type="number"
        min={1}
        data-testid={`add-units-count-${lineNumber}`}
        value={count}
        onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
        style={{ width: 70 }}
      />
      <button
        type="button"
        className="btn"
        data-testid={`add-units-${lineNumber}`}
        onClick={() => dispatch({ type: "addUnitsToLine", input: { orderNumber: orderNo, lineId, count } })}
      >
        Add unit{count === 1 ? "" : "s"}
      </button>
      <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
        Appends independent Units (continuing the sequence); line currently has {unitCount}.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section registry — the single dispatch table both hosts (legacy tab strip,
// new tree pane) key off of.
// ---------------------------------------------------------------------------

export const LINE_SECTIONS_BASE = [
  ["config", "Configuration"],
  ["notes", "Manufacturing notes"],
  ["changes", "Approved changes"],
  ["bom", "BOM"],
  ["documents", "Documents"],
  ["asbuilt", "As built"]
] as const;
export const LINE_SECTIONS_1196 = [
  ["parts1196", "Parts & subassemblies"],
  ["services1196", "Testing & services"],
  ["gate1196", "Confirmation gate"]
] as const;
export const LINE_SECTIONS = [...LINE_SECTIONS_BASE, ...LINE_SECTIONS_1196] as const;
export type LineSectionKey = (typeof LINE_SECTIONS)[number][0];

export function LineSectionBody({ ctx, section }: { ctx: LineContext; section: LineSectionKey }) {
  switch (section) {
    case "config":
      return <LineConfigurationSection ctx={ctx} />;
    case "notes":
      return <LineNotesSection ctx={ctx} />;
    case "changes":
      return <LineChangesSection ctx={ctx} />;
    case "bom":
      return <LineBomSection ctx={ctx} />;
    case "documents":
      return <LineDocumentsSection ctx={ctx} />;
    case "asbuilt":
      return <LineAsBuiltSection ctx={ctx} />;
    case "parts1196":
      return ctx.config1196 ? <Pump1196PartsTab units={ctx.units} /> : null;
    case "services1196":
      return ctx.config1196 ? <Pump1196ServicesTab lineId={ctx.lineId} /> : null;
    case "gate1196":
      return ctx.config1196 ? <Pump1196GateTab lineId={ctx.lineId} /> : null;
    default:
      return null;
  }
}
