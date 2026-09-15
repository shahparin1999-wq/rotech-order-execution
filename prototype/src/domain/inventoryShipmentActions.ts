import type { AppState, AuditEvent } from "./types";
import type {
  CreateExpectedShipmentInput,
  ExpectedShipmentDraftPatch,
  ExpectedShipmentLine,
  ParseRun,
  ParsedField,
  ShipmentFileRecord
} from "./inventory/contracts";

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function takeId(state: AppState, prefix: string): [string, AppState] {
  const id = `${prefix}-${state.nextId}`;
  return [id, { ...state, nextId: state.nextId + 1 }];
}

function appendAudit(state: AppState, actorId: string, action: string, targetType: string, targetId: string, detail: string, at: string): AppState {
  const [id, next] = takeId(state, "ae");
  const event: AuditEvent = { id, at, actorId, action, targetType, targetId, unitId: null, detail, supersedesEventId: null };
  return { ...next, auditEvents: [...next.auditEvents, event] };
}

export interface RecordShipmentParseInput {
  file: Omit<ShipmentFileRecord, "id">;
  parseRun: Omit<ParseRun, "id" | "fileId">;
  fields: Array<Omit<ParsedField, "id" | "parseRunId">>;
  shipment?: CreateExpectedShipmentInput;
}

/** Stores parser output and a reviewable expected-shipment draft atomically. */
export function recordShipmentParse(state: AppState, actorId: string, input: RecordShipmentParseInput, at?: string): AppState {
  const ts = nowIso(at);
  if (state.shipmentFiles.some((x) => x.sha256 === input.file.sha256)) {
    throw new Error(`A shipment file with hash ${input.file.sha256} was already uploaded`);
  }
  if (!input.file.originalName.trim() || !input.file.storageKey.trim()) throw new Error("Uploaded shipment metadata is incomplete");

  const [fileId, withFileId] = takeId(state, "file");
  const file: ShipmentFileRecord = { id: fileId, ...input.file };
  const [parseRunId, withParseId] = takeId(withFileId, "parse");
  const parseRun: ParseRun = { id: parseRunId, fileId, ...input.parseRun };
  let next: AppState = {
    ...withParseId,
    shipmentFiles: [...withParseId.shipmentFiles, file],
    parseRuns: [...withParseId.parseRuns, parseRun]
  };
  const parsedFields: ParsedField[] = [];
  for (const field of input.fields) {
    const [id, advanced] = takeId(next, "field");
    next = advanced;
    parsedFields.push({ id, parseRunId, ...field });
  }
  next = { ...next, parsedFields: [...next.parsedFields, ...parsedFields] };

  if (input.shipment && input.shipment.lines.length > 0) {
    const [shipmentId, withShipmentId] = takeId(next, "ship");
    next = withShipmentId;
    const lines: ExpectedShipmentLine[] = [];
    for (const line of input.shipment.lines) {
      const [lineId, advanced] = takeId(next, "shl");
      next = advanced;
      lines.push({ id: lineId, ...line });
    }
    next = {
      ...next,
      expectedShipments: [
        ...next.expectedShipments,
        { id: shipmentId, revision: 1, status: "Draft", ...input.shipment, lines, sourceFileId: fileId, sourceFileHash: file.sha256, createdBy: actorId, createdAt: ts }
      ]
    };
    next = appendAudit(next, actorId, "inventory.shipmentDraftCreated", "ExpectedShipment", shipmentId, `Parsed ${lines.length} inbound line(s) from ${file.originalName}.`, ts);
  }

  return appendAudit(next, actorId, "inventory.shipmentFileParsed", "ShipmentFile", fileId, `${file.originalName} parsed with ${input.fields.length} field result(s).`, ts);
}

