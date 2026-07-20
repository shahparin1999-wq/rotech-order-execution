"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import {
  customerById,
  employeeName,
  isOrderCompleted,
  ordersForCustomer,
  orderProgress,
  tasksForCustomer
} from "@/domain/selectors";
import { Exact, PriorityBadge, TaskStatusBadge } from "@/components/bits";
import { PlusIcon } from "@/components/icons";
import { NewTaskDrawer } from "@/components/NewTaskDrawer";
import { FieldGroup } from "@/components/Drawer";

function CustomerDetail({ customerId }: { customerId: string }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const customer = customerById(state, customerId);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState("");

  if (!customer) {
    return (
      <div className="page">
        <h1>Customer not found</h1>
        <Link href="/customers">Back to customers</Link>
      </div>
    );
  }

  const contacts = state.contacts.filter((c) => c.customerId === customerId);
  const orders = ordersForCustomer(state, customerId);
  const openOrders = orders.filter((o) => !isOrderCompleted(state, o.orderNumber));
  const completedOrders = orders.filter((o) => isOrderCompleted(state, o.orderNumber));
  const tasks = tasksForCustomer(state, customerId);
  const activity = state.auditEvents
    .filter((e) => e.targetId === customerId || orders.some((o) => o.orderNumber === e.targetId))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 15);

  return (
    <div className="page">
      <div className="command-bar">
        <h1 className="command-bar-title">{customer.name}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowNewTask(true)}>
          <PlusIcon size={14} /> New task
        </button>
      </div>
      <p style={{ color: "var(--text-subtle)" }}>
        {customer.city}, {customer.region} · Customer since {new Date(customer.createdAt).toLocaleDateString("en-CA")}
      </p>
      {customer.notes && <p>{customer.notes}</p>}

      <div className="grid-2">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Contacts</h3>
            <button type="button" className="btn" data-testid="add-contact-button" onClick={() => setShowAddContact((v) => !v)}>
              <PlusIcon size={12} /> Add contact
            </button>
          </div>
          {showAddContact && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <FieldGroup label="Name" required>
                <input data-testid="new-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </FieldGroup>
              <FieldGroup label="Email">
                <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </FieldGroup>
              <FieldGroup label="Role">
                <input value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
              </FieldGroup>
              <div className="composer-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!contactName.trim()}
                  data-testid="submit-new-contact"
                  onClick={() => {
                    dispatch({
                      type: "createContact",
                      customerId,
                      input: { name: contactName.trim(), email: contactEmail.trim() || null, role: contactRole.trim() || null }
                    });
                    setContactName("");
                    setContactEmail("");
                    setContactRole("");
                    setShowAddContact(false);
                  }}
                >
                  Save contact
                </button>
                <button type="button" className="btn" onClick={() => setShowAddContact(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {contacts.length === 0 && !showAddContact && <p>No contacts yet.</p>}
          {contacts.map((c) => (
            <div key={c.id} className="record-list-item" data-testid={`contact-${c.id}`}>
              <b>{c.name}</b> {c.role && <span style={{ color: "var(--text-subtle)" }}>· {c.role}</span>}
              <div style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>
                {c.email ?? "No email"} {c.phone && `· ${c.phone}`}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Open orders ({openOrders.length})</h3>
          {openOrders.length === 0 && <p>No open orders.</p>}
          {openOrders.map((o) => {
            const p = orderProgress(state, o.orderNumber);
            return (
              <Link key={o.orderNumber} href={`/orders/${o.orderNumber}`} className="record-list-item">
                <b>{o.orderNumber}</b> · due {o.dueDate} · {p.complete.length}/{p.total} complete
              </Link>
            );
          })}
          <h3 style={{ marginTop: 14 }}>Completed orders ({completedOrders.length})</h3>
          {completedOrders.length === 0 && <p>None yet.</p>}
          {completedOrders.map((o) => (
            <Link key={o.orderNumber} href={`/orders/${o.orderNumber}`} className="record-list-item">
              <b>{o.orderNumber}</b> · due {o.dueDate}
            </Link>
          ))}
        </div>

        <div className="card">
          <h3>Linked tasks ({tasks.length})</h3>
          {tasks.length === 0 && <p>No tasks linked to this customer yet.</p>}
          {tasks.map((t) => (
            <div key={t.id} className="record-list-item" data-testid={`customer-task-${t.id}`}>
              <b>{t.name}</b> <TaskStatusBadge status={t.status} /> <PriorityBadge priority={t.priority} />
              <div style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>
                {t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString("en-CA")}` : "No due date"} · owner {employeeName(state, t.ownerId)}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Activity</h3>
          {activity.length === 0 && <p>No recorded activity yet.</p>}
          {activity.map((e) => (
            <div key={e.id} style={{ marginBottom: 8, fontSize: 13 }}>
              <b>{employeeName(state, e.actorId)}</b> <span style={{ color: "var(--text-subtle)" }}>{e.action}</span>
              <div style={{ color: "var(--text-subtle)", fontSize: 12 }}>
                {e.detail} · <Exact at={e.at} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {showNewTask && (
        <NewTaskDrawer onClose={() => setShowNewTask(false)} defaultCustomerId={customerId} />
      )}
    </div>
  );
}

export default function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  return <CustomerDetail customerId={decodeURIComponent(customerId)} />;
}
