"use client";

// Shop-floor tablet experience: large labelled controls, minimal typing, and
// the active Unit identity visible during every controlled action.

import Link from "next/link";
import { use, useState } from "react";
import { useAppState } from "@/store/StoreProvider";
import {
  checklistProgress,
  continueLastJob,
  currentResponses,
  employeeName,
  postsForOrder,
  tasksForUnit,
  unitById
} from "@/domain/selectors";
import { IdentityBanner } from "@/components/IdentityBanner";
import { TaskControls } from "@/components/TaskControls";
import { PhotoCapture } from "@/components/PhotoCapture";
import { Checklist } from "@/components/Checklist";
import { Exact, SaveStateBadge } from "@/components/bits";

function TabletView({ unitId }: { unitId: string }) {
  const state = useAppState();
  const unit = unitById(state, unitId);
  const [panel, setPanel] = useState<null | "photo" | "file" | "measure" | "checklist">(null);
  const me = state.employees.find((e) => e.id === state.currentUserId)!;

  if (!unit) {
    return (
      <div className="page">
        <h1>Unit not found</h1>
        <Link href="/orders">Back to orders</Link>
      </div>
    );
  }

  const tasks = tasksForUnit(state, unitId);
  const active =
    tasks.find((t) => t.status === "InProgress") ??
    tasks.find((t) => t.status === "Paused") ??
    tasks.find((t) => t.status === "Blocked") ??
    tasks.find((t) => t.status === "Ready") ??
    tasks[0];
  const cp = checklistProgress(state, unitId);
  const lastJob = continueLastJob(state, me.id);
  const nextResponses = [...currentResponses(state, unitId).values()];
  const recent = postsForOrder(state, unit.orderNumber, unitId).slice(0, 2);

  return (
    <>
      <IdentityBanner unit={unit} />
      <div className="tablet-screen">
        <div className="card" style={{ background: "var(--accent-soft)" }}>
          <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>Current operation</div>
          <div style={{ fontSize: 21, fontWeight: 700 }} data-testid="tablet-current-op">
            {unit.currentOperation}
          </div>
          <div style={{ marginTop: 6 }}>
            Checklist: <b>{cp.done} of {cp.total} complete</b> ·{" "}
            {unit.holdReason ? (
              <span className="badge s-blocked">Blocked: {unit.holdReason}</span>
            ) : (
              <span className="badge save-saved">Online — mock connectivity</span>
            )}
          </div>
        </div>

        {active && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{active.name}</h3>
            <TaskControls task={active} big />
          </div>
        )}

        <div className="big-actions" data-testid="tablet-actions">
          <button className="btn btn-big" data-testid="tablet-take-photo" onClick={() => setPanel(panel === "photo" ? null : "photo")}>
            <span className="icon">📷</span>Take Photo
          </button>
          <button className="btn btn-big" onClick={() => setPanel(panel === "file" ? null : "file")}>
            <span className="icon">📎</span>Attach File
          </button>
          <button className="btn btn-big" data-testid="tablet-measure" onClick={() => setPanel(panel === "measure" ? null : "measure")}>
            <span className="icon">📏</span>Enter Measurement
          </button>
          <button className="btn btn-big" data-testid="tablet-checklist" onClick={() => setPanel(panel === "checklist" ? null : "checklist")}>
            <span className="icon">☑️</span>Complete Checklist
          </button>
          <Link className="btn btn-big" href={`/units/${unitId}?tab=activity`}>
            <span className="icon">💬</span>Recent Activity
          </Link>
          {lastJob && (
            <Link
              className="btn btn-big btn-primary"
              href={`/tablet/${lastJob.unitId}`}
              data-testid="continue-last-job"
              title={`${lastJob.name} on ${lastJob.unitId}`}
            >
              <span className="icon">↩️</span>Continue Last Job
              <span style={{ fontSize: 12, fontWeight: 500 }}>{lastJob.unitId}</span>
            </Link>
          )}
        </div>

        {(panel === "photo" || panel === "file") && (
          <PhotoCapture
            orderNumber={unit.orderNumber}
            unitId={unitId}
            targetRef={active?.id ?? null}
            targetLabel={active ? `Task: ${active.name}` : "Unit-level evidence"}
            big
            autoStartMode={panel}
          />
        )}

        {panel === "measure" && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Enter measurement — {unitId}</h3>
            <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>
              Measurements are recorded against this Unit only.
            </p>
            <Checklist unitId={unitId} orderNumber={unit.orderNumber} />
          </div>
        )}

        {panel === "checklist" && <Checklist unitId={unitId} orderNumber={unit.orderNumber} />}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Requirements still outstanding</h3>
          <ul style={{ paddingLeft: 18, lineHeight: 1.9 }}>
            {state.checklistDefs
              .filter((d) => !nextResponses.some((r) => r.itemKey === d.key && r.state === "Saved"))
              .slice(0, 5)
              .map((d) => (
                <li key={d.key}>
                  {d.label}
                  {d.requiresPhoto && <span className="badge save-pending" style={{ marginLeft: 6 }}>photo required</span>}
                </li>
              ))}
          </ul>
          {nextResponses.some((r) => r.state !== "Saved") && (
            <p>
              Unsent items:{" "}
              {nextResponses
                .filter((r) => r.state !== "Saved")
                .map((r) => (
                  <span key={r.id} style={{ marginRight: 8 }}>
                    {r.itemKey} <SaveStateBadge state={r.state} />
                  </span>
                ))}
            </p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent activity</h3>
          {recent.length === 0 && <p>No activity for this Unit.</p>}
          {recent.map((p) => (
            <div key={p.id} style={{ marginBottom: 8 }}>
              <b>{employeeName(state, p.authorId)}</b>{" "}
              <span className="post-time">
                <Exact at={p.at} />
              </span>
              <div>{p.body}</div>
            </div>
          ))}
        </div>

        <Link className="btn" href={`/units/${unitId}`}>
          ← Full Unit record
        </Link>
      </div>
    </>
  );
}

export default function TabletPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  return <TabletView unitId={decodeURIComponent(unitId)} />;
}
