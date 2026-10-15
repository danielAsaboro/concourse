// Event-night plan for a real venue (Climate Pledge Arena): flexible locations solved
// with HiGHS, par sheet, baselines, without-Qloo ablation and sensitivity.
// GET /api/night            -> venue, events, assumptions
// GET /api/night?event=<id> -> full analysis (optional &pin=slot:concept,slot:concept)
import { NextRequest, NextResponse } from "next/server";
import { EVENTS, CANCELLED, VENUE, RETRIEVED, FLEX_SLOTS, CONCEPTS, eventById } from "@/lib/deep/venue";
import { PARAMS } from "@/lib/deep/economics";
import { analyse } from "@/lib/deep/analysis";
import { tasteFor } from "@/lib/deep/taste";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("event");
  if (!id) {
    return NextResponse.json({ venue: VENUE, retrieved: RETRIEVED, events: EVENTS, cancelled: CANCELLED, slots: FLEX_SLOTS, concepts: CONCEPTS, params: PARAMS });
  }
  const e = eventById.get(id);
  if (!e) return NextResponse.json({ error: `Unknown event ${id}` }, { status: 400 });
  const pinned: Record<string, string> = {};
  for (const pair of (req.nextUrl.searchParams.get("pin") ?? "").split(",")) {
    const [s, c] = pair.split(":");
    if (s && c && FLEX_SLOTS.some((x) => x.id === s) && CONCEPTS.some((x) => x.id === c)) pinned[s] = c;
  }
  try {
    const taste = await tasteFor(e);
    const a = await analyse(e, taste.status === "live" ? taste.affinity : null, undefined, pinned);
    // Calls are listed without the key (it is a header, never a parameter). Raw bodies stay in .cache.
    return NextResponse.json({ ...a, taste: taste.status === "live" ? { ...taste } : taste, pinned });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
