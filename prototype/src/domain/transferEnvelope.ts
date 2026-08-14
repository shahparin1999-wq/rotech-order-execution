// CPQ transfer envelope (v1). A won order is transferred as a ZIP bundle:
//
//   execution-package.json      the frozen ExecutionPackageV1(.1) contract
//   customer-po/<file>          the accepted customer PO document (PDF)
//   transfer-manifest.json      this envelope: identifies the accepted PO
//                               submission and carries a SHA-256 of each file
//
// The envelope is a transfer wrapper, NOT a silent extension of the execution
// package: keeping it separate lets the frozen JSON contract stay unchanged
// while still carrying PO bytes and the acceptedPoSubmissionId needed for
// idempotency. Verification is pure and synchronous (SHA-256 over already-
// extracted bytes) so it can run in the same discipline as package validation.

import { sha256Bytes } from "./sha256";

export const TRANSFER_ENVELOPE_SCHEMA_VERSION = "1.0" as const;

export interface TransferFileEntry {
  name: string;
  sha256: string;
  sizeBytes: number;
  mediaType?: string;
}

export interface TransferManifestV1 {
  envelopeSchemaVersion: "1.0";
  packageId: string;
  acceptedPoSubmissionId: string;
  files: {
    executionPackage: TransferFileEntry;
    customerPo: TransferFileEntry;
  };
}

export interface TransferEnvelopeParts {
  manifest: unknown; // parsed transfer-manifest.json
  packageBytes: Uint8Array; // raw execution-package.json bytes
  poBytes: Uint8Array; // raw PO file bytes
}

export interface TransferVerifyResult {
  ok: boolean;
  errors: string[];
  manifest?: TransferManifestV1;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function validateEntry(entry: unknown, path: string, errors: string[]): void {
  if (!isObject(entry)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof entry.name !== "string" || entry.name.trim() === "") errors.push(`${path}.name is required`);
  if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
    errors.push(`${path}.sha256 must be lowercase 64-hex`);
  }
  if (typeof entry.sizeBytes !== "number" || !Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
    errors.push(`${path}.sizeBytes must be a non-negative integer`);
  }
}

// Verifies a transfer envelope: manifest shape, then that the actual extracted
// bytes hash and size match the manifest for both the execution package and the
// PO. Fails closed — any mismatch or malformed field rejects the whole bundle.
export function verifyTransferEnvelope(parts: TransferEnvelopeParts): TransferVerifyResult {
  const errors: string[] = [];
  const m = parts.manifest;

  if (!isObject(m)) {
    return { ok: false, errors: ["transfer-manifest.json must be a JSON object"] };
  }
  if (m.envelopeSchemaVersion !== TRANSFER_ENVELOPE_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `Unsupported envelopeSchemaVersion ${JSON.stringify(m.envelopeSchemaVersion)}; expected "${TRANSFER_ENVELOPE_SCHEMA_VERSION}"`
      ]
    };
  }
  if (typeof m.packageId !== "string" || m.packageId.trim() === "") errors.push("packageId is required");
  if (typeof m.acceptedPoSubmissionId !== "string" || m.acceptedPoSubmissionId.trim() === "") {
    errors.push("acceptedPoSubmissionId is required");
  }
  if (!isObject(m.files)) {
    errors.push("files must be an object");
    return { ok: false, errors };
  }
  validateEntry(m.files.executionPackage, "files.executionPackage", errors);
  validateEntry(m.files.customerPo, "files.customerPo", errors);
  if (errors.length > 0) return { ok: false, errors };

  const manifest = m as unknown as TransferManifestV1;

  // Integrity: hashes and sizes must match the extracted bytes.
  const pkgHash = sha256Bytes(parts.packageBytes);
  if (pkgHash !== manifest.files.executionPackage.sha256) {
    errors.push(
      `execution-package.json checksum mismatch: manifest ${manifest.files.executionPackage.sha256}, actual ${pkgHash}`
    );
  }
  if (parts.packageBytes.length !== manifest.files.executionPackage.sizeBytes) {
    errors.push("execution-package.json size does not match the manifest");
  }
  const poHash = sha256Bytes(parts.poBytes);
  if (poHash !== manifest.files.customerPo.sha256) {
    errors.push(`customer PO checksum mismatch: manifest ${manifest.files.customerPo.sha256}, actual ${poHash}`);
  }
  if (parts.poBytes.length !== manifest.files.customerPo.sizeBytes) {
    errors.push("customer PO size does not match the manifest");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], manifest };
}
