"use client";

// Internal order configurator — the CPQ-shaped line builder.
//
// Add a configured assembly, a spare, or a bought-out item; for an assembly,
// fill in the component breakdown. Deliberately less rule-bound than the CPQ:
// brands, seal numbers, part numbers and materials are free text, and anything
// typed over a catalogue value is marked so it stays reviewable.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import {
  applyReferenceDefaults,
  clampTrim,
  customFieldCount,
  isCustomValue,
  markEdited,
  LINE_KIND_LABELS,
  newAssemblyLine,
  newItemLine,
  newSpareLine,
  reseedAssembly,
  summarizeLine,
  switchFamily,
  validateDraft,
  type ComponentEntry,
  type ConfiguratorDraft,
  type ConfiguratorLine
} from "@/domain/configurator";
import {
  catalogueBlockers1196,
  catalogueFamilies,
  componentMaterialOptionsFor,
  flangeOptionsFor,
  materialOptionsFor,
  pumpSizeEntryFor,
  pumpSizesFor,
  SBC_TYPES,
  sealArrangementOptionsFor,
  sealGlandMocOptions,
  sealMocOptionsFor,
  sealPlans,
  shaftTypesFor,
  testingAdders,
  catalogueProvenance
} from "@/domain/model1196";
import { capabilitiesForFamily, familyShape } from "@/domain/familyShapes";
import { assemblyPartNumber, majorComponentPartCodes } from "@/domain/partNumbers";
import { FieldGroup, Modal } from "./Drawer";

let uid = 0;
const nextId = () => `cl-${++uid}`;

