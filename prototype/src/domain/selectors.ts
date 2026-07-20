// Read-side helpers. Views (facility, department, blocked, my work) are
// filters over the master orders — never duplicate orders.

import type {
  AppState,
  ChecklistItemDef,
  ChecklistResponse,
  Contact,
  Customer,
  HandoffRecord,
  Order,
  PlannerBucket,
  QrIdentity,
  Task,
  Unit,
  UnitStatus
} from "./types";

const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  NotStarted: "Not started",
  InAssembly: "In assembly",
  Blocked: "Blocked",
  AwaitingQuality: "Awaiting quality",
  Complete: "Complete"
};

export function unitStatusLabel(status: UnitStatus): string {
  return UNIT_STATUS_LABELS[status];
}

// Turns PascalCase lifecycle values ("NotStarted") into readable text
// ("Not started") for display.
export function humanizeStatus(status: string): string {
  const spaced = status.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0) + spaced.slice(1).toLowerCase();
}

export function employeeName(state: AppState, id: string | null): string {
  if (!id) return "Unassigned";
  return state.employees.find((e) => e.id === id)?.name ?? id;
}

export function unitsForOrder(state: AppState, orderNumber: string): Unit[] {
  return state.units
    .filter((u) => u.orderNumber === orderNumber)
    .sort((a, b) => a.lineNumber - b.lineNumber || a.sequence - b.sequence);
}

export function unitById(state: AppState, unitId: string): Unit | undefined {
  return state.units.find((u) => u.unitId === unitId);
}

export function orderByNumber(state: AppState, orderNumber: string): Order | undefined {
  return state.orders.find((o) => o.orderNumber === orderNumber);
}

// ---------------------------------------------------------------------------
// Customers and contacts
// ---------------------------------------------------------------------------

export function customerById(state: AppState, customerId: string | null): Customer | undefined {
  if (!customerId) return undefined;
  return state.customers.find((c) => c.id === customerId);
}

export function customerName(state: AppState, customerId: string | null): string {
  return customerById(state, customerId)?.name ?? "Unknown customer";
}

// "Name - City" as shown on the order header and printed Work Order Plan -
// the same at-a-glance identification the old single-string customer field
// gave the shop floor, now derived from the Customer record.
export function customerNameWithCity(state: AppState, customerId: string | null): string {
  const c = customerById(state, customerId);
  if (!c) return "Unknown customer";
  return c.city ? `${c.name} - ${c.city}` : c.name;
}

export function contactsForCustomer(state: AppState, customerId: string): Contact[] {
  return state.contacts.filter((c) => c.customerId === customerId);
}

export function ordersForCustomer(state: AppState, customerId: string): Order[] {
  return state.orders.filter((o) => o.customerId === customerId);
}

export function tasksForCustomer(state: AppState, customerId: string): Task[] {
  return state.tasks.filter((t) => t.customerId === customerId);
}

// ---------------------------------------------------------------------------
// Date helpers - all overdue/due-soon logic funnels through these two
// functions so every screen agrees on what "today" and "this week" mean.
// ---------------------------------------------------------------------------

export function isOverdue(dueDate: string | null, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  return new Date(dueDate).getTime() < startOfDay(now).getTime();
}

export function isDueToday(dueDate: string | null, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const today = startOfDay(now);
  return d.getTime() >= today.getTime() && d.getTime() < addDays(today, 1).getTime();
}

export function isDueThisWeek(dueDate: string | null, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate).getTime();
  const today = startOfDay(now).getTime();
  const weekOut = addDays(startOfDay(now), 7).getTime();
  return d >= today && d < weekOut;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Progress fraction drill-down: given a status, return the exact Unit set.
export function unitsInStatus(state: AppState, orderNumber: string, status: UnitStatus): Unit[] {
  return unitsForOrder(state, orderNumber).filter((u) => u.status === status);
}

export interface ProgressSummary {
  total: number;
  complete: Unit[];
  blocked: Unit[];
  inProgress: Unit[];
  awaitingQuality: Unit[];
  notStarted: Unit[];
}

