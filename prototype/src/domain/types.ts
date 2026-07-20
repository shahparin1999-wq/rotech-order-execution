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

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: Department;
  facility: Facility;
}

export interface OrderLine {
  lineNumber: number;
  product: string;
  description: string;
  quantity: number;
  orderedMaterial: string;
  templateName: string;
}

export interface Order {
  orderNumber: string;
  customer: string;
  customerPo: string;
  dueDate: string; // ISO date
  productFamily: string;
  orderType: string;
  facility: Facility;
  coordinatorId: string;
  status: string;
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

export interface Task {
  id: string;
  unitId: string;
  orderNumber: string;
  name: string;
  operationId: string | null;
  status: TaskStatus;
  ownerId: string | null;
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

export interface AppState {
  currentUserId: string;
  employees: Employee[];
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
  favourites: string[]; // view ids or order numbers
  followedOrders: string[];
  nextId: number;
}
