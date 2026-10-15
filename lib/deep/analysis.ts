// Everything the "does Qloo matter?" view needs for one event: the plan, the
// without-Qloo ablation, the baselines scored under the same model, a
// sensitivity sweep over every assumption, and break-even affinity gaps.
import { CONCEPTS, EVENTS, FLEX_SLOTS, type VenueEvent } from "./venue";
import { PARAMS, defaults, type ParamKey, type Values } from "./economics";
import { planFlex, evaluate, breakEven, parSheet, attendance, perCap, type FlexPlan, type TasteInput } from "./planner";
import claudeBaseline from "./data/baseline-claude-no-qloo.json";

export type Baseline = {
  id: "claude-no-qloo" | "last-similar-event" | "most-popular" | "status-quo";
  label: string;
  status: "scored" | "pending" | "not-available";
  note: string;
  assignment?: Record<string, string>;
  total?: number;
  slotsDifferent?: number;
};

export type Sensitivity = { param: ParamKey; status: string; low: number; high: number; totalLow: number; totalHigh: number; planChangesLow: number; planChangesHigh: number };

const cid = (x: string | undefined) => (x ?? "").split("#")[0];
/** Concept plus registers; an assignment without a register count means the location's default staffing. */
const full = (slotId: string, x: string | undefined) => {
  const [c, k] = (x ?? "").split("#");
  return `${c}#${k || FLEX_SLOTS.find((s) => s.id === slotId)!.servers}`;
};
/** Locations whose concept or register count differs. */
const diff = (a: Record<string, string>, b: Record<string, string>) => FLEX_SLOTS.filter((s) => full(s.id, a[s.id]) !== full(s.id, b[s.id])).length;
/** Changed locations, ignoring swaps between concepts the model scores as tied. */
const material = (p: FlexPlan, base: Record<string, string>) =>
  p.decisions.filter((d) => d.concept.id !== cid(base[d.slot.id]) && !d.tiedWith.includes(cid(base[d.slot.id]))).length;
const asMap = (p: FlexPlan) => Object.fromEntries(p.decisions.map((d) => [d.slot.id, d.concept.id]));
/** Concept and staffing, for scoring a plan exactly as solved. */
const asOpt = (p: FlexPlan) => Object.fromEntries(p.decisions.map((d) => [d.slot.id, `${d.concept.id}#${d.servers}`]));

export type SolveLog = { label: string; status: string; objective: number; gap: number; ms: number; variables: number; constraints: number };

export type ParetoPoint = { waitPenalty: number; contribution: number; peakWaitMin: number; fanWaitHours: number; assignment: Record<string, string>; chosen: boolean };

