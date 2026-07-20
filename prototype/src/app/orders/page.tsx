"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppState } from "@/store/StoreProvider";
import {
  applyOrderFilters,
  applySavedView,
  customerName,
  employeeName,
  groupOrdersBy,
  orderFlags,
  orderProgress,
  type OrderFilters,
  type OrderSortKey,
  type SavedView,
  searchOrders,
  sortOrders
} from "@/domain/selectors";
import type { Order } from "@/domain/types";
import { PriorityBadge, UnitStatusBadge } from "@/components/bits";
import { FilterIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { NewWorkOrderDrawer } from "@/components/NewWorkOrderDrawer";

const SAVED_VIEWS: Array<{ id: SavedView; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "due-this-week", label: "Due this week" },
  { id: "overdue", label: "Overdue" },
  { id: "blocked", label: "Blocked" },
  { id: "awaiting-quality", label: "Awaiting quality" },
  { id: "completed", label: "Completed" }
];

const ALL_COLUMNS = [
  "orderNumber", "customer", "po", "description", "dueDate", "status",
  "progress", "location", "type", "coordinator", "priority", "updated", "flags"
] as const;
type ColumnKey = (typeof ALL_COLUMNS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  orderNumber: "Order",
  customer: "Customer",
  po: "PO",
  description: "Description",
  dueDate: "Due date",
  status: "Status",
  progress: "Progress",
  location: "Location",
  type: "Type",
  coordinator: "Coordinator",
  priority: "Priority",
  updated: "Updated",
  flags: "Flags"
};

