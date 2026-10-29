// Staffing a concession stand through a bursty event night, the way workforce
// management tools do it for call centres and quick-service restaurants:
//   1. arrivals per 15-minute interval (forecast curve),
//   2. offered load with the lag a burst needs to clear (modified offered load,
//      Jennings, Mandelbaum, Massey & Whitt 1996; Feldman et al. 2008),
//   3. registers per interval: fewest that meet the targets under Erlang A,
//   4. shifts: an integer covering program (Dantzig 1954) solved with HiGHS.
import { erlangA, minServers, sqrtStaffing } from "./erlangA";
import { solveModel, type Model, type Term } from "./lp";

export const STEP_MIN = 15;

export type Interval = { t: number; label: string; arrivals: number };

/**
 * Spread a window's transactions over 15-minute intervals with a shape:
 * "ramp" rises toward the end (doors → start), "burst" front-loads (intermission),
 * "flat" is even.
 */
export function spread(total: number, minutes: number, shape: "ramp" | "burst" | "flat"): number[] {
  const n = Math.max(1, Math.round(minutes / STEP_MIN));
  const w = Array.from({ length: n }, (_, i) => (shape === "ramp" ? i + 1 : shape === "burst" ? n - i + 0.5 * n : 1));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (total * x) / s);
}

/**
 * Modified offered load: the mean number of fans that would be in service if
 * registers were unlimited, m(t) = ∫ λ(t − s) P(S > s) ds. For exponential
 * service, m' = λ(t) − μ m, integrated per minute. Staffing to m(t) instead of
 * λ(t)/μ adds the lag a burst needs to clear.
 */
export function offeredLoad(arrivalsPerInterval: number[], serviceMin: number): number[] {
  const mu = 1 / serviceMin;
  let m = 0;
  const out: number[] = [];
  for (const a of arrivalsPerInterval) {
    const lam = a / STEP_MIN;
    let peak = 0;
    for (let k = 0; k < STEP_MIN; k++) { m += lam - mu * m; peak = Math.max(peak, m); }
    out.push(peak);
  }
  return out;
}

export type Targets = { maxAbandon: number; maxMeanWaitMin: number };

export type IntervalNeed = { t: number; label: string; arrivals: number; load: number; servers: number; sqrtRule: number; waitMin: number; abandon: number };

export function requirements(intervals: Interval[], serviceMin: number, patienceMin: number, targets: Targets, maxServers: number): IntervalNeed[] {
  const loads = offeredLoad(intervals.map((i) => i.arrivals), serviceMin);
  return intervals.map((iv, k) => {
    const load = loads[k];
    if (load < 0.05) return { ...iv, load, servers: 0, sqrtRule: 0, waitMin: 0, abandon: 0 };
    // Equivalent stationary arrival rate with the same offered load.
    const lam = load / serviceMin;
    const { servers, result } = minServers(lam, serviceMin, patienceMin, targets, maxServers);
    return { ...iv, load, servers, sqrtRule: sqrtStaffing(load, 0.5), waitMin: result.meanWaitMin, abandon: result.pAbandon };
  });
}

/** What the registers you actually open deliver, interval by interval. */
export function performance(intervals: Interval[], open: number[], serviceMin: number, patienceMin: number) {
  const loads = offeredLoad(intervals.map((i) => i.arrivals), serviceMin);
  return intervals.map((iv, k) => {
    const lam = loads[k] / serviceMin;
    if (!(lam > 0)) return { t: iv.t, served: 0, lost: 0, waitMin: 0 };
    const r = erlangA(lam, serviceMin, open[k], patienceMin);
    return { t: iv.t, served: iv.arrivals * (1 - r.pAbandon), lost: iv.arrivals * r.pAbandon, waitMin: r.meanWaitMin };
  });
}

export type ShiftRules = {
  /** Allowed shift lengths, hours. */
  lengths: number[];
  /** Minutes worked before the first interval (setup) and after the last (close-down). */
  setupMin: number;
  closeMin: number;
  hourlyCost: number;
  /** Paid hours guaranteed per shift (call-in minimum). */
  minPaidHours: number;
};

export type Shift = { start: number; end: number; hours: number; count: number };

/**
 * Covering integer program: y_j staff on shift template j, Σ_{j∋t} y_j ≥ need_t,
 * minimise Σ cost_j y_j. Every start on the 15-minute grid and every allowed length.
 */
export async function scheduleShifts(needs: number[], rules: ShiftRules) {
  const n = needs.length;
  const setup = Math.ceil(rules.setupMin / STEP_MIN), close = Math.ceil(rules.closeMin / STEP_MIN);
  const templates: { id: string; start: number; end: number; hours: number }[] = [];
  for (const L of rules.lengths) {
    const len = Math.round((L * 60) / STEP_MIN);
    for (let s = -setup; s + len <= n + close; s++) templates.push({ id: `y_${templates.length}`, start: s, end: s + len, hours: L });
  }
  const cost = (h: number) => Math.max(h, rules.minPaidHours) * rules.hourlyCost;
  const rows = needs.map((need, t) => ({ name: `cover_${t}`, terms: templates.filter((j) => j.start <= t && t < j.end).map((j) => ({ v: j.id, c: 1 }) as Term), op: ">=" as const, rhs: need })).filter((r) => r.rhs > 0);
  const model: Model = { sense: "min", objective: templates.map((j) => ({ v: j.id, c: cost(j.hours) })), rows, integers: templates.map((j) => j.id) };
  const r = await solveModel(model);
  const shifts: Shift[] = templates.map((j) => ({ start: j.start, end: j.end, hours: j.hours, count: Math.round(r.values[j.id] ?? 0) })).filter((s) => s.count > 0);
  const onFloor = needs.map((_, t) => shifts.reduce((a, s) => a + (s.start <= t && t < s.end ? s.count : 0), 0));
  const paidHours = shifts.reduce((a, s) => a + s.count * Math.max(s.hours, rules.minPaidHours), 0);
  return { status: r.status, shifts, onFloor, paidHours, cost: paidHours * rules.hourlyCost, solve: { ms: r.ms, variables: r.variables, constraints: r.constraints, objective: r.objective } };
}
