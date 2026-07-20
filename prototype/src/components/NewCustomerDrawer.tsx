"use client";

import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { Drawer, FieldGroup } from "./Drawer";

// Usable both from the Customers directory (no callback needed) and from
// inside the New Work Order drawer (onCreated selects the new customer).
export function NewCustomerDrawer({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated?: (customerId: string) => void;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit = name.trim().length > 0;

  return (
    <Drawer
      title="New customer"
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
            data-testid="submit-new-customer"
            onClick={() => {
              const nextId = `cust-${state.nextId}`;
              dispatch({
                type: "createCustomer",
                input: { name: name.trim(), city: city.trim(), region: region.trim(), notes: notes.trim() || null }
              });
              onCreated?.(nextId);
              onClose();
            }}
          >
            Create customer
          </button>
        </>
      }
    >
      <FieldGroup label="Customer name" required>
        <input data-testid="new-customer-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </FieldGroup>
      <div className="field-row">
        <FieldGroup label="City">
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Region/state">
          <input value={region} onChange={(e) => setRegion(e.target.value)} />
        </FieldGroup>
      </div>
      <FieldGroup label="Notes">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FieldGroup>
    </Drawer>
  );
}
