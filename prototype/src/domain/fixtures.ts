// Deterministic mock fixture data for the vertical-slice prototype.
// Every order number, customer, PO, serial, and pallet destination below is
// invented demonstration data and does not correspond to any real Rotech
// order, customer, or shipment. No customer-sensitive data is present.

import { generateUnits, mockPublicRef, unitIdFor } from "./ids";
import { recomputeUnitProjection } from "./projections";
import type {
  AppState,
  ChecklistItemDef,
  Contact,
  Customer,
  Employee,
  Order,
  QrIdentity,
  RouteOperation,
  Task,
  Unit
} from "./types";

export const ORDER_NO = "SAMPLE1001";
export const HOUSTON_ORDER_NO = "SAMPLE1002";

// A few Planner-only task due dates are computed relative to "now" (not a
// fixed fictional date) so the My Work overdue/due-soon sections stay
// believable no matter when this prototype is actually opened.
function addDaysIso(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

const employees: Employee[] = [
  { id: "e-alex", name: "Alex Nguyen", role: "Technician", department: "Assembly", facility: "Mississauga" },
  { id: "e-sarah", name: "Sarah Kowalski", role: "Order Coordinator", department: "Coordination", facility: "Mississauga" },
  { id: "e-miguel", name: "Miguel Torres", role: "Technician", department: "Assembly", facility: "Mississauga" },
  { id: "e-priya", name: "Priya Sharma", role: "Quality Inspector", department: "Quality", facility: "Mississauga" },
  { id: "e-dave", name: "Dave McAllister", role: "Production Manager", department: "Assembly", facility: "Mississauga" },
  { id: "e-lena", name: "Lena Fischer", role: "Engineering", department: "Machining", facility: "Mississauga" },
  { id: "e-tom", name: "Tom Reyes", role: "Shipping", department: "Shipping", facility: "Mississauga" },
  { id: "e-omar", name: "Omar Haddad", role: "Machinist", department: "Machining", facility: "Houston" }
];

export const CUSTOMER_ACME = "cust-acme";
export const CUSTOMER_SAMPLE_PUMP = "cust-samplepump";
export const CUSTOMER_THIRDCO = "cust-thirdco";

const customers: Customer[] = [
  {
    id: CUSTOMER_ACME,
    name: "Acme Sample Industries",
    city: "Fairview",
    region: "TX",
    notes: "Primary demo customer. Fictional - not a real Rotech account.",
    createdAt: "2026-06-01T13:00:00Z"
  },
  {
    id: CUSTOMER_SAMPLE_PUMP,
    name: "Sample Pump Services",
    city: "Houston",
    region: "TX",
    notes: "Fictional demo customer for the Houston facility view.",
    createdAt: "2026-06-02T09:00:00Z"
  },
  {
    id: CUSTOMER_THIRDCO,
    name: "Thirdco Fabrication (mock)",
    city: "Example City",
    region: "TX",
    notes: "No orders yet - demonstrates an empty order/task history on the customer page.",
    createdAt: "2026-07-01T10:00:00Z"
  }
];

const contacts: Contact[] = [
  { id: "cont-acme-1", customerId: CUSTOMER_ACME, name: "Jordan Blake", email: "jordan.blake@example.com", phone: "555-0101", role: "Purchasing", createdAt: "2026-06-01T13:05:00Z" },
  { id: "cont-acme-2", customerId: CUSTOMER_ACME, name: "Riley Chen", email: "riley.chen@example.com", phone: "555-0102", role: "Plant Engineer", createdAt: "2026-06-01T13:06:00Z" },
  { id: "cont-sample-1", customerId: CUSTOMER_SAMPLE_PUMP, name: "Morgan Diaz", email: "morgan.diaz@example.com", phone: "555-0201", role: "Operations", createdAt: "2026-06-02T09:05:00Z" }
];

const mainOrder: Order = {
  orderNumber: ORDER_NO,
  customerId: CUSTOMER_ACME,
  customerPo: "DEMO-0001",
  dueDate: "2026-07-28",
  productFamily: "ANSI 1196",
  orderType: "Bare pump end",
  facility: "Mississauga",
  coordinatorId: "e-sarah",
  status: "In production",
  priority: "High",
  updatedAt: "2026-07-17T21:58:00Z",
  teamsLinkPlaceholder: "Teams thread link (placeholder - no real Teams integration)",
  publicRef: mockPublicRef(`order:${ORDER_NO}`),
  lines: [
    {
      id: `${ORDER_NO}-L1`,
      lineNumber: 1,
      sourceSystem: "Manual",
      product: "1196 3x4-13",
      description: "ANSI 1196 bare pump end, 3x4-13",
      family: "1196",
      model: "1196",
      quantity: 5,
      orderedMaterial: "316SS",
      templateName: "1196 bare pump end rev 1 (mock)"
    }
  ],
  risks: [
    "CD4MCu material change approved for Unit 1.1 - verify as-built record before release",
    "Unit 1.3 blocked - impeller casting not received (supplier ETA Jul 22)",
    "Unit 1.4 axial play flagged Needs Review against placeholder limit"
  ]
};

const houstonOrder: Order = {
  orderNumber: HOUSTON_ORDER_NO,
  customerId: CUSTOMER_SAMPLE_PUMP,
  customerPo: "DEMO-0002",
  dueDate: "2026-08-14",
  productFamily: "Machining",
  orderType: "Stub shaft machining",
  facility: "Houston",
  coordinatorId: "e-sarah",
  status: "In production",
  priority: "Medium",
  updatedAt: "2026-07-17T16:35:00Z",
  teamsLinkPlaceholder: "Teams thread link (placeholder - no real Teams integration)",
  publicRef: mockPublicRef(`order:${HOUSTON_ORDER_NO}`),
  lines: [
    {
      id: `${HOUSTON_ORDER_NO}-L1`,
      lineNumber: 1,
      sourceSystem: "Manual",
      product: "Stub shaft 4140",
      description: "Machined stub shafts per drawing (mock)",
      family: "Machining",
      model: "Stub shaft",
      quantity: 2,
      orderedMaterial: "4140",
      templateName: "Machining rev 1 (mock)"
    }
  ],
  risks: []
};

// Five independent Units in five different states so quantity progress is
// visible. Unit 1.1 carries an approved CD4MCu material change; every other
// Unit remains at the ordered 316SS.
const mainUnits: Unit[] = generateUnits(
  ORDER_NO,
  1,
  5,
  {
    model: "1196",
    size: "3x4-13",
    orderedMaterial: "316SS",
    location: "Mississauga - Assembly floor"
  },
  {
    1: {
      serial: "DEMO-SN-0001",
      status: "Complete",
      asBuiltMaterial: "CD4MCu",
      location: "Mississauga - Shipping staging",
      currentOperation: "Released - packaging complete"
    },
    2: {
      status: "InAssembly",
      location: "Mississauga - Machining bay 2",
      currentOperation: "Impeller trim"
    },
    3: {
      status: "Blocked",
      location: "Mississauga - Parts staging",
      currentOperation: "Verify impeller material",
      holdReason: "Missing impeller casting (supplier ETA Jul 22)"
    },
    4: {
      status: "AwaitingQuality",
      location: "Mississauga - Quality bench",
      currentOperation: "Final quality inspection"
    },
    5: {
      status: "NotStarted",
      location: "Mississauga - Parts staging",
      currentOperation: "Intake review"
    }
  }
);

const houstonUnits: Unit[] = generateUnits(
  HOUSTON_ORDER_NO,
  1,
  2,
  {
    model: "Stub shaft",
    size: "per drawing",
    orderedMaterial: "4140",
    location: "Houston - Machining"
  },
  {
    1: { status: "InAssembly", currentOperation: "Machine stub shaft" },
    2: { status: "NotStarted", currentOperation: "Receive material" }
  }
);

const ROUTE_1196: Array<{ name: string; department: RouteOperation["department"] }> = [
  { name: "Intake review", department: "Coordination" },
  { name: "Pull and tag parts", department: "Assembly" },
  { name: "Verify impeller material", department: "Assembly" },
  { name: "Powerframe leak / free rotation", department: "Assembly" },
  { name: "Impeller trim", department: "Machining" },
  { name: "Runout and axial play", department: "Assembly" },
  { name: "Pump travel and impeller clearance", department: "Assembly" },
  { name: "Hydrotest", department: "Quality" },
  { name: "Nameplate", department: "Assembly" },
  { name: "Final quality inspection", department: "Quality" },
  { name: "Packaging", department: "Shipping" }
];

function routeFor(unitId: string, completeThrough: number, current: { seq: number; status: RouteOperation["status"] } | null): RouteOperation[] {
  return ROUTE_1196.map((op, i) => {
    const seq = i + 1;
    let status: RouteOperation["status"] = "NotStarted";
    if (seq <= completeThrough) status = "Complete";
    else if (current && seq === current.seq) status = current.status;
    else if (seq === completeThrough + 1 && !current) status = "Ready";
    return { id: `op-${unitId}-${seq}`, unitId, seq, name: op.name, department: op.department, status };
  });
}

const routeOps: RouteOperation[] = [
  ...routeFor(unitIdFor(ORDER_NO, 1, 1), 11, null),
  ...routeFor(unitIdFor(ORDER_NO, 1, 2), 4, { seq: 5, status: "InProgress" }),
  ...routeFor(unitIdFor(ORDER_NO, 1, 3), 2, { seq: 3, status: "Blocked" }),
  ...routeFor(unitIdFor(ORDER_NO, 1, 4), 9, { seq: 10, status: "Ready" }),
  ...routeFor(unitIdFor(ORDER_NO, 1, 5), 0, { seq: 1, status: "Ready" })
];

const U = (seq: number) => unitIdFor(ORDER_NO, 1, seq);

// Shop-floor tasks (Unit-linked, route-driven). Every task now carries the
// full Planner field set; fields not meaningful for a route task (labels,
// checklist, comments, dueDate) default to empty/null rather than being
// backfilled with invented content.
const shopFloorTasks: Task[] = [
  {
    id: "t-11-final",
    unitId: U(1),
    orderNumber: ORDER_NO,
    customerId: null,
    name: "Final quality inspection",
    description: null,
    operationId: `op-${U(1)}-10`,
    bucket: "Complete",
    department: "Quality",
    status: "Complete",
    ownerId: "e-priya",
    assigneeIds: ["e-priya"],
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
    history: [
      { action: "Started", actorId: "e-priya", at: "2026-07-15T14:05:00Z", note: null },
      { action: "Completed", actorId: "e-priya", at: "2026-07-15T15:40:00Z", note: "All checklist items pass; release approved." }
    ],
    sourcePostId: null
  },
  {
    id: "t-12-trim",
    unitId: U(2),
    orderNumber: ORDER_NO,
    customerId: null,
    name: "Machine impeller trim to 12.50 in",
    description: null,
    operationId: `op-${U(2)}-5`,
    bucket: "Machining",
    department: "Machining",
    status: "Paused",
    ownerId: "e-miguel",
    assigneeIds: ["e-miguel"],
    startDate: null,
    dueDate: null,
    priority: "High",
    labels: [],
    checklist: [],
    attachmentIds: [],
    comments: [],
    status_beforeBlock: null,
    blockReason: null,
    handoffs: [
      {
        id: "ho-fixture-1201",
        reason: "End of shift",
        completedWork: "Impeller mounted in lathe, rough cut to 12.58 in complete.",
        remainingWork: "Finish cut to 12.50 in, deburr, record final measurement with photo.",
        location: "Machining bay 2, lathe L-3",
        storageState: "Impeller secured in chuck, machine locked out",
        blockerItem: null,
        note: "Inserts changed at start of cut - roughly 40 min of tool life used.",
        byId: "e-miguel",
        at: "2026-07-17T21:58:00Z",
        supersedesId: null
      }
    ],
    history: [
      { action: "Started", actorId: "e-miguel", at: "2026-07-17T19:12:00Z", note: null },
      { action: "Paused", actorId: "e-miguel", at: "2026-07-17T21:58:00Z", note: "End of shift handoff recorded." }
    ],
    sourcePostId: null
  },
  {
    id: "t-13-verify",
    unitId: U(3),
    orderNumber: ORDER_NO,
    customerId: null,
    name: "Verify impeller material",
    description: null,
    operationId: `op-${U(3)}-3`,
    bucket: "PartsPicked",
    department: "Assembly",
    status: "Blocked",
    ownerId: null,
    assigneeIds: [],
    startDate: null,
    dueDate: null,
    priority: "High",
    labels: [],
    checklist: [],
    attachmentIds: [],
    comments: [],
    status_beforeBlock: "Ready",
    blockReason: "Impeller casting not received (supplier ETA Jul 22)",
    handoffs: [],
    history: [
      { action: "Blocked", actorId: "e-dave", at: "2026-07-16T13:20:00Z", note: "Casting missed the truck; new ETA Jul 22." }
    ],
    sourcePostId: null
  },
  {
    id: "t-14-quality",
    unitId: U(4),
    orderNumber: ORDER_NO,
    customerId: null,
    name: "Final quality inspection",
    description: null,
    operationId: `op-${U(4)}-10`,
    bucket: "Quality",
    department: "Quality",
    status: "Ready",
    ownerId: "e-priya",
    assigneeIds: ["e-priya"],
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
  },
  {
    id: "t-15-intake",
    unitId: U(5),
    orderNumber: ORDER_NO,
    customerId: null,
    name: "Intake review",
    description: null,
    operationId: `op-${U(5)}-1`,
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
  },
  {
    id: "t-h1-machine",
    unitId: unitIdFor(HOUSTON_ORDER_NO, 1, 1),
    orderNumber: HOUSTON_ORDER_NO,
    customerId: null,
    name: "Machine stub shaft per drawing",
    description: null,
    operationId: null,
    bucket: "Machining",
    department: "Machining",
    status: "InProgress",
    ownerId: "e-omar",
    assigneeIds: ["e-omar"],
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
    history: [{ action: "Started", actorId: "e-omar", at: "2026-07-17T16:30:00Z", note: null }],
    sourcePostId: null
  }
];

// Representative 1196 checklist. Numeric limits are NOT approved engineering
// tolerances; every placeholder is labelled in the UI as
// "Pilot placeholder - owner approval required" (decision D-013 is pending).
const checklistDefs: ChecklistItemDef[] = [
  { key: "verify-parts", label: "Verify parts against pick list", responseType: "checkbox", unit: null, nominal: null, min: null, max: null, requiresPhoto: false, requiresNote: false, placeholderTolerance: false },
  { key: "casing-material", label: "Verify casing material marking", responseType: "passfail", unit: null, nominal: null, min: null, max: null, requiresPhoto: true, requiresNote: false, placeholderTolerance: false },
  { key: "impeller-material", label: "Verify impeller material marking", responseType: "passfail", unit: null, nominal: null, min: null, max: null, requiresPhoto: true, requiresNote: false, placeholderTolerance: false },
  { key: "visual-inspection", label: "Visual inspection of machined surfaces", responseType: "passfail", unit: null, nominal: null, min: null, max: null, requiresPhoto: false, requiresNote: false, placeholderTolerance: false },
  { key: "free-rotation", label: "Powerframe free-rotation evidence", responseType: "passfail", unit: null, nominal: null, min: null, max: null, requiresPhoto: true, requiresNote: false, placeholderTolerance: false },
  { key: "impeller-trim", label: "Impeller trim diameter", responseType: "measurement", unit: "in", nominal: 12.5, min: 12.45, max: 12.55, requiresPhoto: true, requiresNote: false, placeholderTolerance: true },
  { key: "shaft-runout", label: "Shaft/sleeve runout", responseType: "measurement", unit: "thou", nominal: null, min: null, max: 2, requiresPhoto: false, requiresNote: false, placeholderTolerance: true },
  { key: "axial-play", label: "Axial play", responseType: "measurement", unit: "thou", nominal: null, min: null, max: 2, requiresPhoto: false, requiresNote: false, placeholderTolerance: true },
  { key: "impeller-clearance", label: "Impeller clearance", responseType: "measurement", unit: "thou", nominal: 15, min: 10, max: 20, requiresPhoto: false, requiresNote: false, placeholderTolerance: true },
  { key: "hydrotest", label: "Hydrotest (pressure/duration per spec)", responseType: "passfail", unit: null, nominal: null, min: null, max: null, requiresPhoto: true, requiresNote: true, placeholderTolerance: true },
  { key: "nameplate", label: "Nameplate installed and stamped", responseType: "checkbox", unit: null, nominal: null, min: null, max: null, requiresPhoto: true, requiresNote: false, placeholderTolerance: false },
  { key: "final-quality", label: "Final quality inspection", responseType: "passfail", unit: null, nominal: null, min: null, max: null, requiresPhoto: false, requiresNote: true, placeholderTolerance: false },
  { key: "packaging-photo", label: "Packaging complete with photo", responseType: "checkbox", unit: null, nominal: null, min: null, max: null, requiresPhoto: true, requiresNote: false, placeholderTolerance: false }
];

export function buildInitialState(): AppState {
  const units = [...mainUnits, ...houstonUnits];
  const now = new Date();

  // Planner-only tasks: no Unit link, exercising every bucket/section this
  // expansion adds. Several are deliberately assigned to the default acting
  // employee (e-alex) so My Work's six sections all have something to show
  // out of the box.
  const plannerTasks: Task[] = [
    {
      id: "t-plan-overdue",
      unitId: null,
      orderNumber: ORDER_NO,
      customerId: null,
      name: "Confirm hydrotest fixture availability",
      description: "Coordinate with Quality to reserve the hydrotest rig before Unit 1.4 reaches that step.",
      operationId: null,
      bucket: "OrderPlanning",
      department: "Coordination",
      status: "Ready",
      ownerId: "e-alex",
      assigneeIds: ["e-alex"],
      startDate: addDaysIso(now, -7),
      dueDate: addDaysIso(now, -3),
      priority: "High",
      labels: ["Fixture"],
      checklist: [
        { id: "cl-1", text: "Check fixture calendar", done: true },
        { id: "cl-2", text: "Confirm with Quality lead", done: false }
      ],
      attachmentIds: [],
      comments: [
        { id: "cm-1", authorId: "e-dave", at: addDaysIso(now, -5), body: "Rig is booked through Thursday - check with Priya." }
      ],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [{ action: "CreatedFromPlanner", actorId: "e-sarah", at: addDaysIso(now, -7), note: null }],
      sourcePostId: null
    },
    {
      id: "t-plan-duetoday",
      unitId: null,
      orderNumber: ORDER_NO,
      customerId: null,
      name: "Confirm crate specs with shipping",
      description: null,
      operationId: null,
      bucket: "Packaging",
      department: "Shipping",
      status: "Ready",
      ownerId: "e-alex",
      assigneeIds: ["e-alex", "e-tom"],
      startDate: null,
      dueDate: addDaysIso(now, 0),
      priority: "Medium",
      labels: [],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [{ action: "CreatedFromPlanner", actorId: "e-sarah", at: addDaysIso(now, -2), note: null }],
      sourcePostId: null
    },
    {
      id: "t-plan-dueweek",
      unitId: null,
      orderNumber: ORDER_NO,
      customerId: null,
      name: "Review Unit 1.5 intake paperwork",
      description: null,
      operationId: null,
      bucket: "Quality",
      department: "Quality",
      status: "Ready",
      ownerId: "e-alex",
      assigneeIds: ["e-alex"],
      startDate: null,
      dueDate: addDaysIso(now, 3),
      priority: "Medium",
      labels: [],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [{ action: "CreatedFromPlanner", actorId: "e-sarah", at: addDaysIso(now, -1), note: null }],
      sourcePostId: null
    },
    {
      id: "t-plan-inprogress",
      unitId: null,
      orderNumber: ORDER_NO,
      customerId: null,
      name: "Draft Unit 1.2 special instruction verification report",
      description: null,
      operationId: null,
      bucket: "AssemblyTesting",
      department: "Assembly",
      status: "InProgress",
      ownerId: "e-alex",
      assigneeIds: ["e-alex"],
      startDate: addDaysIso(now, -1),
      dueDate: addDaysIso(now, 5),
      priority: "Medium",
      labels: ["Report"],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [{ action: "Started", actorId: "e-alex", at: addDaysIso(now, -1), note: null }],
      sourcePostId: null
    },
    {
      id: "t-plan-blocked",
      unitId: null,
      orderNumber: ORDER_NO,
      customerId: null,
      name: "Await customer sign-off on CD4MCu change letter",
      description: null,
      operationId: null,
      bucket: "OnHold",
      department: "Coordination",
      status: "Blocked",
      ownerId: "e-alex",
      assigneeIds: ["e-alex"],
      startDate: null,
      dueDate: addDaysIso(now, 4),
      priority: "High",
      labels: [],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: "Ready",
      blockReason: "Waiting on customer sign-off",
      handoffs: [],
      history: [{ action: "Blocked", actorId: "e-alex", at: addDaysIso(now, -1), note: "Waiting on customer sign-off" }],
      sourcePostId: null
    },
    {
      id: "t-plan-completed",
      unitId: null,
      orderNumber: ORDER_NO,
      customerId: null,
      name: "Send milestone update to coordinator",
      description: null,
      operationId: null,
      bucket: "Complete",
      department: "Coordination",
      status: "Complete",
      ownerId: "e-alex",
      assigneeIds: ["e-alex"],
      startDate: null,
      dueDate: addDaysIso(now, -2),
      priority: "Low",
      labels: [],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [
        { action: "Started", actorId: "e-alex", at: addDaysIso(now, -3), note: null },
        { action: "Completed", actorId: "e-alex", at: addDaysIso(now, -2), note: null }
      ],
      sourcePostId: null
    },
    {
      id: "t-plan-customer",
      unitId: null,
      orderNumber: null,
      customerId: CUSTOMER_ACME,
      name: "Follow up on Q3 duplex material pricing",
      description: "Customer asked about CD4MCu pricing for future orders - not tied to a specific work order yet.",
      operationId: null,
      bucket: "TBC",
      department: null,
      status: "Ready",
      ownerId: null,
      assigneeIds: [],
      startDate: null,
      dueDate: addDaysIso(now, 2),
      priority: "Medium",
      labels: ["Account"],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [{ action: "CreatedFromCustomer", actorId: "e-sarah", at: addDaysIso(now, -4), note: null }],
      sourcePostId: null
    },
    {
      id: "t-plan-houston",
      unitId: null,
      orderNumber: HOUSTON_ORDER_NO,
      customerId: null,
      name: "Source replacement lathe insert",
      description: null,
      operationId: null,
      bucket: "Machining",
      department: "Machining",
      status: "InProgress",
      ownerId: "e-omar",
      assigneeIds: ["e-omar"],
      startDate: null,
      dueDate: addDaysIso(now, 6),
      priority: "Low",
      labels: [],
      checklist: [],
      attachmentIds: [],
      comments: [],
      status_beforeBlock: null,
      blockReason: null,
      handoffs: [],
      history: [{ action: "CreatedFromPlanner", actorId: "e-sarah", at: addDaysIso(now, -1), note: null }],
      sourcePostId: null
    }
  ];

  const tasks: Task[] = [...shopFloorTasks, ...plannerTasks];

  const qrIdentities: QrIdentity[] = [
    {
      publicRef: mainOrder.publicRef,
      recordType: "Order",
      targetId: ORDER_NO,
      label: `Master order ${ORDER_NO}`,
      printEvents: [{ at: "2026-07-10T15:00:00Z", byId: "e-sarah", reason: "Initial Work Order Plan print" }]
    },
    ...mainUnits.map((u) => ({
      publicRef: u.publicRef,
      recordType: "Unit" as const,
      targetId: u.unitId,
      label: `Unit ${u.unitId}`,
      printEvents:
        u.sequence === 1
          ? [
              { at: "2026-07-10T15:05:00Z", byId: "e-sarah", reason: "Initial tag print (pre-serial)" },
              { at: "2026-07-14T18:20:00Z", byId: "e-dave", reason: "Reprint after serial assignment" }
            ]
          : [{ at: "2026-07-10T15:05:00Z", byId: "e-sarah", reason: "Initial tag print (pre-serial)" }]
    })),
    {
      publicRef: mockPublicRef("component:CMP-IMP-0412"),
      recordType: "Component",
      targetId: "CMP-IMP-0412",
      label: "Impeller casting 13 in",
      printEvents: [{ at: "2026-07-11T14:00:00Z", byId: "e-dave", reason: "Component tag at receipt" }]
    },
    {
      publicRef: mockPublicRef("lot:LOT-316-2231"),
      recordType: "MaterialLot",
      targetId: "LOT-316-2231",
      label: "316SS bar stock lot",
      printEvents: [{ at: "2026-07-08T12:00:00Z", byId: "e-dave", reason: "Lot label at receipt/inspection" }]
    },
    {
      publicRef: mockPublicRef("transfer:TR-0088"),
      recordType: "Transfer",
      targetId: "TR-0088",
      label: "Internal transfer TR-0088",
      printEvents: [{ at: "2026-07-16T16:30:00Z", byId: "e-tom", reason: "Transfer tag at preparation" }]
    },
    {
      publicRef: mockPublicRef("pallet:PAL-0031"),
      recordType: "Pallet",
      targetId: "PAL-0031",
      label: "Pallet PAL-0031",
      printEvents: [{ at: "2026-07-15T20:10:00Z", byId: "e-tom", reason: "Pallet label at packaging" }]
    },
    {
      publicRef: mockPublicRef("pallet:PAL-0032"),
      recordType: "Pallet",
      targetId: "PAL-0032",
      label: "Pallet PAL-0032",
      printEvents: [{ at: "2026-07-16T19:40:00Z", byId: "e-tom", reason: "Pallet label at packaging" }]
    }
  ];

  const initial: AppState = {
    currentUserId: "e-alex",
    employees,
    customers,
    contacts,
    orders: [mainOrder, houstonOrder],
    units,
    routeOps,
    tasks,
    checklistDefs,
    responses: [
      // Unit 1.1 - complete history, including one superseded correction.
      { id: "r-11-parts", unitId: U(1), itemKey: "verify-parts", value: true, enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-11T14:30:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-casing", unitId: U(1), itemKey: "casing-material", value: "pass", enteredText: null, note: "CD4MCu heat stamp verified (approved change MC-001).", photoAttachmentId: "a-material-11", technicianId: "e-alex", at: "2026-07-11T15:10:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-impmat", unitId: U(1), itemKey: "impeller-material", value: "pass", enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-11T15:25:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-visual", unitId: U(1), itemKey: "visual-inspection", value: "pass", enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-12T13:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-freerot", unitId: U(1), itemKey: "free-rotation", value: "pass", enteredText: null, note: null, photoAttachmentId: "a-freerot-11", technicianId: "e-miguel", at: "2026-07-12T15:45:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-trim-v1", unitId: U(1), itemKey: "impeller-trim", value: 12.56, enteredText: "12.56", note: "Entry error - superseded.", photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-13T14:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-trim-v2", unitId: U(1), itemKey: "impeller-trim", value: 12.51, enteredText: "12.51", note: "Corrected transcription; caliper photo attached.", photoAttachmentId: "a-trim-11", technicianId: "e-miguel", at: "2026-07-13T14:20:00Z", state: "Saved", supersedesId: "r-11-trim-v1" },
      { id: "r-11-runout", unitId: U(1), itemKey: "shaft-runout", value: 1.0, enteredText: "1.0", note: null, photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-13T15:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-axial", unitId: U(1), itemKey: "axial-play", value: 1.5, enteredText: "1.5", note: null, photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-13T15:20:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-clear", unitId: U(1), itemKey: "impeller-clearance", value: 14, enteredText: "14", note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-14T13:30:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-hydro", unitId: U(1), itemKey: "hydrotest", value: "pass", enteredText: null, note: "Held test pressure 10 min, no leaks (placeholder spec).", photoAttachmentId: null, technicianId: "e-priya", at: "2026-07-14T16:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-name", unitId: U(1), itemKey: "nameplate", value: true, enteredText: null, note: null, photoAttachmentId: "a-nameplate-11", technicianId: "e-alex", at: "2026-07-14T18:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-final", unitId: U(1), itemKey: "final-quality", value: "pass", enteredText: null, note: "Release approved.", photoAttachmentId: null, technicianId: "e-priya", at: "2026-07-15T15:40:00Z", state: "Saved", supersedesId: null },
      { id: "r-11-pack", unitId: U(1), itemKey: "packaging-photo", value: true, enteredText: null, note: null, photoAttachmentId: "a-packaging-11", technicianId: "e-tom", at: "2026-07-15T19:30:00Z", state: "Saved", supersedesId: null },

      // Unit 1.2 - in progress; shows Saved, Pending and Error states.
      { id: "r-12-parts", unitId: U(2), itemKey: "verify-parts", value: true, enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-12T14:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-12-casing", unitId: U(2), itemKey: "casing-material", value: "pass", enteredText: null, note: "316SS per order.", photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-12T14:20:00Z", state: "Saved", supersedesId: null },
      { id: "r-12-impmat", unitId: U(2), itemKey: "impeller-material", value: "pass", enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-12T14:35:00Z", state: "Saved", supersedesId: null },
      { id: "r-12-visual", unitId: U(2), itemKey: "visual-inspection", value: "pass", enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-15T13:10:00Z", state: "Saved", supersedesId: null },
      { id: "r-12-freerot", unitId: U(2), itemKey: "free-rotation", value: "pass", enteredText: null, note: "Photo upload failed - retry required.", photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-15T14:05:00Z", state: "Error", supersedesId: null },
      { id: "r-12-trim", unitId: U(2), itemKey: "impeller-trim", value: 12.58, enteredText: "12.58", note: "Rough cut only - finish cut outstanding.", photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-17T21:45:00Z", state: "Pending", supersedesId: null },

      // Unit 1.4 - awaiting quality; axial play flagged NeedsReview.
      { id: "r-14-parts", unitId: U(4), itemKey: "verify-parts", value: true, enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-12T16:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-casing", unitId: U(4), itemKey: "casing-material", value: "pass", enteredText: null, note: "316SS per order.", photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-12T16:15:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-impmat", unitId: U(4), itemKey: "impeller-material", value: "pass", enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-12T16:30:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-visual", unitId: U(4), itemKey: "visual-inspection", value: "pass", enteredText: null, note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-13T18:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-freerot", unitId: U(4), itemKey: "free-rotation", value: "pass", enteredText: null, note: null, photoAttachmentId: "a-freerot-14", technicianId: "e-alex", at: "2026-07-13T19:30:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-trim", unitId: U(4), itemKey: "impeller-trim", value: 12.49, enteredText: "12.49", note: null, photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-14T15:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-runout", unitId: U(4), itemKey: "shaft-runout", value: 1.5, enteredText: "1.5", note: null, photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-14T15:30:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-axial", unitId: U(4), itemKey: "axial-play", value: 2.1, enteredText: "2.1", note: "Above placeholder limit of 2 thou - quality review requested.", photoAttachmentId: null, technicianId: "e-miguel", at: "2026-07-14T16:00:00Z", state: "NeedsReview", supersedesId: null },
      { id: "r-14-clear", unitId: U(4), itemKey: "impeller-clearance", value: 16, enteredText: "16", note: null, photoAttachmentId: null, technicianId: "e-alex", at: "2026-07-15T13:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-hydro", unitId: U(4), itemKey: "hydrotest", value: "pass", enteredText: null, note: "Held test pressure 10 min, no leaks (placeholder spec).", photoAttachmentId: "a-hydro-14", technicianId: "e-priya", at: "2026-07-16T15:00:00Z", state: "Saved", supersedesId: null },
      { id: "r-14-name", unitId: U(4), itemKey: "nameplate", value: true, enteredText: null, note: null, photoAttachmentId: "a-nameplate-14", technicianId: "e-alex", at: "2026-07-16T17:00:00Z", state: "Saved", supersedesId: null }
    ],
    posts: [
      {
        id: "p1",
        orderNumber: ORDER_NO,
        unitId: U(1),
        authorId: "e-sarah",
        at: "2026-07-10T16:12:00Z",
        body: "Use CD4 for Unit 1.1 - customer confirmed duplex upgrade against PO DEMO-0001. Applies to Unit 1.1 only; 1.2 through 1.5 stay 316SS.",
        category: "Decision",
        attachmentIds: [],
        mentions: ["e-priya", "e-dave"],
        replies: [
          { id: "p1-r1", authorId: "e-dave", at: "2026-07-10T16:40:00Z", body: "Acknowledged - pulling a CD4MCu casing from stock. @Priya please confirm the approval record.", mentions: ["e-priya"] }
        ],
        convertedTo: { kind: "MaterialChange", recordId: "mc-001" },
        unread: false
      },
      {
        id: "p2",
        orderNumber: ORDER_NO,
        unitId: U(2),
        authorId: "e-lena",
        at: "2026-07-15T17:25:00Z",
        body: "Machine stub shaft by 0.150 inch for Unit 1.2 to correct the seal seat position. Before/after photos and final measurement required.",
        category: "Decision",
        attachmentIds: [],
        mentions: ["e-miguel"],
        replies: [
          { id: "p2-r1", authorId: "e-miguel", at: "2026-07-15T18:02:00Z", body: "Understood - will capture the before photo when I set up.", mentions: [] }
        ],
        convertedTo: { kind: "SpecialInstruction", recordId: "swi-001" },
        unread: false
      },
      {
        id: "p3",
        orderNumber: ORDER_NO,
        unitId: U(3),
        authorId: "e-dave",
        at: "2026-07-16T13:15:00Z",
        body: "Impeller casting for Unit 1.3 missed the truck. Supplier now says ETA Jul 22. Blocking Unit 1.3 at material verification.",
        category: "Problem",
        attachmentIds: [],
        mentions: ["e-sarah"],
        replies: [
          { id: "p3-r1", authorId: "e-sarah", at: "2026-07-16T13:55:00Z", body: "Flagged on the order risks. Customer due date still holds if the casting lands Jul 22.", mentions: [] }
        ],
        convertedTo: { kind: "Problem", recordId: "pr-001" },
        unread: true
      },
      {
        id: "p4",
        orderNumber: ORDER_NO,
        unitId: U(1),
        authorId: "e-alex",
        at: "2026-07-14T18:05:00Z",
        body: "Nameplate installed and photographed for Unit 1.1.",
        category: "Photo",
        attachmentIds: ["a-nameplate-11"],
        mentions: [],
        replies: [
          { id: "p4-r1", authorId: "e-priya", at: "2026-07-14T18:30:00Z", body: "Verified against the spec sheet - thanks.", mentions: [] }
        ],
        convertedTo: null,
        unread: true
      },
      {
        id: "p5",
        orderNumber: ORDER_NO,
        unitId: U(4),
        authorId: "e-priya",
        at: "2026-07-16T15:10:00Z",
        body: "Unit 1.4 hydrotest passed. Axial play reading is flagged Needs Review against the placeholder limit - I will disposition during final inspection.",
        category: "Update",
        attachmentIds: [],
        mentions: [],
        replies: [],
        convertedTo: null,
        unread: true
      },
      {
        id: "p6",
        orderNumber: HOUSTON_ORDER_NO,
        unitId: null,
        authorId: "e-omar",
        at: "2026-07-17T16:35:00Z",
        body: "First stub shaft in the lathe; second blank staged. (Mock Houston order for view filters.)",
        category: "Update",
        attachmentIds: [],
        mentions: [],
        replies: [],
        convertedTo: null,
        unread: false
      }
    ],
    materialChanges: [
      {
        id: "mc-001",
        unitId: U(1),
        orderedMaterial: "316SS",
        proposedMaterial: "CD4MCu",
        status: "Approved",
        reason: "Customer requested duplex upgrade for abrasive service",
        requestedById: "e-sarah",
        approvedById: "e-priya",
        approvedAt: "2026-07-10T19:00:00Z",
        evidencePlaceholder: "CD4MCu heat-stamp photo (attachment a-material-11)",
        sourcePostId: "p1"
      }
    ],
    specialInstructions: [
      {
        id: "swi-001",
        unitId: U(2),
        part: "Stub shaft",
        instruction: "Machine stub shaft by 0.150 in to correct seal seat position",
        beforePhotoAttachmentId: "a-before-12",
        afterPhotoAttachmentId: null,
        completionMeasurement: { value: 0.15, unit: "in" },
        verificationStatus: "AwaitingVerification",
        sourcePostId: "p2"
      }
    ],
    problems: [
      {
        id: "pr-001",
        unitId: U(3),
        orderNumber: ORDER_NO,
        description: "Impeller casting not received - supplier ETA Jul 22",
        status: "Open",
        raisedById: "e-dave",
        sourcePostId: "p3"
      }
    ],
    attachments: [
      { id: "a-material-11", kind: "photo", category: "Material marking", orderNumber: ORDER_NO, unitId: U(1), targetRef: "casing-material", fileName: "cd4-heat-stamp.jpg", employeeId: "e-alex", at: "2026-07-11T15:08:00Z", placeholderArt: "stamp" },
      { id: "a-freerot-11", kind: "photo", category: "Free rotation", orderNumber: ORDER_NO, unitId: U(1), targetRef: "free-rotation", fileName: "free-rotation-11.jpg", employeeId: "e-miguel", at: "2026-07-12T15:44:00Z", placeholderArt: "pump" },
      { id: "a-trim-11", kind: "photo", category: "Measurement evidence", orderNumber: ORDER_NO, unitId: U(1), targetRef: "impeller-trim", fileName: "caliper-12-51.jpg", employeeId: "e-miguel", at: "2026-07-13T14:18:00Z", placeholderArt: "caliper" },
      { id: "a-nameplate-11", kind: "photo", category: "Nameplate", orderNumber: ORDER_NO, unitId: U(1), targetRef: "nameplate", fileName: "nameplate-DEMO-SN-0001.jpg", employeeId: "e-alex", at: "2026-07-14T18:00:00Z", placeholderArt: "nameplate" },
      { id: "a-packaging-11", kind: "photo", category: "Packaging", orderNumber: ORDER_NO, unitId: U(1), targetRef: "packaging-photo", fileName: "crate-11.jpg", employeeId: "e-tom", at: "2026-07-15T19:28:00Z", placeholderArt: "crate" },
      { id: "a-before-12", kind: "photo", category: "Before", orderNumber: ORDER_NO, unitId: U(2), targetRef: "swi-001", fileName: "stub-shaft-before.jpg", employeeId: "e-miguel", at: "2026-07-16T14:00:00Z", placeholderArt: "shaft" },
      { id: "a-freerot-14", kind: "photo", category: "Free rotation", orderNumber: ORDER_NO, unitId: U(4), targetRef: "free-rotation", fileName: "free-rotation-14.jpg", employeeId: "e-alex", at: "2026-07-13T19:28:00Z", placeholderArt: "pump" },
      { id: "a-hydro-14", kind: "photo", category: "Measurement evidence", orderNumber: ORDER_NO, unitId: U(4), targetRef: "hydrotest", fileName: "hydro-gauge-14.jpg", employeeId: "e-priya", at: "2026-07-16T14:58:00Z", placeholderArt: "gauge" },
      { id: "a-nameplate-14", kind: "photo", category: "Nameplate", orderNumber: ORDER_NO, unitId: U(4), targetRef: "nameplate", fileName: "nameplate-14.jpg", employeeId: "e-alex", at: "2026-07-16T17:00:00Z", placeholderArt: "nameplate" },
      { id: "a-wo-pdf", kind: "file", category: "General reference", orderNumber: ORDER_NO, unitId: null, targetRef: null, fileName: `${ORDER_NO}-WO.pdf (mock source document)`, employeeId: "e-sarah", at: "2026-07-10T14:30:00Z", placeholderArt: "pdf" }
    ],
    auditEvents: [
      { id: "ae-1", at: "2026-07-10T15:02:00Z", actorId: "e-sarah", action: "order.confirmed", targetType: "Order", targetId: ORDER_NO, unitId: null, detail: "Import draft confirmed; line 1 quantity 5 generated 5 Units.", supersedesEventId: null },
      { id: "ae-2", at: "2026-07-10T15:02:01Z", actorId: "e-sarah", action: "unit.created", targetType: "Unit", targetId: U(1), unitId: U(1), detail: "Unit created with stable QR identity (pre-serial).", supersedesEventId: null },
      { id: "ae-3", at: "2026-07-10T15:02:01Z", actorId: "e-sarah", action: "unit.created", targetType: "Unit", targetId: U(2), unitId: U(2), detail: "Unit created with stable QR identity (pre-serial).", supersedesEventId: null },
      { id: "ae-4", at: "2026-07-10T15:02:01Z", actorId: "e-sarah", action: "unit.created", targetType: "Unit", targetId: U(3), unitId: U(3), detail: "Unit created with stable QR identity (pre-serial).", supersedesEventId: null },
      { id: "ae-5", at: "2026-07-10T15:02:01Z", actorId: "e-sarah", action: "unit.created", targetType: "Unit", targetId: U(4), unitId: U(4), detail: "Unit created with stable QR identity (pre-serial).", supersedesEventId: null },
      { id: "ae-6", at: "2026-07-10T15:02:01Z", actorId: "e-sarah", action: "unit.created", targetType: "Unit", targetId: U(5), unitId: U(5), detail: "Unit created with stable QR identity (pre-serial).", supersedesEventId: null },
      { id: "ae-7", at: "2026-07-10T19:00:00Z", actorId: "e-priya", action: "materialChange.approved", targetType: "MaterialChange", targetId: "mc-001", unitId: U(1), detail: "316SS -> CD4MCu approved for Unit 1.1 only.", supersedesEventId: null },
      { id: "ae-8", at: "2026-07-13T14:20:00Z", actorId: "e-miguel", action: "checklistResponse.superseded", targetType: "ChecklistResponse", targetId: "r-11-trim-v2", unitId: U(1), detail: "Impeller trim corrected 12.56 -> 12.51 in; original retained.", supersedesEventId: "ae-8a" },
      { id: "ae-8a", at: "2026-07-13T14:00:00Z", actorId: "e-miguel", action: "checklistResponse.recorded", targetType: "ChecklistResponse", targetId: "r-11-trim-v1", unitId: U(1), detail: "Impeller trim recorded 12.56 in.", supersedesEventId: null },
      { id: "ae-9", at: "2026-07-14T18:15:00Z", actorId: "e-dave", action: "unit.serialAssigned", targetType: "Unit", targetId: U(1), unitId: U(1), detail: "Serial DEMO-SN-0001 assigned; QR identity unchanged.", supersedesEventId: null },
      { id: "ae-10", at: "2026-07-14T18:20:00Z", actorId: "e-dave", action: "label.reprinted", targetType: "QrIdentity", targetId: U(1), unitId: U(1), detail: "Unit tag reprinted after serial assignment; same publicRef.", supersedesEventId: null },
      { id: "ae-11", at: "2026-07-16T13:20:00Z", actorId: "e-dave", action: "task.blocked", targetType: "Task", targetId: "t-13-verify", unitId: U(3), detail: "Blocked: impeller casting not received (ETA Jul 22).", supersedesEventId: null },
      { id: "ae-12", at: "2026-07-17T21:58:00Z", actorId: "e-miguel", action: "task.paused", targetType: "Task", targetId: "t-12-trim", unitId: U(2), detail: "Paused with full handoff (end of shift).", supersedesEventId: null }
    ],
    qrIdentities,
    components: [
      {
        id: "CMP-IMP-0412",
        description: "Impeller casting 13 in",
        material: "316SS",
        heatLot: "Heat H8821",
        allocatedUnitId: U(2),
        publicRef: mockPublicRef("component:CMP-IMP-0412")
      }
    ],
    materialLots: [
      {
        id: "LOT-316-2231",
        part: "Bar stock 316SS 2.5 in",
        grade: "316SS",
        heatLot: "Heat 44R210",
        quantity: "12 ft",
        supplier: "Metals Direct (mock)",
        publicRef: mockPublicRef("lot:LOT-316-2231")
      }
    ],
    transfers: [
      {
        id: "TR-0088",
        origin: "Mississauga",
        destination: "Houston",
        contents: "2 machined stub shafts (mock)",
        status: "InTransit",
        publicRef: mockPublicRef("transfer:TR-0088")
      }
    ],
    pallets: [
      {
        id: "PAL-0031",
        orderNumber: ORDER_NO,
        unitIds: [U(1)],
        destination: "Acme Sample Industries - Example City, TX",
        weight: "1,240 lb",
        dimensions: "48 x 40 x 52 in",
        packageCount: 1,
        publicRef: mockPublicRef("pallet:PAL-0031")
      },
      // A second, deliberately different pallet on the same order. Its only
      // purpose is to make cross-Unit shipping leakage detectable in both
      // directions: Unit 1.1 must never show PAL-0032 and Unit 1.4 must never
      // show PAL-0031.
      {
        id: "PAL-0032",
        orderNumber: ORDER_NO,
        unitIds: [U(4)],
        destination: "Acme Sample Industries - Sample City, TX",
        weight: "1,305 lb",
        dimensions: "52 x 44 x 55 in",
        packageCount: 2,
        publicRef: mockPublicRef("pallet:PAL-0032")
      }
    ],
    configurationSnapshots: [],
    manufacturingNotes: [],
    configurationAdjustments: [],
    favourites: ["view:orders", "view:quality"],
    followedOrders: [ORDER_NO],
    nextId: 1000
  };

  // Seed the calculated Unit/Operation statuses the same way live mutations
  // do, so the demo narrative and the projection can never silently disagree.
  return units.reduce(
    (s, u) => recomputeUnitProjection(s, u.unitId),
    initial
  );
}
