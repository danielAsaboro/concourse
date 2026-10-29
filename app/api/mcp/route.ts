// Minimal MCP server (Streamable HTTP, stateless, JSON responses) so anyone can
// check the planner from their own MCP client: POST JSON-RPC to /api/mcp.
// Tools: list_events, plan_event, staff_event, merch_plan, erlang_c, erlang_a, newsvendor, textbook_checks.
import { NextRequest, NextResponse } from "next/server";
import { EVENTS, eventById, FLEX_SLOTS, CONCEPTS } from "@/lib/deep/venue";
import { analyse } from "@/lib/deep/analysis";
import { tasteFor } from "@/lib/deep/taste";
import { erlangC, meanWait, serviceLevel } from "@/lib/deep/queue";
import { newsvendor } from "@/lib/deep/newsvendor";
import { textbookChecks } from "@/lib/deep/checks";
import { opsPlan } from "@/lib/ops/night";
import { merchPlan } from "@/lib/ops/merch";
import { erlangA, transient } from "@/lib/ops/erlangA";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROTOCOL = "2025-06-18";

const TOOLS = [
  { name: "list_events", description: "Real upcoming events at Climate Pledge Arena (from the arena's event feed).", inputSchema: { type: "object", properties: {} } },
  {
    name: "plan_event",
    description: "Solve tonight's flexible-location plan (concept and registers per location) with HiGHS, plus the without-Qloo ablation, baselines and the Pareto set of contribution vs peak wait.",
    inputSchema: { type: "object", properties: { eventId: { type: "string" }, pins: { type: "object", additionalProperties: { type: "string" }, description: "slot id -> concept id" } }, required: ["eventId"] },
  },
  {
    name: "erlang_c",
    description: "M/M/c queue: probability of waiting, mean wait and service level.",
    inputSchema: { type: "object", properties: { arrivalsPerMin: { type: "number" }, serviceMin: { type: "number" }, servers: { type: "integer" }, targetMin: { type: "number" } }, required: ["arrivalsPerMin", "serviceMin", "servers"] },
  },
  {
    name: "newsvendor",
    description: "Prep quantity at critical ratio (price − cost)/(price − salvage) under normally distributed demand.",
    inputSchema: { type: "object", properties: { meanDemand: { type: "number" }, sdDemand: { type: "number" }, price: { type: "number" }, unitCost: { type: "number" }, salvage: { type: "number" } }, required: ["meanDemand", "sdDemand", "price", "unitCost", "salvage"] },
  },
  {
    name: "staff_event",
    description: "Registers per 15 minutes for every stand (time-varying Erlang A), shifts from a HiGHS covering program, and the cost of Seattle's 14-day schedule lock for one event.",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"] },
  },
  {
    name: "merch_plan",
    description: "Merch count-in by item and size, registers before and during the set, and sales lost to lines for one event (atVenu genre priors).",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"] },
  },
  {
    name: "erlang_a",
    description: "M/M/c+M queue with abandonment. Steady state, or a burst: give burstMin to start from an empty stand and run the arrivals for that many minutes.",
    inputSchema: { type: "object", properties: { arrivalsPerMin: { type: "number" }, serviceMin: { type: "number" }, servers: { type: "integer" }, patienceMin: { type: "number" }, burstMin: { type: "number" } }, required: ["arrivalsPerMin", "serviceMin", "servers", "patienceMin"] },
  },
  { name: "textbook_checks", description: "Re-run the published Erlang C example, the newsvendor hand calculation and solver-vs-brute-force checks against this deployment.", inputSchema: { type: "object", properties: {} } },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const text = (data: unknown, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }], structuredContent: data, isError });

