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
  ConvertedKind,
  HandoffRecord,
  MaterialChange,
  Problem,
  SaveState,
  SpecialInstruction,
  Task,
  TaskStatus
} from "./types";

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
      name: input.name ?? post.body.slice(0, 80),
      operationId: null,
      status: "Ready",
      ownerId: null,
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
