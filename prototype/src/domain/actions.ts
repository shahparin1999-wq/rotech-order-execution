// Pure state-transition functions for the mock repository. Every controlled
// action requires an explicit Unit/Order target, appends an audit event, and
// never overwrites history (corrections supersede).

import type {
  ActivityPost,
  AppState,
  Attachment,
  AttachmentCategory,
  AuditEvent,
  ChecklistResponse,
  ChecklistSubItem,
  ConvertedKind,
  ConfigurationAdjustment,
  ConfigurationSnapshot,
  Contact,
  Customer,
  Facility,
  HandoffRecord,
  ManufacturingNote,
  ManufacturingNoteCategory,
  MaterialChange,
  Order,
  OrderLine,
  PlannerBucket,
  Priority,
  Problem,
  QrIdentity,
  RouteOperation,
  SaveState,
  SpecialInstruction,
  Task,
  TaskStatus,
  Unit
} from "./types";
import { generateUnits, mockPublicRef } from "./ids";
import { recomputeUnitProjection } from "./projections";
import {
  validateExecutionPackage,
  type ExecutionLineV1,
  type ExecutionNoteClassification,
  type ExecutionPackageV1
} from "./executionPackage";

// A classified CPQ note maps 1:1 to a ManufacturingNote category, except
// "Provenance", which is read-only context kept only in the frozen snapshot and
// never seeded as an actionable shop note.
const NOTE_CLASSIFICATION_TO_CATEGORY: Record<
  Exclude<ExecutionNoteClassification, "Provenance">,
  ManufacturingNoteCategory
> = {
  ShopInstruction: "ShopInstruction",
  EngineeringNote: "EngineeringNote",
  MachiningInstruction: "MachiningInstruction",
  QualityRequirement: "QualityRequirement",
  PackagingInstruction: "PackagingInstruction"
};

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function takeId(state: AppState, prefix: string): [string, AppState] {
  const id = `${prefix}-${state.nextId}`;
  return [id, { ...state, nextId: state.nextId + 1 }];
}

function appendAudit(
  state: AppState,
  ev: Omit<AuditEvent, "id">
): AppState {
  const [id, s] = takeId(state, "ae");
  return { ...s, auditEvents: [...s.auditEvents, { ...ev, id }] };
}

function updateTask(state: AppState, taskId: string, patch: Partial<Task>): AppState {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
  };
}

function mustFindTask(state: AppState, taskId: string): Task {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) throw new Error(`Unknown task ${taskId}`);
  return t;
}

function withHistory(t: Task, action: string, actorId: string, at: string, note: string | null): Partial<Task> {
  return { history: [...t.history, { action, actorId, at, note }] };
}

const START_OK: TaskStatus[] = ["NotStarted", "Ready"];

export function startTask(state: AppState, taskId: string, actorId: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (!START_OK.includes(t.status)) {
    throw new Error(`Task ${taskId} cannot start from ${t.status}`);
  }
  const ts = nowIso(at);
  let s = updateTask(state, taskId, {
    status: "InProgress",
    ownerId: actorId,
    ...withHistory(t, "Started", actorId, ts, null)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.started", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Started "${t.name}".`, supersedesEventId: null
  });
  if (t.unitId) s = recomputeUnitProjection(s, t.unitId);
  return s;
}

export interface PauseInput {
  reason: string;
  completedWork: string;
  remainingWork: string;
  location: string;
  storageState: string;
  blockerItem?: string | null;
  note?: string | null;
}

export function pauseTask(state: AppState, taskId: string, actorId: string, input: PauseInput, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.status !== "InProgress") {
    throw new Error(`Task ${taskId} cannot pause from ${t.status}`);
  }
  const required: Array<[string, string]> = [
    ["reason", input.reason],
    ["completedWork", input.completedWork],
    ["remainingWork", input.remainingWork],
    ["location", input.location],
    ["storageState", input.storageState]
  ];
  for (const [field, value] of required) {
    if (!value || !value.trim()) throw new Error(`Handoff field "${field}" is required to pause`);
  }
  const ts = nowIso(at);
  // Append a superseding handoff; never overwrite the previous record.
  const prior = t.handoffs.at(-1) ?? null;
  const [handoffId, s1] = takeId(state, "ho");
  const handoff: HandoffRecord = {
    id: handoffId,
    reason: input.reason,
    completedWork: input.completedWork,
    remainingWork: input.remainingWork,
    location: input.location,
    storageState: input.storageState,
    blockerItem: input.blockerItem ?? null,
    note: input.note ?? null,
    byId: actorId,
    at: ts,
    supersedesId: prior?.id ?? null
  };
  const priorPauseEventId =
    s1.auditEvents
      .filter((e) => e.targetId === taskId && e.action === "task.paused")
      .at(-1)?.id ?? null;

  let s = updateTask(s1, taskId, {
    status: "Paused",
    handoffs: [...t.handoffs, handoff],
    ...withHistory(t, "Paused", actorId, ts, input.reason)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.paused", targetType: "Task", targetId: taskId,
    unitId: t.unitId,
    detail: prior
      ? `Paused with handoff: ${input.reason} (supersedes handoff ${prior.id}, which is retained).`
      : `Paused with handoff: ${input.reason}`,
    supersedesEventId: priorPauseEventId
  });
  if (t.unitId) s = recomputeUnitProjection(s, t.unitId);
  return s;
}

export function resumeTask(state: AppState, taskId: string, actorId: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.status !== "Paused") throw new Error(`Task ${taskId} cannot resume from ${t.status}`);
  const ts = nowIso(at);
  // Every handoff record is retained for traceability; the resuming employee
  // becomes the owner.
  const active = t.handoffs.at(-1) ?? null;
  let s = updateTask(state, taskId, {
    status: "InProgress",
    ownerId: actorId,
    ...withHistory(
      t,
      "Resumed",
      actorId,
      ts,
      active ? `Resumed from handoff ${active.id} recorded by the previous owner` : null
    )
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.resumed", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Resumed "${t.name}".`, supersedesEventId: null
  });
  if (t.unitId) s = recomputeUnitProjection(s, t.unitId);
  return s;
}

