// Event-night operations plan for every stand at Climate Pledge Arena: demand per
// stand from the crowd mix, registers per 15-minute interval from the exact
// time-varying Erlang A model, shifts from a covering integer program, and the
// cost of Seattle's 14-day schedule lock. Built on lib/deep (venue data, demand,
// economics), which stays the source of the flex-location decisions.
import { STANDS, type Stand, type VenueEvent } from "../deep/venue";
import { defaults, type Values } from "../deep/economics";
import { attendance, perCap, parSheet } from "../deep/planner";
import { arrivalCurve, clock, phases } from "./timeline";
import { transient, emptyStand } from "./erlangA";
import { scheduleShifts, STEP_MIN } from "./staffing";
import { genreOf, MIX_PRIORS, GENRE_LABEL } from "./profile";
import { SEATTLE, lockCost } from "./seattle";
import { prepWaves } from "./prep";

export type OpsParams = {
  maxAbandon: number;
  maxMeanWaitMin: number;
  /** Seconds to serve a bar transaction (pour, ID check, pay). No published figure: assumption. */
  barServiceSec: number;
  maxRegistersStand: number;
  hourlyWage: number;
  /** Loaded cost multiplier on wage (payroll taxes, benefits). Assumption. */
  loadFactor: number;
  setupMin: number;
  closeMin: number;
  shiftLengths: number[];
  noShow: number;
  /** Forecast error (coefficient of variation) of a stand's demand 14 days out and on the day. */
  cv14: number;
  cvDay: number;
  /** Share of short-notice shifts that get filled. Assumption. */
  addFillRate: number;
  /** Share of sales an unstaffed hour loses outright (the rest go to another stand). Assumption. */
  lostIfShort: number;
};

export const OPS_DEFAULTS: OpsParams = {
  maxAbandon: 0.05,
  maxMeanWaitMin: 5,
  barServiceSec: 40,
  maxRegistersStand: 8,
  hourlyWage: SEATTLE.minimumWage2026,
  loadFactor: 1.25,
  setupMin: 45,
  closeMin: 30,
  shiftLengths: [4, 5, 6],
  noShow: 0.08,
  cv14: 0.3,
  cvDay: 0.12,
  addFillRate: 0.7,
  lostIfShort: 0.25,
};

const DRINK = (s: Stand) => s.category === "drink";

export type StandNeed = {
  id: string; name: string; level: string; category: string; hero: string | null;
  /** Intervals where the stand needs more points of sale than it is assumed to have. */
  capped: number;
  prep: ReturnType<typeof prepWaves> | null;
  demandTx: number;
  /** Registers per 15-minute interval (burst-aware) and what interval-by-interval steady-state staffing (SIPP) would ask for. */
  registers: number[];
  sipp: number[];
  abandonShare: number;
  peakQueue: number;
  meanWaitMin: number;
};

/** Registers for one stand, interval by interval, chaining the queue state forward. */
export function staffStand(curve: { perMin: Float64Array }, serviceMin: number, patienceMin: number, p: OpsParams) {
  const n = Math.ceil(curve.perMin.length / STEP_MIN);
  let state = emptyStand(p.maxRegistersStand + 250);
  const regs: number[] = [], sipp: number[] = [];
  let ab = 0, arr = 0, waitInt = 0, peak = 0;
  for (let k = 0; k < n; k++) {
    const slice = curve.perMin.subarray(k * STEP_MIN, (k + 1) * STEP_MIN);
    const lam = (t: number) => slice[Math.min(slice.length - 1, Math.floor(t))] ?? 0;
    const total = slice.reduce((a, b) => a + b, 0);
    // SIPP: steady-state Erlang A at the interval's average rate.
    const meanLam = total / slice.length;
    let cs = 0;
    if (meanLam > 0.02) { cs = 1; while (cs < p.maxRegistersStand && !sippOk(meanLam, serviceMin, cs, patienceMin, p)) cs++; }
    sipp.push(cs);
    let c = 0, r = transient(lam, 0, serviceMin, patienceMin, slice.length, state);
    if (total > 0.3 || r.peakQueue > 0.3) {
      for (c = 1; c <= p.maxRegistersStand; c++) {
        r = transient(lam, c, serviceMin, patienceMin, slice.length, state);
        const share = r.abandons / Math.max(r.arrivals, 1e-9);
        const wait = r.fanMinutesWaiting / Math.max(r.arrivals, 1e-9);
        if (share <= p.maxAbandon && wait <= p.maxMeanWaitMin) break;
      }
      c = Math.min(c, p.maxRegistersStand);
      r = transient(lam, c, serviceMin, patienceMin, slice.length, state);
    }
    regs.push(c);
    state = r.end; ab += r.abandons; arr += r.arrivals; waitInt += r.fanMinutesWaiting; peak = Math.max(peak, r.peakQueue);
  }
  return { registers: regs, sipp, abandonShare: arr ? ab / arr : 0, meanWaitMin: arr ? waitInt / arr : 0, peakQueue: peak };
}

import { erlangA } from "./erlangA";
function sippOk(lam: number, s: number, c: number, pat: number, p: OpsParams) {
  const r = erlangA(lam, s, c, pat);
  return r.pAbandon <= p.maxAbandon && r.meanWaitMin <= p.maxMeanWaitMin;
}

