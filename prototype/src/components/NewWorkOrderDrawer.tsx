"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import type { Facility, Priority } from "@/domain/types";
import { Drawer, FieldGroup } from "./Drawer";
import { NewCustomerDrawer } from "./NewCustomerDrawer";
import { ImportCpqPackageDrawer } from "./ImportCpqPackageDrawer";

export function NewWorkOrderDrawer({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [orderNumber, setOrderNumber] = useState("");
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? "");
  const [customerPo, setCustomerPo] = useState("");
  const [description, setDescription] = useState("");
  const [facility, setFacility] = useState<Facility>("Mississauga");
  const [orderType, setOrderType] = useState("Bare pump end");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [coordinatorId, setCoordinatorId] = useState(state.employees.find((e) => e.department === "Coordination")?.id ?? state.employees[0].id);
  const [instructions, setInstructions] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  const canSubmit =
    orderNumber.trim() &&
    customerId &&
    customerPo.trim() &&
    description.trim() &&
    dueDate &&
    model.trim() &&
    size.trim() &&
    material.trim() &&
    quantity >= 1 &&
    !state.orders.some((o) => o.orderNumber === orderNumber.trim());

  const orderNumberTaken = orderNumber.trim() && state.orders.some((o) => o.orderNumber === orderNumber.trim());

  // Defined after all hooks so the early return below never skips a hook
  // (React requires an unconditional, stable hook order).
  const modeToggle = (
    <div className="tabs" data-testid="new-order-mode" style={{ marginBottom: 12 }}>
      <button
        type="button"
        className={`tab ${mode === "manual" ? "active" : ""}`}
        data-testid="mode-manual"
        onClick={() => setMode("manual")}
      >
        Create manually
      </button>
      <button
        type="button"
        className={`tab ${mode === "import" ? "active" : ""}`}
        data-testid="import-cpq-toggle"
        onClick={() => setMode("import")}
      >
        Import CPQ package
      </button>
    </div>
  );

  if (mode === "import") {
    return <ImportCpqPackageDrawer onClose={onClose} toggle={modeToggle} />;
  }

  return (
    <>
      <Drawer
        title="New work order"
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
              data-testid="submit-new-work-order"
              onClick={() => {
                dispatch({
                  type: "createWorkOrder",
                  input: {
                    orderNumber: orderNumber.trim(),
                    customerId,
                    customerPo: customerPo.trim(),
                    description: description.trim(),
                    facility,
                    orderType,
                    priority,
                    dueDate,
                    coordinatorId,
                    instructions: instructions.trim() || undefined,
                    quantity,
                    model: model.trim(),
                    size: size.trim(),
                    material: material.trim()
                  }
                });
                onClose();
                router.push(`/orders/${orderNumber.trim()}`);
              }}
            >
              Create work order
            </button>
          </>
        }
      >
        {modeToggle}
        <FieldGroup label="Order number" required>
          <input
            data-testid="new-order-number"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="e.g. SAMPLE1003"
          />
          {orderNumberTaken && (
            <span style={{ fontSize: 12, color: "var(--danger)" }}>
              An order with this number already exists.
            </span>
          )}
        </FieldGroup>

        <FieldGroup label="Customer" required>
          <div style={{ display: "flex", gap: 6 }}>
            <select
              data-testid="new-order-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={{ flex: 1 }}
            >
              {state.customers.length === 0 && <option value="">No customers yet</option>}
              {state.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => setShowNewCustomer(true)}>
              + New
            </button>
          </div>
        </FieldGroup>

        <FieldGroup label="Customer PO" required>
          <input data-testid="new-order-po" value={customerPo} onChange={(e) => setCustomerPo(e.target.value)} />
        </FieldGroup>

        <FieldGroup label="Description" required>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Order description" />
        </FieldGroup>

        <div className="field-row">
          <FieldGroup label="Location">
            <select value={facility} onChange={(e) => setFacility(e.target.value as Facility)}>
              <option value="Mississauga">Mississauga</option>
              <option value="Houston">Houston</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Order type">
            <input value={orderType} onChange={(e) => setOrderType(e.target.value)} />
          </FieldGroup>
        </div>

        <div className="field-row">
          <FieldGroup label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Due date" required>
            <input type="date" data-testid="new-order-duedate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FieldGroup>
        </div>

        <FieldGroup label="Coordinator">
          <select value={coordinatorId} onChange={(e) => setCoordinatorId(e.target.value)}>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="Instructions">
          <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </FieldGroup>

        <FieldGroup label="Quantity" required>
          <input
            type="number"
            min={1}
            data-testid="new-order-quantity"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
          <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            Creates {quantity} independent Unit{quantity === 1 ? "" : "s"}, each with its own stable Unit ID.
          </span>
        </FieldGroup>

        <div className="field-row">
          <FieldGroup label="Model" required>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. 1196" />
          </FieldGroup>
          <FieldGroup label="Size" required>
            <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 3x4-13" />
          </FieldGroup>
        </div>

        <FieldGroup label="Material" required>
          <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. 316SS" />
        </FieldGroup>
      </Drawer>

      {showNewCustomer && (
        <NewCustomerDrawer
          onClose={() => setShowNewCustomer(false)}
          onCreated={(newCustomerId) => {
            setCustomerId(newCustomerId);
            setShowNewCustomer(false);
          }}
        />
      )}
    </>
  );
}
