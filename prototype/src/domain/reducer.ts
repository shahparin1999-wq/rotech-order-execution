// The one pure reducer, shared by the browser store and the server command
// handler (Gate A). Every mutation the application can make goes through
// `applyAction`, so the server and an optimistic client compute the same next
// state from the same action — and the persisted state can never contain a
// transition the domain would have refused.
//
// This file must stay free of React and browser globals.

import type { AppState, PackageDrawing1196, PlannerBucket, Priority } from "./types";
import type { ConfiguratorDraft } from "./configurator";
import { buildInitialState } from "./fixtures";
import { recomputeUnitProjection } from "./projections";
import {
  adjustInventory,
  createPutAwayJob,
  inspectInventory,
  installInventory,
  issueInventoryToUnit,
  putAwayInventory,
  receiveInventory,
  reserveInventory,
  returnInventoryToStock,
  confirmOpeningImport,
  type ReceiveInput
} from "./inventoryActions";
import {
  confirmExpectedShipment,
  editExpectedShipmentDraft,
  recordShipmentParse,
  supersedeExpectedShipment,
  type RecordShipmentParseInput
} from "./inventoryShipmentActions";
import type { ConfirmOpeningImportInput, ExpectedShipmentDraftPatch } from "./inventory/contracts";
import {
  addAttachment,
  addChecklistResponse,
  addConfigurationAdjustment,
  addManufacturingNote,
  addUnitsToLine,
  addWorkingBomRow,
  addPost,
  addReply,
  addTaskChecklistItem,
  addTaskComment,
  assignTask,
  blockTask,
  changeOrderDueDate,
  changeTaskDueDate,
  changeTaskPriority,
  completeTask,
  completeTaskDirect,
  confirmGateItem1196,
  convertPost,
  createContact,
  createCustomer,
  create1196PumpEnd,
  createTask,
  createConfiguredOrder,
  createWorkOrder,
  decidePowerEndAvailability,
  editOrder,
  importExecutionPackage,
  importOrderHandoffV2,
  approveUsageSubstitution,
  recordComponentUsage,
  recordComponentUsage1196,
  removeWorkingBomRow,
  seedWorkingBom,
  setPackageDrawing1196,
  updateWorkingBomRow,
  markPostRead,
  moveTaskBucket,
  pauseTask,
  reopenTaskDirect,
  reprintLabel,
  resolveBlocker,
  resumeTask,
  startTask,
  toggleFollowOrder,
  toggleTaskChecklistItem,
  unassignTask,
  type AttachmentInput,
  type ContactInput,
  type ConvertInput,
  type AddUnitsInput,
  type ConfigurationAdjustmentInput,
  type Create1196PumpEndInput,
  type CustomerInput,
  type ImportHandoffInput,
  type ImportPackageInput,
  type ManufacturingNoteInput,
  type OrderEditInput,
  type PauseInput,
  type RecordComponentUsageInput,
  type RecordUsageInput,
  type ResponseInput,
  type TaskInput,
  type WorkingBomPatch,
  type WorkingBomRowInput,
  type WorkOrderInput
} from "./actions";
import { referenceVendorPo, updateVendorPoExpectedDate, type VendorPoInput } from "./purchasingActions";
import { assignUnitSerial } from "./unitActions";

