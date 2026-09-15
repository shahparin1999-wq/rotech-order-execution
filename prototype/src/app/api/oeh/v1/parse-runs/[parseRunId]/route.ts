import { NextResponse } from "next/server";
import { resolveRequestIdentity, IdentityError } from "@/server/authorization";
import { getRepository, resolvePersistenceMode } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ parseRunId: string }> }) {
  if (resolvePersistenceMode() === "local") return NextResponse.json({ error: "Server persistence is disabled" }, { status: 503 });
  try {
    const repo = await getRepository();
    const snapshot = await repo.load();
    resolveRequestIdentity(request, snapshot.state);
    const { parseRunId } = await context.params;
    const parseRun = snapshot.state.parseRuns.find((x) => x.id === parseRunId);
    if (!parseRun) return NextResponse.json({ error: "Parse run not found" }, { status: 404 });
    return NextResponse.json({ parseRun, fields: snapshot.state.parsedFields.filter((x) => x.parseRunId === parseRunId), shipmentDraft: snapshot.state.expectedShipments.find((x) => x.sourceFileId === parseRun.fileId) ?? null, version: snapshot.version });
  } catch (err) {
    const status = err instanceof IdentityError ? 401 : 503;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
