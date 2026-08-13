"use client";

// The Unit workspace — one physical pump or package, one screen.
//
// Ordered by what a person needs, not by what the data model contains:
//
//   Identity            which exact pump is this
//   Do now              what I can start right now
//   Waiting on          what I am blocked behind
//   Blocking completion what stops this shipping
//   Summaries           parts / QC / photos / drawings, as COUNTS
//   Recent activity     the last few events, not the whole feed
//
// Detail on demand: the component tree, the full measurement table, every
// drawing and every photo open when asked for. They do not all render at once.
//
// This replaces both the seven-tab Unit page and the separate /tablet route —
// the tablet's big action tiles were the only correctly-sized controls in the
// app, stranded on a route that was not in the nav.

import Link from "next/link";
import { useState } from "react";
import { useAppState } from "@/store/StoreProvider";
import {
  checklistProgress,
  currentResponses,
  defByKey,
  employeeName,
  measurementResult,
  postsForOrder,
  tasksForUnit,
  unitById
} from "@/domain/selectors";
import { unitAttention } from "@/domain/ledger/attention";
import { unit1196View } from "@/domain/selectors";
import { requiredVsActual, rowsNeedingAttention } from "@/domain/ledger/requiredVsActual";
import { unitDisplayRef } from "@/domain/ids";
import type { Task } from "@/domain/types";
import { Exact, MockPhoto } from "@/components/bits";
import { IdentityBanner } from "@/components/IdentityBanner";
import { TaskControls } from "@/components/TaskControls";
import { Checklist } from "@/components/Checklist";
import { PhotoCapture } from "@/components/PhotoCapture";
import { RequiredVsActualPanel } from "@/components/RequiredVsActual";
import { Pump1196RequirementTable } from "@/components/Pump1196Requirement";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Modal } from "@/components/Drawer";

type Sheet = "checklist" | "parts" | "photo" | "measure" | "drawings" | null;

// A task a person can pick up right now, versus one that is held behind
// something else. Derived — never a stored "ready" flag.
function isActionable(task: Task): boolean {
  return task.status === "Ready" || task.status === "InProgress" || task.status === "Paused";
}
function isHeld(task: Task): boolean {
  return task.status === "Blocked" || task.status === "WaitingInspection";
}

function SummaryRow({
  label,
  value,
  detail,
  onOpen,
  testId
}: {
  label: string;
  value: string;
  detail?: string;
  onOpen: () => void;
  testId: string;
}) {
  return (
    <button type="button" className="summary-row" data-testid={testId} onClick={onOpen}>
      <span className="summary-label">{label}</span>
      <span className="summary-value">
        {value}
        {detail && <span className="summary-detail"> · {detail}</span>}
      </span>
      <span className="summary-open">Open</span>
    </button>
  );
}

