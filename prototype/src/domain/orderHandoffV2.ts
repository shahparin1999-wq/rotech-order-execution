// CPQ → Work Order internal order handoff contract (v2).
// Blueprint: docs/integration/CPQ_INTERNAL_ORDER_HANDOFF_BLUEPRINT.md
//
// v2 is the "full internal handoff": the CPQ (the only configurator) freezes one
// revision-bound package carrying ALL configured scope — configuration, RFQ
// scope, services, spares, special requests, BOM/component breakdown, documents,
// and internal/admin notes. The ONLY thing withheld is money: cost, price,
// margin, discount, tax, multiplier, currency, totals. Monetary fields are
// removed by an allowlist at the boundary, not merely hidden — so this validator
// FAILS a package that leaks any monetary key anywhere (invariant 5).
//
// This module is pure and dependency-free (except the shared hash helper) so it
// can validate an untrusted uploaded JSON file. It never throws on bad input and
// never silently coerces: validation returns structured, field-level errors.
//
// Stage 1 of the staged plan: schema + fixture + leak/validation tests only.
// No adapter, no transport, no UI. The existing v1/v1.1 importer
// (executionPackage.ts) stays readable and untouched for compatibility.

import { sha256Hex } from "./sha256";

export const ORDER_HANDOFF_SCHEMA = "rotech-cpq-order-handoff/2.0";

// Every CPQ line crosses (nothing is dropped). Its disposition tells the Work
// Order side what execution action to take — NOT whether to transfer it.
//   unit-bearing    → creates a Work Order Line and quantity N isolated Units.
//   line-level-scope → a separate, packable non-Unit order item (spares,
//                      services, resale, documentation). It still gets packed
//                      and shipped; it just does not generate Units.
//   reference-only  → preserved and displayed; no execution action unless a
//                     coordinator promotes it.
//   review-required → mapping unknown/unresolved; import succeeds into review
//                     but manufacturing release is blocked until resolved.
export const EXECUTION_DISPOSITIONS = [
  "unit-bearing",
  "line-level-scope",
  "reference-only",
  "review-required"
] as const;
export type ExecutionDisposition = (typeof EXECUTION_DISPOSITIONS)[number];

// commercialState is trace-only (never gates manufacturing on its own).
export const COMMERCIAL_STATES = [
  "included",
  "excluded",
  "rfq",
  "partial-pricing",
  "no-charge",
  "resolved"
] as const;
export type CommercialState = (typeof COMMERCIAL_STATES)[number];

// executionState is what Production may do now.
export const EXECUTION_STATES = [
  "ready",
  "plan",
  "awaiting-decision"
] as const;
export type ExecutionState = (typeof EXECUTION_STATES)[number];

// Suggested classification for a transferred internal/admin note. The note is
// NOT auto-converted into a shop instruction — a coordinator promotes it.
export const HANDOFF_NOTE_CLASSIFICATIONS = [
  "engineering",
  "shop",
  "machining",
  "quality",
  "packaging",
  "customer-request",
  "service",
  "commercial-context",
  "rfq-resolution",
  "provenance"
] as const;
export type HandoffNoteClassification = (typeof HANDOFF_NOTE_CLASSIFICATIONS)[number];

