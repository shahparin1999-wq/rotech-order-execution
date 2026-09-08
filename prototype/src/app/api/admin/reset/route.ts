import { NextResponse } from "next/server";
import { buildInitialState } from "@/domain/fixtures";
import { getRepository, resetAllowed, resolvePersistenceMode } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Development/test only: reload the sample data. Refused in production unless OEH_ALLOW_RESET=1. */
export async function POST() {
  const mode = resolvePersistenceMode();
  if (mode === "local") {
    return NextResponse.json({ error: "Server persistence is disabled", mode }, { status: 503 });
  }
  if (!resetAllowed()) {
    return NextResponse.json({ error: "Reset is not allowed in this environment" }, { status: 403 });
  }
  const repo = await getRepository();
  const snapshot = await repo.reset(buildInitialState());
  return NextResponse.json({ mode, version: snapshot.version, state: snapshot.state });
}