// A real dropdown, the way the CPQ configurator does it — every option is
// visible on one click, rather than hidden behind a datalist that only appears
// once you start typing. "Other…" preserves the type-anything escape hatch:
// picking it swaps in a free-text box, and a value that is not in the option
// set renders as Other automatically so a loaded custom value still shows.
function OptionSelect({
  value,
  options,
  onChange,
  testId,
  disabled,
  placeholder,
  width
}: {
  value: string | undefined;
  options: string[];
  onChange: (v: string) => void;
  testId?: string;
  disabled?: boolean;
  placeholder?: string;
  width?: number;
}) {
  const current = value ?? "";
  const isKnown = options.includes(current);
  const [forceCustom, setForceCustom] = useState(false);
  const custom = forceCustom || (current !== "" && !isKnown);

  return (
    <>
      <select
        style={width ? { width } : undefined}
        disabled={disabled}
        data-testid={testId}
        value={custom ? "__other__" : current}
        onChange={(e) => {
          if (e.target.value === "__other__") {
            setForceCustom(true);
            onChange("");
          } else {
            setForceCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {custom && (
        <input
          style={width ? { width, marginTop: 4 } : { marginTop: 4 }}
          disabled={disabled}
          data-testid={testId ? `${testId}-custom` : undefined}
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Type a value"}
        />
      )}
    </>
  );
}

export function ConfiguratorDrawer({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [draft, setDraft] = useState<ConfiguratorDraft>(() => ({
    orderNumber: "",
    customerId: state.customers[0]?.id ?? "",
    customerPo: "",
    description: "",
    facility: "Mississauga",
    coordinatorId:
      state.employees.find((e) => e.department === "Coordination")?.id ?? state.employees[0].id,
    priority: "Medium",
    dueDate: "",
    lines: [newAssemblyLine(nextId())]
  }));
  const [openLineId, setOpenLineId] = useState<string | null>(draft.lines[0]?.id ?? null);

  const validation = validateDraft(
    draft,
    state.orders.map((o) => o.orderNumber)
  );
  const blockers = catalogueBlockers1196();
  const provenance = catalogueProvenance();

  const patch = (p: Partial<ConfiguratorDraft>) => setDraft((d) => ({ ...d, ...p }));

  // Every coordinator edit is recorded so re-defaulting never overwrites it.
  const patchLine = (id: string, p: Partial<ConfiguratorLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        if (l.id !== id) return l;
        let merged: ConfiguratorLine = { ...l, ...p };
        for (const field of Object.keys(p)) {
          if (!["size", "quantity", "description", "components"].includes(field)) {
            merged = markEdited(merged, field);
          }
        }
        // Choosing a new size re-derives the whole line from the reference.
        if ("size" in p) {
          merged = { ...merged, coordinatorEdited: [] };
          merged = applyReferenceDefaults(merged);
        }
        const reseeds = "size" in p || "materialBuild" in p || "buildType" in p;
        if (reseeds) merged = reseedAssembly(merged);
        return clampTrim(merged);
      })
    }));

  const patchComponent = (lineId: string, key: string, p: Partial<ComponentEntry>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.id === lineId
          ? { ...l, components: l.components.map((c) => (c.key === key ? { ...c, ...p } : c)) }
          : l
      )
    }));

  const addLine = (line: ConfiguratorLine) => {
    setDraft((d) => ({ ...d, lines: [...d.lines, line] }));
    setOpenLineId(line.id);
  };

  const removeLine = (id: string) =>
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));

  return (
    <Modal
      title="Configure order"
      onClose={onClose}
      subtitle={
        provenance
          ? `Reference ${provenance.catalogueReleaseId} (${provenance.status}) · CPQ ${String(provenance.sourceCommit ?? "").slice(0, 8)} on ${provenance.sourceBranch ?? "?"}`
          : undefined
      }
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!validation.ok}
            data-testid="configurator-submit"
            onClick={() => {
              dispatch({ type: "createConfiguredOrder", draft });
              onClose();
              router.push(`/orders/${draft.orderNumber.trim()}`);
            }}
          >
            Create order ({draft.lines.length} line{draft.lines.length === 1 ? "" : "s"})
          </button>
        </>
      }
    >
      {blockers.length > 0 && (
        <div className="card" data-testid="configurator-blockers" style={{ background: "var(--bg-subtle)", marginBottom: 12 }}>
          <b>Catalogue status</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <h3 style={{ marginTop: 0 }}>Order</h3>
      <div className="field-row">
        <FieldGroup label="Order number" required>
          <input
            data-testid="configurator-order-number"
            value={draft.orderNumber}
            onChange={(e) => patch({ orderNumber: e.target.value })}
            placeholder="e.g. 26SO00729"
          />
        </FieldGroup>
        <FieldGroup label="Customer PO">
          <input value={draft.customerPo} onChange={(e) => patch({ customerPo: e.target.value })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Customer" required>
        <select
          data-testid="configurator-customer"
          value={draft.customerId}
          onChange={(e) => patch({ customerId: e.target.value })}
        >
          {state.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Description">
        <input
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Order description"
        />
      </FieldGroup>
      <div className="field-row">
        <FieldGroup label="Location">
          <select value={draft.facility} onChange={(e) => patch({ facility: e.target.value })}>
            <option value="Mississauga">Mississauga</option>
            <option value="Houston">Houston</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Due date" required>
          <input
            type="date"
            data-testid="configurator-duedate"
            value={draft.dueDate}
            onChange={(e) => patch({ dueDate: e.target.value })}
          />
        </FieldGroup>
      </div>
      <div className="field-row">
        <FieldGroup label="Priority">
          <select value={draft.priority} onChange={(e) => patch({ priority: e.target.value })}>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Coordinator">
          <select value={draft.coordinatorId} onChange={(e) => patch({ coordinatorId: e.target.value })}>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </FieldGroup>
      </div>

      <h3 style={{ marginTop: 18 }}>Lines</h3>
      {draft.lines.map((line, i) => (
        <LineCard
          key={line.id}
          line={line}
          index={i}
          open={openLineId === line.id}
          onToggle={() => setOpenLineId((cur) => (cur === line.id ? null : line.id))}
          onPatch={(p) => patchLine(line.id, p)}
          onPatchComponent={(key, p) => patchComponent(line.id, key, p)}
          onSwitchFamily={(code) =>
            setDraft((d) => ({
              ...d,
              lines: d.lines.map((l) => (l.id === line.id ? switchFamily(l, code) : l))
            }))
          }
          onRemove={() => removeLine(line.id)}
          canRemove={draft.lines.length > 1}
        />
      ))}

      <div className="composer-actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn" data-testid="add-assembly-line" onClick={() => addLine(newAssemblyLine(nextId()))}>
          + Configured assembly
        </button>
        <button type="button" className="btn" data-testid="add-spare-line" onClick={() => addLine(newSpareLine(nextId()))}>
          + Spare part
        </button>
        <button type="button" className="btn" data-testid="add-item-line" onClick={() => addLine(newItemLine(nextId()))}>
          + Bought-out item
        </button>
      </div>

      {validation.errors.length > 0 && (
        <div className="card" data-testid="configurator-errors" style={{ marginTop: 12, background: "var(--danger-soft)" }}>
          <b>Cannot create yet</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
            {validation.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="card" data-testid="configurator-warnings" style={{ marginTop: 12, background: "var(--warn-soft)" }}>
          <b>Review before release</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
            {validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p style={{ fontSize: 12, margin: "6px 0 0", color: "var(--text-subtle)" }}>
            These do not block creation — internal builds legitimately go outside the catalogue. They
            are recorded so they can be reviewed.
          </p>
        </div>
      )}
    </Modal>
  );
}

function LineCard({
  line,
  index,
  open,
  onToggle,
  onPatch,
  onPatchComponent,
  onSwitchFamily,
  onRemove,
  canRemove
}: {
  line: ConfiguratorLine;
  index: number;
  open: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<ConfiguratorLine>) => void;
  onPatchComponent: (key: string, p: Partial<ComponentEntry>) => void;
  onSwitchFamily: (familyCode: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const familyCode = line.family ?? "1196";
  const families = catalogueFamilies();
  const sizes = pumpSizesFor(familyCode);
  const sizeEntry = line.size ? pumpSizeEntryFor(familyCode, line.size) : undefined;
  const materials = line.size ? materialOptionsFor(familyCode, line.size) : null;
  const caps = capabilitiesForFamily(familyCode);
  const shape = familyShape(familyCode);
  const customCount = line.kind === "ConfiguredAssembly" ? customFieldCount(line) : 0;

  // Derived part code per component key, offered as the obvious pick in the
  // component table's part-number dropdown.
  // Derived part numbers: a starting point for the shop, never authoritative.
  const derived =
    line.kind === "ConfiguredAssembly" && line.size
      ? {
          assembly: assemblyPartNumber({
            familyCode,
            pumpSize: line.size,
            frameSize: line.frame ?? "",
            materialBuild: line.materialBuild ?? "",
            flangeType: line.flangeType,
            sbcType: line.sbcType,
            shaftType: line.shaftType,
            fullImpellerTrim: sizeEntry?.fullImpellerTrim,
            motorFrame: line.motorFrame
          }),
          components: majorComponentPartCodes({
            familyCode,
            pumpSize: line.size,
            frameSize: line.frame ?? "",
            materialBuild: line.materialBuild ?? "",
            flangeType: line.flangeType,
            sbcType: line.sbcType,
            shaftType: line.shaftType,
            fullImpellerTrim: sizeEntry?.fullImpellerTrim,
            motorFrame: line.motorFrame
          })
        }
      : null;

  // Derived code per component key, offered as the obvious pick in the
  // component table's part-number dropdown. Only settled codes are offered —
  // "Code Needed" or "RFQ" is not something to pull from the shelf.
  const derivedByKey: Record<string, string> = {};
  for (const c of derived?.components ?? []) {
    if (c.result.status === "standard") derivedByKey[c.key] = c.result.value;
  }

  return (
    <div className="card" data-testid={`configurator-line-${index + 1}`} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-subtle" onClick={onToggle} aria-expanded={open}>
          {open ? "▾" : "▸"}
        </button>
        <b>
          Line {index + 1} · {LINE_KIND_LABELS[line.kind]}
        </b>
        <span style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>{summarizeLine(line)}</span>
        {customCount > 0 && (
          <span className="badge save-pending" data-testid={`line-${index + 1}-custom-count`}>
            {customCount} custom
          </span>
        )}
        <span style={{ marginLeft: "auto" }} />
        {canRemove && (
          <button type="button" className="btn btn-subtle" onClick={onRemove} aria-label={`Remove line ${index + 1}`}>
            Remove
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="field-row">
            <FieldGroup label="Quantity" required>
              <input
                type="number"
                min={1}
                data-testid={`line-${index + 1}-quantity`}
                value={line.quantity}
                onChange={(e) => onPatch({ quantity: Math.max(1, Number(e.target.value) || 1) })}
              />
            </FieldGroup>
            <FieldGroup label="Description" required={line.kind !== "ConfiguredAssembly"}>
              <input
                data-testid={`line-${index + 1}-description`}
                value={line.description}
                onChange={(e) => onPatch({ description: e.target.value })}
                placeholder={line.kind === "Spare" ? "e.g. Repair kit" : "e.g. Pressure gauge"}
              />
            </FieldGroup>
          </div>

          {line.kind === "ConfiguredAssembly" ? (
            <>
              <div className="field-row">
                <FieldGroup label="Model" required>
                  <select
                    data-testid={`line-${index + 1}-family`}
                    value={familyCode}
                    onChange={(e) => onSwitchFamily(e.target.value)}
                  >
                    {families.map((f) => (
                      <option key={f.familyCode} value={f.familyCode}>
                        {f.familyCode} — {f.displayName}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                    {shape.replace(/([a-z])([A-Z])/g, "$1 $2")} build
                  </span>
                </FieldGroup>
                <FieldGroup label="Size" required>
                  <select
                    data-testid={`line-${index + 1}-size`}
                    value={line.size ?? ""}
                    onChange={(e) => {
                      const entry = pumpSizeEntryFor(familyCode, e.target.value);
                      onPatch({
                        size: e.target.value,
                        frame: entry?.defaultFrame ?? "",
                        materialBuild: entry?.defaultMoc ?? "",
                        description: `${familyCode} ${e.target.value}`
                      });
                    }}
                  >
                    {sizes.map((s) => (
                      <option key={s.pumpSize} value={s.pumpSize}>
                        {s.pumpSize}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
              </div>
              <div className="field-row">
                {caps.choosesFrame ? (
                  <FieldGroup label="Frame" required>
                    <select
                      data-testid={`line-${index + 1}-frame`}
                      value={line.frame ?? ""}
                      onChange={(e) => onPatch({ frame: e.target.value })}
                    >
                      {(sizeEntry?.frameOptions ?? []).map((f) => (
                        <option key={f} value={f}>
                          {f}
                          {f === sizeEntry?.defaultFrame ? " (standard)" : ""}
                        </option>
                      ))}
                    </select>
                  </FieldGroup>
                ) : (
                  <FieldGroup label="Frame">
                    <input value={line.frame ?? ""} readOnly data-testid={`line-${index + 1}-frame`} />
                    <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Set by the size for this model.</span>
                  </FieldGroup>
                )}
                {caps.closeCoupled && (
                  <FieldGroup label="Motor frame (JM)">
                    <input
                      data-testid={`line-${index + 1}-motorframe`}
                      value={line.motorFrame ?? ""}
                      onChange={(e) => onPatch({ motorFrame: e.target.value })}
                      placeholder="e.g. 254JM"
                    />
                    <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                      254JM and larger uses a big-bore stub shaft.
                    </span>
                  </FieldGroup>
                )}
              </div>
              <div className="field-row">
                <FieldGroup label="Material build" required>
                  <input
                    list={`materials-${line.id}`}
                    data-testid={`line-${index + 1}-material`}
                    value={line.materialBuild ?? ""}
                    onChange={(e) => onPatch({ materialBuild: e.target.value })}
                  />
                  <datalist id={`materials-${line.id}`}>
                    {(materials?.options ?? []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                    Catalogue options suggested — type anything if the build differs.
                  </span>
                </FieldGroup>
                <FieldGroup label="Build type">
                  <select
                    data-testid={`line-${index + 1}-buildtype`}
                    value={line.buildType ?? "BarePumpEnd"}
                    onChange={(e) =>
                      onPatch({ buildType: e.target.value as "BarePumpEnd" | "CompletePackage" })
                    }
                  >
                    <option value="BarePumpEnd">Bare pump end</option>
                    <option value="CompletePackage">Complete package</option>
                  </select>
                </FieldGroup>
              </div>

              <div className="field-row">
                {caps.choosesFlange && (
                  <FieldGroup label="Flange type">
                    <OptionSelect
                      testId={`line-${index + 1}-flange`}
                      value={line.flangeType}
                      options={flangeOptionsFor(familyCode, line.size ?? "")}
                      onChange={(v) => onPatch({ flangeType: v })}
                    />
                  </FieldGroup>
                )}
                {caps.choosesStuffingBoxCover && (
                  <FieldGroup label="Stuffing box cover">
                    <OptionSelect
                      testId={`line-${index + 1}-sbc`}
                      value={line.sbcType}
                      options={[...SBC_TYPES]}
                      onChange={(v) => onPatch({ sbcType: v })}
                    />
                  </FieldGroup>
                )}
              </div>
              {caps.choosesShaftKit && (
                <FieldGroup label="Shaft kit type">
                  <OptionSelect
                    testId={`line-${index + 1}-shafttype`}
                    value={line.shaftType}
                    options={[...shaftTypesFor(familyCode), "CUSTOM"]}
                    onChange={(v) => onPatch({ shaftType: v })}
                    placeholder="e.g. 2205 solid shaft kit"
                  />
                  <span className="from-default">
                    CUSTOM, or any typed value, makes the derived part numbers RFQ.
                  </span>
                </FieldGroup>
              )}

              {caps.choosesTrim && (
                <div className="config-section">
                  <h4>Impeller</h4>
                  <div className="field-grid">
                    <FieldGroup label="Full diameter (in)">
                      <input value={line.fullTrim ?? ""} readOnly data-testid={`line-${index + 1}-fulltrim`} />
                      <span className="from-default">Max diameter for this size, from the reference.</span>
                    </FieldGroup>
                    <FieldGroup label="Requested trim (in)">
                      <input
                        data-testid={`line-${index + 1}-trim`}
                        value={line.requestedTrim ?? ""}
                        onChange={(e) => onPatch({ requestedTrim: e.target.value })}
                        inputMode="decimal"
                      />
                      <span className="from-default">
                        {Number(line.requestedTrim) === Number(line.fullTrim)
                          ? "Full diameter (no trim)."
                          : "Trimmed — clamped to the full diameter."}
                      </span>
                    </FieldGroup>
                  </div>
                </div>
              )}

              {caps.configuresSeal && (
                <div className="config-section" data-testid={`line-${index + 1}-seal-section`}>
                  <h4>
                    Seal
                    {line.sealSize != null && (
                      <span className="badge save-saved" style={{ marginLeft: 6 }} data-testid={`line-${index + 1}-sealsize`}>
                        {line.sealSize}&quot; seal size ({line.frame})
                      </span>
                    )}
                  </h4>
                  <div className="field-grid">
                    <FieldGroup label="Arrangement">
                      <OptionSelect
                        testId={`line-${index + 1}-sealarrangement`}
                        value={line.sealArrangement}
                        options={sealArrangementOptionsFor(familyCode)}
                        onChange={(v) => onPatch({ sealArrangement: v })}
                      />
                    </FieldGroup>
                    <FieldGroup label="Seal material (MOC)">
                      <OptionSelect
                        testId={`line-${index + 1}-sealmoc`}
                        value={line.sealMoc}
                        options={sealMocOptionsFor(familyCode)}
                        onChange={(v) => onPatch({ sealMoc: v })}
                      />
                    </FieldGroup>
                    <FieldGroup label="Gland material">
                      <OptionSelect
                        testId={`line-${index + 1}-sealgland`}
                        value={line.sealGlandMoc}
                        options={sealGlandMocOptions()}
                        onChange={(v) => onPatch({ sealGlandMoc: v })}
                        placeholder="Cartridge seals need none"
                      />
                    </FieldGroup>
                    <FieldGroup label="Manufacturer">
                      <input
                        data-testid={`line-${index + 1}-sealmfr`}
                        value={line.sealManufacturer ?? ""}
                        onChange={(e) => onPatch({ sealManufacturer: e.target.value })}
                      />
                    </FieldGroup>
                    <FieldGroup label="Seal part number">
                      <input
                        data-testid={`line-${index + 1}-sealpn`}
                        value={line.sealPartNumber ?? ""}
                        onChange={(e) => onPatch({ sealPartNumber: e.target.value })}
                        placeholder="e.g. R-S1-1.750-SSV"
                      />
                    </FieldGroup>
                    <FieldGroup label="API seal plan">
                      <OptionSelect
                        testId={`line-${index + 1}-sealplan`}
                        value={line.sealPlan}
                        options={sealPlans()}
                        onChange={(v) => onPatch({ sealPlan: v })}
                      />
                    </FieldGroup>
                  </div>
                  {/^PLAN 11$/i.test(line.sealPlan ?? "") && (
                    <p style={{ fontSize: 12.5, margin: 0 }} data-testid={`line-${index + 1}-plan11`}>
                      <b>Plan 11 selected</b> — casing drill-and-tap and a flush line are required.
                      These will appear as checklist items on the build.
                    </p>
                  )}
                </div>
              )}

              <div className="config-section">
                <h4>Testing requirements</h4>
                <div className="field-grid">
                  {testingAdders().map((t) => (
                    <label key={t} style={{ fontWeight: 400, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        data-testid={`line-${index + 1}-test-${t.replace(/\s+/g, "-").toLowerCase()}`}
                        checked={(line.testingRequirements ?? []).includes(t)}
                        onChange={(e) =>
                          onPatch({
                            testingRequirements: e.target.checked
                              ? [...(line.testingRequirements ?? []), t]
                              : (line.testingRequirements ?? []).filter((x) => x !== t)
                          })
                        }
                      />{" "}
                      {t}
                    </label>
                  ))}
                </div>
                <span className="from-default">
                  Only a selected test creates work. Nothing is selected by default.
                </span>
              </div>

              {derived && (
                <div className="card" data-testid={`line-${index + 1}-derived`} style={{ background: "var(--bg-subtle)", marginBottom: 8 }}>
                  <b>Derived part numbers</b>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Assembly: <code data-testid={`line-${index + 1}-assembly-pn`}>{derived.assembly.value}</code>
                  </div>
                  {derived.components.length > 0 && (
                    <table className="data" style={{ marginTop: 6 }}>
                      <tbody>
                        {derived.components.map((c) => (
                          <tr key={c.key}>
                            <td>{c.label}</td>
                            <td>
                              <code>{c.result.value}</code>
                              {c.result.missing.length > 0 && (
                                <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                                  {" "}
                                  — needs {c.result.missing.join(", ")}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "6px 0 0" }}>
                    Composed from the pinned catalogue as a starting point. Record the part number
                    actually used in the table below — they are kept separately.
                  </p>
                </div>
              )}

              <h4 style={{ marginBottom: 4 }}>Components</h4>
              <p style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 0 }}>
                Enter the brand, part number and seal/serial reference actually used. Blank is fine —
                it can be filled in during the build.
              </p>
              <table className="data" data-testid={`line-${index + 1}-components`}>
                <thead>
                  <tr>
                    <th>In scope</th>
                    <th>Component</th>
                    <th>Part number</th>
                    <th>Brand</th>
                    <th>Material</th>
                    <th>Reference</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {line.components.map((c) => {
                    const custom = isCustomValue(c, "material") || isCustomValue(c, "partNumber");
                    return (
                      <tr key={c.key} data-testid={`component-${c.key}`} style={{ opacity: c.inScope ? 1 : 0.5 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={c.inScope}
                            aria-label={`${c.label} in scope`}
                            data-testid={`component-${c.key}-inscope`}
                            onChange={(e) => onPatchComponent(c.key, { inScope: e.target.checked })}
                          />
                        </td>
                        <td>
                          {c.label}
                          {custom && (
                            <span className="badge save-pending" style={{ marginLeft: 4 }}>
                              custom
                            </span>
                          )}
                        </td>
                        <td>
                          <OptionSelect
                            width={150}
                            disabled={!c.inScope}
                            testId={`component-${c.key}-partnumber`}
                            value={c.partNumber}
                            options={derivedByKey[c.key] ? [derivedByKey[c.key]] : []}
                            onChange={(v) => onPatchComponent(c.key, { partNumber: v })}
                            placeholder="Part number"
                          />
                        </td>
                        <td>
                          <input
                            style={{ width: 110 }}
                            disabled={!c.inScope}
                            data-testid={`component-${c.key}-brand`}
                            value={c.brand}
                            onChange={(e) => onPatchComponent(c.key, { brand: e.target.value })}
                            placeholder="Manufacturer"
                          />
                        </td>
                        <td>
                          <OptionSelect
                            width={130}
                            disabled={!c.inScope}
                            testId={`component-${c.key}-material`}
                            value={c.material}
                            options={componentMaterialOptionsFor(familyCode, c.key)}
                            onChange={(v) => onPatchComponent(c.key, { material: v })}
                          />
                        </td>
                        <td>
                          <input
                            style={{ width: 130 }}
                            disabled={!c.inScope}
                            data-testid={`component-${c.key}-reference`}
                            value={c.reference}
                            onChange={(e) => onPatchComponent(c.key, { reference: e.target.value })}
                            placeholder={c.referenceLabel}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            style={{ width: 60 }}
                            disabled={!c.inScope}
                            value={c.quantity}
                            onChange={(e) =>
                              onPatchComponent(c.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          ) : (
            <div className="field-row">
              <FieldGroup label="Part number">
                <input
                  data-testid={`line-${index + 1}-partnumber`}
                  value={line.partNumber ?? ""}
                  onChange={(e) => onPatch({ partNumber: e.target.value })}
                />
              </FieldGroup>
              <FieldGroup label="Brand / manufacturer">
                <input
                  data-testid={`line-${index + 1}-brand`}
                  value={line.brand ?? ""}
                  onChange={(e) => onPatch({ brand: e.target.value })}
                />
              </FieldGroup>
            </div>
          )}

          <FieldGroup label="Notes">
            <input
              value={line.notes ?? ""}
              onChange={(e) => onPatch({ notes: e.target.value })}
              placeholder="Anything the shop needs to know about this line"
            />
          </FieldGroup>
        </div>
      )}
    </div>
  );
}