const num = (x: unknown, name: string) => {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
};

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_events":
      return text({ events: EVENTS.map((e) => ({ id: e.id, title: e.title, date: e.date, start: e.start, kind: e.kind, source: e.source })) });
    case "plan_event": {
      const e = eventById.get(String(args.eventId));
      if (!e) return text({ error: `Unknown event ${args.eventId}` }, true);
      const pins: Record<string, string> = {};
      for (const [s, c] of Object.entries((args.pins as Record<string, string>) ?? {})) if (FLEX_SLOTS.some((x) => x.id === s) && CONCEPTS.some((x) => x.id === c)) pins[s] = c;
      const taste = await tasteFor(e);
      const a = await analyse(e, taste.status === "live" ? taste.affinity : null, undefined, pins);
      return text({
        event: { id: e.id, title: e.title, date: e.date },
        tasteSignal: taste.status,
        headline: a.headline,
        plan: a.plan.decisions.map((d) => ({ location: d.slot.id, concept: d.concept.id, registers: d.servers, expectedOrders: Math.round(d.economics.servedTx), worstWaitMin: +d.economics.worstWaitMin.toFixed(2), par: d.economics.par.quantity, contribution: Math.round(d.economics.contribution), tiedWith: d.tiedWith })),
        total: Math.round(a.plan.total),
        solver: a.plan.solver,
        ablation: { total: Math.round(a.ablation.plan.total), locationsDifferent: a.ablation.slotsDifferent },
        baselines: a.baselines.map((b) => ({ id: b.id, status: b.status, total: b.total !== undefined ? Math.round(b.total) : null })),
        pareto: a.pareto.map((p) => ({ waitPenaltyPerFanMinute: p.waitPenalty, contribution: Math.round(p.contribution), peakWaitMin: +p.peakWaitMin.toFixed(2), fanWaitHours: +p.fanWaitHours.toFixed(1) })),
        solves: a.solves.length,
      });
    }
    case "erlang_c": {
      const lambda = num(args.arrivalsPerMin, "arrivalsPerMin"), s = num(args.serviceMin, "serviceMin"), c = Math.round(num(args.servers, "servers"));
      const a = lambda * s;
      const t = args.targetMin === undefined ? 1 : num(args.targetMin, "targetMin");
      return text({ offeredLoadErlangs: a, utilisation: a / c, pWait: erlangC(a, c), meanWaitMin: meanWait(a, c, s), serviceLevel: serviceLevel(a, c, s, t), targetMin: t, stable: a < c });
    }
    case "staff_event": {
      const e = eventById.get(String(args.eventId));
      if (!e) return text({ error: `Unknown event ${args.eventId}` }, true);
      const o = await opsPlan(e);
      return text({ event: o.event, crowd: o.genre, totals: o.totals, intervals: o.intervals, stands: o.stands.map((s) => ({ id: s.id, name: s.name, registers: s.registers, steadyState: s.sipp, walkAway: +s.abandonShare.toFixed(4) })), seattle: { postAtPercentile: o.seattle.optimal.q, saving: Math.round(o.seattle.savingVsForecast), sharperForecastSaving: Math.round(o.seattle.sharperForecast.saving) }, solver: o.solver });
    }
    case "merch_plan": {
      const e = eventById.get(String(args.eventId));
      if (!e) return text({ error: `Unknown event ${args.eventId}` }, true);
      const o = await opsPlan(e);
      const m = merchPlan(e, o.attendance);
      return text({ genre: m.genre, gross: Math.round(m.gross), venueShare: Math.round(m.venueShare), registers: m.registers, early: m.early, lostSales: Math.round(m.lostSales), countIn: m.stock.map((s) => ({ id: s.id, quantity: s.quantity })) });
    }
    case "erlang_a": {
      const l = num(args.arrivalsPerMin, "arrivalsPerMin"), s = num(args.serviceMin, "serviceMin"), c = Math.round(num(args.servers, "servers")), pat = num(args.patienceMin, "patienceMin");
      if (args.burstMin !== undefined) {
        const T = num(args.burstMin, "burstMin");
        const r = transient(() => l, c, s, pat, T);
        const tail = transient(() => 0, c, s, pat, 60, r.end);
        const arr = r.arrivals;
        return text({ mode: "burst from empty", arrivals: arr, walkAwayShare: (r.abandons + tail.abandons) / arr, meanWaitMin: (r.fanMinutesWaiting + tail.fanMinutesWaiting) / arr, peakQueue: r.peakQueue });
      }
      const r = erlangA(l, s, c, pat);
      return text({ mode: "steady state", pWait: r.pWait, walkAwayShare: r.pAbandon, meanWaitMin: r.meanWaitMin, meanQueue: r.meanQueue, utilisation: r.utilisation });
    }
    case "newsvendor":
      return text(newsvendor({ meanDemand: num(args.meanDemand, "meanDemand"), sdDemand: num(args.sdDemand, "sdDemand"), price: num(args.price, "price"), unitCost: num(args.unitCost, "unitCost"), salvage: num(args.salvage, "salvage") }));
    case "textbook_checks":
      return text(await textbookChecks());
    default:
      return null;
  }
}

async function handle(m: Rpc) {
  switch (m.method) {
    case "initialize":
      return ok(m.id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "concourse-planner", version: "1.0.0" }, instructions: "Event-night planner for Climate Pledge Arena. Start with list_events, then plan_event. textbook_checks re-runs the published references." });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      try {
        const r = await callTool(name, (m.params?.arguments as Record<string, unknown>) ?? {});
        return r ? ok(m.id, r) : fail(m.id, -32602, `Unknown tool ${name}`);
      } catch (err) {
        return ok(m.id, text({ error: (err as Error).message }, true));
      }
    }
    default:
      return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(req: NextRequest) {
  let body: Rpc | Rpc[];
  try { body = await req.json(); } catch { return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400 }); }
  const msgs = Array.isArray(body) ? body : [body];
  const out = [];
  for (const m of msgs) {
    if (m.id === undefined || m.id === null) continue; // notifications get no response
    out.push(await handle(m));
  }
  if (!out.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? out : out[0], { headers: { "MCP-Protocol-Version": PROTOCOL } });
}

export async function GET() {
  // Stateless server: no server-initiated stream. Spec-wise a 405 tells clients to use POST only.
  return NextResponse.json({ name: "concourse-planner", transport: "streamable-http, POST JSON-RPC only", tools: TOOLS.map((t) => t.name) }, { status: 405, headers: { Allow: "POST" } });
}