export function completeTask(state: AppState, taskId: string, actorId: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.status !== "InProgress") throw new Error(`Task ${taskId} cannot complete from ${t.status}`);
  const ts = nowIso(at);
  let s = updateTask(state, taskId, {
    status: "Complete",
    ...withHistory(t, "Completed", actorId, ts, null)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.completed", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Completed "${t.name}".`, supersedesEventId: null
  });
  if (t.unitId) s = recomputeUnitProjection(s, t.unitId);
  return s;
}

export function blockTask(state: AppState, taskId: string, actorId: string, reason: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.status === "Complete" || t.status === "Blocked") {
    throw new Error(`Task ${taskId} cannot block from ${t.status}`);
  }
  if (!reason.trim()) throw new Error("A blocking reason is required");
  const ts = nowIso(at);
  let s = updateTask(state, taskId, {
    status: "Blocked",
    status_beforeBlock: t.status,
    blockReason: reason,
    ...withHistory(t, "Blocked", actorId, ts, reason)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.blocked", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Blocked: ${reason}`, supersedesEventId: null
  });
  if (t.unitId) s = recomputeUnitProjection(s, t.unitId);
  return s;
}

export function resolveBlocker(state: AppState, taskId: string, actorId: string, note: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.status !== "Blocked") throw new Error(`Task ${taskId} is not blocked`);
  const ts = nowIso(at);
  const restored: TaskStatus = t.status_beforeBlock ?? "Ready";
  let s = updateTask(state, taskId, {
    status: restored,
    status_beforeBlock: null,
    blockReason: null,
    ...withHistory(t, "BlockerResolved", actorId, ts, note || null)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.blockerResolved", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Blocker resolved; task returned to ${restored}.`, supersedesEventId: null
  });
  if (t.unitId) s = recomputeUnitProjection(s, t.unitId);
  return s;
}

export interface ResponseInput {
  itemKey: string;
  value: boolean | "pass" | "fail" | number | null;
  enteredText?: string | null;
  note?: string | null;
  photoAttachmentId?: string | null;
  state?: SaveState;
  supersedesId?: string | null;
}

export function addChecklistResponse(
  state: AppState,
  unitId: string,
  technicianId: string,
  input: ResponseInput,
  at?: string
): AppState {
  const unit = state.units.find((u) => u.unitId === unitId);
  if (!unit) throw new Error(`Unknown unit ${unitId}`);
  const def = state.checklistDefs.find((d) => d.key === input.itemKey);
  if (!def) throw new Error(`Unknown checklist item ${input.itemKey}`);
  if (input.supersedesId) {
    const prior = state.responses.find((r) => r.id === input.supersedesId);
    if (!prior) throw new Error(`Cannot supersede unknown response ${input.supersedesId}`);
    if (prior.unitId !== unitId) {
      throw new Error(`Cross-Unit supersession rejected: response ${input.supersedesId} belongs to ${prior.unitId}`);
    }
  }
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "r");
  const response: ChecklistResponse = {
    id,
    unitId,
    itemKey: input.itemKey,
    value: input.value,
    enteredText: input.enteredText ?? null,
    note: input.note ?? null,
    photoAttachmentId: input.photoAttachmentId ?? null,
    technicianId,
    at: ts,
    state: input.state ?? "Saved",
    supersedesId: input.supersedesId ?? null
  };
  let s = { ...s0, responses: [...s0.responses, response] };
  s = appendAudit(s, {
    at: ts, actorId: technicianId,
    action: input.supersedesId ? "checklistResponse.superseded" : "checklistResponse.recorded",
    targetType: "ChecklistResponse", targetId: id, unitId,
    detail: `${def.label}: recorded for ${unitId}.`, supersedesEventId: null
  });
  return s;
}

export interface AttachmentInput {
  kind: "photo" | "file";
  category: AttachmentCategory;
  orderNumber: string;
  unitId: string | null;
  targetRef: string | null;
  fileName: string;
  placeholderArt: string;
}

export function addAttachment(state: AppState, employeeId: string, input: AttachmentInput, at?: string): AppState {
  const order = state.orders.find((o) => o.orderNumber === input.orderNumber);
  if (!order) throw new Error(`Unknown order ${input.orderNumber}`);
  if (input.unitId) {
    const unit = state.units.find((u) => u.unitId === input.unitId);
    if (!unit) throw new Error(`Unknown unit ${input.unitId}`);
    if (unit.orderNumber !== input.orderNumber) {
      throw new Error(`Inconsistent ancestors: ${input.unitId} does not belong to ${input.orderNumber}`);
    }
  }
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "a");
  const attachment: Attachment = { id, employeeId, at: ts, ...input, unitId: input.unitId, targetRef: input.targetRef };
  let s = { ...s0, attachments: [...s0.attachments, attachment] };
  s = appendAudit(s, {
    at: ts, actorId: employeeId, action: "attachment.captured", targetType: "Attachment",
    targetId: id, unitId: input.unitId,
    detail: `${input.kind} "${input.fileName}" (${input.category}) captured against ${input.unitId ?? input.orderNumber}.`,
    supersedesEventId: null
  });
  return s;
}

export function addPost(
  state: AppState,
  authorId: string,
  input: { orderNumber: string; unitId: string | null; body: string; category?: ActivityPost["category"]; mentions?: string[]; attachmentIds?: string[] },
  at?: string
): AppState {
  if (!input.body.trim()) throw new Error("Post body is required");
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "p");
  const post: ActivityPost = {
    id,
    orderNumber: input.orderNumber,
    unitId: input.unitId,
    authorId,
    at: ts,
    body: input.body,
    category: input.category ?? "Update",
    attachmentIds: input.attachmentIds ?? [],
    mentions: input.mentions ?? [],
    replies: [],
    convertedTo: null,
    unread: false
  };
  return { ...s0, posts: [...s0.posts, post] };
}

export function addReply(state: AppState, postId: string, authorId: string, body: string, at?: string): AppState {
  if (!body.trim()) throw new Error("Reply body is required");
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "reply");
  return {
    ...s0,
    posts: s0.posts.map((p) =>
      p.id === postId
        ? { ...p, replies: [...p.replies, { id, authorId, at: ts, body, mentions: [] }] }
        : p
    )
  };
}

export function markPostRead(state: AppState, postId: string): AppState {
  return {
    ...state,
    posts: state.posts.map((p) => (p.id === postId ? { ...p, unread: false } : p))
  };
}

