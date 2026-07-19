"use client";

import Link from "next/link";
import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { useAppState } from "@/store/StoreProvider";
import {
  checklistProgress,
  currentResponses,
  employeeName,
  postsForOrder,
  tasksForUnit,
  unitById
} from "@/domain/selectors";
import { IdentityBanner } from "@/components/IdentityBanner";
import { Checklist } from "@/components/Checklist";
import { ActivityFeed } from "@/components/ActivityFeed";
import { TaskControls, HandoffCard } from "@/components/TaskControls";
import { PhotoCapture } from "@/components/PhotoCapture";
import {
  Exact,
  MockPhoto,
  OperationStatusBadge,
  SaveStateBadge,
  TaskStatusBadge
} from "@/components/bits";

const TABS = ["overview", "checklist", "evidence", "activity", "audit"] as const;
type Tab = (typeof TABS)[number];

function UnitView({ unitId }: { unitId: string }) {
  const state = useAppState();
  const params = useSearchParams();
  const tab = (params.get("tab") ?? "overview") as Tab;
  const unit = unitById(state, unitId);

  if (!unit) {
    return (
      <div className="page">
        <h1>Unit not found</h1>
        <p>
          No Unit “{unitId}” exists in the mock data. <Link href="/orders">Back to orders</Link>
        </p>
      </div>
    );
  }

  const tasks = tasksForUnit(state, unitId);
  const route = state.routeOps.filter((o) => o.unitId === unitId).sort((a, b) => a.seq - b.seq);
  const cp = checklistProgress(state, unitId);
  const attachments = state.attachments.filter((a) => a.unitId === unitId);
  const audit = state.auditEvents.filter((e) => e.unitId === unitId).sort((a, b) => b.at.localeCompare(a.at));
  const changes = state.materialChanges.filter((m) => m.unitId === unitId);
  const swis = state.specialInstructions.filter((s) => s.unitId === unitId);
  const problems = state.problems.filter((p) => p.unitId === unitId);
  const responses = [...currentResponses(state, unitId).values()];
  const measurements = responses.filter((r) => typeof r.value === "number");

  return (
    <>
      <IdentityBanner unit={unit} />
      <div className="page">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <Link className="btn btn-primary" href={`/tablet/${unitId}`}>
            📱 Open shop-floor tablet view
          </Link>
          <Link className="btn" href={`/documents/${unitId}`}>
            📄 Unit QC history preview
          </Link>
          <Link className="btn" href={`/orders/${unit.orderNumber}`}>
            ← Order {unit.orderNumber}
          </Link>
        </div>

        <nav className="tabs" aria-label="Unit tabs">
          {TABS.map((t) => (
            <Link key={t} className={`tab ${tab === t ? "active" : ""}`} href={`/units/${unitId}?tab=${t}`}>
              {t[0].toUpperCase() + t.slice(1)}
            </Link>
          ))}
        </nav>

        {tab === "overview" && (
          <>
            <div className="grid-2">
              <div className="card">
                <h3>Route operations</h3>
                <ol style={{ paddingLeft: 20, lineHeight: 1.9 }}>
                  {route.map((op) => (
                    <li key={op.id}>
                      {op.name} <OperationStatusBadge status={op.status} />{" "}
                      <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{op.department}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="card">
                <h3>Actionable tasks</h3>
                {tasks.length === 0 && <p>No tasks for this Unit yet.</p>}
                {tasks.map((t) => (
                  <div key={t.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 10 }}>
                    <b>{t.name}</b>
                    <TaskControls task={t} />
                  </div>
                ))}
              </div>

              <div className="card">
                <h3>Checklist progress</h3>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(cp.done / cp.total) * 100}%` }} />
                </div>
                <p>
                  {cp.done}/{cp.total} items complete ·{" "}
                  <Link href={`/units/${unitId}?tab=checklist`}>open checklist</Link>
                </p>
                <h4>Measurements</h4>
                {measurements.length === 0 && <p>No measurements recorded.</p>}
                <ul style={{ paddingLeft: 18 }}>
                  {measurements.map((m) => {
                    const def = state.checklistDefs.find((d) => d.key === m.itemKey)!;
                    return (
                      <li key={m.id}>
                        {def.label}: <b>{String(m.value)} {def.unit}</b> <SaveStateBadge state={m.state} />
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="card">
                <h3>Required evidence</h3>
                <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
                  {state.checklistDefs
                    .filter((d) => d.requiresPhoto)
                    .map((d) => {
                      const has = attachments.some((a) => a.targetRef === d.key);
                      return (
                        <li key={d.key}>
                          {d.label} —{" "}
                          {has ? (
                            <span className="badge save-saved">captured</span>
                          ) : (
                            <span className="badge save-pending">outstanding</span>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>

              <div className="card">
                <h3>Material and part changes</h3>
                {changes.length === 0 && <p>No material change. As-built matches ordered {unit.orderedMaterial}.</p>}
                {changes.map((mc) => (
                  <div key={mc.id} data-testid={`unit-mc-${mc.id}`}>
                    <b>{mc.orderedMaterial} → {mc.proposedMaterial}</b>{" "}
                    <span className={`badge ${mc.status === "Approved" ? "save-saved" : "save-pending"}`}>{mc.status}</span>
                    <div style={{ fontSize: 13.5 }}>
                      Reason: {mc.reason}
                      <br />
                      Requested by {employeeName(state, mc.requestedById)}
                      {mc.approvedById && <> · approved by {employeeName(state, mc.approvedById)}</>}
                      <br />
                      Evidence: {mc.evidencePlaceholder}
                      <br />
                      Affects <b>this Unit only</b>.
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3>Special work instructions</h3>
                {swis.length === 0 && <p>None.</p>}
                {swis.map((s) => {
                  const before = state.attachments.find((a) => a.id === s.beforePhotoAttachmentId);
                  const after = state.attachments.find((a) => a.id === s.afterPhotoAttachmentId);
                  return (
                    <div key={s.id} data-testid={`unit-swi-${s.id}`}>
                      <b>{s.part}</b>: {s.instruction}
                      <div style={{ fontSize: 13.5, marginTop: 4 }}>
                        Completion measurement:{" "}
                        {s.completionMeasurement
                          ? `${s.completionMeasurement.value} ${s.completionMeasurement.unit}`
                          : "not recorded"}
                        <br />
                        Verification: <span className="badge save-pending">{s.verificationStatus}</span>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                        {before ? (
                          <MockPhoto art={before.placeholderArt} caption="Before" width={140} height={95} />
                        ) : (
                          <div className="attachment-card">Before photo placeholder — outstanding</div>
                        )}
                        {after ? (
                          <MockPhoto art={after.placeholderArt} caption="After" width={140} height={95} />
                        ) : (
                          <div className="attachment-card">After photo placeholder — outstanding</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="card">
                <h3>Blockers</h3>
                {unit.holdReason ? (
                  <p style={{ color: "var(--danger)", fontWeight: 600 }}>⛔ {unit.holdReason}</p>
                ) : (
                  <p>No active blocker.</p>
                )}
                {problems.map((p) => (
                  <div key={p.id}>
                    <b>{p.description}</b> <span className="badge save-pending">{p.status}</span>
                    <div style={{ fontSize: 13 }}>Raised by {employeeName(state, p.raisedById)}</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3>Final document status</h3>
                <p>
                  {unit.unitId}_Unit_QC_and_Manufacturing_History.pdf —{" "}
                  {unit.status === "Complete" ? (
                    <span className="badge save-saved">Released (mock)</span>
                  ) : (
                    <span className="badge save-pending">Draft — awaiting release</span>
                  )}
                </p>
                <Link className="btn" href={`/documents/${unitId}`}>
                  Open preview
                </Link>
              </div>
            </div>

            {tasks.filter((t) => t.handoff).map((t) => (
              <HandoffCard key={t.id} task={t} />
            ))}

            <div className="card">
              <h3>Recent activity for this Unit</h3>
              {postsForOrder(state, unit.orderNumber, unitId)
                .slice(0, 3)
                .map((p) => (
                  <div key={p.id} className="record-list-item">
                    <b>{employeeName(state, p.authorId)}</b>{" "}
                    <span className="post-time">
                      <Exact at={p.at} />
                    </span>
                    <div>{p.body}</div>
                  </div>
                ))}
              <Link href={`/units/${unitId}?tab=activity`}>See all activity</Link>
            </div>
          </>
        )}

        {tab === "checklist" && <Checklist unitId={unitId} orderNumber={unit.orderNumber} />}

        {tab === "evidence" && (
          <>
            <div className="card">
              <h3>Capture new evidence</h3>
              <PhotoCapture
                orderNumber={unit.orderNumber}
                unitId={unitId}
                targetRef={null}
                targetLabel="Unit-level evidence (no specific step)"
              />
            </div>
            <div className="card">
              <h3>Photos and files on {unitId}</h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {attachments.length === 0 && <p>No evidence captured yet.</p>}
                {attachments.map((a) => (
                  <div key={a.id} data-testid={`attachment-${a.id}`}>
                    {a.kind === "photo" ? (
                      <MockPhoto art={a.placeholderArt} caption={`${a.category}`} width={160} height={110} />
                    ) : (
                      <div className="attachment-card">📄 {a.fileName}</div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--text-subtle)", maxWidth: 160 }}>
                      {a.fileName}
                      <br />
                      {employeeName(state, a.employeeId)} · <Exact at={a.at} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "activity" && <ActivityFeed orderNumber={unit.orderNumber} unitId={unitId} />}

        {tab === "audit" && (
          <div className="card">
            <h3>Audit timeline for {unitId}</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Exact at={e.at} />
                      </td>
                      <td>{employeeName(state, e.actorId)}</td>
                      <td>
                        <code style={{ fontSize: 12.5 }}>{e.action}</code>
                      </td>
                      <td style={{ fontSize: 13.5 }}>
                        {e.detail}
                        {e.supersedesEventId && (
                          <div className="badge save-needsreview" style={{ marginTop: 3 }}>
                            supersedes {e.supersedesEventId}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "overview" && tasks.length > 0 && (
          <div className="card">
            <h3>Task history</h3>
            {tasks.map((t) => (
              <div key={t.id} style={{ marginBottom: 10 }}>
                <b>{t.name}</b> <TaskStatusBadge status={t.status} />
                <ul style={{ paddingLeft: 18, fontSize: 13.5 }}>
                  {t.history.map((h, i) => (
                    <li key={i}>
                      {h.action} by {employeeName(state, h.actorId)} · <Exact at={h.at} />
                      {h.note && <> — {h.note}</>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function UnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  return (
    <Suspense>
      <UnitView unitId={decodeURIComponent(unitId)} />
    </Suspense>
  );
}