/** Transactions per stand tonight: food from the deep planner's par sheet (genre food share), drinks split by level. */
export function standDemand(e: VenueEvent, v: Values): { stand: Stand; tx: number }[] {
  const genre = genreOf(e);
  const mix = MIX_PRIORS[genre];
  const vv = { ...v, foodShare: mix.foodShare.value };
  const food = new Map(parSheet(e, vv).map((r) => [r.standId, r.demandTx]));
  const att = attendance(e, v);
  const drinkTx = (att * perCap(e, v) * (1 - mix.foodShare.value)) / v.avgTicket;
  const upper = 1 - v.levelShareMain - v.levelShareClub;
  const share = (l: string) => (l === "main" ? v.levelShareMain : l === "club" ? v.levelShareClub : l === "upper" ? upper : (v.levelShareMain + upper) / 2);
  const bars = STANDS.filter(DRINK);
  const wsum = new Map<string, number>();
  for (const b of bars) wsum.set(b.level, (wsum.get(b.level) ?? 0) + 1);
  const out: { stand: Stand; tx: number }[] = [];
  for (const s of STANDS) {
    if (DRINK(s)) out.push({ stand: s, tx: (drinkTx * share(s.level)) / (wsum.get(s.level) ?? 1) / (s.level === "both" ? 2 : 1) });
    else if (food.has(s.id)) out.push({ stand: s, tx: food.get(s.id)! });
  }
  return out;
}

export async function opsPlan(e: VenueEvent, v: Values = defaults(), p: OpsParams = OPS_DEFAULTS) {
  const genre = genreOf(e);
  const rows = standDemand(e, v);
  const ph = phases(e, v);
  const stands: StandNeed[] = rows.map(({ stand, tx }) => {
    const curve = arrivalCurve(e, v, tx);
    const sv = DRINK(stand) ? p.barServiceSec / 60 : v.serviceMin;
    const r = staffStand(curve, sv, v.patienceMin, p);
    return { id: stand.id, name: stand.name, level: stand.level, category: stand.category, demandTx: tx, hero: stand.items?.[0] ?? null, capped: r.abandonShare > p.maxAbandon ? r.registers.filter((x) => x >= p.maxRegistersStand).length : 0, prep: DRINK(stand) ? null : prepWaves(e, v, tx), ...r };
  });
  // Nonprofit groups earn the greater of ~10% of stand sales or a per-volunteer minimum
  // (Levy at Lumen Field: $170 per volunteer per event). Group = peak registers + 2 in back.
  const volunteer = stands.map((s) => {
    const group = Math.max(...s.registers) + 2;
    const sales = s.demandTx * (1 - s.abandonShare) * v.avgTicket;
    return { id: s.id, group, cost: Math.max(0.1 * sales, 170 * group) };
  });
  const n = stands[0]?.registers.length ?? 0;
  const from = ph[0].from;
  const labels = Array.from({ length: n }, (_, k) => clock(e, from + k * STEP_MIN));
  // Shifts per stand (staff work one stand), then roll up.
  const rules = { lengths: p.shiftLengths, setupMin: p.setupMin, closeMin: p.closeMin, hourlyCost: p.hourlyWage * p.loadFactor, minPaidHours: 0 };
  let paidHours = 0, solveMs = 0, vars = 0, cons = 0, headcount = 0, sippHours = 0, burstHours = 0;
  const shifts: { standId: string; start: string; end: string; hours: number; count: number }[] = [];
  for (const s of stands) {
    if (!s.registers.some((x) => x > 0)) continue;
    const r = await scheduleShifts(s.registers, rules);
    paidHours += r.paidHours; solveMs += r.solve.ms; vars += r.solve.variables; cons += r.solve.constraints;
    for (const sh of r.shifts) { headcount += sh.count; shifts.push({ standId: s.id, start: clock(e, from + sh.start * STEP_MIN), end: clock(e, from + sh.end * STEP_MIN), hours: sh.hours, count: sh.count }); }
    burstHours += (s.registers.reduce((a, b) => a + b, 0) * STEP_MIN) / 60;
    sippHours += (s.sipp.reduce((a, b) => a + b, 0) * STEP_MIN) / 60;
  }
  const rostered = Math.ceil(headcount / (1 - p.noShow));
  const laborCost = paidHours * p.hourlyWage * p.loadFactor;
  const sales = attendance(e, v) * perCap(e, v);
  // Margin an unfilled hour loses: average margin per paid hour × the share of those fans who
  // do not buy at another stand instead (assumption).
  const lock = lockCost(paidHours, p, ((sales * (1 - v.foodCostPct)) / Math.max(paidHours, 1)) * p.lostIfShort);
  const totalTx = stands.reduce((t, s) => t + s.demandTx, 0);
  const lost = stands.reduce((t, s) => t + s.demandTx * s.abandonShare, 0);
  return {
    event: { id: e.id, title: e.title, date: e.date, start: e.start, kind: e.kind },
    genre: { id: genre, label: GENRE_LABEL[genre], status: "inference" as const },
    mix: MIX_PRIORS[genre],
    attendance: attendance(e, v),
    phases: ph.map((x) => ({ ...x, fromClock: clock(e, x.from), toClock: clock(e, x.to) })),
    intervals: labels,
    stands: stands.sort((a, b) => b.demandTx - a.demandTx),
    totals: {
      transactions: totalTx,
      lostTx: lost,
      registerHoursBurstAware: burstHours,
      registerHoursSipp: sippHours,
      paidHours,
      headcount,
      rostered,
      laborCost,
      laborPctOfSales: laborCost / sales,
      sales,
    },
    shifts,
    volunteer,
    seattle: lock,
    solver: { name: "HiGHS", ms: solveMs, variables: vars, constraints: cons, programs: shifts.length ? new Set(shifts.map((s) => s.standId)).size : 0 },
    params: p,
  };
}
