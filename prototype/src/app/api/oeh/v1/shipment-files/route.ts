import { NextResponse } from "next/server";
import { resolveRequestIdentity, IdentityError, CapabilityError, authorizeInventoryAction } from "@/server/authorization";
import { getRepository, resolvePersistenceMode } from "@/server/store";
import { storeImmutableBlob } from "@/server/immutableBlob";
import { parseShipmentFile } from "@/server/shipmentParser";
import { executeCommand } from "@/server/commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (resolvePersistenceMode() === "local") return NextResponse.json({ error: "Server persistence is disabled" }, { status: 503 });
  try {
    const repo = await getRepository();
    const snapshot = await repo.load();
    const identity = resolveRequestIdentity(request, snapshot.state);
    authorizeInventoryAction({ type: "recordShipmentParse", input: { file: {} as never, parseRun: {} as never, fields: [] } }, identity, snapshot.state);
    const form = await request.formData();
    const entry = form.get("file");
    if (!(entry instanceof File)) return NextResponse.json({ error: "multipart field 'file' is required" }, { status: 400 });
    if (entry.size <= 0 || entry.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `File size must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes` }, { status: 413 });
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const blob = await storeImmutableBlob(bytes);
    const idempotencyKey = form.get("idempotencyKey")?.toString() || `shipment-upload-${blob.sha256}`;
    const prior = await repo.findCommand(idempotencyKey);
    if (prior) {
      const file = snapshot.state.shipmentFiles.find((x) => x.sha256 === blob.sha256);
      if (prior.actionType !== "recordShipmentParse" || !file) {
        return NextResponse.json({ error: "The same idempotency key was already used with a different shipment upload", code: "idempotency-conflict", version: snapshot.version }, { status: 409 });
      }
      const parseRun = snapshot.state.parseRuns.find((x) => x.fileId === file.id);
      const shipment = snapshot.state.expectedShipments.find((x) => x.sourceFileId === file.id);
      return NextResponse.json({ file, parseRun, parsedFields: parseRun ? snapshot.state.parsedFields.filter((x) => x.parseRunId === parseRun.id) : [], shipmentDraft: shipment, version: snapshot.version, replayed: true, parserError: parseRun?.error });
    }
    const parsed = await parseShipmentFile(bytes, entry.type || "application/octet-stream", entry.name);
    const now = new Date().toISOString();
    const action = {
      type: "recordShipmentParse" as const,
      input: {
        file: {
          originalName: entry.name,
          mediaType: entry.type || "application/octet-stream",
          sizeBytes: blob.sizeBytes,
          sha256: blob.sha256,
          storageKey: blob.storageKey,
          status: parsed.ok ? "Parsed" as const : "ParseFailed" as const,
          uploadedBy: identity.oehUserId,
          uploadedAt: now
        },
        parseRun: {
          parserVersion: parsed.parserVersion,
          status: parsed.ok ? "Completed" as const : "Failed" as const,
          startedAt: now,
          completedAt: now,
          ...(parsed.error ? { error: parsed.error } : {})
        },
        fields: parsed.fields,
        ...(parsed.shipment ? { shipment: { ...parsed.shipment, sourceFileId: "pending", sourceFileHash: blob.sha256 } } : {})
      }
    };
    authorizeInventoryAction(action, identity, snapshot.state);
    const outcome = await executeCommand(repo, {
      idempotencyKey,
      actorId: identity.oehUserId,
      expectedVersion: snapshot.version,
      action
    });
    if (outcome.status !== 200) return NextResponse.json({ error: outcome.message, code: outcome.code, state: "state" in outcome ? outcome.state : undefined }, { status: outcome.status });
    const file = outcome.state.shipmentFiles.find((x) => x.sha256 === blob.sha256);
    const parseRun = file ? outcome.state.parseRuns.find((x) => x.fileId === file.id) : undefined;
    const shipment = file ? outcome.state.expectedShipments.find((x) => x.sourceFileId === file.id) : undefined;
    return NextResponse.json({ file, parseRun, parsedFields: parseRun ? outcome.state.parsedFields.filter((x) => x.parseRunId === parseRun.id) : [], shipmentDraft: shipment, version: outcome.version, replayed: outcome.replayed, parserError: parsed.error });
  } catch (err) {
    const status = err instanceof IdentityError || err instanceof CapabilityError ? err.status : 422;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
