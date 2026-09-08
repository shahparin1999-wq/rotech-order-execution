"use client";

// Manual CPQ import. Accepts either a v1 execution package or a v2 order
// handoff (`rotech-cpq-order-handoff/2.0`), as plain JSON or as the CPQ ZIP
// transfer bundle (package + accepted PO + manifest). The file is validated
// (schema + checksum + money-leak scan) in the browser, previewed by
// disposition, and only the validated payload is stored — never a temporary
// upload object URL.
//
// The visible order number is the Rotech sales order (AIMCOR). The CPQ
// quote/revision is provenance, and the order carries its own immutable
// internal id regardless of what the visible number is.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import type { Facility } from "@/domain/types";
import { validateExecutionPackage, type ExecutionLineV1, type ExecutionPackageV1 } from "@/domain/executionPackage";
import { validateOrderHandoffPackage, ORDER_HANDOFF_SCHEMA, type HandoffLine, type OrderHandoffPackageV2 } from "@/domain/orderHandoffV2";
import { componentsFromHandoffLine, demandKind } from "@/domain/ledger/fromHandoff";
import { verifyTransferEnvelope } from "@/domain/transferEnvelope";
import { readZipEntries } from "@/domain/zip";
import type { ImportedPoInput } from "@/domain/actions";
import { Drawer, FieldGroup } from "./Drawer";

type Candidate = { kind: "v1"; pkg: ExecutionPackageV1 } | { kind: "v2"; pkg: OrderHandoffPackageV2 };

// Q-DEMO-1001 rev 3 → Q-DEMO-1001-R3. A suggestion only: the coordinator
// replaces it with the Rotech sales order number issued in AIMCOR.
export function deriveOrderNumber(pkg: { source: { quoteNumber: string; revisionNumber: number } }): string {
  return `${pkg.source.quoteNumber}-R${pkg.source.revisionNumber}`;
}

function summarizeMotor(line: ExecutionLineV1): string {
  const m = line.configuration.motor;
  if (!m || Object.keys(m).length === 0) return "—";
  const supply = typeof m.supply === "string" ? m.supply : "";
  const power = typeof m.power === "string" ? m.power : "";
  return [supply, power].filter(Boolean).join(", ") || "See configuration";
}