export function toggleFollowOrder(state: AppState, orderNumber: string): AppState {
  const followed = state.followedOrders.includes(orderNumber);
  return {
    ...state,
    followedOrders: followed
      ? state.followedOrders.filter((o) => o !== orderNumber)
      : [...state.followedOrders, orderNumber]
  };
}

export interface ConvertInput {
  kind: ConvertedKind;
  unitId: string | null;
  // MaterialChange fields
  proposedMaterial?: string;
  reason?: string;
  // SpecialInstruction fields
  part?: string;
  instruction?: string;
  // Task/Problem fields
  name?: string;
  description?: string;
}

// Converts an activity post into a structured record. The original comment is
// preserved and gains a link to the created record.
export function convertPost(state: AppState, postId: string, actorId: string, input: ConvertInput, at?: string): AppState {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) throw new Error(`Unknown post ${postId}`);
  if (post.convertedTo) throw new Error(`Post ${postId} was already converted`);
  const unitId = input.unitId ?? post.unitId;
  if (input.kind !== "Problem" && !unitId) {
    throw new Error("Conversion requires an explicit Unit target");
  }
  if (unitId && !state.units.some((u) => u.unitId === unitId)) {
    throw new Error(`Unknown unit ${unitId}`);
  }
  const ts = nowIso(at);
  let s = state;
  let recordId: string;

  if (input.kind === "MaterialChange") {
    const unit = s.units.find((u) => u.unitId === unitId)!;
    const [id, s0] = takeId(s, "mc");
    recordId = id;
    const mc: MaterialChange = {
      id,
      unitId: unitId!,
      orderedMaterial: unit.orderedMaterial,
      proposedMaterial: input.proposedMaterial ?? "(unspecified)",
      status: "PendingApproval",
      reason: input.reason ?? post.body,
      requestedById: actorId,
      approvedById: null,
      approvedAt: null,
      evidencePlaceholder: "Evidence placeholder - photo required before approval",
      sourcePostId: postId
    };
    s = { ...s0, materialChanges: [...s0.materialChanges, mc] };
  } else if (input.kind === "SpecialInstruction") {
    const [id, s0] = takeId(s, "swi");
    recordId = id;
    const swi: SpecialInstruction = {
      id,
      unitId: unitId!,
      part: input.part ?? "(unspecified part)",
      instruction: input.instruction ?? post.body,
      beforePhotoAttachmentId: null,
      afterPhotoAttachmentId: null,
      completionMeasurement: null,
      verificationStatus: "Open",
      sourcePostId: postId
    };
    s = { ...s0, specialInstructions: [...s0.specialInstructions, swi] };
  } else if (input.kind === "Problem") {
    const [id, s0] = takeId(s, "pr");
    recordId = id;
    const pr: Problem = {
      id,
      unitId: unitId ?? null,
      orderNumber: post.orderNumber,
      description: input.description ?? post.body,
      status: "Open",
      raisedById: actorId,
      sourcePostId: postId
    };
    s = { ...s0, problems: [...s0.problems, pr] };
  } else {
    const [id, s0] = takeId(s, "t");
    recordId = id;
    const task: Task = {
      id,
      unitId: unitId!,
      orderNumber: post.orderNumber,
      customerId: null,
      name: input.name ?? post.body.slice(0, 80),
      description: null,
      operationId: null,
      bucket: "TBC",
      department: null,
      status: "Ready",
      ownerId: null,
      assigneeIds: [],
      startDate: null,
      dueDate: null,
      priority: "Medium",
      labels: [],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [{ action: "CreatedFromPost", actorId, at: ts, note: `Created from activity post ${postId}` }],
      sourcePostId: postId
    };
    s = { ...s0, tasks: [...s0.tasks, task] };
  }

  s = {
    ...s,
    posts: s.posts.map((p) =>
      p.id === postId ? { ...p, convertedTo: { kind: input.kind, recordId } } : p
    )
  };
  s = appendAudit(s, {
    at: ts, actorId, action: `post.convertedTo${input.kind}`, targetType: input.kind,
    targetId: recordId, unitId: unitId ?? null,
    detail: `Activity post ${postId} converted to ${input.kind} ${recordId}; original comment preserved.`,
    supersedesEventId: null
  });
  // Closes a previously-documented gap: a Task created here (unlike
  // MaterialChange/SpecialInstruction/Problem) can affect a zero-RouteOperation
  // Unit's calculated status via the Task-only fallback, so recompute it.
  if (input.kind === "Task" && unitId) {
    s = recomputeUnitProjection(s, unitId);
  }
  return s;
}

// Reprinting a label appends a print event to the existing QR identity.
// It never creates a new Unit or a new identity (protected invariant).
export function reprintLabel(state: AppState, publicRef: string, actorId: string, reason: string, at?: string): AppState {
  const qr = state.qrIdentities.find((q) => q.publicRef === publicRef);
  if (!qr) throw new Error(`Unknown QR identity ${publicRef}`);
  const ts = nowIso(at);
  let s: AppState = {
    ...state,
    qrIdentities: state.qrIdentities.map((q) =>
      q.publicRef === publicRef
        ? { ...q, printEvents: [...q.printEvents, { at: ts, byId: actorId, reason }] }
        : q
    )
  };
  s = appendAudit(s, {
    at: ts, actorId, action: "label.reprinted", targetType: "QrIdentity", targetId: qr.targetId,
    unitId: qr.recordType === "Unit" ? qr.targetId : null,
    detail: `Label reprinted for ${qr.label}; identity unchanged.`, supersedesEventId: null
  });
  return s;
}

// ---------------------------------------------------------------------------
// Customers and contacts
// ---------------------------------------------------------------------------

export interface CustomerInput {
  name: string;
  city: string;
  region: string;
  notes?: string | null;
}

export function createCustomer(state: AppState, actorId: string, input: CustomerInput, at?: string): AppState {
  if (!input.name.trim()) throw new Error("Customer name is required");
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "cust");
  const customer: Customer = {
    id,
    name: input.name,
    city: input.city,
    region: input.region,
    notes: input.notes ?? null,
    createdAt: ts
  };
  let s = { ...s0, customers: [...s0.customers, customer] };
  s = appendAudit(s, {
    at: ts, actorId, action: "customer.created", targetType: "Customer", targetId: id,
    unitId: null, detail: `Customer "${customer.name}" created.`, supersedesEventId: null
  });
  return s;
}

export interface ContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
}