// ---------------------------------------------------------------------------
// Monetary allowlist (invariant 5). Any key that normalizes to one of these is
// a leak and rejects the package. Normalization lowercases and strips non-
// alphanumerics so unit_price / unitPrice / UnitPrice all collapse to the same
// token. Exact-token match (not substring) avoids false positives on names like
// "description" or a hydraulic "staticHead".
// ---------------------------------------------------------------------------
export const FORBIDDEN_MONETARY_KEYS: ReadonlySet<string> = new Set([
  "cost",
  "costprice",
  "fixedcost",
  "unitcost",
  "price",
  "listprice",
  "netprice",
  "sellprice",
  "unitprice",
  "extendedprice",
  "rate",
  "finalrate",
  "discount",
  "margin",
  "markup",
  "multiplier",
  "subtotal",
  "total",
  "extendedtotal",
  "tax",
  "taxgroup",
  "taxtype",
  "currency",
  "pricingreleaseid",
  "listpriceoverride",
  "manualprice",
  "manualpriceoverride"
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Walks the whole payload and collects the dotted path of every monetary key.
export function findMonetaryLeaks(value: unknown, path = ""): string[] {
  const leaks: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => leaks.push(...findMonetaryLeaks(item, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_MONETARY_KEYS.has(normalizeKey(key))) {
        leaks.push(childPath);
      }
      leaks.push(...findMonetaryLeaks(child, childPath));
    }
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Types. Nested configuration groups are intentionally permissive
// (Record<string, unknown>) so the CPQ can carry each family's native selected
// options without this contract flattening their meaning. The validator pins
// the structural spine (identity, disposition, quantity, notes) and enforces the
// monetary-leak and checksum invariants.
// ---------------------------------------------------------------------------
export interface HandoffNote {
  classification: HandoffNoteClassification;
  text: string;
  source: string; // source path or record id in CPQ
  author?: string;
  timestamp?: string;
  affects?: string; // quote / line / component reference
  requiresCoordinatorReview?: boolean;
  blocksRelease?: boolean;
  blocksReleaseReason?: string;
}

export interface HandoffAttentionItem {
  id: string;
  kind: "rfq" | "technical" | "supplier" | "customer" | "engineering" | "other";
  description: string;
  affects?: string;
  responsibleParty?: string;
  blocksRelease?: boolean;
}

// A monetary-free operational projection of a CPQ internalCosting row. Carries
// the configured parent/child component breakdown WITHOUT any money.
export interface HandoffComponentRow {
  sourceRowId: string;
  rowNumber?: string;
  parentRowNumber?: string;
  isParent?: boolean;
  type?: string;
  productName?: string;
  description: string;
  partCode?: string;
  quantity: number;
  uom?: string;
  source?: "configured" | "manual" | "rfq";
  requiresReview?: boolean;
  operationalNote?: string;
}

export interface HandoffLine {
  id: string;
  lineNumber: number;
  lineType: string; // native CPQ line type, preserved (pump, spare, service, …)
  executionDisposition: ExecutionDisposition;
  quantity?: number; // required and >= 1 for unit-bearing lines

  commercialState?: CommercialState;
  executionState?: ExecutionState;

  product?: Record<string, unknown>;
  selection?: Record<string, unknown>; // hydraulic duty, fluid, curve refs
  pumpBuild?: Record<string, unknown>; // material, size, frame, trim, shaft, flange
  packageBuild?: Record<string, unknown>; // motor, baseplate, coupling, guard, mounting
  seal?: Record<string, unknown>;
  scope?: Record<string, unknown>; // scopeResponsibilities, special requests, service adders

  testingRequirements?: string[];
  customerSuppliedItems?: string[];
  selectedOptions?: Array<{ code?: string; description: string; value?: string }>;

  bom?: HandoffComponentRow[];
  componentBreakdown?: HandoffComponentRow[]; // from internalCosting.rows (money-free)
  documents?: Array<Record<string, unknown>>;

  internalContext?: HandoffNote[];
  attentionItems?: HandoffAttentionItem[];
}

export interface OrderHandoffPackageV2 {
  schema: typeof ORDER_HANDOFF_SCHEMA;
  packageId: string;
  idempotencyKey: string; // cpq:<quoteId>:<revisionId>:<acceptedPoSubmissionId>
  createdAt: string;
  createdBy: { userId: string; email?: string };
  checksum: string;

  source: {
    system: string;
    quoteId: string;
    quoteNumber: string;
    revisionId: string;
    revisionNumber: number;
    revisionToken: string; // changes whenever the CPQ revision changes → forces WO update
    quoteStatus?: string;
    orderProcessingState?: string;
    acceptedPoSubmissionId?: string;
  };

  customer: Record<string, unknown>;
  orderContext?: Record<string, unknown>;

  lines: HandoffLine[];
  orderLevelScope?: Array<Record<string, unknown>>;
  attentionItems?: HandoffAttentionItem[];
  documents?: Array<Record<string, unknown>>;
  provenance?: Record<string, unknown>;
}

export interface HandoffValidationResult {
  ok: boolean;
  package?: OrderHandoffPackageV2;
  errors: string[];
  monetaryLeaks: string[];
}

// ---------------------------------------------------------------------------
// Checksum — identical canonicalization rule as v1 so both sides agree
// byte-for-byte: recursively sort object keys, preserve array order, compact
// UTF-8 JSON, lowercase-hex SHA-256, excluding the checksum field itself.
// ---------------------------------------------------------------------------
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return value;
}

export function computeHandoffChecksum(pkg: OrderHandoffPackageV2): string {
  const { checksum: _omit, ...rest } = pkg;
  void _omit;
  return sha256Hex(JSON.stringify(canonicalize(rest)));
}

export function verifyHandoffChecksum(pkg: OrderHandoffPackageV2): boolean {
  return pkg.checksum === computeHandoffChecksum(pkg);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function requireString(v: unknown, path: string, errors: string[]): void {
  if (typeof v !== "string" || v.trim() === "") {
    errors.push(`${path} is required and must be a non-empty string`);
  }
}

function requireStringArray(v: unknown, path: string, errors: string[]): void {
  if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) {
    errors.push(`${path}, when present, must be an array of strings`);
  }
}

function validateNotes(notes: unknown, path: string, errors: string[]): void {
  if (notes === undefined) return;
  if (!Array.isArray(notes)) {
    errors.push(`${path}, when present, must be an array`);
    return;
  }
  notes.forEach((note, i) => {
    const np = `${path}[${i}]`;
    if (!isObject(note)) {
      errors.push(`${np} must be an object`);
      return;
    }
    if (!HANDOFF_NOTE_CLASSIFICATIONS.includes(note.classification as HandoffNoteClassification)) {
      errors.push(`${np}.classification must be one of ${HANDOFF_NOTE_CLASSIFICATIONS.join(", ")}`);
    }
    requireString(note.text, `${np}.text`, errors);
    requireString(note.source, `${np}.source`, errors);
  });
}

function validateLine(line: unknown, index: number, errors: string[]): void {
  const p = `lines[${index}]`;
  if (!isObject(line)) {
    errors.push(`${p} must be an object`);
    return;
  }
  requireString(line.id, `${p}.id`, errors);
  requireString(line.lineType, `${p}.lineType`, errors);
  if (typeof line.lineNumber !== "number" || !Number.isInteger(line.lineNumber) || line.lineNumber < 1) {
    errors.push(`${p}.lineNumber must be a positive integer`);
  }
  if (!EXECUTION_DISPOSITIONS.includes(line.executionDisposition as ExecutionDisposition)) {
    errors.push(
      `${p}.executionDisposition must be one of ${EXECUTION_DISPOSITIONS.join(", ")} (got ${JSON.stringify(line.executionDisposition)})`
    );
  }
  // Unit-bearing lines must declare a positive integer quantity (each Unit is
  // created from it). Non-unit lines may carry a quantity but are not required
  // to — and never create Units regardless.
  if (line.executionDisposition === "unit-bearing") {
    if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1) {
      errors.push(`${p}.quantity must be an integer >= 1 for a unit-bearing line`);
    }
  } else if (
    line.quantity !== undefined &&
    (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1)
  ) {
    errors.push(`${p}.quantity, when present, must be an integer >= 1`);
  }

  requireStringArray(line.testingRequirements, `${p}.testingRequirements`, errors);
  requireStringArray(line.customerSuppliedItems, `${p}.customerSuppliedItems`, errors);
  validateNotes(line.internalContext, `${p}.internalContext`, errors);
}

// Validates an untrusted, already-JSON-parsed value against the v2 contract.
// A tampered (checksum mismatch) or money-leaking package is rejected before it
// can become manufacturing facts.
export function validateOrderHandoffPackage(raw: unknown): HandoffValidationResult {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ["Package must be a JSON object"], monetaryLeaks: [] };
  }

  if (raw.schema !== ORDER_HANDOFF_SCHEMA) {
    // Without a matching schema we cannot trust any other field.
    return {
      ok: false,
      errors: [`Unsupported schema ${JSON.stringify(raw.schema)}; expected "${ORDER_HANDOFF_SCHEMA}"`],
      monetaryLeaks: []
    };
  }

  requireString(raw.packageId, "packageId", errors);
  requireString(raw.idempotencyKey, "idempotencyKey", errors);
  requireString(raw.createdAt, "createdAt", errors);
  requireString(raw.checksum, "checksum", errors);

  if (!isObject(raw.createdBy)) {
    errors.push("createdBy must be an object");
  } else {
    requireString(raw.createdBy.userId, "createdBy.userId", errors);
  }

  if (!isObject(raw.source)) {
    errors.push("source must be an object");
  } else {
    requireString(raw.source.system, "source.system", errors);
    requireString(raw.source.quoteId, "source.quoteId", errors);
    requireString(raw.source.quoteNumber, "source.quoteNumber", errors);
    requireString(raw.source.revisionId, "source.revisionId", errors);
    requireString(raw.source.revisionToken, "source.revisionToken", errors);
    if (typeof raw.source.revisionNumber !== "number") {
      errors.push("source.revisionNumber must be a number");
    }
  }

  if (!isObject(raw.customer)) {
    errors.push("customer must be an object");
  }

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    errors.push("lines must be a non-empty array");
  } else {
    raw.lines.forEach((line, i) => validateLine(line, i, errors));
  }

  validateNotes((raw as Record<string, unknown>).internalContext, "internalContext", errors);

  // Invariant 5: no money anywhere. Scanned over the whole payload, so a
  // monetary key buried in any nested config/BOM/note object is caught.
  const monetaryLeaks = findMonetaryLeaks(raw);
  for (const leak of monetaryLeaks) {
    errors.push(`monetary field not allowed in handoff: ${leak}`);
  }

  // Checksum last, only when structurally sound enough to hash meaningfully.
  if (errors.length === 0 && !verifyHandoffChecksum(raw as unknown as OrderHandoffPackageV2)) {
    errors.push("checksum mismatch: package may have been altered after publishing");
  }

  if (errors.length > 0) {
    return { ok: false, errors, monetaryLeaks };
  }
  return { ok: true, package: raw as unknown as OrderHandoffPackageV2, errors: [], monetaryLeaks: [] };
}
