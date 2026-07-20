"use client";

import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { PLANNER_BUCKETS, PLANNER_BUCKET_LABELS, unitsForOrder } from "@/domain/selectors";
import type { Department, PlannerBucket, Priority } from "@/domain/types";
import { Drawer, FieldGroup } from "./Drawer";

// One shared creation drawer used from Planner, an Order, a Unit, a
// Customer, and My Work - each caller pins whichever context it already
// knows (orderNumber/unitId/customerId) so the created task can never
// silently attach to the wrong record.
export function NewTaskDrawer({
  onClose,
  defaultOrderNumber = null,
  defaultUnitId = null,
  defaultCustomerId = null
}: {
  onClose: () => void;
  defaultOrderNumber?: string | null;
  defaultUnitId?: string | null;
  defaultCustomerId?: string | null;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [orderNumber, setOrderNumber] = useState<string>(defaultOrderNumber ?? "");
  const [unitId, setUnitId] = useState<string>(defaultUnitId ?? "");
  const [customerId, setCustomerId] = useState<string>(defaultCustomerId ?? "");
  const [bucket, setBucket] = useState<PlannerBucket>("TBC");
  const [department, setDepartment] = useState<Department | "">("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");

  const canSubmit = name.trim().length > 0;
  const unitsForSelectedOrder = orderNumber ? unitsForOrder(state, orderNumber) : [];

  return (
    <Drawer
      title="New task"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            data-testid="submit-new-task"
            onClick={() => {
              dispatch({
                type: "createTask",
                input: {
                  name: name.trim(),
                  description: description.trim() || null,
                  orderNumber: unitId ? undefined : orderNumber || null,
                  unitId: unitId || null,
                  customerId: customerId || null,
                  bucket,
                  department: department || null,
                  priority,
                  dueDate: dueDate || null,
                  assigneeIds: assigneeId ? [assigneeId] : []
                }
              });
              onClose();
            }}
          >
            Create task
          </button>
        </>
      }
    >
      <FieldGroup label="Title" required>
        <input data-testid="new-task-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </FieldGroup>
      <FieldGroup label="Description">
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </FieldGroup>

      <FieldGroup label="Order (optional)">
        <select
          data-testid="new-task-order"
          value={orderNumber}
          onChange={(e) => {
            setOrderNumber(e.target.value);
            setUnitId("");
          }}
        >
          <option value="">No order (general/customer task)</option>
          {state.orders.map((o) => (
            <option key={o.orderNumber} value={o.orderNumber}>
              {o.orderNumber}
            </option>
          ))}
        </select>
      </FieldGroup>

      {orderNumber && (
        <FieldGroup label="Unit (optional)">
          <select data-testid="new-task-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">No specific Unit</option>
            {unitsForSelectedOrder.map((u) => (
              <option key={u.unitId} value={u.unitId}>
                {u.unitId}
              </option>
            ))}
          </select>
        </FieldGroup>
      )}

      {!orderNumber && (
        <FieldGroup label="Customer (optional)">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">No customer</option>
            {state.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FieldGroup>
      )}

      <div className="field-row">
        <FieldGroup label="Bucket">
          <select data-testid="new-task-bucket" value={bucket} onChange={(e) => setBucket(e.target.value as PlannerBucket)}>
            {PLANNER_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {PLANNER_BUCKET_LABELS[b]}
              </option>
            ))}
          </select>
        </FieldGroup>
        <FieldGroup label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>
        </FieldGroup>
      </div>

      <div className="field-row">
        <FieldGroup label="Department">
          <select
            data-testid="new-task-department"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department | "")}
          >
            <option value="">No specific department</option>
            <option value="Machining">Machining</option>
            <option value="Assembly">Assembly</option>
            <option value="Quality">Quality</option>
            <option value="Shipping">Shipping</option>
            <option value="Coordination">Coordination</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Due date">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FieldGroup>
      </div>

      <div className="field-row">
        <FieldGroup label="Assignee">
          <select data-testid="new-task-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </FieldGroup>
      </div>
    </Drawer>
  );
}
