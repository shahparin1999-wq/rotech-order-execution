import { NextResponse } from "next/server";
import { resolveRequestIdentity, IdentityError } from "@/server/authorization";
import { getRepository, resolvePersistenceMode } from "@/server/store";
import { inventoryPositions } from "@/domain/inventoryActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (resolvePersistenceMode() === "local") return NextResponse.json({ error: "Server persistence is disabled" }, { status: 503 });
  try {
    const repo = await getRepository();
    const snapshot = await repo.load();
    resolveRequestIdentity(request, snapshot.state);
    // Both pools are visible; facility scope restricts mutations, not remote
    // stock visibility in the operational view.
    return NextResponse.json({ positions: inventoryPositions(snapshot.state), expectedShipments: snapshot.state.expectedShipments, version: snapshot.version });
  } catch (err) {
    const status = err instanceof IdentityError ? 401 : 503;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
