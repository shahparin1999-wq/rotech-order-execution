import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveRequestIdentity, IdentityError, CapabilityError, authorizeInventoryAction } from "@/server/authorization";
import { getRepository, resolvePersistenceMode } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (resolvePersistenceMode() === "local") return NextResponse.json({ error: "Server persistence is disabled" }, { status: 503 });
  try {
    const repo = await getRepository();
    const snapshot = await repo.load();
    const identity = resolveRequestIdentity(request, snapshot.state);
    authorizeInventoryAction({ type: "recordShipmentParse", input: { file: {} as never, parseRun: {} as never, fields: [] } }, identity, snapshot.state);
    const uploadId = randomUUID();
    return NextResponse.json({ uploadId, method: "POST", endpoint: "/api/oeh/v1/shipment-files", expiresInSeconds: 900, immutable: true });
  } catch (err) {
    const status = err instanceof IdentityError || err instanceof CapabilityError ? err.status : 503;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
