import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export interface StoredBlob {
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}

/** UAT-only durable object adapter. Production must replace this with Azure Blob. */
export async function storeImmutableBlob(bytes: Uint8Array): Promise<StoredBlob> {
  if (process.env.NODE_ENV === "production" && process.env.OEH_BLOB_MODE !== "azure" && process.env.OEH_UAT_MODE !== "1") {
    throw new Error("Production upload storage is not configured for Azure Blob");
  }
  if (process.env.OEH_BLOB_MODE === "azure") {
    throw new Error("Azure Blob adapter is not enabled in this UAT build");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const root = path.resolve(process.env.OEH_BLOB_DIR ?? path.join(process.cwd(), ".oeh-data", "blobs"));
  const storageKey = `shipments/${sha256}`;
  const absolute = path.resolve(root, storageKey);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("Invalid blob storage key");
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  try {
    await fs.writeFile(absolute, bytes, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    const existing = await fs.readFile(absolute);
    const existingHash = createHash("sha256").update(existing).digest("hex");
    if (existingHash !== sha256) throw new Error("Immutable blob collision detected");
  }
  return { sha256, sizeBytes: bytes.byteLength, storageKey };
}