export type Action =
  | { type: "startTask"; taskId: string }
  | { type: "pauseTask"; taskId: string; input: PauseInput }
  | { type: "resumeTask"; taskId: string }
  | { type: "completeTask"; taskId: string }
  | { type: "blockTask"; taskId: string; reason: string }
  | { type: "resolveBlocker"; taskId: string; note: string }
  | { type: "addResponse"; unitId: string; input: ResponseInput }
  | { type: "addAttachment"; input: AttachmentInput }
  | { type: "addPost"; orderNumber: string; unitId: string | null; body: string; mentions?: string[] }
  | { type: "addReply"; postId: string; body: string }
  | { type: "markPostRead"; postId: string }
  | { type: "toggleFollowOrder"; orderNumber: string }
  | { type: "convertPost"; postId: string; input: ConvertInput }
  | { type: "reprintLabel"; publicRef: string; reason: string }
  | { type: "switchUser"; employeeId: string }
  | { type: "hydrateState"; state: AppState }
  | { type: "resetToFixtures" }
  | { type: "createCustomer"; input: CustomerInput }
  | { type: "createContact"; customerId: string; input: ContactInput }
  | { type: "createWorkOrder"; input: WorkOrderInput }
  | { type: "importExecutionPackage"; input: ImportPackageInput }
  | { type: "importOrderHandoffV2"; input: ImportHandoffInput }
  | { type: "create1196PumpEnd"; input: Create1196PumpEndInput }
  | { type: "createConfiguredOrder"; draft: ConfiguratorDraft }
  | { type: "receiveInventory"; input: ReceiveInput }
  | { type: "inspectInventory"; identityId: string; decision: "Accept" | "Reject"; note: string }
  | { type: "putAwayInventory"; identityId: string; locationId: string }
  | { type: "reserveInventory"; identityId: string; unitId: string; quantity: number; requirementId?: string }
  | { type: "issueInventoryToUnit"; identityId: string; unitId: string; quantity: number }
  | { type: "installInventory"; identityId: string; unitId: string; quantity: number }
  | { type: "returnInventoryToStock"; identityId: string; unitId: string; quantity: number; reason: string; locationId: string }
  | { type: "adjustInventory"; identityId: string; delta: number; reason: string; authorizedBy: string }
  | { type: "confirmOpeningImport"; input: ConfirmOpeningImportInput }
  | { type: "recordShipmentParse"; input: RecordShipmentParseInput }
  | { type: "editExpectedShipmentDraft"; input: ExpectedShipmentDraftPatch }
  | { type: "confirmExpectedShipment"; shipmentId: string }
  | { type: "supersedeExpectedShipment"; shipmentId: string }
  | { type: "feasibilityProbe"; probeId: string }
  | { type: "createPutAwayJob"; identityIds: string[]; facility: string }
  | { type: "decidePowerEndAvailability"; unitId: string; decision: "Available" | "BuildRequired" }
  | { type: "recordComponentUsage1196"; requirementId: string; input: RecordComponentUsageInput }
  | { type: "recordComponentUsage"; input: RecordUsageInput }
  | { type: "approveUsageSubstitution"; usageId: string; reason: string }
  | { type: "confirmGateItem1196"; lineId: string; gateKey: string; note: string | null }
  | { type: "setPackageDrawing1196"; lineId: string; drawing: PackageDrawing1196 }
  | { type: "addManufacturingNote"; input: ManufacturingNoteInput }
  | { type: "addConfigurationAdjustment"; input: ConfigurationAdjustmentInput }
  | { type: "addUnitsToLine"; input: AddUnitsInput }
  | { type: "seedWorkingBom"; orderNumber: string; lineId: string }
  | { type: "addWorkingBomRow"; input: WorkingBomRowInput }
  | { type: "updateWorkingBomRow"; rowId: string; patch: WorkingBomPatch }
  | { type: "removeWorkingBomRow"; rowId: string }
  | { type: "changeOrderDueDate"; orderNumber: string; dueDate: string }
  | { type: "editOrder"; orderNumber: string; input: OrderEditInput }
  | { type: "createTask"; input: TaskInput }
  | { type: "assignTask"; taskId: string; employeeId: string }
  | { type: "unassignTask"; taskId: string; employeeId: string }
  | { type: "changeTaskDueDate"; taskId: string; dueDate: string | null }
  | { type: "changeTaskPriority"; taskId: string; priority: Priority }
  | { type: "moveTaskBucket"; taskId: string; bucket: PlannerBucket }
  | { type: "completeTaskDirect"; taskId: string }
  | { type: "reopenTaskDirect"; taskId: string }
  | { type: "addTaskChecklistItem"; taskId: string; text: string }
  | { type: "toggleTaskChecklistItem"; taskId: string; itemId: string }
  | { type: "addTaskComment"; taskId: string; body: string }
  | { type: "referenceVendorPo"; input: VendorPoInput }
  | { type: "updateVendorPoExpectedDate"; poId: string; lineId: string; expectedDate: string; reason: string }
  | { type: "assignUnitSerial"; unitId: string; serial: string; reason?: string };

