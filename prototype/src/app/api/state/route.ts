import { NextResponse } from "next/server";
import { getRepository, resolvePersistenceMode } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = resolvePersistenceMode();
  if (mode === "local") {
    return NextResponse.json({ error: "Server persistence is disabled", mode }, { status: 503 });
  }
  const repo = await getRepository();
  const snapshot = await repo.load();
  return NextResponse.json({ mode, version: snapshot.version, state: snapshot.state });
}
