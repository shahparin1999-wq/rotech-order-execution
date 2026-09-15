import { NextResponse } from "next/server";
import { executeCommand, type CommandRequest } from "@/server/commands";
import { getRepository, resolvePersistenceMode } from "@/server/store";
import { authorizeInventoryAction, IdentityError, CapabilityError, resolveRequestIdentity } from "@/server/authorization";

const AUTHORIZED_INVENTORY_ACTIONS = new Set([
  "feasibilityProbe",
  "receiveInventory",
  "inspectInventory",
  "putAwayInventory",
  "createPutAwayJob",
  "reserveInventory",
  "issueInventoryToUnit",
  "installInventory",
  "returnInventoryToStock",
  "adjustInventory",
  "confirmOpeningImport",
  "recordShipmentParse",
  "editExpectedShipmentDraft",
  "confirmExpectedShipment",
  "supersedeExpectedShipment"
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const mode = resolvePersistenceMode();
  if (mode === "local") {
    return NextResponse.json({ error: "Server persistence is disabled", mode }, { status: 503 });
  }
  let body: CommandRequest;
  try {
    body = (await request.json()) as CommandRequest;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const repo = await getRepository();
  const snapshot = await repo.load();
  try {
      const identity = resolveRequestIdentity(request, snapshot.state);
      if (AUTHORIZED_INVENTORY_ACTIONS.has(body.action?.type ?? "")) authorizeInventoryAction(body.action, identity, snapshot.state);
      // The client may send a legacy actorId for optimistic rendering, but it
      // is never used for server authorization or audit attribution.
      body = { ...body, actorId: identity.oehUserId };
  } catch (err) {
    const status = err instanceof IdentityError || err instanceof CapabilityError ? err.status : 403;
    return NextResponse.json({ error: (err as Error).message, code: status === 401 ? "identity-required" : "capability-denied" }, { status });
  }
  const outcome = await executeCommand(repo, body);
  if (outcome.status === 200) {
    return NextResponse.json({ version: outcome.version, state: outcome.state, replayed: outcome.replayed });
  }
  if (outcome.status === 409) {
    return NextResponse.json({ error: outcome.message, code: outcome.code, version: outcome.version, state: outcome.state }, { status: 409 });
  }
  return NextResponse.json({ error: outcome.message, code: outcome.code, version: outcome.version }, { status: 422 });
}
