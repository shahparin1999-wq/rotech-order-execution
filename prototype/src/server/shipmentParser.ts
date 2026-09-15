import { readZipEntries } from "@/domain/zip";
import type { CreateExpectedShipmentInput, ParsedFieldFlag } from "@/domain/inventory/contracts";
import type { Facility } from "@/domain/types";
import { INVENTORY_CATEGORIES, type InventoryCategory } from "@/domain/inventory/identity";

export interface ParsedShipmentResult {
  parserVersion: string;
  ok: boolean;
  fields: Array<{
    field: string;
    value: string | null;
    normalizedValue?: string | null;
    confidence: number;
    sourceRow?: number;
    sourcePage?: number;
    flags: ParsedFieldFlag[];
  }>;
  shipment?: Omit<CreateExpectedShipmentInput, "sourceFileId" | "sourceFileHash">;
  error?: string;
}

const PARSER_VERSION = "shipment-parser-uat-1";

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">" ).replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function splitDelimited(line: string, delimiter: "," | "\t"): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim()); cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function fieldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function headerIndex(headers: string[]): Record<string, number> {
  const aliases: Record<string, string[]> = {
    supplier: ["supplier", "vendor", "vendorname"],
    poNumber: ["po", "ponumber", "purchaseorder"],
    facility: ["facility", "site", "location"],
    expectedDate: ["expecteddate", "eta", "duedate", "deliverydate"],
    partNumber: ["part", "partnumber", "item", "itemnumber", "sku"],
    description: ["description", "desc", "itemdescription"],
    category: ["category", "type"],
    componentKey: ["componentkey", "componentrole", "role", "component"],
    material: ["material", "alloy", "materialgrade"],
    expectedQuantity: ["quantity", "qty", "expectedquantity", "orderqty"],
    uom: ["uom", "unit", "unitofmeasure"],
    serialNumber: ["serial", "serialnumber"],
    lotNumber: ["lot", "lotnumber"],
    heatNumber: ["heat", "heatnumber"]
  };
  const result: Record<string, number> = {};
  headers.forEach((header, index) => {
    const key = fieldKey(header);
    for (const [canonical, names] of Object.entries(aliases)) if (names.includes(key) && result[canonical] === undefined) result[canonical] = index;
  });
  return result;
}

function facility(value: string | undefined): Facility | null {
  if (value === "Mississauga" || value === "Houston") return value;
  return null;
}