export function orderProgress(state: AppState, orderNumber: string): ProgressSummary {
  const units = unitsForOrder(state, orderNumber);
  return {
    total: units.length,
    complete: units.filter((u) => u.status === "Complete"),
    blocked: units.filter((u) => u.status === "Blocked"),
    inProgress: units.filter((u) => u.status === "InAssembly"),
    awaitingQuality: units.filter((u) => u.status === "AwaitingQuality"),
    notStarted: units.filter((u) => u.status === "NotStarted")
  };
}

// An order is "Completed" once every one of its Units is Complete (and it
// has at least one Unit) - this is a computed read, never a second mutable
// status field that could disagree with the Units.
export function isOrderCompleted(state: AppState, orderNumber: string): boolean {
  const p = orderProgress(state, orderNumber);
  return p.total > 0 && p.complete.length === p.total;
}

export interface OrderFlags {
  overdue: boolean;
  blocked: boolean;
  missingDetails: boolean;
}

export function orderFlags(state: AppState, orderNumber: string): OrderFlags {
  const order = orderByNumber(state, orderNumber);
  const p = orderProgress(state, orderNumber);
  const completed = p.total > 0 && p.complete.length === p.total;
  return {
    overdue: !!order && isOverdue(order.dueDate) && !completed,
    blocked: p.blocked.length > 0,
    missingDetails: !!order && (!order.customerPo.trim() || order.lines.length === 0)
  };
}

export function tasksForUnit(state: AppState, unitId: string): Task[] {
  return state.tasks.filter((t) => t.unitId === unitId);
}

export function tasksForOrder(state: AppState, orderNumber: string): Task[] {
  return state.tasks.filter((t) => t.orderNumber === orderNumber);
}

// The active handoff is the most recent record. Earlier records are retained
// and readable through `task.handoffs`.
export function currentHandoff(task: Task): HandoffRecord | null {
  return task.handoffs.at(-1) ?? null;
}

export function supersededHandoffs(task: Task): HandoffRecord[] {
  return task.handoffs.slice(0, -1);
}

// Checklist items whose numeric limits or pass criteria are unapproved
// placeholders (decision D-013 is still Proposed). This is independent of
// response type: the hydrotest criterion is pass/fail and still unapproved.
export function placeholderItemKeys(state: AppState): string[] {
  return state.checklistDefs.filter((d) => d.placeholderTolerance).map((d) => d.key);
}

export function responsesForUnit(state: AppState, unitId: string): ChecklistResponse[] {
  return state.responses.filter((r) => r.unitId === unitId);
}

// Latest (non-superseded) response per checklist item for a unit.
export function currentResponses(state: AppState, unitId: string): Map<string, ChecklistResponse> {
  const superseded = new Set(
    state.responses.filter((r) => r.supersedesId).map((r) => r.supersedesId as string)
  );
  const map = new Map<string, ChecklistResponse>();
  for (const r of state.responses) {
    if (r.unitId !== unitId || superseded.has(r.id)) continue;
    const existing = map.get(r.itemKey);
    if (!existing || r.at >= existing.at) map.set(r.itemKey, r);
  }
  return map;
}

export function checklistProgress(state: AppState, unitId: string): { done: number; total: number } {
  const current = currentResponses(state, unitId);
  let done = 0;
  for (const def of state.checklistDefs) {
    const r = current.get(def.key);
    if (r && r.state === "Saved" && r.value !== null && r.value !== "fail") done++;
  }
  return { done, total: state.checklistDefs.length };
}

export function defByKey(state: AppState, key: string): ChecklistItemDef | undefined {
  return state.checklistDefs.find((d) => d.key === key);
}

export function measurementResult(
  def: ChecklistItemDef,
  value: number
): "in-range" | "out-of-range" | "no-limits" {
  if (def.min === null && def.max === null) return "no-limits";
  if (def.min !== null && value < def.min) return "out-of-range";
  if (def.max !== null && value > def.max) return "out-of-range";
  return "in-range";
}