export function editExpectedShipmentDraft(state: AppState, actorId: string, input: ExpectedShipmentDraftPatch, at?: string): AppState {
  const shipment = state.expectedShipments.find((x) => x.id === input.shipmentId);
  if (!shipment) throw new Error(`Unknown expected shipment ${input.shipmentId}`);
  if (shipment.status !== "Draft") throw new Error("Confirmed shipments are immutable; create a superseding revision to correct them");
  const ts = nowIso(at);
  const nextShipment = {
    ...shipment,
    ...(input.supplier === undefined ? {} : { supplier: input.supplier.trim() }),
    ...(input.poNumber === undefined ? {} : { poNumber: input.poNumber.trim() || undefined }),
    ...(input.facility === undefined ? {} : { facility: input.facility }),
    ...(input.expectedDate === undefined ? {} : { expectedDate: input.expectedDate || undefined }),
    lines: input.lineId
      ? shipment.lines.map((line) => line.id === input.lineId && input.line ? { ...line, ...input.line } : line)
      : shipment.lines
  };
  if (input.lineId && !shipment.lines.some((x) => x.id === input.lineId)) throw new Error(`Unknown shipment line ${input.lineId}`);
  const next = { ...state, expectedShipments: state.expectedShipments.map((x) => x.id === shipment.id ? nextShipment : x) };
  return appendAudit(next, actorId, "inventory.shipmentDraftEdited", "ExpectedShipment", shipment.id, "Edited a draft shipment during human review.", ts);
}

export function confirmExpectedShipment(state: AppState, actorId: string, shipmentId: string, at?: string): AppState {
  const shipment = state.expectedShipments.find((x) => x.id === shipmentId);
  if (!shipment) throw new Error(`Unknown expected shipment ${shipmentId}`);
  if (shipment.status !== "Draft") throw new Error("Only a draft shipment can be confirmed");
  if (!shipment.supplier.trim() || shipment.lines.length === 0) throw new Error("A shipment needs a supplier and at least one line before confirmation");
  if (shipment.lines.some((line) => !line.partNumber.trim() || !line.description.trim() || !Number.isFinite(line.expectedQuantity) || line.expectedQuantity <= 0)) {
    throw new Error("Every shipment line needs a part number, description, and positive expected quantity");
  }
  if (shipment.lines.some((line) => line.facility !== shipment.facility)) {
    throw new Error("Every shipment line must use the shipment facility");
  }
  const ts = nowIso(at);
  const next = {
    ...state,
    expectedShipments: state.expectedShipments.map((x) => x.id === shipmentId ? { ...x, status: "Confirmed" as const, confirmedBy: actorId, confirmedAt: ts } : x)
  };
  return appendAudit(next, actorId, "inventory.shipmentConfirmed", "ExpectedShipment", shipmentId, `Confirmed inbound shipment revision ${shipment.revision}.`, ts);
}

/** Corrections never edit a confirmed row: they create a new draft revision. */
export function supersedeExpectedShipment(state: AppState, actorId: string, shipmentId: string, at?: string): AppState {
  const shipment = state.expectedShipments.find((x) => x.id === shipmentId);
  if (!shipment) throw new Error(`Unknown expected shipment ${shipmentId}`);
  if (shipment.status !== "Confirmed") throw new Error("Only a confirmed shipment can be superseded");
  const ts = nowIso(at);
  const [newId, withId] = takeId(state, "ship");
  let next = withId;
  const lines: ExpectedShipmentLine[] = [];
  for (const line of shipment.lines) {
    const [lineId, advanced] = takeId(next, "shl");
    next = advanced;
    lines.push({ ...line, id: lineId });
  }
  next = {
    ...next,
    expectedShipments: [
      ...next.expectedShipments.map((x) => x.id === shipmentId ? { ...x, status: "Superseded" as const } : x),
      { ...shipment, id: newId, revision: shipment.revision + 1, status: "Draft" as const, supersedesId: shipment.id, lines, confirmedBy: undefined, confirmedAt: undefined, createdBy: actorId, createdAt: ts }
    ]
  };
  return appendAudit(next, actorId, "inventory.shipmentRevisionCreated", "ExpectedShipment", newId, `Created superseding revision ${shipment.revision + 1} for confirmed shipment ${shipment.id}.`, ts);
}
