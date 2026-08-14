// End-to-end handshake against CPQ's real sanitized transfer bundle
// (sample-data/cpq-handshake-bundle.zip = the inner transfer bundle Codex
// produced for 26CPQ0003). Exercises the full path our import UI uses: unzip ->
// verify envelope -> validate package -> import -> isolated Units + PO provenance.

import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { readZipEntries } from "@/domain/zip";
import { verifyTransferEnvelope, type TransferManifestV1 } from "@/domain/transferEnvelope";
import { validateExecutionPackage, type ExecutionPackageV1 } from "@/domain/executionPackage";
import { importExecutionPackage, type ImportedPoInput } from "@/domain/actions";
import { buildInitialState } from "@/domain/fixtures";

const BUNDLE = "sample-data/cpq-handshake-bundle.zip";

interface Bundle {
  pkgBytes: Uint8Array;
  poBytes: Uint8Array;
  manifest: TransferManifestV1;
  pkg: ExecutionPackageV1;
}

async function loadBundle(): Promise<Bundle> {
  const buf = readFileSync(BUNDLE);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const entries = await readZipEntries(ab);
  const pkgBytes = entries.get("execution-package.json")!;
  const manifestBytes = entries.get("transfer-manifest.json")!;
  const poName = [...entries.keys()].find((k) => k.startsWith("customer-po/"))!;
  const poBytes = entries.get(poName)!;
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as TransferManifestV1;
  const pkg = JSON.parse(new TextDecoder().decode(pkgBytes)) as ExecutionPackageV1;
  return { pkgBytes, poBytes, manifest, pkg };
}

function poFrom(manifest: TransferManifestV1): ImportedPoInput {
  return {
    fileName: manifest.files.customerPo.name,
    sha256: manifest.files.customerPo.sha256,
    sizeBytes: manifest.files.customerPo.sizeBytes,
    mediaType: manifest.files.customerPo.mediaType,
    acceptedPoSubmissionId: manifest.acceptedPoSubmissionId
  };
}

describe("CPQ real handshake bundle", () => {
  let b: Bundle;
  beforeAll(async () => {
    b = await loadBundle();
  });

  it("verifies the transfer envelope (both file hashes + sizes)", () => {
    const r = verifyTransferEnvelope({ manifest: b.manifest, packageBytes: b.pkgBytes, poBytes: b.poBytes });
    expect(r.ok).toBe(true);
  });

  it("the manifest and package name the same packageId", () => {
    expect(b.manifest.packageId).toBe(b.pkg.packageId);
  });

  it("validates the execution package (canonical SHA-256 parity with CPQ)", () => {
    const r = validateExecutionPackage(b.pkg);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("imports to one order, two lines (pump + pump-package), three isolated units", () => {
    const on = `${b.pkg.source.quoteNumber}-R${b.pkg.source.revisionNumber}`;
    const state = importExecutionPackage(buildInitialState(), "e-alex", {
      package: b.pkg,
      orderNumber: on,
      facility: "Mississauga",
      coordinatorId: "e-alex",
      po: poFrom(b.manifest)
    });

    const order = state.orders.find((o) => o.orderNumber === on)!;
    expect(order.lines).toHaveLength(2);
    expect(order.lines.map((l) => l.lineType).sort()).toEqual(["pump", "pump-package"]);

    const units = state.units.filter((u) => u.orderNumber === on);
    expect(units).toHaveLength(3); // quantity 2 + quantity 1

    // Each unit resolves to exactly one line; publicRefs are all distinct.
    expect(new Set(units.map((u) => u.publicRef)).size).toBe(3);
    for (const u of units) expect(order.lines.some((l) => l.lineNumber === u.lineNumber)).toBe(true);

    // Frozen snapshots carry the accepted PO submission id and the CPQ checksum.
    expect(state.configurationSnapshots).toHaveLength(2);
    expect(state.configurationSnapshots.every((s) => s.checksum === b.pkg.checksum)).toBe(true);
    expect(state.configurationSnapshots.every((s) => s.acceptedPoSubmissionId === "POSUB-SANITIZED-0001")).toBe(true);

    // PO provenance is stored as an Order attachment (hash + size, no bytes).
    const po = state.attachments.find((a) => a.orderNumber === on && a.source === "CPQ")!;
    expect(po.sha256).toBe(b.manifest.files.customerPo.sha256);
    expect(po.targetRef).toBe("POSUB-SANITIZED-0001");
  });

  it("rejects a second import of the same quote+revision even under a different order number (idempotency)", () => {
    const first = importExecutionPackage(buildInitialState(), "e-alex", {
      package: b.pkg,
      orderNumber: `${b.pkg.source.quoteNumber}-R${b.pkg.source.revisionNumber}`,
      facility: "Mississauga",
      coordinatorId: "e-alex",
      po: poFrom(b.manifest)
    });
    expect(() =>
      importExecutionPackage(first, "e-alex", {
        package: b.pkg,
        orderNumber: "A-DIFFERENT-ORDER",
        facility: "Mississauga",
        coordinatorId: "e-alex",
        po: poFrom(b.manifest)
      })
    ).toThrow(/already imported/);
  });

  it("fails closed if the PO bytes are tampered", () => {
    const r = verifyTransferEnvelope({
      manifest: b.manifest,
      packageBytes: b.pkgBytes,
      poBytes: new TextEncoder().encode("tampered")
    });
    expect(r.ok).toBe(false);
  });
});
