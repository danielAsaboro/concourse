import { NextRequest, NextResponse } from "next/server";
import { buildPlan } from "@/lib/agent/plan";
import { EVENTS } from "@/lib/venue/events";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const eventId = url.searchParams.get("event") ?? EVENTS[0].id;
  const overrides: Record<string, string> = {};
  const o = url.searchParams.get("overrides");
  if (o) for (const pair of o.split(",")) { const [k, v] = pair.split(":"); if (k && v) overrides[k] = v; }
  try {
    const plan = await buildPlan(eventId, overrides);
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
