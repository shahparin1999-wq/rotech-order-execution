import { NextResponse } from "next/server";
import { getRepository, resolvePersistenceMode } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = resolvePersistenceMode();
  if (mode === "local") return NextResponse.json({ ok: true, mode });
  try {
    const repo = await getRepository();
    const snapshot = await repo.load();
    return NextResponse.json({ ok: true, mode, repository: repo.kind, version: snapshot.version, orders: snapshot.state.orders.length });
  } catch (err) {
    return NextResponse.json({ ok: false, mode, error: (err as Error).message }, { status: 503 });
  }
}
