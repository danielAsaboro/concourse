// Event-night planner for Climate Pledge Arena. Pure functions: tonight's event,
// the parameter values and (optionally) a Qloo taste signal in, a solved plan out.
// Taste only enters through demandMultiplier(); with no taste the plan is the
// without-Qloo ablation by construction.
import { CONCEPTS, FLEX_SLOTS, STANDS, canRun, capacityFor, type Concept, type FlexSlot, type Level, type VenueEvent } from "./venue";
import { defaults, type Values } from "./economics";
import { simulateStand } from "./queue";
import { newsvendor } from "./newsvendor";
import { nbVariance, interval } from "./stats";
import { solve, key, type SolveResult } from "./solver";

/** Stands whose concept is decided per event are planned as flex slots, not as fixed stands. */
const FLEX_BACKED = new Set(["cpa-24709", "cpa-1056"]);
export const FIXED_FOOD = STANDS.filter((s) => s.category === "food" && !FLEX_BACKED.has(s.id));

export type TasteInput = Record<string, number> | null; // concept id -> affinity (one Qloo call), or null

export type Window = { name: string; minutes: number; share: number };

export function windowsFor(e: VenueEvent, v: Values): Window[] {
  const rest = 1 - v.shareBeforeStart - v.shareIntermission;
  if (e.kind === "game") {
    return [
      { name: "Doors to puck drop", minutes: v.doorsWindowMin, share: v.shareBeforeStart },
      { name: "1st intermission", minutes: v.intermissionMin, share: v.shareIntermission / 2 },
      { name: "2nd intermission", minutes: v.intermissionMin, share: v.shareIntermission / 2 },
      { name: "During play", minutes: 100, share: rest },
    ];
  }
  return [
    { name: "Doors to opener", minutes: v.doorsWindowMin, share: v.shareBeforeStart },
    { name: "Changeover", minutes: v.changeoverMin, share: v.shareIntermission },
    { name: "During the headline set", minutes: 100, share: rest },
  ];
}

export function attendance(e: VenueEvent, v: Values): number {
  return Math.round(capacityFor(e) * v.fill);
}

function levelShare(level: Level, v: Values): number {
  const upper = 1 - v.levelShareMain - v.levelShareClub;
  return level === "main" ? v.levelShareMain : level === "club" ? v.levelShareClub : level === "upper" ? upper : (v.levelShareMain + upper) / 2;
}

/** Food outlets drawing on each level's fans: fixed stands count 1 (split across levels if on both), flex slots by kind. */
function levelWeights(v: Values) {
  const w: Record<"main" | "upper" | "club", number> = { main: 0, upper: 0, club: 0 };
  for (const s of FIXED_FOOD) {
    if (s.level === "both") { w.main += 0.5; w.upper += 0.5; } else w[s.level as "main" | "upper" | "club"] += 1;
  }
  for (const f of FLEX_SLOTS) w[f.level as "main" | "upper" | "club"] += f.kind === "cart" ? v.cartWeight : 1;
  return w;
}

export function perCap(e: VenueEvent, v: Values) {
  return e.kind === "game" ? v.fnbPerCapGame : v.fnbPerCapConcert;
}

/** z-scores of tonight's affinities across the candidates that have one. Only compared within one call. */
export function standardise(t: TasteInput): Record<string, number> {
  if (!t) return {};
  const xs = Object.values(t);
  if (xs.length < 2) return {};
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
  return Object.fromEntries(Object.entries(t).map(([k, x]) => [k, (x - m) / sd]));
}

export function demandMultiplier(z: number | undefined, v: Values): number {
  return Math.exp(v.tasteBeta * (z ?? 0));
}

export type SlotEconomics = {
  demandTx: number;
  demandInterval: [number, number];
  servedTx: number;
  lostTx: number;
  worstWaitMin: number;
  windows: { name: string; demand: number; served: number; waitMin: number; utilisation: number }[];
  par: { item: string; quantity: number; expectedLeftover: number; criticalRatio: number };
  revenue: number;
  contribution: number;
  parts: { margin: number; waste: number; changeover: number };
};

