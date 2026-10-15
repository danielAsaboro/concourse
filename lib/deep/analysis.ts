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

const diff = (a: Record<string, string>, b: Record<string, string>) => FLEX_SLOTS.filter((s) => a[s.id] !== b[s.id]).length;
/** Changed locations, ignoring swaps between concepts the model scores as tied. */
const material = (p: FlexPlan, base: Record<string, string>) =>
  p.decisions.filter((d) => d.concept.id !== base[d.slot.id] && !d.tiedWith.includes(base[d.slot.id])).length;
const asMap = (p: FlexPlan) => Object.fromEntries(p.decisions.map((d) => [d.slot.id, d.concept.id]));

export async function analyse(e: VenueEvent, taste: TasteInput, v: Values = defaults(), pinned: Record<string, string> = {}) {
  const plan = await planFlex(e, v, taste, pinned);
  const ablation = await planFlex(e, { ...v, tasteBeta: 0 }, null, pinned);
  const planMap = asMap(plan);
  const ablMap = asMap(ablation);

  const baselines: Baseline[] = [];
  const sq = Object.fromEntries(FLEX_SLOTS.map((s) => [s.id, s.statusQuo ?? ablMap[s.id]]));
  baselines.push({ id: "status-quo", label: "Keep what runs there now", status: "scored", note: "Published occupant where there is one; otherwise the without-taste pick.", assignment: sq, total: evaluate(e, sq, v, taste).total, slotsDifferent: diff(sq, planMap) });
  const cb = (claudeBaseline as { generatedAt: string; events: Record<string, { assignment: Record<string, string> }> }).events[e.id];
  if (cb) {
    const ev = evaluate(e, cb.assignment, v, taste);
    baselines.push({ id: "claude-no-qloo", label: "Claude without Qloo", status: ev.feasible ? "scored" : "not-available", note: `Recorded ${claudeBaseline.generatedAt}: same locations, concepts and rules, no Qloo data, no web access.`, assignment: cb.assignment, total: ev.total, slotsDifferent: diff(cb.assignment, planMap) });
  } else {
    baselines.push({ id: "claude-no-qloo", label: "Claude without Qloo", status: "not-available", note: "Recorded for five pre-registered events only." });
  }
  const i = EVENTS.findIndex((x) => x.id === e.id);
  const prevSimilar = EVENTS.slice(0, i).reverse().find((x) => x.kind === e.kind);
  if (prevSimilar) {
    const prevPlan = asMap(await planFlex(prevSimilar, v, null));
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
    const lo = await planFlex(e, { ...v, [k]: p.low }, taste, pinned);
    const hi = await planFlex(e, { ...v, [k]: p.high }, taste, pinned);
    sensitivity.push({ param: k, status: p.status, low: p.low, high: p.high, totalLow: lo.total, totalHigh: hi.total, planChangesLow: material(lo, planMap), planChangesHigh: material(hi, planMap) });
  }
  sensitivity.sort((a, b) => Math.abs(b.totalHigh - b.totalLow) - Math.abs(a.totalHigh - a.totalLow));

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
    ablation: { plan: ablation, slotsDifferent: material(plan, ablMap), valueOfTaste: plan.usedTaste ? plan.total - evaluate(e, ablMap, v, taste).total : null, tiedSlotsWithoutTaste: ablation.decisions.filter((d) => d.tiedWith.length > 0).length },
    baselines,
    sensitivity,
    breakEvens,
    par: parSheet(e, v),
    concepts: CONCEPTS.map((c) => ({ id: c.id, name: c.name })),
  };
}

export type Analysis = Awaited<ReturnType<typeof analyse>>;
