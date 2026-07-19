// Read-side helpers. Views (facility, department, blocked, my work) are
// filters over the master orders — never duplicate orders.

import type {
  AppState,
  ChecklistItemDef,
  ChecklistResponse,
  Order,
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

export function tasksForUnit(state: AppState, unitId: string): Task[] {
  return state.tasks.filter((t) => t.unitId === unitId);
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

export function myWork(state: AppState, employeeId: string): Task[] {
  return state.tasks.filter(
    (t) =>
      (t.ownerId === employeeId && t.status !== "Complete") ||
      (t.ownerId === null && (t.status === "Ready" || t.status === "Paused"))
  );
}

export function continueLastJob(state: AppState, employeeId: string): Task | undefined {
  const resumable = state.tasks.filter(
    (t) => (t.status === "Paused" || t.status === "InProgress") &&
      (t.ownerId === employeeId || t.ownerId === null || t.status === "Paused")
  );
  return resumable.sort((a, b) => {
    const aAt = a.history.at(-1)?.at ?? "";
    const bAt = b.history.at(-1)?.at ?? "";
    return bAt.localeCompare(aAt);
  })[0];
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
  type: "Order" | "Unit" | "Task" | "Post" | "Attachment";
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
    if (
      o.orderNumber.toLowerCase().includes(q) ||
      o.customer.toLowerCase().includes(q) ||
      o.customerPo.toLowerCase().includes(q)
    ) {
      hits.push({ type: "Order", id: o.orderNumber, title: o.orderNumber, subtitle: o.customer, href: `/orders/${o.orderNumber}` });
    }
  }
  for (const u of state.units) {
    if (u.unitId.toLowerCase().includes(q) || (u.serial ?? "").toLowerCase().includes(q)) {
      hits.push({ type: "Unit", id: u.unitId, title: u.unitId, subtitle: u.serial ? `Serial ${u.serial}` : "Serial pending", href: `/units/${u.unitId}` });
    }
  }
  for (const t of state.tasks) {
    if (t.name.toLowerCase().includes(q)) {
      hits.push({ type: "Task", id: t.id, title: t.name, subtitle: t.unitId, href: `/units/${t.unitId}` });
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