function summarizeSeal(line: ExecutionLineV1): string {
  const seal = line.configuration.seal;
  if (!seal || Object.keys(seal).length === 0) return "—";
  const type = typeof seal.type === "string" ? seal.type : "";
  const arr = typeof seal.arrangement === "string" ? seal.arrangement : "";
  return [type, arr].filter(Boolean).join(" / ") || "See configuration";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

const DISPOSITION_LABEL: Record<HandoffLine["executionDisposition"], string> = {
  "unit-bearing": "Units",
  "line-level-scope": "Packable scope (no Units)",
  "reference-only": "Reference only",
  "review-required": "Review required"
};

function V2LinePreview({ line }: { line: HandoffLine }) {
  const components = componentsFromHandoffLine(line);
  const demand = components.filter((c) => demandKind(c) !== "none");
  const pumpBuild = (line.pumpBuild ?? {}) as Record<string, unknown>;
  const seal = (line.seal ?? {}) as Record<string, unknown>;
  const product = (line.product ?? {}) as Record<string, unknown>;
  return (
    <div className="card" data-testid={`cpq-preview-line-${line.lineNumber}`}>
      <strong>
        Line {line.lineNumber} — {str(product.model) || str(product.family) || line.lineType} {str(product.pumpSize)}
        {line.quantity !== undefined && <> — Quantity {line.quantity}</>}
      </strong>
      <table className="data" style={{ marginTop: 6 }}>
        <tbody>
          <tr>
            <td>Disposition</td>
            <td data-testid={`cpq-preview-disposition-${line.lineNumber}`}>{DISPOSITION_LABEL[line.executionDisposition]}</td>
          </tr>
          <tr>
            <td>Commercial / execution</td>
            <td>
              {line.commercialState ?? "—"} · {line.executionState ?? "—"}
            </td>
          </tr>
          {str(pumpBuild.materialBuild) && (
            <tr>
              <td>Build</td>
              <td>
                {str(pumpBuild.materialBuild)} · {str(pumpBuild.frameSize)} · {str(pumpBuild.flangeType)}
                {str(pumpBuild.impellerTrim) && <> · trim {str(pumpBuild.impellerTrim)}</>}
              </td>
            </tr>
          )}
          {str(seal.sealOption) && (
            <tr>
              <td>Seal</td>
              <td>
                {str(seal.sealOption)} {str(seal.sealMoc) && <>· {str(seal.sealMoc)}</>} {str(seal.sealPlanOption) && <>· {str(seal.sealPlanOption)}</>}
              </td>
            </tr>
          )}
          <tr>
            <td>Testing</td>
            <td>{(line.testingRequirements ?? []).join(", ") || "—"}</td>
          </tr>
          <tr>
            <td>Demand per Unit</td>
            <td data-testid={`cpq-preview-demand-${line.lineNumber}`}>{demand.length > 0 ? demand.map((c) => c.label).join(", ") : "none"}</td>
          </tr>
          <tr>
            <td>Reference BOM rows</td>
            <td>
              {(line.bom ?? []).length} row(s)
              {line.bom && line.bom.length > 0 && (
                <span style={{ color: "var(--text-subtle)" }}> — reference only, not procurement authority</span>
              )}
            </td>
          </tr>
          {(line.attentionItems ?? []).length > 0 && (
            <tr>
              <td>Attention</td>
              <td>{line.attentionItems!.map((a) => a.description).join("; ")}</td>
            </tr>
          )}
          <tr>
            <td>Source line</td>
            <td>{line.id}</td>
          </tr>
        </tbody>
      </table>
      {line.executionDisposition === "unit-bearing" && (
        <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 4 }}>
          Creates {line.quantity} independent Unit{line.quantity === 1 ? "" : "s"} under Line {line.lineNumber}, each with its own material demand.
        </div>
      )}
    </div>
  );
}