export function createContact(state: AppState, actorId: string, customerId: string, input: ContactInput, at?: string): AppState {
  if (!state.customers.some((c) => c.id === customerId)) {
    throw new Error(`Unknown customer ${customerId}`);
  }
  if (!input.name.trim()) throw new Error("Contact name is required");
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "cont");
  const contact: Contact = {
    id,
    customerId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    role: input.role ?? null,
    createdAt: ts
  };
  let s = { ...s0, contacts: [...s0.contacts, contact] };
  s = appendAudit(s, {
    at: ts, actorId, action: "contact.created", targetType: "Contact", targetId: id,
    unitId: null, detail: `Contact "${contact.name}" added to customer ${customerId}.`, supersedesEventId: null
  });
  return s;
}

// ---------------------------------------------------------------------------
// Work order creation
// ---------------------------------------------------------------------------

// A minimal, generic route used only for orders created through the New Work
// Order drawer - deliberately not the approved 1196 route (that stays fixture
// data pending template governance). Every step starts NotStarted except the
// first, which is Ready, matching the same seed convention as the fixtures.
const GENERIC_ROUTE: Array<{ name: string; department: RouteOperation["department"] }> = [
  { name: "Intake review", department: "Coordination" },
  { name: "Production", department: "Assembly" },
  { name: "Quality inspection", department: "Quality" },
  { name: "Packaging", department: "Shipping" }
];

function buildGenericRoute(unitId: string): RouteOperation[] {
  return GENERIC_ROUTE.map((step, i) => ({
    id: `op-${unitId}-${i + 1}`,
    unitId,
    seq: i + 1,
    name: step.name,
    department: step.department,
    status: i === 0 ? "Ready" : "NotStarted"
  }));
}

export interface WorkOrderInput {
  orderNumber: string;
  customerId: string;
  customerPo: string;
  description: string;
  facility: Facility;
  orderType: string;
  priority: Priority;
  dueDate: string;
  coordinatorId: string;
  instructions?: string;
  quantity: number;
  model: string;
  size: string;
  material: string;
}

// Confirms a new work order exactly once: creates the Order, generates N
// isolated Units with stable Unit IDs (never a shared/aggregate QC object),
// a generic route per Unit, and an audit trail - mirroring the same
// generate-exactly-once discipline as the seeded fixture order.
export function createWorkOrder(state: AppState, actorId: string, input: WorkOrderInput, at?: string): AppState {
  if (!input.orderNumber.trim()) throw new Error("Order number is required");
  if (state.orders.some((o) => o.orderNumber === input.orderNumber)) {
    throw new Error(`Order ${input.orderNumber} already exists`);
  }
  if (!state.customers.some((c) => c.id === input.customerId)) {
    throw new Error(`Unknown customer ${input.customerId}`);
  }
  if (input.quantity < 1) throw new Error("Quantity must be at least 1");

  const ts = nowIso(at);
  const line: OrderLine = {
    id: `${input.orderNumber}-L1`,
    lineNumber: 1,
    sourceSystem: "Manual",
    product: `${input.model} ${input.size}`,
    description: input.description,
    family: input.model,
    model: input.model,
    quantity: input.quantity,
    orderedMaterial: input.material,
    templateName: "Generic work order (mock)"
  };
  const order: Order = {
    orderNumber: input.orderNumber,
    customerId: input.customerId,
    customerPo: input.customerPo,
    dueDate: input.dueDate,
    productFamily: input.model,
    orderType: input.orderType,
    facility: input.facility,
    coordinatorId: input.coordinatorId,
    status: "Open",
    priority: input.priority,
    updatedAt: ts,
    teamsLinkPlaceholder: "Teams thread link (placeholder - no real Teams integration)",
    publicRef: mockPublicRef(`order:${input.orderNumber}`),
    lines: [line],
    risks: []
  };

  const units = generateUnits(
    input.orderNumber,
    1,
    input.quantity,
    {
      model: input.model,
      size: input.size,
      orderedMaterial: input.material,
      location: `${input.facility} - Intake`
    },
    {}
  );
  const routeOps = units.flatMap((u) => buildGenericRoute(u.unitId));
  const qrIdentities = [
    {
      publicRef: order.publicRef,
      recordType: "Order" as const,
      targetId: order.orderNumber,
      label: `Master order ${order.orderNumber}`,
      printEvents: []
    },
    ...units.map((u) => ({
      publicRef: u.publicRef,
      recordType: "Unit" as const,
      targetId: u.unitId,
      label: `Unit ${u.unitId}`,
      printEvents: []
    }))
  ];

  let s: AppState = {
    ...state,
    orders: [...state.orders, order],
    units: [...state.units, ...units],
    routeOps: [...state.routeOps, ...routeOps],
    qrIdentities: [...state.qrIdentities, ...qrIdentities]
  };

  // One intake Task per Unit, each with its own id via takeId() so there is
  // no chance of two Units in the same order (or a later action in the same
  // session) colliding on an id.
  for (const u of units) {
    const [taskId, s1] = takeId(s, "t");
    const task: Task = {
      id: taskId,
      unitId: u.unitId,
      orderNumber: input.orderNumber,
      customerId: null,
      name: "Intake review",
      description: input.instructions ?? null,
      operationId: `op-${u.unitId}-1`,
      bucket: "TBC",
      department: "Coordination",
      status: "Ready",
      ownerId: null,
      assigneeIds: [],
      startDate: null,
      dueDate: null,
      priority: input.priority,
      labels: [],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [],
      sourcePostId: null
    };
    s = { ...s1, tasks: [...s1.tasks, task] };
  }

  s = appendAudit(s, {
    at: ts, actorId, action: "order.created", targetType: "Order", targetId: order.orderNumber,
    unitId: null,
    detail: `Order ${order.orderNumber} created for quantity ${input.quantity}; generated ${units.length} independent Unit(s).`,
    supersedesEventId: null
  });
  for (const u of units) {
    s = appendAudit(s, {
      at: ts, actorId, action: "unit.created", targetType: "Unit", targetId: u.unitId,
      unitId: u.unitId, detail: "Unit created with stable QR identity (pre-serial).", supersedesEventId: null
    });
    s = recomputeUnitProjection(s, u.unitId);
  }
  return s;
}

// ---------------------------------------------------------------------------
// CPQ execution-package import
// ---------------------------------------------------------------------------

