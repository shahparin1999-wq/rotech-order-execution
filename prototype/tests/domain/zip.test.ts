import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readZipEntries } from "@/domain/zip";

// Minimal ZIP writer for tests. CRC is left 0 (readZipEntries does not verify
// it). Supports STORED (0) and DEFLATE (8).
function buildZip(entries: Array<{ name: string; data: Uint8Array; method: 0 | 8 }>): ArrayBuffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const stored = e.method === 8 ? deflateRawSync(Buffer.from(e.data)) : Buffer.from(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt32LE(0, 14); // crc
    local.writeUInt32LE(stored.length, 18); // comp size
    local.writeUInt32LE(e.data.length, 22); // uncomp size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, stored);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(e.method, 10);
    cen.writeUInt32LE(0, 16); // crc
    cen.writeUInt32LE(stored.length, 20);
    cen.writeUInt32LE(e.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + stored.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  const all = Buffer.concat([...chunks, cdBuf, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("readZipEntries", () => {
  it("reads STORED entries", async () => {
    const zip = buildZip([
      { name: "execution-package.json", data: enc('{"a":1}'), method: 0 },
      { name: "customer-po/po.pdf", data: enc("%PDF stored"), method: 0 }
    ]);
    const entries = await readZipEntries(zip);
    expect(dec(entries.get("execution-package.json")!)).toBe('{"a":1}');
    expect(dec(entries.get("customer-po/po.pdf")!)).toBe("%PDF stored");
  });

  it("reads DEFLATE entries", async () => {
    const body = JSON.stringify({ schemaVersion: "1.0", lines: [1, 2, 3] });
    const zip = buildZip([{ name: "transfer-manifest.json", data: enc(body), method: 8 }]);
    const entries = await readZipEntries(zip);
    expect(dec(entries.get("transfer-manifest.json")!)).toBe(body);
  });

  it("rejects a non-zip buffer", async () => {
    await expect(readZipEntries(enc("not a zip").buffer)).rejects.toThrow(/ZIP/);
  });

  it("rejects path-traversal entry names", async () => {
    const zip = buildZip([{ name: "../evil.json", data: enc("x"), method: 0 }]);
    await expect(readZipEntries(zip)).rejects.toThrow(/Unsafe/);
  });
});
