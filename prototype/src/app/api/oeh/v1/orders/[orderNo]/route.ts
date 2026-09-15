import { NextResponse } from "next/server";
import { resolveRequestIdentity, IdentityError } from "@/server/authorization";
import { getRepository, resolvePersistenceMode } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ orderNo: string }> }) {
  if (resolvePersistenceMode() === "local") return NextResponse.json({ error: "Server persistence is disabled" }, { status: 503 });
  try {
    const repo = await getRepository();
    const snapshot = await repo.load();
    const identity = resolveRequestIdentity(request, snapshot.state);
    const { orderNo } = await context.params;
    const order = snapshot.state.orders.find((x) => x.orderNumber === orderNo);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (!identity.facilityScope.includes(order.facility)) return NextResponse.json({ error: "Order is outside this user's facility scope" }, { status: 403 });
    return NextResponse.json({ order, version: snapshot.version });
  } catch (err) {
    const status = err instanceof IdentityError ? 401 : 503;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
