// CPQ → Order Execution package contract (v1). See
// docs/integration/CPQ_EXECUTION_CONTRACT.md for the field-by-field mapping,
// ownership boundaries, and immutability rules.
//
// This module is pure and dependency-free (except the shared hash helper) so it
// can validate an untrusted uploaded JSON file without a DOM/localStorage mock.
// It never throws on bad input and never silently coerces: validation returns
// structured, field-level errors and the caller decides what to do.

import { fnv1a32 } from "./ids";

export const EXECUTION_PACKAGE_SCHEMA_VERSION = "1.0" as const;

export interface ExecutionPackageV1 {
  schemaVersion: "1.0";

  packageId: string;
  publishedAt: string;
  publishedBy: string;
  checksum: string;

  source: {
    quoteId: string;
    quoteNumber: string;
    revisionId: string;
    revisionNumber: number;
  };

  customer: {
    customerId?: string;
    customerName: string;
    customerPo?: string;
  };

  lines: ExecutionLineV1[];
}

export interface ExecutionLineV1 {
  cpqLineId: string;
  lineNumber: number;
  quantity: number;

  product: {
    family: string;
    model: string;
    pumpSize: string;
    description: string;
  };

  configuration: {
    materialBuild?: string;
    casingMaterial?: string;
    impellerMaterial?: string;
    shaftMaterial?: string;

    seal?: Record<string, unknown>;
    motor?: Record<string, unknown>;
    baseplate?: Record<string, unknown>;
    coupling?: Record<string, unknown>;

    testingRequirements: string[];
    customerSuppliedItems: string[];
    selectedOptions: Array<{
      code?: string;
      description: string;
      value?: string;
    }>;
  };

  bom: Array<{
    partNumber?: string;
    description: string;
    quantity: number;
    material?: string;
  }>;

  documents: Array<{
    type: "Drawing" | "Curve" | "Datasheet" | "Manual" | "Other";
    documentId: string;
    title: string;
    revision?: string;
  }>;

  versions: {
    configurationRulesVersion: string;
    pricingReleaseId?: string;
    documentManifestVersion?: string;
  };
}

export interface ValidationResult {
  ok: boolean;
  package?: ExecutionPackageV1;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

// Order-independent canonical JSON: object keys are sorted recursively so a
// re-serialized package with keys in a different order hashes identically.
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

// A deterministic mock checksum over the whole package payload except the
// checksum field itself. A real integration would use SHA-256; this stays
// dependency-free and reproducible. Two salted FNV passes widen the digest so
// small edits are very likely to change it.
export function computeChecksum(pkg: ExecutionPackageV1): string {
  const { checksum: _omit, ...rest } = pkg;
  void _omit;
  const canonical = JSON.stringify(canonicalize(rest));
  const a = fnv1a32(canonical).toString(16).padStart(8, "0");
  const b = fnv1a32(`salt:${canonical}`).toString(16).padStart(8, "0");
  return `chk_${a}${b}`;
}

export function verifyChecksum(pkg: ExecutionPackageV1): boolean {
  return pkg.checksum === computeChecksum(pkg);
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
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    errors.push(`${path} must be an array of strings`);
  }
}

function validateLine(line: unknown, index: number, errors: string[]): void {
  const p = `lines[${index}]`;
  if (!isObject(line)) {
    errors.push(`${p} must be an object`);
    return;
  }
  requireString(line.cpqLineId, `${p}.cpqLineId`, errors);
  if (typeof line.lineNumber !== "number" || !Number.isInteger(line.lineNumber) || line.lineNumber < 1) {
    errors.push(`${p}.lineNumber must be a positive integer`);
  }
  if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1) {
    errors.push(`${p}.quantity must be an integer >= 1 (each Unit is created from it)`);
  }

  if (!isObject(line.product)) {
    errors.push(`${p}.product must be an object`);
  } else {
    requireString(line.product.family, `${p}.product.family`, errors);
    requireString(line.product.model, `${p}.product.model`, errors);
    requireString(line.product.pumpSize, `${p}.product.pumpSize`, errors);
    requireString(line.product.description, `${p}.product.description`, errors);
  }

  if (!isObject(line.configuration)) {
    errors.push(`${p}.configuration must be an object`);
  } else {
    requireStringArray(line.configuration.testingRequirements, `${p}.configuration.testingRequirements`, errors);
    requireStringArray(line.configuration.customerSuppliedItems, `${p}.configuration.customerSuppliedItems`, errors);
    if (!Array.isArray(line.configuration.selectedOptions)) {
      errors.push(`${p}.configuration.selectedOptions must be an array`);
    }
  }

  if (!Array.isArray(line.bom)) {
    errors.push(`${p}.bom must be an array`);
  }
  if (!Array.isArray(line.documents)) {
    errors.push(`${p}.documents must be an array`);
  }
  if (!isObject(line.versions)) {
    errors.push(`${p}.versions must be an object`);
  } else {
    requireString(line.versions.configurationRulesVersion, `${p}.versions.configurationRulesVersion`, errors);
  }
}

// Validates an untrusted, already-JSON-parsed value against the v1 contract.
// Returns { ok, package, errors }. When ok is true, the value is safe to treat
// as an ExecutionPackageV1. Checksum mismatch is reported as an error too, so a
// tampered package is rejected before it can become manufacturing facts.
export function validateExecutionPackage(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ["Package must be a JSON object"] };
  }

  if (raw.schemaVersion !== EXECUTION_PACKAGE_SCHEMA_VERSION) {
    errors.push(
      `Unsupported schemaVersion ${JSON.stringify(raw.schemaVersion)}; expected "${EXECUTION_PACKAGE_SCHEMA_VERSION}"`
    );
    // Without a matching schema version we cannot trust any other field.
    return { ok: false, errors };
  }

  requireString(raw.packageId, "packageId", errors);
  requireString(raw.publishedAt, "publishedAt", errors);
  requireString(raw.publishedBy, "publishedBy", errors);
  requireString(raw.checksum, "checksum", errors);

  if (!isObject(raw.source)) {
    errors.push("source must be an object");
  } else {
    requireString(raw.source.quoteId, "source.quoteId", errors);
    requireString(raw.source.quoteNumber, "source.quoteNumber", errors);
    requireString(raw.source.revisionId, "source.revisionId", errors);
    if (typeof raw.source.revisionNumber !== "number") {
      errors.push("source.revisionNumber must be a number");
    }
  }

  if (!isObject(raw.customer)) {
    errors.push("customer must be an object");
  } else {
    requireString(raw.customer.customerName, "customer.customerName", errors);
  }

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    errors.push("lines must be a non-empty array");
  } else {
    raw.lines.forEach((line, i) => validateLine(line, i, errors));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const pkg = raw as unknown as ExecutionPackageV1;
  if (!verifyChecksum(pkg)) {
    return {
      ok: false,
      errors: [
        `Checksum mismatch: stored ${pkg.checksum} does not match recomputed ${computeChecksum(pkg)}. The package may have been altered after publishing.`
      ]
    };
  }

  return { ok: true, package: pkg, errors: [] };
}