function rowsToResult(rows: string[][], confidence: number): ParsedShipmentResult {
  if (rows.length < 2) return { parserVersion: PARSER_VERSION, ok: false, fields: [{ field: "document", value: null, confidence: 0, flags: ["Missing"] }], error: "The shipment file has no data rows" };
  const headers = rows[0].map((x) => x.trim());
  const indexes = headerIndex(headers);
  const valueAt = (row: string[], key: string): string | undefined => indexes[key] === undefined ? undefined : row[indexes[key]]?.trim() || undefined;
  const first = rows[1];
  const supplier = valueAt(first, "supplier");
  const poNumber = valueAt(first, "poNumber");
  const facilityValue = valueAt(first, "facility");
  const facilityValueParsed = facility(facilityValue);
  const expectedDate = valueAt(first, "expectedDate");
  const material = valueAt(first, "material");
  const fields: ParsedShipmentResult["fields"] = [];
  const addField = (field: string, value: string | undefined, sourceRow: number, flags: ParsedFieldFlag[] = []) => {
    const finalFlags = [...flags];
    if (!value) finalFlags.push("Missing");
    if (finalFlags.includes("Missing") && !finalFlags.includes("LowConfidence")) finalFlags.push("LowConfidence");
    fields.push({ field, value: value ?? null, normalizedValue: value?.trim() ?? null, confidence: value ? confidence : 0, sourceRow, flags: finalFlags });
  };
  addField("supplier", supplier, 2);
  addField("poNumber", poNumber, 2);
  addField("facility", facilityValue, 2, facilityValue && !facilityValueParsed ? ["Ambiguous"] : []);
  addField("expectedDate", expectedDate, 2);
  if (indexes.material !== undefined) addField("material", material, 2);

  const seenParts = new Set<string>();
  const lines = rows.slice(1).map((row, index) => {
    const sourceRow = index + 2;
    const partNumber = valueAt(row, "partNumber") ?? "";
    const description = valueAt(row, "description") ?? "";
    const material = valueAt(row, "material");
    const categoryValue = valueAt(row, "category") ?? "";
    const category = INVENTORY_CATEGORIES.includes(categoryValue as InventoryCategory) ? categoryValue as InventoryCategory : "Accessory";
    const quantityText = valueAt(row, "expectedQuantity") ?? "";
    const quantity = Number(quantityText);
    const duplicate = !!partNumber && seenParts.has(partNumber.toUpperCase());
    if (partNumber) seenParts.add(partNumber.toUpperCase());
    addField("partNumber", partNumber, sourceRow, duplicate ? ["Duplicate"] : []);
    addField("description", description, sourceRow);
    addField("expectedQuantity", quantityText, sourceRow, !Number.isFinite(quantity) || quantity <= 0 ? ["Ambiguous"] : []);
    return {
      sourceRow,
      partNumber,
      description,
      material,
      category,
      componentKey: valueAt(row, "componentKey") || undefined,
      attributes: headers.reduce<Record<string, string>>((attributes, header, column) => {
        const value = row[column]?.trim();
        if (value && !Object.values(indexes).includes(column)) attributes[header.trim()] = value;
        return attributes;
      }, {}),
      facility: facilityValueParsed ?? "Mississauga",
      expectedQuantity: Number.isFinite(quantity) ? quantity : 0,
      uom: valueAt(row, "uom") ?? "EA",
      ...(valueAt(row, "serialNumber") ? { serialNumbers: [valueAt(row, "serialNumber")!] } : {}),
      lotNumber: valueAt(row, "lotNumber"),
      heatNumber: valueAt(row, "heatNumber")
    };
  });
  const canCreateDraft = !!supplier && !!facilityValueParsed && lines.length > 0;
  return {
    parserVersion: PARSER_VERSION,
    ok: canCreateDraft,
    fields,
    ...(canCreateDraft ? { shipment: { supplier, poNumber, facility: facilityValueParsed, expectedDate, lines } } : {}),
    ...(canCreateDraft ? {} : { error: "The parser returned a review result but needs supplier and facility confirmation before a draft can be created" })
  };
}

function parseDelimited(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  return lines.map((line) => splitDelimited(line, delimiter));
}

async function parseXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entries = await readZipEntries(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const shared = entries.get("xl/sharedStrings.xml");
  const sharedValues = shared ? [...new TextDecoder().decode(shared).matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])) : [];
  const worksheet = entries.get("xl/worksheets/sheet1.xml");
  if (!worksheet) throw new Error("Workbook has no first worksheet");
  const xml = new TextDecoder().decode(worksheet);
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<c[^>]*r="([A-Z]+)[0-9]+"[^>]*(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
      const column = cell[1].split("").reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const value = cell[3].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? cell[3].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      while (cells.length <= column) cells.push("");
      cells[column] = cell[2] === "s" ? (sharedValues[Number(value)] ?? "") : decodeXml(value);
    }
    rows.push(cells);
  }
  return rows;
}

/** Parsing stays backend-side; unsupported OCR is returned as an explicit review state. */
export async function parseShipmentFile(bytes: Uint8Array, mediaType: string, fileName: string): Promise<ParsedShipmentResult> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || mediaType.includes("csv") || mediaType.includes("tab-separated")) {
    return rowsToResult(parseDelimited(new TextDecoder().decode(bytes)), 0.99);
  }
  if (lower.endsWith(".xlsx") || mediaType.includes("spreadsheetml")) {
    try { return rowsToResult(await parseXlsx(bytes), 0.99); }
    catch (err) { return { parserVersion: PARSER_VERSION, ok: false, fields: [{ field: "document", value: null, confidence: 0, flags: ["Unsupported"] }], error: `Excel parsing failed: ${(err as Error).message}` }; }
  }
  if (lower.endsWith(".txt") || lower.endsWith(".pdf") || mediaType.startsWith("text/")) {
    const text = new TextDecoder().decode(bytes);
    if (text.includes(",") || text.includes("\t")) return rowsToResult(parseDelimited(text), 0.75);
  }
  return {
    parserVersion: PARSER_VERSION,
    ok: false,
    fields: [{ field: "document", value: null, confidence: 0, flags: ["Unsupported", "Missing", "LowConfidence"] }],
    error: "Scanned PDF/JPG/PNG OCR adapter is not configured in this UAT runtime; human review is required"
  };
}