export function postsForOrder(state: AppState, orderNumber: string, unitId?: string) {
  return state.posts
    .filter((p) => p.orderNumber === orderNumber && (unitId === undefined || p.unitId === unitId))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function unreadCountForOrder(state: AppState, orderNumber: string): number {
  return state.posts.filter((p) => p.orderNumber === orderNumber && p.unread).length;
}

export function resolveScan(state: AppState, publicRef: string): QrIdentity | undefined {
  return state.qrIdentities.find((q) => q.publicRef === publicRef);
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

export const PLANNER_BUCKETS: PlannerBucket[] = [
  "TBC",
  "OrderPlanning",
  "PartsPicked",
  "Machining",
  "AssemblyTesting",
  "Quality",
  "Packaging",
  "OnHold",
  "Complete"
];

export const PLANNER_BUCKET_LABELS: Record<PlannerBucket, string> = {
  TBC: "TBC",
  OrderPlanning: "Order planning",
  PartsPicked: "Parts picked/ordered",
  Machining: "Machining",
  AssemblyTesting: "Assembly and testing",
  Quality: "Quality",
  Packaging: "Packaging",
  OnHold: "On hold",
  Complete: "Complete"
};

export function tasksInBucket(state: AppState, bucket: PlannerBucket, tasks: Task[] = state.tasks): Task[] {
  return tasks.filter((t) => t.bucket === bucket);
}

export function isAssignedTo(task: Task, employeeId: string): boolean {
  return task.ownerId === employeeId || task.assigneeIds.includes(employeeId);
}

export function checklistDone(task: Task): { done: number; total: number } {
  return { done: task.checklist.filter((c) => c.done).length, total: task.checklist.length };
}

export interface MyWorkSections {
  overdue: Task[];
  dueToday: Task[];
  dueThisWeek: Task[];
  inProgress: Task[];
  blocked: Task[];
  recentlyCompleted: Task[];
}

// A task appears in exactly one primary section so counts add up predictably:
// Blocked takes priority over due-date sections, then overdue > due-today >
// due-this-week > in-progress. Recently-completed is separate (status-based,
// not date-based).
export function myWorkSections(state: AppState, employeeId: string, now: Date = new Date()): MyWorkSections {
  const mine = state.tasks.filter((t) => isAssignedTo(t, employeeId) && t.status !== "Complete");
  const sections: MyWorkSections = {
    overdue: [],
    dueToday: [],
    dueThisWeek: [],
    inProgress: [],
    blocked: [],
    recentlyCompleted: []
  };
  for (const t of mine) {
    if (t.status === "Blocked") sections.blocked.push(t);
    else if (isOverdue(t.dueDate, now)) sections.overdue.push(t);
    else if (isDueToday(t.dueDate, now)) sections.dueToday.push(t);
    else if (isDueThisWeek(t.dueDate, now)) sections.dueThisWeek.push(t);
    else if (t.status === "InProgress" || t.status === "Paused") sections.inProgress.push(t);
  }
  sections.recentlyCompleted = state.tasks
    .filter((t) => isAssignedTo(t, employeeId) && t.status === "Complete")
    .sort((a, b) => (b.history.at(-1)?.at ?? "").localeCompare(a.history.at(-1)?.at ?? ""))
    .slice(0, 10);
  return sections;
}

export function myWork(state: AppState, employeeId: string): Task[] {
  return state.tasks.filter(
    (t) =>
      (t.ownerId === employeeId && t.status !== "Complete") ||
      (t.ownerId === null && (t.status === "Ready" || t.status === "Paused"))
  );
}

export function continueLastJob(state: AppState, employeeId: string): Task | undefined {
  const resumable = state.tasks.filter(
    (t) => t.unitId && (t.status === "Paused" || t.status === "InProgress") &&
      (t.ownerId === employeeId || t.ownerId === null || t.status === "Paused")
  );
  return resumable.sort((a, b) => {
    const aAt = a.history.at(-1)?.at ?? "";
    const bAt = b.history.at(-1)?.at ?? "";
    return bAt.localeCompare(aAt);
  })[0];
}

// ---------------------------------------------------------------------------
// Orders grid: saved views and filters
// ---------------------------------------------------------------------------

export type SavedView =
  | "all"
  | "open"
  | "due-this-week"
  | "overdue"
  | "blocked"
  | "awaiting-quality"
  | "completed";

export interface OrderFilters {
  status?: string;
  customerId?: string;
  facility?: string;
  orderType?: string;
  priority?: string;
  coordinatorId?: string;
  assigneeId?: string;
  overdueOnly?: boolean;
  blockedOnly?: boolean;
  missingDetailsOnly?: boolean;
}

export function applySavedView(state: AppState, view: SavedView, orders: Order[] = state.orders): Order[] {
  switch (view) {
    case "all":
      return orders;
    case "open":
      return orders.filter((o) => !isOrderCompleted(state, o.orderNumber));
    case "completed":
      return orders.filter((o) => isOrderCompleted(state, o.orderNumber));
    case "due-this-week":
      return orders.filter((o) => isDueThisWeek(o.dueDate) || isDueToday(o.dueDate));
    case "overdue":
      return orders.filter((o) => orderFlags(state, o.orderNumber).overdue);
    case "blocked":
      return orders.filter((o) => orderFlags(state, o.orderNumber).blocked);
    case "awaiting-quality":
      return orders.filter((o) => orderProgress(state, o.orderNumber).awaitingQuality.length > 0);
    default:
      return orders;
  }
}

export function applyOrderFilters(state: AppState, filters: OrderFilters, orders: Order[] = state.orders): Order[] {
  return orders.filter((o) => {
    if (filters.status && o.status !== filters.status) return false;
    if (filters.customerId && o.customerId !== filters.customerId) return false;
    if (filters.facility && o.facility !== filters.facility) return false;
    if (filters.orderType && o.orderType !== filters.orderType) return false;
    if (filters.priority && o.priority !== filters.priority) return false;
    if (filters.coordinatorId && o.coordinatorId !== filters.coordinatorId) return false;
    if (filters.assigneeId) {
      const hasAssignee = tasksForOrder(state, o.orderNumber).some((t) => isAssignedTo(t, filters.assigneeId!));
      if (!hasAssignee) return false;
    }
    const flags = orderFlags(state, o.orderNumber);
    if (filters.overdueOnly && !flags.overdue) return false;
    if (filters.blockedOnly && !flags.blocked) return false;
    if (filters.missingDetailsOnly && !flags.missingDetails) return false;
    return true;
  });
}

export function searchOrders(orders: Order[], state: AppState, query: string): Order[] {
  const q = query.trim().toLowerCase();
  if (!q) return orders;
  return orders.filter(
    (o) =>
      o.orderNumber.toLowerCase().includes(q) ||
      customerName(state, o.customerId).toLowerCase().includes(q) ||
      o.customerPo.toLowerCase().includes(q) ||
      (o.lines[0]?.description ?? "").toLowerCase().includes(q)
  );
}

export type OrderSortKey = "orderNumber" | "customer" | "dueDate" | "status" | "priority" | "updatedAt";

export function sortOrders(orders: Order[], state: AppState, key: OrderSortKey, dir: "asc" | "desc" = "asc"): Order[] {
  const sorted = [...orders].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "orderNumber":
        cmp = a.orderNumber.localeCompare(b.orderNumber);
        break;
      case "customer":
        cmp = customerName(state, a.customerId).localeCompare(customerName(state, b.customerId));
        break;
      case "dueDate":
        cmp = a.dueDate.localeCompare(b.dueDate);
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "priority":
        cmp = a.priority.localeCompare(b.priority);
        break;
      case "updatedAt":
        cmp = a.updatedAt.localeCompare(b.updatedAt);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function groupOrdersBy(
  orders: Order[],
  state: AppState,
  key: "status" | "facility" | "customer" | "priority"
): Array<{ group: string; orders: Order[] }> {
  const map = new Map<string, Order[]>();
  for (const o of orders) {
    const group =
      key === "status" ? o.status :
      key === "facility" ? o.facility :
      key === "priority" ? o.priority :
      customerName(state, o.customerId);
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(o);
  }
  return [...map.entries()].map(([group, orders]) => ({ group, orders }));
}

export type ViewId =
  | "home"
  | "my-work"
  | "orders"
  | "mississauga"
  | "houston"
  | "machining"
  | "assembly"
  | "quality"
  | "shipping"
  | "blocked"
  | "search";

export interface ViewFilterResult {
  orders: Order[];
  units: Unit[];
}

// Location and department views are filters over the same master orders.
export function applyView(state: AppState, view: ViewId): ViewFilterResult {
  const all = { orders: state.orders, units: state.units };
  switch (view) {
    case "mississauga":
    case "houston": {
      const fac = view === "mississauga" ? "Mississauga" : "Houston";
      return {
        orders: state.orders.filter((o) => o.facility === fac),
        units: state.units.filter((u) => u.location.startsWith(fac))
      };
    }
    case "machining":
    case "assembly":
    case "quality":
    case "shipping": {
      const dep = view[0].toUpperCase() + view.slice(1);
      const unitIds = new Set(
        state.routeOps
          .filter((op) => op.department === dep && (op.status === "InProgress" || op.status === "Ready" || op.status === "Blocked"))
          .map((op) => op.unitId)
      );
      const units = state.units.filter((u) => unitIds.has(u.unitId));
      const orderNos = new Set(units.map((u) => u.orderNumber));
      return { orders: state.orders.filter((o) => orderNos.has(o.orderNumber)), units };
    }
    case "blocked": {
      const units = state.units.filter((u) => u.status === "Blocked");
      const orderNos = new Set(units.map((u) => u.orderNumber));
      return { orders: state.orders.filter((o) => orderNos.has(o.orderNumber)), units };
    }
    default:
      return all;
  }
}

export interface SearchHit {
  type: "Order" | "Unit" | "Task" | "Post" | "Attachment" | "Customer";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export function search(state: AppState, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const o of state.orders) {
    const cName = customerName(state, o.customerId);
    if (
      o.orderNumber.toLowerCase().includes(q) ||
      cName.toLowerCase().includes(q) ||
      o.customerPo.toLowerCase().includes(q)
    ) {
      hits.push({ type: "Order", id: o.orderNumber, title: o.orderNumber, subtitle: cName, href: `/orders/${o.orderNumber}` });
    }
  }
  for (const c of state.customers) {
    if (c.name.toLowerCase().includes(q)) {
      hits.push({ type: "Customer", id: c.id, title: c.name, subtitle: `${c.city}, ${c.region}`, href: `/customers/${c.id}` });
    }
  }
  for (const u of state.units) {
    if (u.unitId.toLowerCase().includes(q) || (u.serial ?? "").toLowerCase().includes(q)) {
      hits.push({ type: "Unit", id: u.unitId, title: u.unitId, subtitle: u.serial ? `Serial ${u.serial}` : "Serial pending", href: `/units/${u.unitId}` });
    }
  }
  for (const t of state.tasks) {
    if (t.name.toLowerCase().includes(q)) {
      hits.push({
        type: "Task",
        id: t.id,
        title: t.name,
        subtitle: t.unitId ?? t.orderNumber ?? "Planner",
        href: t.unitId ? `/units/${t.unitId}` : "/planner"
      });
    }
  }
  for (const p of state.posts) {
    if (p.body.toLowerCase().includes(q)) {
      hits.push({ type: "Post", id: p.id, title: p.body.slice(0, 60), subtitle: p.unitId ?? p.orderNumber, href: `/orders/${p.orderNumber}?tab=activity` });
    }
  }
  for (const a of state.attachments) {
    if (a.fileName.toLowerCase().includes(q)) {
      hits.push({ type: "Attachment", id: a.id, title: a.fileName, subtitle: a.unitId ?? a.orderNumber, href: a.unitId ? `/units/${a.unitId}` : `/orders/${a.orderNumber}` });
    }
  }
  return hits.slice(0, 25);
}
