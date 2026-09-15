import { NextResponse } from "next/server";
import { getRepository, resolvePersistenceMode } from "@/server/store";
import { IdentityError, resolveRequestIdentity } from "@/server/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const mode = resolvePersistenceMode();
  if (mode === "local") {
    return NextResponse.json({ error: "Server persistence is disabled", mode }, { status: 503 });
  }
  try {
    const repo = await getRepository();
    const snapshot = await repo.load();
    // Shared state is an OEH read, not an anonymous public fixture endpoint.
    // The same trusted identity chain used by commands gates the snapshot.
    resolveRequestIdentity(request, snapshot.state);
    return NextResponse.json({ mode, version: snapshot.version, state: snapshot.state });
  } catch (err) {
    const status = err instanceof IdentityError ? err.status : 503;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