export default function OrdersPage() {
  const state = useAppState();
  const [query, setQuery] = useState("");
  const [savedView, setSavedView] = useState<SavedView>("all");
  const [locationView, setLocationView] = useState<string | null>(null);
  const [filters, setFilters] = useState<OrderFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<OrderSortKey>("dueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState<"none" | "status" | "facility" | "customer" | "priority">("none");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(ALL_COLUMNS));
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const locations = useMemo(
    () => [...new Set(state.orders.map((o) => o.facility))].sort(),
    [state.orders]
  );

  const filtered = useMemo(() => {
    let orders: Order[] = savedView === "all" ? state.orders : applySavedView(state, savedView);
    if (locationView) orders = orders.filter((o) => o.facility === locationView);
    orders = applyOrderFilters(state, filters, orders);
    orders = searchOrders(orders, state, query);
    orders = sortOrders(orders, state, sortKey, sortDir);
    return orders;
  }, [state, savedView, locationView, filters, query, sortKey, sortDir]);

  const grouped = groupBy === "none" ? null : groupOrdersBy(filtered, state, groupBy);

  const toggleSort = (key: OrderSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const col = (key: ColumnKey) => visibleColumns.has(key);

  const renderRow = (o: Order) => {
    const p = orderProgress(state, o.orderNumber);
    const flags = orderFlags(state, o.orderNumber);
    return (
      <tr key={o.orderNumber} data-testid={`order-row-${o.orderNumber}`}>
        {col("orderNumber") && (
          <td>
            <Link href={`/orders/${o.orderNumber}`}>
              <b>{o.orderNumber}</b>
            </Link>
          </td>
        )}
        {col("customer") && <td>{customerName(state, o.customerId)}</td>}
        {col("po") && <td>{o.customerPo}</td>}
        {col("description") && <td>{o.lines[0]?.description ?? "—"}</td>}
        {col("dueDate") && <td>{o.dueDate}</td>}
        {col("status") && <td>{o.status}</td>}
        {col("progress") && (
          <td>
            {p.complete.length}/{p.total}
          </td>
        )}
        {col("location") && <td>{o.facility}</td>}
        {col("type") && <td>{o.orderType}</td>}
        {col("coordinator") && <td>{employeeName(state, o.coordinatorId)}</td>}
        {col("priority") && (
          <td>
            <PriorityBadge priority={o.priority} />
          </td>
        )}
        {col("updated") && <td>{new Date(o.updatedAt).toLocaleDateString("en-CA")}</td>}
        {col("flags") && (
          <td>
            <div style={{ display: "flex", gap: 4 }}>
              {flags.overdue && <UnitStatusBadge status="Blocked" />}
              {flags.blocked && <span className="badge s-blocked">Blocked</span>}
              {flags.missingDetails && <span className="badge save-pending">Missing details</span>}
            </div>
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="page">
      <div className="command-bar">
        <h1 className="command-bar-title">Orders</h1>
        <div style={{ position: "relative" }}>
          <input
            placeholder="Search order number, customer, PO, description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 300, paddingLeft: 30 }}
            aria-label="Search orders"
            data-testid="orders-search"
          />
          <SearchIcon size={14} className="search-icon-inline" />
        </div>
        <button type="button" className="btn" onClick={() => setShowFilters((v) => !v)}>
          <FilterIcon size={14} /> Filters
        </button>
        <button type="button" className="btn" onClick={() => setShowColumnPicker((v) => !v)}>
          Columns
        </button>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} style={{ width: "auto" }} aria-label="Group by">
          <option value="none">No grouping</option>
          <option value="status">Group by status</option>
          <option value="facility">Group by location</option>
          <option value="customer">Group by customer</option>
          <option value="priority">Group by priority</option>
        </select>
        <button type="button" className="btn btn-primary" data-testid="new-work-order-button" onClick={() => setShowNewOrder(true)}>
          <PlusIcon size={14} /> New work order
        </button>
      </div>

      <div className="saved-views">
        {SAVED_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`saved-view-chip ${savedView === v.id ? "active" : ""}`}
            data-testid={`saved-view-${v.id}`}
            onClick={() => setSavedView(v.id)}
          >
            {v.label}
          </button>
        ))}
        {locations.map((loc) => (
          <button
            key={loc}
            type="button"
            className={`saved-view-chip ${locationView === loc ? "active" : ""}`}
            data-testid={`saved-view-location-${loc}`}
            onClick={() => setLocationView((cur) => (cur === loc ? null : loc))}
          >
            {loc}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="filter-panel" data-testid="orders-filter-panel">
          <select
            value={filters.status ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
            aria-label="Filter by status"
          >
            <option value="">Status: any</option>
            {[...new Set(state.orders.map((o) => o.status))].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filters.customerId ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value || undefined }))}
            aria-label="Filter by customer"
          >
            <option value="">Customer: any</option>
            {state.customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filters.orderType ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, orderType: e.target.value || undefined }))}
            aria-label="Filter by type"
          >
            <option value="">Type: any</option>
            {[...new Set(state.orders.map((o) => o.orderType))].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={filters.priority ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value || undefined }))}
            aria-label="Filter by priority"
          >
            <option value="">Priority: any</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>
          <select
            value={filters.coordinatorId ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, coordinatorId: e.target.value || undefined }))}
            aria-label="Filter by coordinator"
          >
            <option value="">Coordinator: any</option>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select
            value={filters.assigneeId ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value || undefined }))}
            aria-label="Filter by assignee"
          >
            <option value="">Assignee: any</option>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={!!filters.overdueOnly}
              onChange={(e) => setFilters((f) => ({ ...f, overdueOnly: e.target.checked || undefined }))}
            />
            Overdue only
          </label>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={!!filters.blockedOnly}
              onChange={(e) => setFilters((f) => ({ ...f, blockedOnly: e.target.checked || undefined }))}
            />
            Blocked only
          </label>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={!!filters.missingDetailsOnly}
              onChange={(e) => setFilters((f) => ({ ...f, missingDetailsOnly: e.target.checked || undefined }))}
            />
            Missing details
          </label>
          {Object.keys(filters).length > 0 && (
            <button type="button" className="filter-chip-clear" onClick={() => setFilters({})}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {showColumnPicker && (
        <div className="filter-panel" data-testid="orders-column-picker">
          {ALL_COLUMNS.map((c) => (
            <label key={c} style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={visibleColumns.has(c)} onChange={() => toggleColumn(c)} />
              {COLUMN_LABELS[c]}
            </label>
          ))}
        </div>
      )}

      <div className="data-grid-wrap">
        <table className="data-grid" data-testid="orders-grid">
          <thead>
            <tr>
              {col("orderNumber") && (
                <th><button onClick={() => toggleSort("orderNumber")}>Order</button></th>
              )}
              {col("customer") && (
                <th><button onClick={() => toggleSort("customer")}>Customer</button></th>
              )}
              {col("po") && <th>PO</th>}
              {col("description") && <th>Description</th>}
              {col("dueDate") && (
                <th><button data-testid="sort-dueDate" onClick={() => toggleSort("dueDate")}>Due date {sortKey === "dueDate" ? (sortDir === "asc" ? "▲" : "▼") : ""}</button></th>
              )}
              {col("status") && (
                <th><button onClick={() => toggleSort("status")}>Status</button></th>
              )}
              {col("progress") && <th>Progress</th>}
              {col("location") && <th>Location</th>}
              {col("type") && <th>Type</th>}
              {col("coordinator") && <th>Coordinator</th>}
              {col("priority") && (
                <th><button onClick={() => toggleSort("priority")}>Priority</button></th>
              )}
              {col("updated") && (
                <th><button onClick={() => toggleSort("updatedAt")}>Updated</button></th>
              )}
              {col("flags") && <th>Flags</th>}
            </tr>
          </thead>
          <tbody>
            {grouped
              ? grouped.flatMap(({ group, orders }) => [
                  <tr key={`group-${group}`} className="group-row">
                    <td colSpan={visibleColumns.size}>{group} ({orders.length})</td>
                  </tr>,
                  ...orders.map(renderRow)
                ])
              : filtered.map(renderRow)}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p style={{ padding: 16, color: "var(--text-subtle)" }}>No orders match the current view/filters.</p>
        )}
      </div>

      {showNewOrder && <NewWorkOrderDrawer onClose={() => setShowNewOrder(false)} />}
    </div>
  );
}
