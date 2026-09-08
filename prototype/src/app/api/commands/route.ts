import { NextResponse } from "next/server";
import { executeCommand, type CommandRequest } from "@/server/commands";
import { getRepository, resolvePersistenceMode } from "@/server/store";

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
  const outcome = await executeCommand(repo, body);
  if (outcome.status === 200) {
    return NextResponse.json({ version: outcome.version, state: outcome.state, replayed: outcome.replayed });
  }
  if (outcome.status === 409) {
    return NextResponse.json({ error: outcome.message, code: outcome.code, version: outcome.version, state: outcome.state }, { status: 409 });
  }
  return NextResponse.json({ error: outcome.message, code: outcome.code, version: outcome.version }, { status: 422 });
}
