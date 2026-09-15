import { NextResponse } from "next/server";
import { resolveRequestIdentity, IdentityError } from "@/server/authorization";
import { getRepository, resolvePersistenceMode } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (resolvePersistenceMode() === "local") return NextResponse.json({ error: "Server persistence is disabled" }, { status: 503 });
  try {
    const repo = await getRepository();
    const snapshot = await repo.load();
    const identity = resolveRequestIdentity(request, snapshot.state);
    return NextResponse.json({ identity, persistence: { repository: repo.kind, version: snapshot.version } });
  } catch (err) {
    const status = err instanceof IdentityError ? 401 : 503;
    return NextResponse.json({ error: (err as Error).message, code: status === 401 ? "identity-required" : "oeh-unavailable" }, { status });
  }
}
