// Domain types for the mock vertical slice. All data is fixture/mock data;
// nothing here talks to AIMCOR, Azure, Entra, Teams, or a database.

export type Facility = "Mississauga" | "Houston";

export type Department =
  | "Machining"
  | "Assembly"
  | "Quality"
  | "Shipping"
  | "Coordination";

export type UnitStatus =
  | "NotStarted"
  | "InAssembly"
  | "Blocked"
  | "AwaitingQuality"
  | "Complete";

export type TaskStatus =
  | "NotStarted"
  | "Ready"
  | "InProgress"
  | "Paused"
  | "Blocked"
  | "WaitingInspection"
  | "Complete";

export type SaveState = "Saved" | "Pending" | "Error" | "NeedsReview";

export type Priority = "Low" | "Medium" | "High" | "Urgent";

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: Department;
  facility: Facility;
}

// Customer/Contact are new lightweight CRM-style entities. Orders reference
// customers by ID (never a free-text copy) so a rename or contact change
// never requires touching every Order record.
export interface Customer {
  id: string;
  name: string;
  city: string;
  region: string;
  notes: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  createdAt: string;
}

// A first-class Work Order Line: the middle level between Order and Unit. Line
// number is immutable within an Order and Unit sequence is immutable within a
// Line (docs 03 identifier grammar). CPQ-imported lines carry provenance back
// to the exact quote/revision/line and to their frozen ConfigurationSnapshot;
// manually created lines set sourceSystem "Manual" and leave the cpq* fields
// undefined.
export interface OrderLine {
  id: string;
  lineNumber: number;
  sourceSystem: "CPQ" | "Manual";
  // CPQ manufacturing line type ("pump" | "pump-package"); undefined for manual
  // lines. Spare/unsupported types never reach a line (rejected at import).
  lineType?: string;
  // Model-template this line was created from (manual lines); drives the master
  // routing and BOM skeleton shown on the order. undefined for CPQ lines.
  templateId?: string;
  product: string;
  description: string;
  family: string;
  model: string;
  quantity: number;
  orderedMaterial: string;
  templateName: string;
  cpqQuoteId?: string;
  cpqRevisionId?: string;
  cpqLineId?: string;
  configurationSnapshotId?: string;
}

export interface Order {
  orderNumber: string;
  customerId: string;
  customerPo: string;
  dueDate: string; // ISO date
  productFamily: string;
  orderType: string;
  facility: Facility;
  coordinatorId: string;
  status: string;
  priority: Priority;
  updatedAt: string; // ISO, bumped whenever the order record itself changes
  teamsLinkPlaceholder: string;
  publicRef: string;
  lines: OrderLine[];
  risks: string[];
}

export interface Unit {
  unitId: string; // e.g. SAMPLE1001_1.1
  orderNumber: string;
  lineNumber: number;
  sequence: number;
  serial: string | null; // null renders as "Serial pending"
  model: string;
  size: string;
  orderedMaterial: string;
  asBuiltMaterial: string;
  status: UnitStatus;
  location: string;
  currentOperation: string;
  publicRef: string;
  holdReason: string | null;
}

export interface RouteOperation {
  id: string;
  unitId: string;
  seq: number;
  name: string;
  department: Department;
  status: "NotStarted" | "Ready" | "InProgress" | "Blocked" | "Complete";
}

// A handoff is controlled manufacturing history. It is never overwritten: a
// later pause appends a new record that supersedes the previous one, and both
// remain readable.
export interface HandoffRecord {
  id: string;
  reason: string;
  completedWork: string;
  remainingWork: string;
  location: string;
  storageState: string;
  blockerItem: string | null;
  note: string | null;
  byId: string;
  at: string;
  supersedesId: string | null;
}

export interface TaskEvent {
  action: string;
  actorId: string;
  at: string;
  note: string | null;
}

// Planner buckets are a coarser, cross-Unit view of work than the 1196 route
// operations - a task's bucket is independent of any RouteOperation it may
// also be linked to via operationId.
export type PlannerBucket =
  | "TBC"
  | "OrderPlanning"
  | "PartsPicked"
  | "Machining"
  | "AssemblyTesting"
  | "Quality"
  | "Packaging"
  | "OnHold"
  | "Complete";

export interface ChecklistSubItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskComment {
  id: string;
  authorId: string;
  at: string;
  body: string;
}

