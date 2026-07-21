// Minimal, dependency-free ZIP reader for the CPQ transfer bundle. Supports the
// two methods a bundle realistically uses: STORED (0) and DEFLATE (8, inflated
// via the platform DecompressionStream). It reads the central directory, then
// each local entry's bytes.
//
// This is intentionally small and hardened against the inputs we control; the
// exact producer format is finalized when CPQ emits a real bundle at handshake.
// It rejects anything it cannot parse rather than guessing.

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  // DecompressionStream is available in modern browsers and Node >= 18.
  const DS = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error("DEFLATE entry requires DecompressionStream, which is unavailable here");
  const stream = new Blob([bytes]).stream().pipeThrough(new DS("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// Returns a map of entry name -> raw uncompressed bytes. Directory entries and
// entries whose name contains ".." (path traversal) are rejected.
export async function readZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Find End Of Central Directory (scan back over the optional comment).
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file (no end-of-central-directory record)");

  const entryCount = dv.getUint16(eocd + 10, true);
  let cptr = dv.getUint32(eocd + 16, true); // central directory offset

  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();

  for (let n = 0; n < entryCount; n++) {
    if (dv.getUint32(cptr, true) !== CEN_SIG) throw new Error("Corrupt ZIP central directory");
    const method = dv.getUint16(cptr + 10, true);
    const compSize = dv.getUint32(cptr + 20, true);
    const nameLen = dv.getUint16(cptr + 28, true);
    const extraLen = dv.getUint16(cptr + 30, true);
    const commentLen = dv.getUint16(cptr + 32, true);
    const localOffset = dv.getUint32(cptr + 42, true);
    const name = decoder.decode(bytes.subarray(cptr + 46, cptr + 46 + nameLen));
    cptr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directory entry
    if (name.includes("..") || name.startsWith("/")) throw new Error(`Unsafe ZIP entry name: ${name}`);

    // Local header: 30 fixed bytes + name + extra, then the file data.
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      out.set(name, comp.slice());
    } else if (method === 8) {
      out.set(name, await inflateRaw(comp));
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    }
  }

  return out;
}