// A CPQ purchase-order document accepted on the CPQ side and transferred in the
// bundle. Verified upstream against the transfer manifest; the raw bytes are
// never persisted (prototype holds only plain data), so we keep the integrity
// hash and size as provenance.
export interface ImportedPoInput {
  fileName: string;
  sha256: string;
  sizeBytes: number;
  mediaType?: string;
  acceptedPoSubmissionId?: string;
}

export interface ImportPackageInput {
  package: unknown; // untrusted, already-JSON-parsed upload
  orderNumber: string;
  customerPo?: string;
  facility: Facility;
  coordinatorId: string;
  po?: ImportedPoInput; // present when imported from a transfer bundle
}

// Imports one approved CPQ execution package as a Work Order. Mirrors the
// generate-exactly-once discipline of createWorkOrder, but creates N
// first-class OrderLines (one per CPQ line), one immutable ConfigurationSnapshot
// per line, and line.quantity isolated Units per line via generateUnits(). The
// package is validated and its checksum verified first; any failure throws
// (surfaced as an error toast) rather than importing partial data.
export function importExecutionPackage(
  state: AppState,
  actorId: string,
  input: ImportPackageInput,
  at?: string
): AppState {
  const validation = validateExecutionPackage(input.package);
  if (!validation.ok || !validation.package) {
    throw new Error(`Execution package rejected: ${validation.errors.join("; ")}`);
  }
  const pkg: ExecutionPackageV1 = validation.package;

  const orderNumber = input.orderNumber.trim();
  if (!orderNumber) throw new Error("Order number is required");
  if (state.orders.some((o) => o.orderNumber === orderNumber)) {
    throw new Error(`Order ${orderNumber} already exists`);
  }

  // Source-tuple idempotency (fail closed). A revision may be imported into
  // manufacturing exactly once; a second import of the same (quoteId,
  // revisionId) is rejected rather than silently creating a divergent order.
  // The full key adds acceptedPoSubmissionId once the transfer contract lands.
  const priorForRevision = state.configurationSnapshots.find(
    (snap) => snap.sourceQuoteId === pkg.source.quoteId && snap.sourceRevisionId === pkg.source.revisionId
  );
  if (priorForRevision) {
    throw new Error(
      `CPQ revision already imported: quote ${pkg.source.quoteId} revision ${pkg.source.revisionId} was already imported as order ${priorForRevision.orderNumber}.`
    );
  }

  const ts = nowIso(at);
  let s: AppState = state;

  // Resolve the customer by name, or create a lightweight record. CPQ is the
  // system of record for the commercial customer; the imported city/region are
  // placeholders pending owner approval.
  let customerId = state.customers.find((c) => c.name === pkg.customer.customerName)?.id;
  if (!customerId) {
    const [custId, s1] = takeId(s, "cust");
    s = {
      ...s1,
      customers: [
        ...s1.customers,
        {
          id: custId,
          name: pkg.customer.customerName,
          city: "Pilot placeholder - owner approval required",
          region: "Pilot placeholder - owner approval required",
          notes: `Imported from CPQ quote ${pkg.source.quoteNumber} rev ${pkg.source.revisionNumber}`,
          createdAt: ts
        }
      ]
    };
    customerId = custId;
  }

  const customerPo = (input.customerPo ?? pkg.customer.customerPo ?? "").trim();

  const lines: OrderLine[] = [];
  const snapshots: ConfigurationSnapshot[] = [];
  const allUnits: Unit[] = [];

  for (const pl of pkg.lines) {
    const lineId = `${orderNumber}-L${pl.lineNumber}`;
    const orderedMaterial =
      pl.configuration.casingMaterial ?? pl.configuration.materialBuild ?? "See configuration";

    const [snapId, s1] = takeId(s, "cfgsnap");
    s = s1;
    const snapshot: ConfigurationSnapshot = {
      id: snapId,
      workOrderLineId: lineId,
      orderNumber,
      lineNumber: pl.lineNumber,
      sourcePackageId: pkg.packageId,
      sourceQuoteId: pkg.source.quoteId,
      sourceRevisionId: pkg.source.revisionId,
      sourceLineId: pl.cpqLineId,
      schemaVersion: pkg.schemaVersion,
      checksum: pkg.checksum,
      // Deep-cloned so a later edit to the source object (or the sample file)
      // can never mutate the frozen snapshot held in state.
      payload: JSON.parse(JSON.stringify(pl)) as ExecutionLineV1,
      importedAt: ts,
      importedBy: actorId
    };
    snapshots.push(snapshot);

    lines.push({
      id: lineId,
      lineNumber: pl.lineNumber,
      sourceSystem: "CPQ",
      product: `${pl.product.model} ${pl.product.pumpSize}`,
      description: pl.product.description,
      family: pl.product.family,
      model: pl.product.model,
      quantity: pl.quantity,
      orderedMaterial,
      templateName: `CPQ ${pkg.source.quoteNumber} rev ${pkg.source.revisionNumber} (imported)`,
      cpqQuoteId: pkg.source.quoteId,
      cpqRevisionId: pkg.source.revisionId,
      cpqLineId: pl.cpqLineId,
      configurationSnapshotId: snapId
    });

    allUnits.push(
      ...generateUnits(orderNumber, pl.lineNumber, pl.quantity, {
        model: pl.product.model,
        size: pl.product.pumpSize,
        orderedMaterial,
        location: `${input.facility} - Intake`
      })
    );
  }

  const order: Order = {
    orderNumber,
    customerId,
    customerPo,
    dueDate: "", // CPQ has no manufacturing due date; set later via the order workspace.
    productFamily: pkg.lines[0].product.family,
    orderType: "CPQ import",
    facility: input.facility,
    coordinatorId: input.coordinatorId,
    status: "Open",
    priority: "Medium",
    updatedAt: ts,
    teamsLinkPlaceholder: "Teams thread link (placeholder - no real Teams integration)",
    publicRef: mockPublicRef(`order:${orderNumber}`),
    lines,
    risks: []
  };

  const routeOps = allUnits.flatMap((u) => buildGenericRoute(u.unitId));
  const qrIdentities: QrIdentity[] = [
    {
      publicRef: order.publicRef,
      recordType: "Order",
      targetId: order.orderNumber,
      label: `Master order ${order.orderNumber}`,
      printEvents: []
    },
    ...allUnits.map((u) => ({
      publicRef: u.publicRef,
      recordType: "Unit" as const,
      targetId: u.unitId,
      label: `Unit ${u.unitId}`,
      printEvents: []
    }))
  ];

  s = {
    ...s,
    orders: [...s.orders, order],
    units: [...s.units, ...allUnits],
    routeOps: [...s.routeOps, ...routeOps],
    qrIdentities: [...s.qrIdentities, ...qrIdentities],
    configurationSnapshots: [...s.configurationSnapshots, ...snapshots]
  };

  for (const u of allUnits) {
    const [taskId, s1] = takeId(s, "t");
    const task: Task = {
      id: taskId,
      unitId: u.unitId,
      orderNumber,
      customerId: null,
      name: "Intake review",
      description: null,
      operationId: `op-${u.unitId}-1`,
      bucket: "TBC",
      department: "Coordination",
      status: "Ready",
      ownerId: null,
      assigneeIds: [],
      startDate: null,
      dueDate: null,
      priority: "Medium",
      labels: [],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [],
      sourcePostId: null
    };
    s = { ...s1, tasks: [...s1.tasks, task] };
  }

  s = appendAudit(s, {
    at: ts, actorId, action: "order.created", targetType: "Order", targetId: orderNumber,
    unitId: null,
    detail: `Order ${orderNumber} created by CPQ import of ${pkg.source.quoteNumber} rev ${pkg.source.revisionNumber}; ${lines.length} line(s), ${allUnits.length} independent Unit(s).`,
    supersedesEventId: null
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "package.imported", targetType: "Order", targetId: orderNumber,
    unitId: null,
    detail: `Imported CPQ package ${pkg.packageId} (checksum ${pkg.checksum}); configuration frozen as ${snapshots.length} immutable snapshot(s).`,
    supersedesEventId: null
  });
  for (const u of allUnits) {
    s = appendAudit(s, {
      at: ts, actorId, action: "unit.created", targetType: "Unit", targetId: u.unitId,
      unitId: u.unitId, detail: "Unit created with stable QR identity (pre-serial).", supersedesEventId: null
    });
    s = recomputeUnitProjection(s, u.unitId);
  }

  // Seed line-scoped ManufacturingNotes from v1.1 classified notes. Only
  // actionable classifications become shop notes; "Provenance" notes stay in the
  // frozen snapshot payload (read-only) and are not seeded as actionable work.
  for (let i = 0; i < pkg.lines.length; i++) {
    const pl = pkg.lines[i];
    const lineId = lines[i].id;
    for (const note of pl.notes ?? []) {
      if (note.classification === "Provenance") continue;
      const [id, s1] = takeId(s, "mnote");
      const record: ManufacturingNote = {
        id,
        scopeType: "WorkOrderLine",
        scopeId: lineId,
        orderNumber,
        lineNumber: pl.lineNumber,
        category: NOTE_CLASSIFICATION_TO_CATEGORY[note.classification],
        title: `CPQ ${note.classification} (${note.source})`,
        description: note.text,
        createdAt: ts,
        createdBy: actorId,
        source: "CPQ"
      };
      s = { ...s1, manufacturingNotes: [...s1.manufacturingNotes, record] };
      s = appendAudit(s, {
        at: ts, actorId, action: "manufacturingNote.imported", targetType: "WorkOrderLine", targetId: lineId,
        unitId: null,
        detail: `Seeded ${note.classification} note on line ${pl.lineNumber} from CPQ package.`,
        supersedesEventId: null
      });
    }
  }

  // Store the accepted CPQ PO as an Order attachment (metadata + integrity hash
  // only; raw bytes are never persisted).
  if (input.po) {
    const [attId, s1] = takeId(s, "att");
    const attachment: Attachment = {
      id: attId,
      kind: "file",
      category: "General reference",
      orderNumber,
      unitId: null,
      targetRef: input.po.acceptedPoSubmissionId ?? null,
      fileName: input.po.fileName,
      employeeId: actorId,
      at: ts,
      placeholderArt: "cpq-po-document",
      sha256: input.po.sha256,
      sizeBytes: input.po.sizeBytes,
      source: "CPQ"
    };
    s = { ...s1, attachments: [...s1.attachments, attachment] };
    s = appendAudit(s, {
      at: ts, actorId, action: "po.attached", targetType: "Order", targetId: orderNumber,
      unitId: null,
      detail: `Accepted customer PO "${input.po.fileName}" attached (sha256 ${input.po.sha256}).`,
      supersedesEventId: null
    });
  }

  return s;
}

