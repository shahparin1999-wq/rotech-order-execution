"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import {
  employeeName,
  isDueThisWeek,
  isOverdue,
  PLANNER_BUCKETS,
  PLANNER_BUCKET_LABELS
} from "@/domain/selectors";
import type { PlannerBucket, Task } from "@/domain/types";
import { PriorityBadge, TaskStatusBadge } from "@/components/bits";
import { GridIcon, PlannerIcon, PlusIcon } from "@/components/icons";
import { NewTaskDrawer } from "@/components/NewTaskDrawer";

function DueBadge({ task }: { task: Task }) {
  if (!task.dueDate) return null;
  if (isOverdue(task.dueDate)) return <span className="badge s-blocked">Overdue</span>;
  if (isDueThisWeek(task.dueDate)) return <span className="badge save-pending">Due soon</span>;
  return null;
}

function PlannerCard({ task, onMove }: { task: Task; onMove: (bucket: PlannerBucket) => void }) {
  const state = useAppState();
  return (
    <div
      className="planner-card"
      draggable
      data-testid={`planner-card-${task.id}`}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
    >
      <div className="planner-card-title">
        {task.unitId ? (
          <Link href={`/units/${task.unitId}`}>{task.name}</Link>
        ) : (
          task.name
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
        {task.orderNumber ?? (task.customerId ? "Customer task" : "General")}
        {task.unitId ? ` · ${task.unitId}` : ""}
      </div>
      <div className="planner-card-meta">
        <TaskStatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        <DueBadge task={task} />
      </div>
      <div className="planner-card-meta">
        <span style={{ fontSize: 11.5 }}>{employeeName(state, task.ownerId)}</span>
        <select
          className="move-select"
          data-testid={`move-select-${task.id}`}
          value={task.bucket}
          onChange={(e) => onMove(e.target.value as PlannerBucket)}
          aria-label={`Move ${task.name} to bucket`}
        >
          {PLANNER_BUCKETS.map((b) => (
            <option key={b} value={b}>
              {PLANNER_BUCKET_LABELS[b]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [view, setView] = useState<"board" | "grid">("board");
  const [orderFilter, setOrderFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dragOverBucket, setDragOverBucket] = useState<PlannerBucket | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);

  const tasks = state.tasks.filter((t) => {
    if (orderFilter && t.orderNumber !== orderFilter) return false;
    if (assigneeFilter && !t.assigneeIds.includes(assigneeFilter) && t.ownerId !== assigneeFilter) return false;
    return true;
  });

  const move = (taskId: string, bucket: PlannerBucket) => {
    dispatch({ type: "moveTaskBucket", taskId, bucket });
  };

  return (
    <div className="page">
      <div className="command-bar">
        <h1 className="command-bar-title">Planner</h1>
        <select value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)} aria-label="Filter by order" data-testid="planner-order-filter">
          <option value="">Order: any</option>
          {state.orders.map((o) => (
            <option key={o.orderNumber} value={o.orderNumber}>{o.orderNumber}</option>
          ))}
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} aria-label="Filter by assignee" data-testid="planner-assignee-filter">
          <option value="">Assignee: any</option>
          {state.employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <button type="button" className={`btn ${view === "board" ? "btn-primary" : ""}`} onClick={() => setView("board")}>
          <PlannerIcon size={14} /> Board
        </button>
        <button type="button" className={`btn ${view === "grid" ? "btn-primary" : ""}`} onClick={() => setView("grid")}>
          <GridIcon size={14} /> Grid
        </button>
        <button type="button" className="btn btn-primary" data-testid="new-task-button" onClick={() => setShowNewTask(true)}>
          <PlusIcon size={14} /> New task
        </button>
      </div>

      {view === "board" ? (
        <div className="planner-board" data-testid="planner-board">
          {PLANNER_BUCKETS.map((bucket) => {
            const bucketTasks = tasks.filter((t) => t.bucket === bucket);
            return (
              <div
                key={bucket}
                className={`planner-column ${dragOverBucket === bucket ? "drag-over" : ""}`}
                data-testid={`planner-column-${bucket}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverBucket(bucket);
                }}
                onDragLeave={() => setDragOverBucket((b) => (b === bucket ? null : b))}
                onDrop={(e) => {
                  e.preventDefault();
                  const taskId = e.dataTransfer.getData("text/plain");
                  if (taskId) move(taskId, bucket);
                  setDragOverBucket(null);
                }}
              >
                <div className="planner-column-header">
                  {PLANNER_BUCKET_LABELS[bucket]} ({bucketTasks.length})
                </div>
                {bucketTasks.map((t) => (
                  <PlannerCard key={t.id} task={t} onMove={(b) => move(t.id, b)} />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="data-grid-wrap">
          <table className="data-grid" data-testid="planner-grid">
            <thead>
              <tr>
                <th>Title</th>
                <th>Order / Unit</th>
                <th>Bucket</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Due date</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} data-testid={`planner-grid-row-${t.id}`}>
                  <td>{t.name}</td>
                  <td>{t.unitId ?? t.orderNumber ?? (t.customerId ? "Customer" : "—")}</td>
                  <td>{PLANNER_BUCKET_LABELS[t.bucket]}</td>
                  <td><TaskStatusBadge status={t.status} /></td>
                  <td>{employeeName(state, t.ownerId)}</td>
                  <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-CA") : "—"}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && <p style={{ padding: 16, color: "var(--text-subtle)" }}>No tasks match the current filters.</p>}
        </div>
      )}

      {showNewTask && <NewTaskDrawer onClose={() => setShowNewTask(false)} />}
    </div>
  );
}
