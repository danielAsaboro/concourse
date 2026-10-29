// Event-night operations: registers per 15 minutes for every stand (time-varying
// Erlang A), shifts (HiGHS covering program), Seattle's 14-day schedule lock, prep
// waves and call-downs, merch counts by item and size, and the crowd's taste from
// Qloo (live only).
// GET  /api/ops?event=<id>
// POST /api/ops?event=<id>  body: sales-history CSV -> per-stand forecasts updated from it
import { NextRequest, NextResponse } from "next/server";
import { eventById, EVENTS } from "@/lib/deep/venue";
import { defaults } from "@/lib/deep/economics";
import { opsPlan } from "@/lib/ops/night";
import { merchPlan } from "@/lib/ops/merch";
import { crowdFor, femaleShareFromDemo } from "@/lib/ops/crowd";
import { forecast, parseSalesCsv, effectiveDispersion } from "@/lib/ops/forecast";
import { genreOf } from "@/lib/ops/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new Map<string, { at: number; value: Awaited<ReturnType<typeof opsPlan>> }>();
async function plan(id: string) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.value;
  const value = await opsPlan(eventById.get(id)!);
  cache.set(id, { at: Date.now(), value });
  return value;
}

async function build(id: string, csv?: string) {
  const e = eventById.get(id)!;
  const [ops, crowd] = await Promise.all([plan(id), crowdFor(e)]);
  const female = crowd.status === "live" ? femaleShareFromDemo(crowd.demographics[0]?.gender) : undefined;
  const merch = merchPlan(e, ops.attendance, undefined, female);
  const target = { date: e.date, kind: e.kind, genre: genreOf(e), start: e.start, attendance: ops.attendance };
  const hist = csv ? parseSalesCsv(csv) : { rows: [], errors: [] };
  const forecasts = ops.stands.map((s) => forecast(s.id, target, s.demandTx, hist.rows));
  return {
    ...ops,
    merch,
    crowd,
    forecasts,
    history: { rows: hist.rows.length, errors: hist.errors, dispersionNewAct: effectiveDispersion(defaults().demandDispersion, 3) },
  };
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("event");
  if (!id) return NextResponse.json({ events: EVENTS.map((e) => ({ id: e.id, title: e.title, date: e.date, start: e.start, kind: e.kind, genre: genreOf(e) })) });
  if (!eventById.has(id)) return NextResponse.json({ error: `Unknown event ${id}` }, { status: 400 });
  try { return NextResponse.json(await build(id)); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("event");
  if (!id || !eventById.has(id)) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  const csv = (await req.text()).slice(0, 2_000_000);
  try { return NextResponse.json(await build(id, csv)); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 500 }); }
}