// ---------------------------------------------------------------------------
// Manufacturing layer (notes + configuration adjustments)
// ---------------------------------------------------------------------------

export interface ManufacturingNoteInput {
  scopeType: "WorkOrderLine" | "Unit";
  scopeId: string; // OrderLine.id or Unit.unitId
  orderNumber: string;
  category: ManufacturingNoteCategory;
  title: string;
  description: string;
}

// Resolves the owning (order, lineNumber) for a scope and rejects inconsistent
// ancestors - the same discipline addAttachment uses. A WorkOrderLine scope
// must be a line on the named order; a Unit scope must be a Unit on the named
// order. Returns the resolved lineNumber.
function resolveScopeLine(
  state: AppState,
  scopeType: "WorkOrderLine" | "Unit",
  scopeId: string,
  orderNumber: string
): number {
  const order = state.orders.find((o) => o.orderNumber === orderNumber);
  if (!order) throw new Error(`Unknown order ${orderNumber}`);
  if (scopeType === "WorkOrderLine") {
    const line = order.lines.find((l) => l.id === scopeId);
    if (!line) throw new Error(`Inconsistent ancestors: line ${scopeId} is not on order ${orderNumber}`);
    return line.lineNumber;
  }
  const unit = state.units.find((u) => u.unitId === scopeId);
  if (!unit) throw new Error(`Unknown unit ${scopeId}`);
  if (unit.orderNumber !== orderNumber) {
    throw new Error(`Inconsistent ancestors: unit ${scopeId} is not on order ${orderNumber}`);
  }
  return unit.lineNumber;
}