/** Actions that only affect the viewer's own session, never shared state. */
export const LOCAL_ONLY_ACTIONS = new Set<Action["type"]>(["switchUser", "hydrateState", "resetToFixtures"]);

// A saved/hydrated state's cached Unit/Operation statuses are never trusted
// as-is - always recomputed fresh before use, so a stale save (from before a
// projection-logic change) or a tampered one can never display an incorrect
// cached status. The projection is always the source of truth.
export function recomputeAllProjections(state: AppState): AppState {
  return state.units.reduce((s, u) => recomputeUnitProjection(s, u.unitId), state);
}

/**
 * Applies one action. Throws on a domain violation — callers decide whether
 * that becomes a toast (browser) or a 409/422 (server). `at` lets the server
 * stamp its own clock so an optimistic client and the server agree once the
 * authoritative state is adopted.
 */
export function applyAction(state: AppState, action: Action, at?: string): AppState {
  const actor = state.currentUserId;
  switch (action.type) {
    case "startTask":
      return startTask(state, action.taskId, actor, at);
    case "pauseTask":
      return pauseTask(state, action.taskId, actor, action.input, at);
    case "resumeTask":
      return resumeTask(state, action.taskId, actor, at);
    case "completeTask":
      return completeTask(state, action.taskId, actor, at);
    case "blockTask":
      return blockTask(state, action.taskId, actor, action.reason, at);
    case "resolveBlocker":
      return resolveBlocker(state, action.taskId, actor, action.note, at);
    case "addResponse":
      return addChecklistResponse(state, action.unitId, actor, action.input, at);
    case "addAttachment":
      return addAttachment(state, actor, action.input, at);
    case "addPost":
      return addPost(state, actor, {
        orderNumber: action.orderNumber,
        unitId: action.unitId,
        body: action.body,
        mentions: action.mentions
      }, at);
    case "addReply":
      return addReply(state, action.postId, actor, action.body, at);
    case "markPostRead":
      return markPostRead(state, action.postId);
    case "toggleFollowOrder":
      return toggleFollowOrder(state, action.orderNumber);
    case "convertPost":
      return convertPost(state, action.postId, actor, action.input, at);
    case "reprintLabel":
      return reprintLabel(state, action.publicRef, actor, action.reason, at);
    case "switchUser":
      return { ...state, currentUserId: action.employeeId };
    case "hydrateState":
      return recomputeAllProjections(action.state);
    case "resetToFixtures":
      return buildInitialState();
    case "createCustomer":
      return createCustomer(state, actor, action.input, at);
    case "createContact":
      return createContact(state, actor, action.customerId, action.input, at);
    case "createWorkOrder":
      return createWorkOrder(state, actor, action.input, at);
    case "importExecutionPackage":
      return importExecutionPackage(state, actor, action.input, at);
    case "importOrderHandoffV2":
      return importOrderHandoffV2(state, actor, action.input, at);
    case "create1196PumpEnd":
      return create1196PumpEnd(state, actor, action.input, at);
    case "createConfiguredOrder":
      return createConfiguredOrder(state, actor, action.draft, at);
    case "receiveInventory":
      return receiveInventory(state, actor, action.input, at);
    case "inspectInventory":
      return inspectInventory(state, actor, action.identityId, action.decision, action.note, at);
    case "putAwayInventory":
      return putAwayInventory(state, actor, action.identityId, action.locationId, at);
    case "reserveInventory":
      return reserveInventory(state, actor, action.identityId, action.unitId, action.quantity, action.requirementId, at);
    case "issueInventoryToUnit":
      return issueInventoryToUnit(state, actor, action.identityId, action.unitId, action.quantity, at);
    case "installInventory":
      return installInventory(state, actor, action.identityId, action.unitId, action.quantity, at);
    case "returnInventoryToStock":
      return returnInventoryToStock(state, actor, action.identityId, action.unitId, action.quantity, action.reason, action.locationId, at);
    case "adjustInventory":
      return adjustInventory(state, actor, action.identityId, action.delta, action.reason, action.authorizedBy, at);
    case "confirmOpeningImport":
      return confirmOpeningImport(state, actor, action.input, at);
    case "recordShipmentParse":
      return recordShipmentParse(state, actor, action.input, at);
    case "editExpectedShipmentDraft":
      return editExpectedShipmentDraft(state, actor, action.input, at);
    case "confirmExpectedShipment":
      return confirmExpectedShipment(state, actor, action.shipmentId, at);
    case "supersedeExpectedShipment":
      return supersedeExpectedShipment(state, actor, action.shipmentId, at);
    case "feasibilityProbe":
      return state;
    case "createPutAwayJob":
      return createPutAwayJob(state, actor, action.identityIds, action.facility, at);
    case "decidePowerEndAvailability":
      return decidePowerEndAvailability(state, actor, action.unitId, action.decision, at);
    case "recordComponentUsage":
      return recordComponentUsage(state, actor, action.input, at);
    case "approveUsageSubstitution":
      return approveUsageSubstitution(state, actor, action.usageId, action.reason, at);
    case "recordComponentUsage1196":
      return recordComponentUsage1196(state, actor, action.requirementId, action.input, at);
    case "confirmGateItem1196":
      return confirmGateItem1196(state, actor, action.lineId, action.gateKey, action.note, at);
    case "setPackageDrawing1196":
      return setPackageDrawing1196(state, actor, action.lineId, action.drawing, at);
    case "addManufacturingNote":
      return addManufacturingNote(state, actor, action.input, at);
    case "addConfigurationAdjustment":
      return addConfigurationAdjustment(state, actor, action.input, at);
    case "addUnitsToLine":
      return addUnitsToLine(state, actor, action.input, at);
    case "seedWorkingBom":
      return seedWorkingBom(state, actor, action.orderNumber, action.lineId, at);
    case "addWorkingBomRow":
      return addWorkingBomRow(state, actor, action.input, at);
    case "updateWorkingBomRow":
      return updateWorkingBomRow(state, actor, action.rowId, action.patch, at);
    case "removeWorkingBomRow":
      return removeWorkingBomRow(state, actor, action.rowId, at);
    case "changeOrderDueDate":
      return changeOrderDueDate(state, action.orderNumber, actor, action.dueDate, at);
    case "editOrder":
      return editOrder(state, action.orderNumber, actor, action.input, at);
    case "createTask":
      return createTask(state, actor, action.input, at);
    case "assignTask":
      return assignTask(state, action.taskId, actor, action.employeeId, at);
    case "unassignTask":
      return unassignTask(state, action.taskId, actor, action.employeeId, at);
    case "changeTaskDueDate":
      return changeTaskDueDate(state, action.taskId, actor, action.dueDate, at);
    case "changeTaskPriority":
      return changeTaskPriority(state, action.taskId, actor, action.priority, at);
    case "moveTaskBucket":
      return moveTaskBucket(state, action.taskId, actor, action.bucket, at);
    case "completeTaskDirect":
      return completeTaskDirect(state, action.taskId, actor, at);
    case "reopenTaskDirect":
      return reopenTaskDirect(state, action.taskId, actor, at);
    case "addTaskChecklistItem":
      return addTaskChecklistItem(state, action.taskId, actor, action.text, at);
    case "toggleTaskChecklistItem":
      return toggleTaskChecklistItem(state, action.taskId, action.itemId);
    case "addTaskComment":
      return addTaskComment(state, action.taskId, actor, action.body, at);
    case "referenceVendorPo":
      return referenceVendorPo(state, actor, action.input, at);
    case "updateVendorPoExpectedDate":
      return updateVendorPoExpectedDate(state, actor, action.poId, action.lineId, action.expectedDate, action.reason, at);
    case "assignUnitSerial":
      return assignUnitSerial(state, actor, action.unitId, action.serial, action.reason, at);
    default:
      return state;
  }
}
