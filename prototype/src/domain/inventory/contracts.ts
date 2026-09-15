import type { Facility } from "../types";
import type { InventoryCategory } from "./identity";

/** Capabilities are the server authorization vocabulary for inventory. */
export const INVENTORY_CAPABILITIES = [
  "inventory.receive",
  "inventory.putAway",
  "inventory.inspect",
  "inventory.issue",
  "inventory.return",
  "inventory.adjust",
  "inventory.confirmOpeningBalance",
  "inventory.manageExpectedShipment"
] as const;
export type InventoryCapability = (typeof INVENTORY_CAPABILITIES)[number];

export type ShipmentFileStatus = "Stored" | "ParseQueued" | "Parsed" | "ParseFailed";

export interface ShipmentFileRecord {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  status: ShipmentFileStatus;
  uploadedBy: string;
  uploadedAt: string;
}

export type ParsedFieldFlag = "Missing" | "Duplicate" | "Ambiguous" | "LowConfidence" | "Unsupported";

export interface ParsedField {
  id: string;
  parseRunId: string;
  field: string;
  value: string | null;
  normalizedValue?: string | null;
  confidence: number;
  sourceRow?: number;
  sourcePage?: number;
  flags: ParsedFieldFlag[];
}

export type ParseRunStatus = "Queued" | "Running" | "Completed" | "Failed";

export interface ParseRun {
  id: string;
  fileId: string;
  parserVersion: string;
  status: ParseRunStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export type ExpectedShipmentStatus = "Draft" | "Confirmed" | "Superseded";

export interface ExpectedShipmentLine {
  id: string;
  sourceRow?: number;
  partNumber: string;
  description: string;
  material?: string;
  category: InventoryCategory;
  componentKey?: string;
  attributes: Record<string, string>;
  facility: Facility;
  expectedQuantity: number;
  uom: string;
  serialNumbers?: string[];
  lotNumber?: string;
  heatNumber?: string;
}

export interface ExpectedShipment {
  id: string;
  revision: number;
  status: ExpectedShipmentStatus;
  supersedesId?: string;
  supplier: string;
  poNumber?: string;
  facility: Facility;
  expectedDate?: string;
  sourceFileId: string;
  sourceFileHash: string;
  lines: ExpectedShipmentLine[];
  createdBy: string;
  createdAt: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface CreateExpectedShipmentInput {
  supplier: string;
  poNumber?: string;
  facility: Facility;
  expectedDate?: string;
  sourceFileId: string;
  sourceFileHash: string;
  lines: Array<Omit<ExpectedShipmentLine, "id">>;
}

export interface ExpectedShipmentDraftPatch {
  shipmentId: string;
  supplier?: string;
  poNumber?: string;
  facility?: Facility;
  expectedDate?: string;
  lineId?: string;
  line?: Partial<Omit<ExpectedShipmentLine, "id">>;
}

export interface OpeningBalanceLine {
  identityId: string;
  delta: number;
  sourceRow: number;
  reason: string;
}

export interface OpeningImportRecord {
  id: string;
  importBatchId: string;
  sourceFileId: string;
  sourceFileHash: string;
  sourceRows: number[];
  status: "Confirmed" | "Superseded";
  reason: string;
  approvedBy: string;
  approvedAt: string;
  lines: OpeningBalanceLine[];
  supersedesId?: string;
}

export interface ConfirmOpeningImportInput {
  importBatchId: string;
  sourceFileId: string;
  sourceFileHash: string;
  reason: string;
  lines: OpeningBalanceLine[];
}

export interface ReconciliationException {
  id: string;
  facility: Facility;
  source: string;
  partNumber: string;
  expectedQuantity?: number;
  observedQuantity?: number;
  status: "Open" | "Resolved";
  createdAt: string;
  createdBy: string;
  resolution?: string;
}