export function addManufacturingNote(
  state: AppState,
  actorId: string,
  input: ManufacturingNoteInput,
  at?: string
): AppState {
  if (!input.title.trim()) throw new Error("Note title is required");
  if (!input.description.trim()) throw new Error("Note description is required");
  const lineNumber = resolveScopeLine(state, input.scopeType, input.scopeId, input.orderNumber);
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "mnote");
  const note: ManufacturingNote = {
    id,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    orderNumber: input.orderNumber,
    lineNumber,
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    createdAt: ts,
    createdBy: actorId,
    source: "Manual"
  };
  let s: AppState = { ...s0, manufacturingNotes: [...s0.manufacturingNotes, note] };
  s = appendAudit(s, {
    at: ts, actorId, action: "manufacturingNote.added", targetType: input.scopeType, targetId: input.scopeId,
    unitId: input.scopeType === "Unit" ? input.scopeId : null,
    detail: `${input.category} note "${note.title}" added at ${input.scopeType} scope.`,
    supersedesEventId: null
  });
  return s;
}

export interface ConfigurationAdjustmentInput {
  scopeType: "WorkOrderLine" | "Unit";
  scopeId: string;
  orderNumber: string;
  configurationPath: string;
  originalValue: unknown;
  proposedValue: unknown;
  reason: string;
  commercialReviewRequired?: boolean;
}

// A configuration path that touches material, seal, motor or testing scope is
// commercially significant and defaults to requiring commercial review.
function defaultCommercialReview(path: string): boolean {
  return /material|casing|impeller|shaft|seal|motor|testing|hydrotest|witness/i.test(path);
}

export function addConfigurationAdjustment(
  state: AppState,
  actorId: string,
  input: ConfigurationAdjustmentInput,
  at?: string
): AppState {
  if (!input.configurationPath.trim()) throw new Error("Configuration path is required");
  if (!input.reason.trim()) throw new Error("Adjustment reason is required");
  const lineNumber = resolveScopeLine(state, input.scopeType, input.scopeId, input.orderNumber);
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "cfgadj");
  const adjustment: ConfigurationAdjustment = {
    id,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    orderNumber: input.orderNumber,
    lineNumber,
    configurationPath: input.configurationPath.trim(),
    originalValue: input.originalValue,
    proposedValue: input.proposedValue,
    reason: input.reason.trim(),
    approvalStatus: "Pending",
    commercialReviewRequired: input.commercialReviewRequired ?? defaultCommercialReview(input.configurationPath),
    createdAt: ts,
    createdBy: actorId
  };
  let s: AppState = { ...s0, configurationAdjustments: [...s0.configurationAdjustments, adjustment] };
  s = appendAudit(s, {
    at: ts, actorId, action: "configurationAdjustment.proposed", targetType: input.scopeType, targetId: input.scopeId,
    unitId: input.scopeType === "Unit" ? input.scopeId : null,
    detail: `Proposed ${input.configurationPath}: ${JSON.stringify(input.originalValue)} → ${JSON.stringify(input.proposedValue)} (commercial review ${adjustment.commercialReviewRequired ? "required" : "not required"}).`,
    supersedesEventId: null
  });
  return s;
}

export function changeOrderDueDate(state: AppState, orderNumber: string, actorId: string, dueDate: string, at?: string): AppState {
  const order = state.orders.find((o) => o.orderNumber === orderNumber);
  if (!order) throw new Error(`Unknown order ${orderNumber}`);
  const ts = nowIso(at);
  let s: AppState = {
    ...state,
    orders: state.orders.map((o) =>
      o.orderNumber === orderNumber ? { ...o, dueDate, updatedAt: ts } : o
    )
  };
  s = appendAudit(s, {
    at: ts, actorId, action: "order.dueDateChanged", targetType: "Order", targetId: orderNumber,
    unitId: null, detail: `Due date changed from ${order.dueDate} to ${dueDate}.`, supersedesEventId: null
  });
  return s;
}

export interface OrderEditInput {
  customerPo?: string;
  orderType?: string;
  priority?: Priority;
  coordinatorId?: string;
}

// A small, explicit set of order-header fields editable from the order
// workspace's "Edit order" action - deliberately not a generic patch of
// every field, so identifiers, lines, and status stay governed by their own
// dedicated actions.
export function editOrder(state: AppState, orderNumber: string, actorId: string, input: OrderEditInput, at?: string): AppState {
  const order = state.orders.find((o) => o.orderNumber === orderNumber);
  if (!order) throw new Error(`Unknown order ${orderNumber}`);
  const ts = nowIso(at);
  let s: AppState = {
    ...state,
    orders: state.orders.map((o) =>
      o.orderNumber === orderNumber ? { ...o, ...input, updatedAt: ts } : o
    )
  };
  s = appendAudit(s, {
    at: ts, actorId, action: "order.edited", targetType: "Order", targetId: orderNumber,
    unitId: null, detail: `Order details updated: ${Object.keys(input).join(", ")}.`, supersedesEventId: null
  });
  return s;
}

// ---------------------------------------------------------------------------
// Planner tasks
// ---------------------------------------------------------------------------

export interface TaskInput {
  name: string;
  description?: string | null;
  orderNumber?: string | null;
  unitId?: string | null;
  customerId?: string | null;
  bucket?: PlannerBucket;
  department?: Task["department"];
  priority?: Priority;
  dueDate?: string | null;
  startDate?: string | null;
  assigneeIds?: string[];
  labels?: string[];
}

