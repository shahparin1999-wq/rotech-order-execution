// Read-only admin view of the model-template master data: the master routing and
// BOM skeleton each model/variant contributes to a manually created work order.
// These are pilot placeholders (route/checklist/tolerance governance, D-013, is
// still Proposed) — not the approved manufacturing standard.

import { MODEL_TEMPLATES } from "@/domain/modelTemplates";

export default function ModelTemplatesPage() {
  return (
    <div>
      <div className="command-bar">
        <h1 className="command-bar-title">Model templates (master routing)</h1>
      </div>
      <p style={{ color: "var(--text-subtle)", maxWidth: 720 }}>
        Master data used by <b>New work order → Create manually</b>. Selecting a template
        pre-fills the order type, material, and applies the model&apos;s master routing to every
        Unit. Read-only in this prototype. Every route and BOM below is a{" "}
        <b>Pilot placeholder – owner approval required</b>.
      </p>

      {MODEL_TEMPLATES.map((t) => (
        <div className="card" key={t.id} data-testid={`template-card-${t.id}`} style={{ marginBottom: 16 }}>
          <h3>
            {t.displayName}{" "}
            <span className="badge">{t.isCustom ? "custom" : t.lineType}</span>
          </h3>
          <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 8 }}>
            Model {t.model || "(free text)"} · variant {t.variant} · allowed order types:{" "}
            {t.allowedOrderTypes.join(", ")} · default material {t.defaultMaterial || "—"}
          </div>

          <div className="grid-2">
            <div>
              <h4>Master routing ({t.route.length} steps)</h4>
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Operation</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {t.route.map((step, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{step.name}</td>
                      <td>{step.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h4>BOM skeleton ({t.bomSkeleton.length} rows)</h4>
              {t.bomSkeleton.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>None (filled in per order).</p>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Qty</th>
                      <th>Material</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.bomSkeleton.map((row, i) => (
                      <tr key={i}>
                        <td>{row.description}</td>
                        <td>{row.quantity}</td>
                        <td>{row.material ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