/** Expected economics of running concept c in a location with given level, pull and registers tonight. */
export function locationEconomics(
  e: VenueEvent,
  loc: { level: Level; weight: number; servers: number },
  c: { perishable: boolean; hero: string },
  z: number | undefined,
  v: Values,
  opts: { incremental: boolean; changeover: boolean },
): SlotEconomics {
  const w = levelWeights(v);
  const lvlWeight = loc.level === "both" ? (w.main + w.upper) / 2 : w[loc.level as "main" | "upper" | "club"];
  const foodRevenue = attendance(e, v) * levelShare(loc.level, v) * perCap(e, v) * v.foodShare * (loc.weight / lvlWeight);
  const demandTx = (foodRevenue * demandMultiplier(z, v)) / v.avgTicket;
  const windows = windowsFor(e, v).map((win) => {
    const q = simulateStand({ demand: demandTx * win.share, windowMin: win.minutes, servers: loc.servers, serviceMin: v.serviceMin, patienceMin: v.patienceMin });
    return { name: win.name, demand: demandTx * win.share, served: q.served, waitMin: q.meanWaitMin, utilisation: q.utilisation };
  });
  const servedTx = windows.reduce((s, x) => s + x.served, 0);
  const price = v.avgTicket / v.itemsPerTicket;
  const unitCost = v.foodCostPct * price;
  const salvage = (c.perishable ? v.perishableSalvage : v.packagedSalvage) * unitCost;
  // One hero item per transaction is an assumption; the par is for that item.
  const nv = newsvendor({ meanDemand: servedTx, sdDemand: Math.sqrt(nbVariance(servedTx, v.demandDispersion)), price, unitCost, salvage });
  const revenue = servedTx * v.avgTicket;
  const margin = (opts.incremental ? v.incremental : 1) * revenue * (1 - v.foodCostPct);
  const waste = nv.expectedLeftover * (unitCost - salvage);
  const changeover = opts.changeover ? v.changeoverCost : 0;
  return {
    demandTx,
    demandInterval: interval(demandTx, nbVariance(demandTx, v.demandDispersion)),
    servedTx,
    lostTx: demandTx - servedTx,
    worstWaitMin: Math.max(...windows.map((x) => x.waitMin)),
    windows,
    par: { item: c.hero, quantity: nv.quantity, expectedLeftover: nv.expectedLeftover, criticalRatio: nv.criticalRatio },
    revenue,
    contribution: margin - waste - changeover,
    parts: { margin, waste, changeover },
  };
}

export function slotValue(e: VenueEvent, s: FlexSlot, c: Concept, z: number | undefined, v: Values): SlotEconomics {
  return locationEconomics(e, { level: s.level, weight: s.kind === "cart" ? v.cartWeight : 1, servers: s.servers }, c, z, v, { incremental: true, changeover: s.statusQuo !== c.id });
}

export type FlexDecision = {
  slot: FlexSlot;
  concept: Concept;
  economics: SlotEconomics;
  z: number | null;
  runnerUp: { concept: Concept; contribution: number } | null;
  /** Other concepts within $1 of the pick here: the model cannot tell them apart tonight. */
  tiedWith: string[];
};

export type FlexPlan = { decisions: FlexDecision[]; total: number; solver: SolveResult; usedTaste: boolean };

