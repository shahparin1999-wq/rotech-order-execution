import { describe, it, expect } from "vitest";
import { sha256Bytes, sha256Hex } from "@/domain/sha256";
import { verifyTransferEnvelope, type TransferManifestV1 } from "@/domain/transferEnvelope";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sha256", () => {
  it("matches known vectors (parity with Python hashlib / Node crypto)", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

function buildManifest(pkgBytes: Uint8Array, poBytes: Uint8Array): TransferManifestV1 {
  return {
    envelopeSchemaVersion: "1.0",
    packageId: "PKG-1",
    acceptedPoSubmissionId: "sub-1",
    files: {
      executionPackage: { name: "execution-package.json", sha256: sha256Bytes(pkgBytes), sizeBytes: pkgBytes.length },
      customerPo: {
        name: "customer-po/po.pdf",
        sha256: sha256Bytes(poBytes),
        sizeBytes: poBytes.length,
        mediaType: "application/pdf"
      }
    }
  };
}

describe("verifyTransferEnvelope", () => {
  const pkgBytes = enc('{"schemaVersion":"1.0"}');
  const poBytes = enc("%PDF-1.4 fake po bytes");

  it("accepts a bundle whose bytes match the manifest hashes and sizes", () => {
    const manifest = buildManifest(pkgBytes, poBytes);
    const r = verifyTransferEnvelope({ manifest, packageBytes: pkgBytes, poBytes });
    expect(r.ok).toBe(true);
    expect(r.manifest?.acceptedPoSubmissionId).toBe("sub-1");
  });

  it("rejects a tampered PO (hash mismatch), failing closed", () => {
    const manifest = buildManifest(pkgBytes, poBytes);
    const r = verifyTransferEnvelope({ manifest, packageBytes: pkgBytes, poBytes: enc("tampered") });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("PO checksum mismatch"))).toBe(true);
  });

  it("rejects a tampered execution package (hash mismatch)", () => {
    const manifest = buildManifest(pkgBytes, poBytes);
    const r = verifyTransferEnvelope({ manifest, packageBytes: enc("{}"), poBytes });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("execution-package.json checksum mismatch"))).toBe(true);
  });

  it("rejects an unsupported envelope schema version", () => {
    const manifest = { ...buildManifest(pkgBytes, poBytes), envelopeSchemaVersion: "9.9" } as unknown;
    const r = verifyTransferEnvelope({ manifest, packageBytes: pkgBytes, poBytes });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/envelopeSchemaVersion/);
  });

  it("rejects a malformed manifest", () => {
    const r = verifyTransferEnvelope({ manifest: { envelopeSchemaVersion: "1.0" }, packageBytes: pkgBytes, poBytes });
    expect(r.ok).toBe(false);
  });
});
