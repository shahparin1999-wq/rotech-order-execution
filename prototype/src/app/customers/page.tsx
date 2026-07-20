"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppState } from "@/store/StoreProvider";
import { ordersForCustomer, tasksForCustomer } from "@/domain/selectors";
import { PlusIcon } from "@/components/icons";
import { NewCustomerDrawer } from "@/components/NewCustomerDrawer";

export default function CustomersPage() {
  const state = useAppState();
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);

  const customers = state.customers
    .filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <div className="command-bar">
        <h1 className="command-bar-title">Customers</h1>
        <input
          placeholder="Search customers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 260 }}
          aria-label="Search customers"
        />
        <button type="button" className="btn btn-primary" data-testid="new-customer-button" onClick={() => setShowNew(true)}>
          <PlusIcon size={14} /> New customer
        </button>
      </div>

      <div className="data-grid-wrap">
        <table className="data-grid" data-testid="customers-grid">
          <thead>
            <tr>
              <th>Customer</th>
              <th>City</th>
              <th>Region</th>
              <th>Open orders</th>
              <th>Contacts</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const orders = ordersForCustomer(state, c.id);
              const contacts = state.contacts.filter((ct) => ct.customerId === c.id);
              const tasks = tasksForCustomer(state, c.id);
              return (
                <tr key={c.id} data-testid={`customer-row-${c.id}`}>
                  <td>
                    <Link href={`/customers/${c.id}`}>
                      <b>{c.name}</b>
                    </Link>
                  </td>
                  <td>{c.city}</td>
                  <td>{c.region}</td>
                  <td>{orders.length}{tasks.length > 0 ? ` · ${tasks.length} task(s)` : ""}</td>
                  <td>{contacts.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {customers.length === 0 && (
          <p style={{ padding: 16, color: "var(--text-subtle)" }}>No customers match “{query}”.</p>
        )}
      </div>

      {showNew && <NewCustomerDrawer onClose={() => setShowNew(false)} />}
    </div>
  );
}