export async function planFlex(e: VenueEvent, v: Values = defaults(), taste: TasteInput = null, pinned: Record<string, string> = {}): Promise<FlexPlan> {
  const z = standardise(taste);
  const value = new Map<string, number>();
  const econ = new Map<string, SlotEconomics>();
  for (const s of FLEX_SLOTS) for (const c of CONCEPTS) {
    if (!canRun(s, c)) continue;
    const x = slotValue(e, s, c, z[c.id], v);
    econ.set(key(s.id, c.id), x);
    // Rounded to cents so exact ties break the same way every run (by list order).
    value.set(key(s.id, c.id), Math.round(x.contribution * 100) / 100);
  }
  const res = await solve({
    slots: FLEX_SLOTS.map((s) => ({ id: s.id, mustFill: true })),
    concepts: CONCEPTS.map((c) => ({ id: c.id, category: c.category })),
    value,
    pinned,
  });
  const decisions: FlexDecision[] = FLEX_SLOTS.filter((s) => res.assignment[s.id]).map((s) => {
    const concept = CONCEPTS.find((c) => c.id === res.assignment[s.id])!;
    const others = CONCEPTS.filter((c) => c.id !== concept.id && value.has(key(s.id, c.id))).map((c) => ({ concept: c, contribution: value.get(key(s.id, c.id))! })).sort((a, b) => b.contribution - a.contribution);
    const mine = value.get(key(s.id, concept.id))!;
    const tiedWith = others.filter((o) => Math.abs(o.contribution - mine) < 1).map((o) => o.concept.id);
    return { slot: s, concept, economics: econ.get(key(s.id, concept.id))!, z: z[concept.id] ?? null, runnerUp: others[0] ?? null, tiedWith };
  });
  return { decisions, total: decisions.reduce((t, d) => t + d.economics.contribution, 0), solver: res, usedTaste: Object.keys(z).length > 0 };
}

/** Score any assignment (a baseline's, an operator's) under the same model. */
export function evaluate(e: VenueEvent, assignment: Record<string, string>, v: Values = defaults(), taste: TasteInput = null): { total: number; feasible: boolean; perSlot: Record<string, number> } {
  const z = standardise(taste);
  const perSlot: Record<string, number> = {};
  let feasible = true;
  const used = new Set<string>();
  for (const s of FLEX_SLOTS) {
    const c = CONCEPTS.find((x) => x.id === assignment[s.id]);
    if (!c || !canRun(s, c) || used.has(c.id)) { feasible = false; perSlot[s.id] = NaN; continue; }
    used.add(c.id);
    perSlot[s.id] = slotValue(e, s, c, z[c.id], v).contribution;
  }
  return { total: Object.values(perSlot).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0), feasible, perSlot };
}

/**
 * Break-even: how far above the incumbent (in SDs of tonight's affinity) the best
 * challenger must score before the plan changes, with the incumbent at z = 0.
 * Needs no Qloo data, and says what Qloo would have to show to matter.
 */
export function breakEven(e: VenueEvent, s: FlexSlot, incumbent: Concept, v: Values = defaults(), placedElsewhere: Set<string> = new Set()): { challenger: string; zNeeded: number | null } | null {
  const base = slotValue(e, s, incumbent, 0, v).contribution;
  let best: { challenger: string; zNeeded: number | null } | null = null;
  for (const c of CONCEPTS) {
    if (c.id === incumbent.id || placedElsewhere.has(c.id) || !canRun(s, c)) continue;
    const f = (zz: number) => slotValue(e, s, c, zz, v).contribution - base;
    let lo = -3, hi = 3;
    let zNeeded: number | null = null;
    if (f(lo) >= 0) zNeeded = lo;
    else if (f(hi) >= 0) {
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) >= 0) hi = mid; else lo = mid; }
      zNeeded = hi;
    }
    if (zNeeded !== null && (best === null || best.zNeeded === null || zNeeded < best.zNeeded)) best = { challenger: c.id, zNeeded };
    if (best === null) best = { challenger: c.id, zNeeded };
  }
  return best;
}

export type ParRow = { standId: string; stand: string; level: Level; item: string; demandTx: number; servedTx: number; worstWaitMin: number; quantity: number; expectedLeftover: number };

/** Par sheet for the fixed food stands (concept unchanged; volume follows tonight's crowd and timing). */
export function parSheet(e: VenueEvent, v: Values = defaults(), servers = 4): ParRow[] {
  return FIXED_FOOD.filter((s) => s.items.length).map((s) => {
    const x = locationEconomics(e, { level: s.level, weight: 1, servers }, { perishable: true, hero: s.items[0] }, undefined, v, { incremental: false, changeover: false });
    return { standId: s.id, stand: s.name, level: s.level, item: s.items[0], demandTx: x.demandTx, servedTx: x.servedTx, worstWaitMin: x.worstWaitMin, quantity: x.par.quantity, expectedLeftover: x.par.expectedLeftover };
  });
}
