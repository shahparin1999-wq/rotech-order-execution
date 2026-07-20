// Customer/Contact creation and the read-side helpers that scope orders and
// tasks to a customer (Fluent work-management expansion).

import { describe, expect, it } from "vitest";
import { buildInitialState, CUSTOMER_ACME, CUSTOMER_THIRDCO, ORDER_NO } from "@/domain/fixtures";
import { createContact, createCustomer } from "@/domain/actions";
import {
  contactsForCustomer,
  customerById,
  customerName,
  ordersForCustomer,
  tasksForCustomer
} from "@/domain/selectors";

describe("Customer creation", () => {
  it("creates a customer with an audit event and a stable, sequential id", () => {
    let state = buildInitialState();
    const before = state.customers.length;
    state = createCustomer(state, "e-sarah", {
      name: "New Fictional Client",
      city: "Example City",
      region: "TX",
      notes: null
    });
    expect(state.customers).toHaveLength(before + 1);
    const created = state.customers.at(-1)!;
    expect(created.name).toBe("New Fictional Client");
    expect(customerById(state, created.id)).toBe(created);
    expect(customerName(state, created.id)).toBe("New Fictional Client");
    const audit = state.auditEvents.find((e) => e.targetId === created.id && e.action === "customer.created");
    expect(audit).toBeDefined();
  });

  it("rejects a blank customer name", () => {
    const state = buildInitialState();
    expect(() =>
      createCustomer(state, "e-sarah", { name: "   ", city: "Example City", region: "TX" })
    ).toThrow(/name is required/i);
  });

  it("customerName falls back gracefully for an unknown/null id", () => {
    const state = buildInitialState();
    expect(customerName(state, null)).toBe("Unknown customer");
    expect(customerName(state, "cust-does-not-exist")).toBe("Unknown customer");
  });
});

describe("Contact creation", () => {
  it("attaches a contact to an existing customer", () => {
    let state = buildInitialState();
    const before = contactsForCustomer(state, CUSTOMER_ACME).length;
    state = createContact(state, "e-sarah", CUSTOMER_ACME, {
      name: "New Contact",
      email: "new.contact@example.com",
      phone: null,
      role: "Buyer"
    });
    const contacts = contactsForCustomer(state, CUSTOMER_ACME);
    expect(contacts).toHaveLength(before + 1);
    expect(contacts.at(-1)!.name).toBe("New Contact");
  });

  it("rejects a contact for an unknown customer", () => {
    const state = buildInitialState();
    expect(() =>
      createContact(state, "e-sarah", "cust-does-not-exist", { name: "Nobody" })
    ).toThrow(/Unknown customer/);
  });

  it("rejects a blank contact name", () => {
    const state = buildInitialState();
    expect(() => createContact(state, "e-sarah", CUSTOMER_ACME, { name: "  " })).toThrow(
      /name is required/i
    );
  });
});

describe("Customer detail scoping", () => {
  it("ordersForCustomer and tasksForCustomer only return that customer's records", () => {
    const state = buildInitialState();
    const acmeOrders = ordersForCustomer(state, CUSTOMER_ACME);
    expect(acmeOrders.some((o) => o.orderNumber === ORDER_NO)).toBe(true);
    expect(acmeOrders.every((o) => o.customerId === CUSTOMER_ACME)).toBe(true);

    const acmeTasks = tasksForCustomer(state, CUSTOMER_ACME);
    expect(acmeTasks.every((t) => t.customerId === CUSTOMER_ACME)).toBe(true);
    expect(acmeTasks.length).toBeGreaterThan(0);
  });

  it("a customer with no orders/tasks yet reports empty lists, not an error", () => {
    const state = buildInitialState();
    expect(ordersForCustomer(state, CUSTOMER_THIRDCO)).toHaveLength(0);
    expect(tasksForCustomer(state, CUSTOMER_THIRDCO)).toHaveLength(0);
  });
});