export function ImportCpqPackageDrawer({ onClose, toggle }: { onClose: () => void; toggle?: React.ReactNode }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [fileName, setFileName] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [po, setPo] = useState<ImportedPoInput | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [customerPo, setCustomerPo] = useState("");
  const [committedDate, setCommittedDate] = useState("");
  const [facility, setFacility] = useState<Facility>("Mississauga");
  const [coordinatorId, setCoordinatorId] = useState(
    state.employees.find((e) => e.department === "Coordination")?.id ?? state.employees[0].id
  );

  function acceptPackage(raw: unknown, poInput: ImportedPoInput | null): void {
    const isV2 = !!raw && typeof raw === "object" && (raw as Record<string, unknown>).schema === ORDER_HANDOFF_SCHEMA;
    if (isV2) {
      const result = validateOrderHandoffPackage(raw);
      if (!result.ok || !result.package) {
        setErrors(result.errors);
        return;
      }
      setCandidate({ kind: "v2", pkg: result.package });
      setPo(poInput);
      setOrderNumber(deriveOrderNumber(result.package));
      setCustomerPo(str(result.package.customer.customerPo));
      setCommittedDate(str(result.package.orderContext?.expectedDelivery ?? result.package.orderContext?.requestedDelivery));
      return;
    }
    const result = validateExecutionPackage(raw);
    if (!result.ok || !result.package) {
      setErrors(result.errors);
      return;
    }
    setCandidate({ kind: "v1", pkg: result.package });
    setPo(poInput);
    setOrderNumber(deriveOrderNumber(result.package));
    setCustomerPo(result.package.customer.customerPo ?? "");
  }

  async function onFile(file: File) {
    setFileName(file.name);
    setCandidate(null);
    setPo(null);
    setErrors([]);

    // A ZIP is a CPQ transfer bundle (package + PO + manifest); a plain .json is
    // the package alone.
    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        const entries = await readZipEntries(await file.arrayBuffer());
        const pkgBytes = entries.get("execution-package.json") ?? entries.get("order-handoff.json");
        const manifestBytes = entries.get("transfer-manifest.json");
        const poName = [...entries.keys()].find((k) => k.startsWith("customer-po/"));
        const poBytes = poName ? entries.get(poName) : undefined;
        if (!pkgBytes || !manifestBytes || !poBytes || !poName) {
          setErrors(["Bundle must contain execution-package.json, transfer-manifest.json, and a customer-po/ file."]);
          return;
        }
        const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
        const verified = verifyTransferEnvelope({ manifest, packageBytes: pkgBytes, poBytes });
        if (!verified.ok || !verified.manifest) {
          setErrors(verified.errors);
          return;
        }
        const raw = JSON.parse(new TextDecoder().decode(pkgBytes));
        // Cross-check: the manifest and the package must name the same package.
        if (raw?.packageId !== verified.manifest.packageId) {
          setErrors([`packageId mismatch: manifest ${verified.manifest.packageId} vs package ${raw?.packageId}.`]);
          return;
        }
        acceptPackage(raw, {
          fileName: verified.manifest.files.customerPo.name,
          sha256: verified.manifest.files.customerPo.sha256,
          sizeBytes: verified.manifest.files.customerPo.sizeBytes,
          mediaType: verified.manifest.files.customerPo.mediaType,
          acceptedPoSubmissionId: verified.manifest.acceptedPoSubmissionId
        });
      } catch (err) {
        setErrors([`Could not read bundle: ${(err as Error).message}`]);
      }
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setErrors(["File is not valid JSON."]);
      return;
    }
    acceptPackage(parsed, null);
  }

  const orderNumberTaken = useMemo(
    () => orderNumber.trim() !== "" && state.orders.some((o) => o.orderNumber === orderNumber.trim()),
    [orderNumber, state.orders]
  );
  const canImport = candidate !== null && orderNumber.trim() !== "" && !orderNumberTaken;

  const v2 = candidate?.kind === "v2" ? candidate.pkg : null;
  const v1 = candidate?.kind === "v1" ? candidate.pkg : null;
  const unitCount = v2
    ? v2.lines.filter((l) => l.executionDisposition === "unit-bearing").reduce((n, l) => n + (l.quantity ?? 0), 0)
    : v1
      ? v1.lines.reduce((n, l) => n + l.quantity, 0)
      : 0;
  const attentionCount = v2 ? v2.lines.reduce((n, l) => n + (l.attentionItems?.length ?? 0), 0) + (v2.attentionItems?.length ?? 0) : 0;

  function confirm() {
    if (!candidate) return;
    const on = orderNumber.trim();
    if (candidate.kind === "v2") {
      dispatch({
        type: "importOrderHandoffV2",
        input: {
          package: candidate.pkg,
          orderNumber: on,
          customerPo: customerPo.trim() || undefined,
          facility,
          coordinatorId,
          dueDate: committedDate.trim() || undefined,
          po: po ?? undefined
        }
      });
    } else {
      dispatch({
        type: "importExecutionPackage",
        input: {
          package: candidate.pkg,
          orderNumber: on,
          customerPo: customerPo.trim() || undefined,
          facility,
          coordinatorId,
          po: po ?? undefined
        }
      });
    }
    onClose();
    router.push(`/orders/${encodeURIComponent(on)}`);
  }

  return (
    <Drawer
      title="Import CPQ package"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canImport} data-testid="confirm-cpq-import" onClick={confirm}>
            Confirm import
          </button>
        </>
      }
    >
      {toggle}
      <FieldGroup label="CPQ package (.json) or transfer bundle (.zip)">
        <input
          type="file"
          accept="application/json,.json,.zip,application/zip"
          data-testid="cpq-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        {fileName && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Selected: {fileName}</span>}
      </FieldGroup>

      {errors.length > 0 && (
        <div className="card" data-testid="cpq-validation-errors" style={{ borderColor: "var(--danger)" }}>
          <strong style={{ color: "var(--danger)" }}>Package rejected</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {errors.map((err, i) => (
              <li key={i} style={{ fontSize: 13 }}>
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidate && (
        <>
          <div className="card" data-testid="cpq-preview-header">
            <div>
              <strong>Quote {candidate.pkg.source.quoteNumber}</strong> — Revision {candidate.pkg.source.revisionNumber}
              {v2 && (
                <span className="badge save-saved" style={{ marginLeft: 8 }} data-testid="cpq-preview-schema">
                  handoff v2
                </span>
              )}
            </div>
            <div style={{ fontSize: 13 }}>Customer: {str(candidate.pkg.customer.customerName)}</div>
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              Package {candidate.pkg.packageId} · checksum {candidate.pkg.checksum.slice(0, 16)}… · {candidate.pkg.lines.length} line(s) · {unitCount} Unit(s)
              {v2 && <> · {attentionCount} attention item(s) · money excluded by contract</>}
            </div>
            {po && (
              <div style={{ fontSize: 12, color: "var(--text-subtle)" }} data-testid="cpq-preview-po">
                Accepted PO: {po.fileName} · verified sha256 {po.sha256.slice(0, 16)}…
              </div>
            )}
          </div>

          <FieldGroup label="Rotech sales order number (AIMCOR)" required>
            <input data-testid="cpq-order-number" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            <span className="from-default">
              Suggested from the quote; replace with the SO number issued in AIMCOR. The CPQ quote and revision stay attached as provenance.
            </span>
            {orderNumberTaken && <span style={{ fontSize: 12, color: "var(--danger)" }}>An order with this number already exists.</span>}
          </FieldGroup>

          <div className="field-row">
            <FieldGroup label="Customer PO">
              <input data-testid="cpq-customer-po" value={customerPo} onChange={(e) => setCustomerPo(e.target.value)} />
            </FieldGroup>
            {v2 && (
              <FieldGroup label="Committed date">
                <input type="date" data-testid="cpq-committed-date" value={committedDate} onChange={(e) => setCommittedDate(e.target.value)} />
              </FieldGroup>
            )}
          </div>

          <div className="field-row">
            <FieldGroup label="Location">
              <select value={facility} onChange={(e) => setFacility(e.target.value as Facility)}>
                <option value="Mississauga">Mississauga</option>
                <option value="Houston">Houston</option>
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

          {v2 && v2.lines.map((line) => <V2LinePreview key={line.id} line={line} />)}

          {v1 &&
            v1.lines.map((line) => (
              <div className="card" key={line.cpqLineId} data-testid={`cpq-preview-line-${line.lineNumber}`}>
                <strong>
                  Line {line.lineNumber} — {line.product.model} {line.product.pumpSize} — Quantity {line.quantity}
                </strong>
                <table className="data" style={{ marginTop: 6 }}>
                  <tbody>
                    <tr>
                      <td>Materials</td>
                      <td>{line.configuration.materialBuild ?? line.configuration.casingMaterial ?? "See configuration"}</td>
                    </tr>
                    <tr>
                      <td>Motor</td>
                      <td>{summarizeMotor(line)}</td>
                    </tr>
                    <tr>
                      <td>Seal</td>
                      <td>{summarizeSeal(line)}</td>
                    </tr>
                    <tr>
                      <td>Testing</td>
                      <td>{line.configuration.testingRequirements.join(", ") || "—"}</td>
                    </tr>
                    <tr>
                      <td>Customer-supplied</td>
                      <td>{line.configuration.customerSuppliedItems.join(", ") || "None"}</td>
                    </tr>
                    <tr>
                      <td>BOM</td>
                      <td>{line.bom.length} item(s)</td>
                    </tr>
                    <tr>
                      <td>Source</td>
                      <td>
                        {v1.source.quoteNumber} rev {v1.source.revisionNumber} · line {line.cpqLineId}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 4 }}>
                  Creates {line.quantity} independent Unit{line.quantity === 1 ? "" : "s"} under Line {line.lineNumber}.
                </div>
              </div>
            ))}
        </>
      )}
    </Drawer>
  );
}
