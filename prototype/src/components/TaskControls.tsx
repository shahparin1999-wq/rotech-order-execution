"use client";

// Start / pause (with mandatory handoff) / resume / complete / block /
// resolve controls for a task. Used by the Unit view and the tablet view.

import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { employeeName } from "@/domain/selectors";
import type { Task } from "@/domain/types";
import { Exact, TaskStatusBadge } from "./bits";

function PauseDialog({ task, onClose, big }: { task: Task; onClose: () => void; big?: boolean }) {
  const dispatch = useAppDispatch();
  const [form, setForm] = useState({
    reason: "",
    completedWork: "",
    remainingWork: "",
    location: "",
    storageState: "",
    blockerItem: "",
    note: ""
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const required: Array<[keyof typeof form, string]> = [
    ["reason", "Reason"],
    ["completedWork", "Completed work"],
    ["remainingWork", "Remaining work"],
    ["location", "Current physical location"],
    ["storageState", "Storage / safety state"]
  ];
  const missing = required.filter(([k]) => !form[k].trim());
  return (
    <div className="card" style={{ background: "var(--warn-soft)", marginTop: 10 }} data-testid="pause-dialog">
      <h3 style={{ marginBottom: 8 }}>Pause / Handoff — {task.name}</h3>
      <div className="composer">
        {required.map(([k, label]) => (
          <label key={k} style={{ fontSize: 13.5 }}>
            {label} <span style={{ color: "var(--danger)" }}>*</span>
            <input value={form[k]} onChange={set(k)} data-testid={`handoff-${k}`} />
          </label>
        ))}
        <label style={{ fontSize: 13.5 }}>
          Blocker or missing item (optional)
          <input value={form.blockerItem} onChange={set("blockerItem")} data-testid="handoff-blockerItem" />
        </label>
        <label style={{ fontSize: 13.5 }}>
          Note (optional)
          <textarea rows={2} value={form.note} onChange={set("note")} data-testid="handoff-note" />
        </label>
        <div className="composer-actions">
          <button
            className={`btn btn-warn ${big ? "btn-big" : ""}`}
            disabled={missing.length > 0}
            data-testid="confirm-pause"
            onClick={() => {
              dispatch({
                type: "pauseTask",
                taskId: task.id,
                input: {
                  reason: form.reason,
                  completedWork: form.completedWork,
                  remainingWork: form.remainingWork,
                  location: form.location,
                  storageState: form.storageState,
                  blockerItem: form.blockerItem || null,
                  note: form.note || null
                }
              });
              onClose();
            }}
          >
            Confirm pause with handoff
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
        {missing.length > 0 && (
          <p style={{ fontSize: 12.5, color: "var(--danger)", margin: 0 }}>
            Required before pausing: {missing.map(([, l]) => l).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

export function HandoffCard({ task }: { task: Task }) {
  const state = useAppState();
  if (!task.handoff) return null;
  const h = task.handoff;
  return (
    <div className="card" style={{ background: "var(--accent-soft)" }} data-testid={`handoff-card-${task.id}`}>
      <b>Handoff from {employeeName(state, h.byId)}</b>{" "}
      <span className="post-time">
        <Exact at={h.at} />
      </span>
      <table className="data" style={{ marginTop: 6 }}>
        <tbody>
          <tr><td><b>Reason</b></td><td>{h.reason}</td></tr>
          <tr><td><b>Completed</b></td><td>{h.completedWork}</td></tr>
          <tr><td><b>Remaining</b></td><td>{h.remainingWork}</td></tr>
          <tr><td><b>Location</b></td><td>{h.location}</td></tr>
          <tr><td><b>Storage / safety</b></td><td>{h.storageState}</td></tr>
          {h.blockerItem && <tr><td><b>Blocker</b></td><td>{h.blockerItem}</td></tr>}
          {h.note && <tr><td><b>Note</b></td><td>{h.note}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function TaskControls({ task, big = false }: { task: Task; big?: boolean }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [pausing, setPausing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const cls = big ? "btn btn-big" : "btn";

  return (
    <div data-testid={`task-controls-${task.id}`}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <TaskStatusBadge status={task.status} />
        <span style={{ fontSize: 13, color: "var(--text-subtle)" }}>
          Owner: {employeeName(state, task.ownerId)}
        </span>
      </div>
      {task.status === "Paused" && <HandoffCard task={task} />}
      {task.blockReason && (
        <p style={{ color: "var(--danger)", fontWeight: 600 }}>⛔ {task.blockReason}</p>
      )}
      <div className={big ? "big-actions" : "composer-actions"} style={big ? {} : { marginTop: 8 }}>
        {(task.status === "Ready" || task.status === "NotStarted") && (
          <button className={`${cls} btn-primary`} onClick={() => dispatch({ type: "startTask", taskId: task.id })}>
            {big && <span className="icon">▶️</span>}Start Work
          </button>
        )}
        {task.status === "Paused" && (
          <button className={`${cls} btn-primary`} data-testid={`resume-${task.id}`} onClick={() => dispatch({ type: "resumeTask", taskId: task.id })}>
            {big && <span className="icon">▶️</span>}Resume Work
          </button>
        )}
        {task.status === "InProgress" && (
          <>
            <button className={`${cls} btn-ok`} data-testid={`complete-${task.id}`} onClick={() => dispatch({ type: "completeTask", taskId: task.id })}>
              {big && <span className="icon">✅</span>}Complete Step
            </button>
            <button className={`${cls} btn-warn`} data-testid={`pause-${task.id}`} onClick={() => setPausing(true)}>
              {big && <span className="icon">⏸️</span>}Pause / Handoff
            </button>
          </>
        )}
        {task.status !== "Blocked" && task.status !== "Complete" && (
          <button className={`${cls} btn-danger`} onClick={() => setBlocking(true)}>
            {big && <span className="icon">🚩</span>}Report Problem
          </button>
        )}
        {task.status === "Blocked" && (
          <button
            className={`${cls} btn-primary`}
            data-testid={`resolve-${task.id}`}
            onClick={() => dispatch({ type: "resolveBlocker", taskId: task.id, note: "Blocker resolved (mock)" })}
          >
            {big && <span className="icon">🟢</span>}Resolve Blocker
          </button>
        )}
      </div>
      {pausing && <PauseDialog task={task} onClose={() => setPausing(false)} big={big} />}
      {blocking && (
        <div className="card" style={{ background: "var(--danger-soft)", marginTop: 10 }}>
          <label style={{ fontSize: 13.5 }}>
            Blocking reason <span style={{ color: "var(--danger)" }}>*</span>
            <input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} data-testid="block-reason" />
          </label>
          <div className="composer-actions" style={{ marginTop: 8 }}>
            <button
              className="btn btn-danger"
              disabled={!blockReason.trim()}
              onClick={() => {
                dispatch({ type: "blockTask", taskId: task.id, reason: blockReason });
                setBlocking(false);
                setBlockReason("");
              }}
            >
              Confirm block
            </button>
            <button className="btn" onClick={() => setBlocking(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
