import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
      : v;

// Minimal STORED-only ZIP writer (crc left 0; the reader does not verify it).
function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, e.data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt32LE(e.data.length, 20);
    cen.writeUInt32LE(e.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + e.data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, eocd]);
}

test.describe("CPQ transfer bundle import", () => {
  test("upload a .zip bundle → PO verified in preview, imports to an order", async ({ page }) => {
    // Build a valid bundle from the fictional sample package + a fake PO.
    const pkg = JSON.parse(readFileSync("sample-data/cpq-execution-package-v1.json", "utf8"));
    const { checksum: _c, ...rest } = pkg;
    void _c;
    pkg.checksum = sha(Buffer.from(JSON.stringify(canon(rest)), "utf8"));
    const pkgBytes = Buffer.from(JSON.stringify(pkg), "utf8");
    const poBytes = Buffer.from("%PDF-1.4 fictional purchase order", "utf8");
    const manifest = {
      envelopeSchemaVersion: "1.0",
      packageId: pkg.packageId,
      acceptedPoSubmissionId: "sub-demo-1",
      files: {
        executionPackage: { name: "execution-package.json", sha256: sha(pkgBytes), sizeBytes: pkgBytes.length },
        customerPo: { name: "customer-po/po.pdf", sha256: sha(poBytes), sizeBytes: poBytes.length, mediaType: "application/pdf" }
      }
    };
    const zip = buildZip([
      { name: "execution-package.json", data: pkgBytes },
      { name: "transfer-manifest.json", data: Buffer.from(JSON.stringify(manifest), "utf8") },
      { name: "customer-po/po.pdf", data: poBytes }
    ]);
    const zipPath = join(mkdtempSync(join(tmpdir(), "cpq-bundle-")), "won-order.zip");
    writeFileSync(zipPath, zip);

    await page.goto("/orders");
    await page.getByTestId("new-work-order-button").click();
    await page.getByTestId("import-cpq-toggle").click();
    await page.getByTestId("cpq-file-input").setInputFiles(zipPath);

    // The PO was extracted and verified against the manifest.
    await expect(page.getByTestId("cpq-preview-po")).toContainText("po.pdf");
    await expect(page.getByTestId("cpq-preview-line-1")).toContainText("Quantity 2");

    await page.getByTestId("confirm-cpq-import").click();
    await expect(page).toHaveURL(/\/orders\/Q-DEMO-1001-R3/);
    await page.goto("/orders/Q-DEMO-1001-R3?tab=units");
    await expect(page.locator('[data-testid^="unit-row-"]')).toHaveCount(3);
  });
});