export function UnitWorkspace({ unitId, asOf }: { unitId: string; asOf: string }) {
  const state = useAppState();
  const [sheet, setSheet] = useState<Sheet>(null);

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

  const tasks = tasksForUnit(state, unitId).filter((t) => t.status !== "Complete");
  const doNow = tasks.filter(isActionable);
  const held = tasks.filter(isHeld);

  const attention = unitAttention(state, unitId, asOf);
  const blocking = attention.filter((i) => i.severity === "Blocker");
  const waiting = attention.filter((i) => i.kind === "Incoming");

  const partRows = requiredVsActual(state.requirements, state.componentUsages, unitId);
  const partsNeedingAttention = rowsNeedingAttention(partRows);
  const installed = partRows.filter((r) => r.installedQuantity > 0).length;

  const cp = checklistProgress(state, unitId);
  // Out-of-range readings are evaluated against the item's own limits, not a
  // stored flag, so a corrected measurement stops counting immediately.
  const outOfRange = [...currentResponses(state, unitId).values()].filter((r) => {
    if (typeof r.value !== "number") return false;
    const def = defByKey(state, r.itemKey);
    return def ? measurementResult(def, r.value) === "out-of-range" : false;
  }).length;

  const photos = state.attachments.filter((a) => a.unitId === unitId && a.kind === "photo");
  const files = state.attachments.filter((a) => a.unitId === unitId && a.kind === "file");
  const recent = postsForOrder(state, unit.orderNumber, unitId).slice(0, 3);
  const swis = state.specialInstructions.filter((s) => s.unitId === unitId);
  // A 1196 line keeps its requirements in the legacy collection; both feed the
  // one Parts destination rather than resurrecting a separate 1196 tab.
  const view1196 = unit1196View(state, unitId);
  const changes = state.materialChanges.filter((m) => m.unitId === unitId);

  return (
    <>
      <IdentityBanner unit={unit} />
      <div className="page">
        {/* The hold reason is the single most important fact about a blocked
            Unit, so it leads — above even what you could otherwise start. */}
        {unit.holdReason && (
          <div className="attention-row blocker" data-testid="unit-hold">
            <span className="attention-kind">On hold</span>
            <div className="attention-body">
              <div className="attention-title">{unit.holdReason}</div>
            </div>
          </div>
        )}

        {/* --- Do now ------------------------------------------------- */}
        {doNow.length > 0 && (
          <section data-testid="unit-do-now">
            <h3 className="section-head">Do now ({doNow.length})</h3>
            {doNow.map((t) => (
              <div key={t.id} className="card" data-testid={`do-now-${t.id}`}>
                <b>{t.name}</b>
                {t.department && (
                  <span style={{ color: "var(--text-subtle)", fontSize: 13 }}> · {t.department}</span>
                )}
                <TaskControls task={t} big />
              </div>
            ))}
          </section>
        )}

        {/* --- Waiting on --------------------------------------------- */}
        {(waiting.length > 0 || held.length > 0) && (
          <section data-testid="unit-waiting">
            <h3 className="section-head">Waiting on ({waiting.length + held.length})</h3>
            {waiting.map((i) => (
              <div key={i.id} className="attention-row warning" data-testid={`waiting-${i.id}`}>
                <span className="attention-kind">Incoming</span>
                <div className="attention-body">
                  <div className="attention-title">{i.title}</div>
                  <div className="attention-detail">{i.detail}</div>
                </div>
              </div>
            ))}
            {held.map((t) => (
              <div key={t.id} className="attention-row warning" data-testid={`waiting-${t.id}`}>
                <span className="attention-kind">{t.status === "Blocked" ? "Blocked" : "Inspection"}</span>
                <div className="attention-body">
                  <div className="attention-title">{t.name}</div>
                  {t.blockReason && <div className="attention-detail">{t.blockReason}</div>}
                  <TaskControls task={t} />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* --- Blocking completion ------------------------------------ */}
        {blocking.length > 0 && (
          <section data-testid="unit-blocking">
            <h3 className="section-head danger">Blocking completion ({blocking.length})</h3>
            {blocking.map((i) => (
              <div key={i.id} className="attention-row blocker" data-testid={`blocking-${i.id}`}>
                <span className="attention-kind">{i.kind === "SubstitutionReview" ? "Review" : i.kind}</span>
                <div className="attention-body">
                  <div className="attention-title">{i.title}</div>
                  <div className="attention-detail">{i.detail}</div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* --- Special work instructions: this is WORK, not reference, so
            it sits above the summaries rather than behind a sheet. ------ */}
        {swis.length > 0 && (
          <section data-testid="unit-swis">
            <h3 className="section-head">Special work instructions ({swis.length})</h3>
            {swis.map((s) => (
              <div key={s.id} className="card" data-testid={`unit-swi-${s.id}`}>
                <b>{s.part}</b>: {s.instruction}
                <div style={{ fontSize: 13.5, marginTop: 4, color: "var(--text-subtle)" }}>
                  Completion measurement:{" "}
                  {s.completionMeasurement
                    ? `${s.completionMeasurement.value} ${s.completionMeasurement.unit}`
                    : "not recorded"}
                  {" · "}
                  <span className="badge save-pending">{s.verificationStatus}</span>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* --- Approved material change. Unit-scoped: an approved change on
            this pump never implies anything about a sibling. ------------ */}
        {changes.length > 0 && (
          <section data-testid="unit-changes">
            <h3 className="section-head">Approved material change</h3>
            {changes.map((mc) => (
              <div key={mc.id} className="card" data-testid={`unit-mc-${mc.id}`}>
                <b>
                  {mc.orderedMaterial} → {mc.proposedMaterial}
                </b>{" "}
                <span className={`badge ${mc.status === "Approved" ? "save-saved" : "save-pending"}`}>
                  {mc.status}
                </span>
                <div style={{ fontSize: 13.5, marginTop: 4, color: "var(--text-subtle)" }}>
                  {mc.reason} · requested by {employeeName(state, mc.requestedById)}
                  {mc.approvedById && <> · approved by {employeeName(state, mc.approvedById)}</>}
                  <br />
                  Affects <b>this Unit only</b>.
                </div>
              </div>
            ))}
          </section>
        )}

        {/* --- Summaries: counts, detail on demand --------------------- */}
        <section className="summary-list" data-testid="unit-summaries">
          {(partRows.length > 0 || view1196) && (
            <SummaryRow
              testId="summary-parts"
              label="Parts"
              value={
                partRows.length > 0
                  ? `${partRows.length - partsNeedingAttention.length} of ${partRows.length} resolved`
                  : `${view1196?.openRequirementLabels.length ?? 0} open`
              }
              detail={`${installed} installed${partsNeedingAttention.length > 0 ? ` · ${partsNeedingAttention.length} need attention` : ""}`}
              onOpen={() => setSheet("parts")}
            />
          )}
          <SummaryRow
            testId="summary-qc"
            label="QC"
            value={`${cp.done} of ${cp.total} complete`}
            detail={outOfRange > 0 ? `${outOfRange} out of range` : undefined}
            onOpen={() => setSheet("checklist")}
          />
          <SummaryRow
            testId="summary-photos"
            label="Photos"
            value={String(photos.length)}
            detail={files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"}` : undefined}
            onOpen={() => setSheet("photo")}
          />
          <SummaryRow
            testId="summary-drawings"
            label="Drawings"
            value={files.length > 0 ? String(files.length) : "None attached"}
            onOpen={() => setSheet("drawings")}
          />
        </section>

        {/* TaskControls already renders the handoff card for a paused task,
            so this screen must not render a second one. */}

        {/* --- Recent activity, not the whole feed -------------------- */}
        {recent.length > 0 && (
          <section data-testid="unit-recent-activity">
            <h3 className="section-head">Recent activity</h3>
            {recent.map((p) => (
              <div key={p.id} className="card" data-testid={`unit-post-${p.id}`}>
                <b>{employeeName(state, p.authorId)}</b>{" "}
                <span className="post-time">
                  <Exact at={p.at} />
                </span>
                <p style={{ margin: "4px 0 0" }}>{p.body}</p>
              </div>
            ))}
            <Link className="btn" href={`/units/${unitId}?tab=activity`} data-testid="unit-all-activity">
              All activity and comments
            </Link>
          </section>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          <Link className="btn" href={`/orders/${unit.orderNumber}`}>
            ← Order {unit.orderNumber}
          </Link>
          <Link className="btn" href={`/documents/${unitId}`}>
            Unit QC history preview
          </Link>
          <Link className="btn" href={`/units/${unitId}?tab=audit`}>
            Audit
          </Link>
        </div>
      </div>

      {/* --- Sheets: detail on demand -------------------------------- */}
      {sheet === "checklist" && (
        <Modal
          title={`Checklist — ${unitDisplayRef(unit)}`}
          subtitle={`${cp.done} of ${cp.total} complete`}
          onClose={() => setSheet(null)}
          footer={
            <button type="button" className="btn btn-primary" data-testid="checklist-done" onClick={() => setSheet(null)}>
              Done
            </button>
          }
        >
          <Checklist unitId={unitId} orderNumber={unit.orderNumber} />
        </Modal>
      )}

      {sheet === "parts" && (
        <Modal
          title={`Parts — ${unitDisplayRef(unit)}`}
          subtitle="Belongs to this Unit alone; never appears on a sibling."
          onClose={() => setSheet(null)}
          footer={
            <button type="button" className="btn btn-primary" data-testid="parts-done" onClick={() => setSheet(null)}>
              Done
            </button>
          }
        >
          <RequiredVsActualPanel unitId={unitId} />
          {view1196 && (
            <>
              <h4>1196 build scope — record what you actually used</h4>
              <Pump1196RequirementTable unitId={unitId} />
            </>
          )}
        </Modal>
      )}

      {sheet === "photo" && (
        <Modal
          title={`Photos and files — ${unitDisplayRef(unit)}`}
          onClose={() => setSheet(null)}
          footer={
            <button type="button" className="btn btn-primary" data-testid="photo-done" onClick={() => setSheet(null)}>
              Done
            </button>
          }
        >
          <PhotoCapture
            orderNumber={unit.orderNumber}
            unitId={unitId}
            targetRef={doNow[0]?.id ?? null}
            targetLabel={doNow[0] ? `Task: ${doNow[0].name}` : "Unit-level evidence"}
            big
          />
          <div className="thumb-grid" style={{ marginTop: 12 }}>
            {photos.map((a) => (
              <div key={a.id} data-testid={`attachment-${a.id}`}>
                <MockPhoto art={a.placeholderArt} caption={a.category} />
                <div style={{ fontSize: 12 }}>{a.fileName}</div>
                {/* Who captured it is part of the evidence, not a nicety. */}
                <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                  {employeeName(state, a.employeeId)} · <Exact at={a.at} />
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {sheet === "drawings" && (
        <Modal
          title={`Drawings and documents — ${unitDisplayRef(unit)}`}
          onClose={() => setSheet(null)}
          footer={
            <button type="button" className="btn btn-primary" data-testid="drawings-done" onClick={() => setSheet(null)}>
              Done
            </button>
          }
        >
          {view1196?.config?.packageDrawing && (
            <div className="card" data-testid="unit-pump1196-drawing">
              <b>Build to drawing:</b> {view1196.config.packageDrawing.reference}
              {view1196.config.packageDrawing.kind === "CustomBaseplate" && (
                <> — Custom baseplate. {view1196.config.packageDrawing.note}</>
              )}
            </div>
          )}
          {files.length === 0 && !view1196?.config?.packageDrawing ? (
            <p>No drawings or documents attached to this Unit.</p>
          ) : (
            files.map((f) => (
              <div key={f.id} className="attachment-card" data-testid={`attachment-${f.id}`}>
                {f.fileName}
                <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>
                  {" "}
                  added by {employeeName(state, f.employeeId)}
                </span>
              </div>
            ))
          )}
        </Modal>
      )}
    </>
  );
}

/** The full activity feed, reached from the Unit's recent-activity section. */
export function UnitActivity({ unitId }: { unitId: string }) {
  const state = useAppState();
  const unit = unitById(state, unitId);
  if (!unit) return null;
  return <ActivityFeed orderNumber={unit.orderNumber} unitId={unitId} />;
}