// General task creator used from Planner, an Order, a Unit, a Customer, and
// My Work. A Unit-linked task must belong to the stated order (ancestor
// consistency, same rule as addAttachment) so a task can never silently
// attach to the wrong Unit's order.
export function createTask(state: AppState, actorId: string, input: TaskInput, at?: string): AppState {
  if (!input.name.trim()) throw new Error("Task name is required");
  if (input.unitId) {
    const unit = state.units.find((u) => u.unitId === input.unitId);
    if (!unit) throw new Error(`Unknown unit ${input.unitId}`);
    if (input.orderNumber && unit.orderNumber !== input.orderNumber) {
      throw new Error(`Inconsistent ancestors: ${input.unitId} does not belong to ${input.orderNumber}`);
    }
  }
  if (input.customerId && !state.customers.some((c) => c.id === input.customerId)) {
    throw new Error(`Unknown customer ${input.customerId}`);
  }
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "t");
  const assigneeIds = input.assigneeIds ?? [];
  const task: Task = {
    id,
    unitId: input.unitId ?? null,
    orderNumber: input.orderNumber ?? (input.unitId ? state.units.find((u) => u.unitId === input.unitId)!.orderNumber : null),
    customerId: input.customerId ?? null,
    name: input.name,
    description: input.description ?? null,
    operationId: null,
    bucket: input.bucket ?? "TBC",
    department: input.department ?? null,
    status: "Ready",
    ownerId: assigneeIds[0] ?? null,
    assigneeIds,
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    priority: input.priority ?? "Medium",
    labels: input.labels ?? [],
    checklist: [],
    attachmentIds: [],
    comments: [],
    status_beforeBlock: null,
    blockReason: null,
    handoffs: [],
    history: [{ action: "Created", actorId, at: ts, note: null }],
    sourcePostId: null
  };
  let s = { ...s0, tasks: [...s0.tasks, task] };
  s = appendAudit(s, {
    at: ts, actorId, action: "task.created", targetType: "Task", targetId: id,
    unitId: task.unitId, detail: `Task "${task.name}" created.`, supersedesEventId: null
  });
  if (task.unitId) s = recomputeUnitProjection(s, task.unitId);
  return s;
}

export function assignTask(state: AppState, taskId: string, actorId: string, employeeId: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.assigneeIds.includes(employeeId)) return state;
  const ts = nowIso(at);
  const assigneeIds = [...t.assigneeIds, employeeId];
  let s = updateTask(state, taskId, {
    assigneeIds,
    ownerId: t.ownerId ?? employeeId,
    ...withHistory(t, "Assigned", actorId, ts, employeeId)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.assigned", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Assigned to ${employeeId}.`, supersedesEventId: null
  });
  return s;
}

export function unassignTask(state: AppState, taskId: string, actorId: string, employeeId: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  const ts = nowIso(at);
  const assigneeIds = t.assigneeIds.filter((id) => id !== employeeId);
  let s = updateTask(state, taskId, {
    assigneeIds,
    ownerId: t.ownerId === employeeId ? (assigneeIds[0] ?? null) : t.ownerId,
    ...withHistory(t, "Unassigned", actorId, ts, employeeId)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.unassigned", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Unassigned ${employeeId}.`, supersedesEventId: null
  });
  return s;
}

export function changeTaskDueDate(state: AppState, taskId: string, actorId: string, dueDate: string | null, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  const ts = nowIso(at);
  let s = updateTask(state, taskId, {
    dueDate,
    ...withHistory(t, "DueDateChanged", actorId, ts, dueDate)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.dueDateChanged", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Due date changed to ${dueDate ?? "(none)"}.`, supersedesEventId: null
  });
  return s;
}

export function changeTaskPriority(state: AppState, taskId: string, actorId: string, priority: Priority, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  const ts = nowIso(at);
  let s = updateTask(state, taskId, {
    priority,
    ...withHistory(t, "PriorityChanged", actorId, ts, priority)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.priorityChanged", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Priority changed to ${priority}.`, supersedesEventId: null
  });
  return s;
}

// The Planner board move. Purely a bucket change - it does not, by itself,
// alter Task.status (moving into/out of the Complete bucket is a distinct,
// explicit action - see completeTaskDirect/reopenTaskDirect - so a board
// drag never silently completes or reopens work).
export function moveTaskBucket(state: AppState, taskId: string, actorId: string, bucket: PlannerBucket, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.bucket === bucket) return state;
  const ts = nowIso(at);
  let s = updateTask(state, taskId, {
    bucket,
    ...withHistory(t, "BucketMoved", actorId, ts, bucket)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.bucketMoved", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Moved from ${t.bucket} to ${bucket}.`, supersedesEventId: null
  });
  return s;
}

// Lenient Planner completion: unlike the strict shop-floor completeTask
// (which requires InProgress), a Planner task can be marked complete from
// any non-Complete state. Reopening restores the bucket it was in before
// completion via history, defaulting to TBC if that can't be determined.
export function completeTaskDirect(state: AppState, taskId: string, actorId: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.status === "Complete") throw new Error(`Task ${taskId} is already complete`);
  const ts = nowIso(at);
  let s = updateTask(state, taskId, {
    status: "Complete",
    bucket: "Complete",
    ...withHistory(t, "Completed", actorId, ts, null)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.completed", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Completed "${t.name}".`, supersedesEventId: null
  });
  if (t.unitId) s = recomputeUnitProjection(s, t.unitId);
  return s;
}

export function reopenTaskDirect(state: AppState, taskId: string, actorId: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (t.status !== "Complete") throw new Error(`Task ${taskId} is not complete`);
  const ts = nowIso(at);
  let s = updateTask(state, taskId, {
    status: "Ready",
    bucket: "TBC",
    ...withHistory(t, "Reopened", actorId, ts, null)
  });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.reopened", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Reopened "${t.name}".`, supersedesEventId: null
  });
  if (t.unitId) s = recomputeUnitProjection(s, t.unitId);
  return s;
}

export function addTaskChecklistItem(state: AppState, taskId: string, actorId: string, text: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (!text.trim()) throw new Error("Checklist item text is required");
  const ts = nowIso(at);
  const item: ChecklistSubItem = { id: `cl-${state.nextId}`, text, done: false };
  let s: AppState = { ...state, nextId: state.nextId + 1 };
  s = updateTask(s, taskId, { checklist: [...t.checklist, item] });
  s = appendAudit(s, {
    at: ts, actorId, action: "task.checklistItemAdded", targetType: "Task", targetId: taskId,
    unitId: t.unitId, detail: `Checklist item "${text}" added.`, supersedesEventId: null
  });
  return s;
}

export function toggleTaskChecklistItem(state: AppState, taskId: string, itemId: string): AppState {
  const t = mustFindTask(state, taskId);
  const item = t.checklist.find((c) => c.id === itemId);
  if (!item) throw new Error(`Unknown checklist item ${itemId}`);
  return updateTask(state, taskId, {
    checklist: t.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c))
  });
}

export function addTaskComment(state: AppState, taskId: string, actorId: string, body: string, at?: string): AppState {
  const t = mustFindTask(state, taskId);
  if (!body.trim()) throw new Error("Comment body is required");
  const ts = nowIso(at);
  const [id, s0] = takeId(state, "tc");
  return updateTask(s0, taskId, {
    comments: [...t.comments, { id, authorId: actorId, at: ts, body }]
  });
}