export async function analyse(e: VenueEvent, taste: TasteInput, v: Values = defaults(), pinned: Record<string, string> = {}) {
  const solves: SolveLog[] = [];
  const run = async (label: string, ...args: Parameters<typeof planFlex>) => {
    const p = await planFlex(...args);
    solves.push({ label, status: p.solver.status, objective: p.solver.objective, gap: p.solver.gap, ms: p.solver.ms, variables: p.solver.variables, constraints: p.solver.constraints });
    return p;
  };
  const plan = await run("Tonight's plan", e, v, taste, pinned);
  const ablation = await run("Without Qloo (taste effect 0)", e, { ...v, tasteBeta: 0 }, null, pinned);
  const planMap = asOpt(plan);
  const ablMap = asMap(ablation);

  const baselines: Baseline[] = [];
  const sq = Object.fromEntries(FLEX_SLOTS.map((s) => [s.id, `${s.statusQuo ?? cid(ablMap[s.id])}#${s.servers}`]));
  baselines.push({ id: "status-quo", label: "Keep what runs there now", status: "scored", note: "Published occupant where there is one, otherwise the without-taste pick, at default staffing (4 registers per stand, 2 per cart).", assignment: sq, total: evaluate(e, sq, v, taste).total, slotsDifferent: diff(sq, planMap) });
  const cb = (claudeBaseline as { generatedAt: string; events: Record<string, { assignment: Record<string, string> }> }).events[e.id];
  if (cb) {
    const ev = evaluate(e, cb.assignment, v, taste);
    baselines.push({ id: "claude-no-qloo", label: "Claude without Qloo", status: ev.feasible ? "scored" : "not-available", note: `Recorded ${claudeBaseline.generatedAt}: same locations, concepts and rules, no Qloo data, no web access. Scored at default staffing.`, assignment: cb.assignment, total: ev.total, slotsDifferent: diff(cb.assignment, planMap) });
  } else {
    baselines.push({ id: "claude-no-qloo", label: "Claude without Qloo", status: "not-available", note: "Recorded for five pre-registered events only." });
  }
  const i = EVENTS.findIndex((x) => x.id === e.id);
  const prevSimilar = EVENTS.slice(0, i).reverse().find((x) => x.kind === e.kind);
  if (prevSimilar) {
    const prevPlan = asOpt(await run(`Last similar event: ${prevSimilar.title}`, prevSimilar, v, null));
    baselines.push({ id: "last-similar-event", label: `Same as ${prevSimilar.title} (${prevSimilar.date})`, status: "scored", note: "Last plan for the same kind of event, carried over.", assignment: prevPlan, total: evaluate(e, prevPlan, v, taste).total, slotsDifferent: diff(prevPlan, planMap) });
  } else {
    baselines.push({ id: "last-similar-event", label: "Same as the last similar event", status: "not-available", note: "No earlier event of this kind in the calendar window." });
  }
  baselines.push({ id: "most-popular", label: "Most popular concept per location", status: "pending", note: "Needs Qloo popularity scores from a live call." });

  // Sensitivity: move one assumption to its low and high end, re-solve, count changed locations.
  const sensitivity: Sensitivity[] = [];
  for (const k of Object.keys(PARAMS) as ParamKey[]) {
    const p = PARAMS[k];
    if (p.low === p.high) continue;
    const lo = await run(`Sensitivity: ${k} low`, e, { ...v, [k]: p.low }, taste, pinned);
    const hi = await run(`Sensitivity: ${k} high`, e, { ...v, [k]: p.high }, taste, pinned);
    sensitivity.push({ param: k, status: p.status, low: p.low, high: p.high, totalLow: lo.total, totalHigh: hi.total, planChangesLow: material(lo, planMap), planChangesHigh: material(hi, planMap) });
  }
  sensitivity.sort((a, b) => Math.abs(b.totalHigh - b.totalLow) - Math.abs(a.totalHigh - a.totalLow));

  // Pareto: re-solve with a growing price on fan waiting time; keep the distinct plans.
  const pareto: ParetoPoint[] = [];
  for (const lam of [0, 0.1, 0.25, 0.5, 1, 2, 5]) {
    const p = await run(`Pareto: $${lam} per fan-minute waited`, e, v, taste, pinned, lam);
    const m = asOpt(p);
    const pt: ParetoPoint = {
      waitPenalty: lam,
      contribution: p.total,
      peakWaitMin: Math.max(...p.decisions.map((d) => (Number.isFinite(d.economics.worstWaitMin) ? d.economics.worstWaitMin : v.patienceMin))),
      fanWaitHours: p.decisions.reduce((t, d) => t + d.economics.fanWaitMin, 0) / 60,
      assignment: m,
      chosen: lam === 0,
    };
    // Plans that differ only by tied concepts land on the same point; keep one.
    const same = (q: ParetoPoint) => Math.abs(q.contribution - pt.contribution) < 1 && Math.abs(q.peakWaitMin - pt.peakWaitMin) < 0.01 && Math.abs(q.fanWaitHours - pt.fanWaitHours) < 0.05;
    if (!pareto.some(same)) pareto.push(pt);
  }

  const placed = new Set(plan.decisions.map((d) => d.concept.id));
  const breakEvens = plan.decisions.map((d) => {
    const others = new Set([...placed].filter((c) => c !== d.concept.id));
    const b = breakEven(e, d.slot, d.concept, v, others);
    return { slotId: d.slot.id, incumbent: d.concept.id, challenger: b?.challenger ?? null, zNeeded: b?.zNeeded ?? null };
  });

  return {
    event: e,
    attendance: attendance(e, v),
    fnbPerCap: perCap(e, v),
    plan,
    ablation: { plan: ablation, slotsDifferent: material(plan, ablMap), valueOfTaste: plan.usedTaste ? plan.total - evaluate(e, asOpt(ablation), v, taste).total : null, tiedSlotsWithoutTaste: ablation.decisions.filter((d) => d.tiedWith.length > 0).length },
    baselines,
    sensitivity,
    breakEvens,
    par: parSheet(e, v),
    stands: standView(plan, parSheet(e, v)),
    pareto,
    solves,
    headline: plan.usedTaste
      ? { status: "live" as const, withQloo: plan.total, withoutQloo: evaluate(e, asOpt(ablation), v, taste).total, claude: baselines.find((b) => b.id === "claude-no-qloo" && b.status === "scored")?.total ?? null }
      : { status: "pending" as const, withQloo: null, withoutQloo: ablation.total, claude: baselines.find((b) => b.id === "claude-no-qloo" && b.status === "scored")?.total ?? null },
    concepts: CONCEPTS.map((c) => ({ id: c.id, name: c.name })),
  };
}

/**
 * One row per stand id from the arena's own data, for colouring the 3D venue:
 * fixed food stands from the par sheet, flexible locations from the solved plan.
 * `z` is tonight's Qloo affinity (null until live); `waitMin` is the worst Erlang C wait.
 */
function standView(plan: FlexPlan, par: ReturnType<typeof parSheet>) {
  const rows: { standId: string; kind: "fixed" | "flex"; concept: string; servedTx: number; waitMin: number | null; par: number; contribution: number | null; z: number | null; tied: boolean }[] = [];
  for (const p of par) rows.push({ standId: p.standId, kind: "fixed", concept: p.stand, servedTx: p.servedTx, waitMin: Number.isFinite(p.worstWaitMin) ? p.worstWaitMin : null, par: p.quantity, contribution: null, z: null, tied: false });
  for (const d of plan.decisions) rows.push({ standId: d.slot.venueId, kind: "flex", concept: d.concept.name, servedTx: d.economics.servedTx, waitMin: Number.isFinite(d.economics.worstWaitMin) ? d.economics.worstWaitMin : null, par: d.economics.par.quantity, contribution: d.economics.contribution, z: d.z, tied: d.tiedWith.length > 0 });
  return rows;
}

export type Analysis = Awaited<ReturnType<typeof analyse>>;
