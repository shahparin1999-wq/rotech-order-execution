"use client";

// Manual CPQ execution-package import. Upload a JSON package, validate it
// (schema + checksum), preview it line-by-line, then confirm to create one Work
// Order with first-class Lines and quantity-based isolated Units. No live API:
// the file is parsed in the browser and only the validated payload is stored -
// never a temporary upload object URL.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import type { Facility } from "@/domain/types";
import {
  validateExecutionPackage,
  type ExecutionLineV1,
  type ExecutionPackageV1
} from "@/domain/executionPackage";
import { Drawer, FieldGroup } from "./Drawer";

// Q-DEMO-1001 rev 3 → Q-DEMO-1001-R3. The revision suffix keeps the derived
// order number unique and makes a re-import of the same revision collide.
export function deriveOrderNumber(pkg: ExecutionPackageV1): string {
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

export function ImportCpqPackageDrawer({
  onClose,
  toggle
}: {
  onClose: () => void;
  toggle?: React.ReactNode;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [fileName, setFileName] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pkg, setPkg] = useState<ExecutionPackageV1 | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [customerPo, setCustomerPo] = useState("");
  const [facility, setFacility] = useState<Facility>("Mississauga");
  const [coordinatorId, setCoordinatorId] = useState(
    state.employees.find((e) => e.department === "Coordination")?.id ?? state.employees[0].id
  );

  async function onFile(file: File) {
    setFileName(file.name);
    setPkg(null);
    setErrors([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setErrors(["File is not valid JSON."]);
      return;
    }
    const result = validateExecutionPackage(parsed);
    if (!result.ok || !result.package) {
      setErrors(result.errors);
      return;
    }
    setPkg(result.package);
    const derived = deriveOrderNumber(result.package);
    setOrderNumber(derived);
    setCustomerPo(result.package.customer.customerPo ?? "");
  }

  const orderNumberTaken = useMemo(
    () => orderNumber.trim() !== "" && state.orders.some((o) => o.orderNumber === orderNumber.trim()),
    [orderNumber, state.orders]
  );

  const canImport = pkg !== null && orderNumber.trim() !== "" && !orderNumberTaken;

  return (
    <Drawer
      title="Import CPQ package"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canImport}
            data-testid="confirm-cpq-import"
            onClick={() => {
              if (!pkg) return;
              const on = orderNumber.trim();
              dispatch({
                type: "importExecutionPackage",
                input: {
                  package: pkg,
                  orderNumber: on,
                  customerPo: customerPo.trim() || undefined,
                  facility,
                  coordinatorId
                }
              });
              onClose();
              router.push(`/orders/${encodeURIComponent(on)}`);
            }}
          >
            Confirm import
          </button>
        </>
      }
    >
      {toggle}
      <FieldGroup label="CPQ JSON package">
        <input
          type="file"
          accept="application/json,.json"
          data-testid="cpq-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        {fileName && (
          <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Selected: {fileName}</span>
        )}
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

      {pkg && (
        <>
          <div className="card" data-testid="cpq-preview-header">
            <div>
              <strong>Quote {pkg.source.quoteNumber}</strong> — Revision {pkg.source.revisionNumber}
            </div>
            <div style={{ fontSize: 13 }}>Customer: {pkg.customer.customerName}</div>
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              Package {pkg.packageId} · checksum {pkg.checksum} · {pkg.lines.length} line(s)
            </div>
          </div>

          <FieldGroup label="Order number (derived from quote)" required>
            <input
              data-testid="cpq-order-number"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
            {orderNumberTaken && (
              <span style={{ fontSize: 12, color: "var(--danger)" }}>
                An order with this number already exists (revision already imported).
              </span>
            )}
          </FieldGroup>

          <FieldGroup label="Customer PO">
            <input data-testid="cpq-customer-po" value={customerPo} onChange={(e) => setCustomerPo(e.target.value)} />
          </FieldGroup>

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

          {pkg.lines.map((line) => (
            <div className="card" key={line.cpqLineId} data-testid={`cpq-preview-line-${line.lineNumber}`}>
              <strong>
                Line {line.lineNumber} — {line.product.model} {line.product.pumpSize} — Quantity {line.quantity}
              </strong>
              <table className="data" style={{ marginTop: 6 }}>
                <tbody>
                  <tr>
                    <td>Materials</td>
                    <td>
                      {line.configuration.materialBuild ?? line.configuration.casingMaterial ?? "See configuration"}
                    </td>
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
                      {pkg.source.quoteNumber} rev {pkg.source.revisionNumber} · line {line.cpqLineId}
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