export interface Task {
  id: string;
  // A task may target a Unit (shop-floor/QC work), a Customer (account-level
  // follow-up), or neither (general order/planning work) - never more than
  // one target family at once in practice, but all three stay independently
  // nullable so a Unit-linked task's evidence can never be confused with a
  // Customer-linked one.
  unitId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  name: string;
  description: string | null;
  operationId: string | null;
  bucket: PlannerBucket;
  department: Department | null;
  status: TaskStatus;
  ownerId: string | null;
  // Multi-assign for Planner; assignTask/unassignTask keep this and ownerId
  // (the primary/shop-floor assignee) in sync so existing shop-floor reads of
  // ownerId keep working unchanged.
  assigneeIds: string[];
  startDate: string | null;
  dueDate: string | null;
  priority: Priority;
  labels: string[];
  checklist: ChecklistSubItem[];
  attachmentIds: string[];
  comments: TaskComment[];
  status_beforeBlock: TaskStatus | null;
  blockReason: string | null;
  // Append-only. The active handoff is the last entry; earlier entries are
  // retained and remain visible in history.
  handoffs: HandoffRecord[];
  history: TaskEvent[];
  sourcePostId: string | null;
}

export type ChecklistResponseType = "checkbox" | "passfail" | "measurement";

export interface ChecklistItemDef {
  key: string;
  label: string;
  responseType: ChecklistResponseType;
  unit: string | null;
  nominal: number | null;
  min: number | null;
  max: number | null;
  requiresPhoto: boolean;
  requiresNote: boolean;
  placeholderTolerance: boolean; // true => "Pilot placeholder - owner approval required"
}

export interface ChecklistResponse {
  id: string;
  unitId: string;
  itemKey: string;
  value: boolean | "pass" | "fail" | number | null;
  enteredText: string | null;
  note: string | null;
  photoAttachmentId: string | null;
  technicianId: string;
  at: string;
  state: SaveState;
  supersedesId: string | null;
}

export type PostCategory =
  | "Update"
  | "Problem"
  | "Decision"
  | "Photo"
  | "System";

export interface ActivityReply {
  id: string;
  authorId: string;
  at: string;
  body: string;
  mentions: string[];
}

export type ConvertedKind =
  | "Task"
  | "Problem"
  | "MaterialChange"
  | "SpecialInstruction";

export interface ActivityPost {
  id: string;
  orderNumber: string;
  unitId: string | null;
  authorId: string;
  at: string;
  body: string;
  category: PostCategory;
  attachmentIds: string[];
  mentions: string[];
  replies: ActivityReply[];
  convertedTo: { kind: ConvertedKind; recordId: string } | null;
  unread: boolean;
}

export type ApprovalStatus = "Draft" | "PendingApproval" | "Approved" | "Rejected";

export interface MaterialChange {
  id: string;
  unitId: string;
  orderedMaterial: string;
  proposedMaterial: string;
  status: ApprovalStatus;
  reason: string;
  requestedById: string;
  approvedById: string | null;
  approvedAt: string | null;
  evidencePlaceholder: string;
  sourcePostId: string | null;
}

export interface SpecialInstruction {
  id: string;
  unitId: string;
  part: string;
  instruction: string;
  beforePhotoAttachmentId: string | null;
  afterPhotoAttachmentId: string | null;
  completionMeasurement: {
    value: number;
    unit: string;
  } | null;
  verificationStatus: "Open" | "AwaitingVerification" | "Verified";
  sourcePostId: string | null;
}

export interface Problem {
  id: string;
  unitId: string | null;
  orderNumber: string;
  description: string;
  status: "Open" | "Resolved";
  raisedById: string;
  sourcePostId: string | null;
}

export type AttachmentCategory =
  | "Nameplate"
  | "Packaging"
  | "Free rotation"
  | "Measurement evidence"
  | "Material marking"
  | "Before"
  | "After"
  | "General reference";

export interface Attachment {
  id: string;
  kind: "photo" | "file";
  category: AttachmentCategory;
  orderNumber: string;
  unitId: string | null;
  targetRef: string | null; // task id or checklist item key
  fileName: string;
  employeeId: string;
  at: string;
  placeholderArt: string; // key for the mock SVG rendering; never a real photo
  // Set for a CPQ transfer-envelope PO document: integrity hash and size from
  // the verified transfer manifest. The raw bytes are never stored (prototype
  // holds only plain data), so these carry the PO's provenance/integrity.
  sha256?: string;
  sizeBytes?: number;
  source?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  unitId: string | null;
  detail: string;
  supersedesEventId: string | null;
}

export type QrRecordType =
  | "Order"
  | "Unit"
  | "Component"
  | "MaterialLot"
  | "Transfer"
  | "Pallet";

export interface LabelPrintEvent {
  at: string;
  byId: string;
  reason: string;
}

export interface QrIdentity {
  publicRef: string;
  recordType: QrRecordType;
  targetId: string; // orderNumber, unitId, componentId, lotId, transferId, palletId
  label: string;
  printEvents: LabelPrintEvent[];
}

export interface ComponentRecord {
  id: string;
  description: string;
  material: string;
  heatLot: string;
  allocatedUnitId: string | null;
  publicRef: string;
}

export interface MaterialLot {
  id: string;
  part: string;
  grade: string;
  heatLot: string;
  quantity: string;
  supplier: string;
  publicRef: string;
}

export interface TransferRecord {
  id: string;
  origin: Facility;
  destination: Facility;
  contents: string;
  status: string;
  publicRef: string;
}

export interface PalletRecord {
  id: string;
  orderNumber: string;
  // Explicit Unit targeting. A pallet is order-scoped only for listing; every
  // Unit-scoped read (notably document generation) must resolve through this
  // list so a sibling Unit's shipping record can never be rendered.
  unitIds: string[];
  destination: string;
  weight: string;
  dimensions: string;
  packageCount: number;
  publicRef: string;
}

// The frozen CPQ configuration for one imported Work Order Line. This is an
// immutable released snapshot: the payload is never edited in place. A revised
// CPQ quote produces a new, superseding snapshot rather than a mutation
// (see docs/integration/CPQ_EXECUTION_CONTRACT.md). Manufacturing detail is
// layered on top via ManufacturingNote and ConfigurationAdjustment, never by
// touching this record.
export interface ConfigurationSnapshot {
  id: string;
  workOrderLineId: string;
  orderNumber: string;
  lineNumber: number;

  sourcePackageId: string;
  sourceQuoteId: string;
  sourceRevisionId: string;
  sourceLineId: string;

  schemaVersion: string;
  checksum: string;

  // Accepted-PO submission id from the transfer envelope, when imported from a
  // bundle. Part of the manufacturing idempotency key
  // (quoteId, revisionId, acceptedPoSubmissionId).
  acceptedPoSubmissionId?: string;

  // The full imported line payload, stored verbatim. Typed as unknown here to
  // keep the domain types independent of the executionPackage module; callers
  // that need the shape import ExecutionLineV1 and narrow.
  payload: unknown;

  importedAt: string;
  importedBy: string;
}

export type ManufacturingNoteCategory =
  | "ShopInstruction"
  | "EngineeringNote"
  | "MachiningInstruction"
  | "QualityRequirement"
  | "PackagingInstruction";

// A manufacturing note is layered detail, not part of the frozen CPQ baseline.
// A WorkOrderLine-scoped note applies to every Unit on that line (resolved at
// read time by scope - never copied onto each Unit). A Unit-scoped note is
// isolated to that one Unit and must never appear on a sibling.
export interface ManufacturingNote {
  id: string;
  scopeType: "WorkOrderLine" | "Unit";
  scopeId: string; // OrderLine.id or Unit.unitId
  orderNumber: string;
  lineNumber: number;
  category: ManufacturingNoteCategory;
  title: string;
  description: string;
  createdAt: string;
  createdBy: string;
  // "CPQ" when seeded from an imported package's classified notes, "Manual"
  // when added in the Work Order System. Optional for backward compatibility.
  source?: "CPQ" | "Manual";
}

export type AdjustmentApprovalStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Superseded";

// A proposed change to a configuration value, tracked separately from the
// frozen CPQ snapshot. The snapshot payload is never edited; the as-built view
// layers approved adjustments on top of the CPQ-ordered values.
export interface ConfigurationAdjustment {
  id: string;
  scopeType: "WorkOrderLine" | "Unit";
  scopeId: string;
  orderNumber: string;
  lineNumber: number;
  configurationPath: string; // e.g. "configuration.impellerMaterial"
  originalValue: unknown;
  proposedValue: unknown;
  reason: string;
  approvalStatus: AdjustmentApprovalStatus;
  commercialReviewRequired: boolean;
  createdAt: string;
  createdBy: string;
}

export interface AppState {
  currentUserId: string;
  employees: Employee[];
  customers: Customer[];
  contacts: Contact[];
  orders: Order[];
  units: Unit[];
  routeOps: RouteOperation[];
  tasks: Task[];
  checklistDefs: ChecklistItemDef[]; // 1196 pilot checklist definition
  responses: ChecklistResponse[];
  posts: ActivityPost[];
  materialChanges: MaterialChange[];
  specialInstructions: SpecialInstruction[];
  problems: Problem[];
  attachments: Attachment[];
  auditEvents: AuditEvent[];
  qrIdentities: QrIdentity[];
  components: ComponentRecord[];
  materialLots: MaterialLot[];
  transfers: TransferRecord[];
  pallets: PalletRecord[];
  configurationSnapshots: ConfigurationSnapshot[];
  manufacturingNotes: ManufacturingNote[];
  configurationAdjustments: ConfigurationAdjustment[];
  favourites: string[]; // view ids or order numbers
  followedOrders: string[];
  nextId: number;
}
