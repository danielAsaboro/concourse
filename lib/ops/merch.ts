// Merch on event night. At Climate Pledge Arena the arena (OVG) sells concert merch
// for the tour, which owns the stock (VenuesNow); Kraken retail is separate. So the
// venue's levers are booths, registers, hours and the recommended count-in by
// item and size it can hand the tour's merch rep.
import type { VenueEvent } from "../deep/venue";
import { FEMALE_SHARE, MERCH_PRIORS, genreOf, type Genre } from "./profile";
import { multiNewsvendor, sizeCurve, type Sku } from "./inventory";
import { erlangA } from "./erlangA";

export type MerchItem = { id: string; label: string; unitShare: number; price: number; sized: boolean; costShare: number };

/** atVenu 2025 unit mix (tee 56% at $37, hoodie 6.5% at $70, hat 5.5% at $33); remainder grouped. */
const BASE_MIX: MerchItem[] = [
  { id: "tee", label: "T-shirt", unitShare: 0.56, price: 37, sized: true, costShare: 0.3 },
  { id: "hoodie", label: "Hoodie", unitShare: 0.065, price: 70, sized: true, costShare: 0.3 },
  { id: "hat", label: "Hat", unitShare: 0.055, price: 33, sized: false, costShare: 0.3 },
  { id: "poster", label: "Poster / print", unitShare: 0.08, price: 25, sized: false, costShare: 0.2 },
  { id: "other", label: "Other (koozie, bag, stickers, vinyl)", unitShare: 0.24, price: 18, sized: false, costShare: 0.35 },
];
/** K-pop: light sticks 10–20% of units, batteries on 80% of light-up sales (atVenu K-pop 2024). */
const KPOP_MIX: MerchItem[] = [
  { id: "tee", label: "T-shirt", unitShare: 0.32, price: 40, sized: true, costShare: 0.3 },
  { id: "hoodie", label: "Hoodie", unitShare: 0.1, price: 75, sized: true, costShare: 0.3 },
  { id: "lightstick", label: "Official light stick", unitShare: 0.15, price: 60, sized: false, costShare: 0.4 },
  { id: "batteries", label: "AAA batteries (3-pack)", unitShare: 0.12, price: 5, sized: false, costShare: 0.4 },
  { id: "photocard", label: "Photocard set", unitShare: 0.16, price: 20, sized: false, costShare: 0.2 },
  { id: "other", label: "Other (hat, bag, sweatpants)", unitShare: 0.15, price: 30, sized: false, costShare: 0.3 },
];
const HOCKEY_MIX: MerchItem[] = [
  { id: "jersey", label: "Jersey", unitShare: 0.15, price: 180, sized: true, costShare: 0.4 },
  { id: "tee", label: "T-shirt", unitShare: 0.4, price: 38, sized: true, costShare: 0.3 },
  { id: "hat", label: "Hat / beanie", unitShare: 0.3, price: 32, sized: false, costShare: 0.3 },
  { id: "other", label: "Other (puck, scarf, kids)", unitShare: 0.15, price: 20, sized: false, costShare: 0.35 },
];

/** Unisex prior, midpoints of S 10–15 / M 25–30 / L 30–35 / XL 15–20 / 2XL 5–10 (Chartlex 2026; Dizzyjam). */
const UNISEX = { XS: 0.0, S: 0.125, M: 0.275, L: 0.325, XL: 0.175, "2XL": 0.1 };

/** Women shop unisex about one size down (Bella+Canvas fit guide), so shift their share down a size and add XS. */
export function sizePrior(femaleShare: number): Record<string, number> {
  const sizes = Object.keys(UNISEX) as (keyof typeof UNISEX)[];
  const men = UNISEX;
  const women: Record<string, number> = { XS: 0.125, S: 0.275, M: 0.325, L: 0.175, XL: 0.1, "2XL": 0 };
  const out: Record<string, number> = {};
  for (const k of sizes) out[k] = (1 - femaleShare) * men[k] + femaleShare * women[k];
  const t = Object.values(out).reduce((a, b) => a + b, 0);
  for (const k of sizes) out[k] /= t;
  return out;
}

export type MerchParams = {
  hallFee: number;
  /** Seconds per merch transaction: fixed + per item (inference: no published figure). */
  baseSec: number;
  perItemSec: number;
  /** Fans give up faster once the headliner starts. */
  patienceMinBefore: number;
  patienceMinDuring: number;
  /** Share of merch sales before the headliner's set. */
  shareBeforeSet: number;
  /** Booths and registers per booth the plan may use. */
  booths: number;
  registersPerBooth: number;
  /** Leftover stock carries to the next tour stop, less handling (terrible* budgets ~$2/unit). */
  carryCost: number;
  /** Share of buyers using app pre-order (CPA offers pre-order "up until doors"). */
  preorderShare: number;
  /** Share of buyers served before doors at the West Plaza truck (CPA runs one from ~3 PM; K-pop tours run an outside booth from 10 am). */
  earlyShare: number;
  earlyRegisters: number;
  earlyWindowMin: number;
};

export const MERCH_DEFAULTS: MerchParams = { hallFee: 0.225, baseSec: 45, perItemSec: 17.5, patienceMinBefore: 20, patienceMinDuring: 6, shareBeforeSet: 0.8, booths: 6, registersPerBooth: 3, carryCost: 2, preorderShare: 0.05, earlyShare: 0.1, earlyRegisters: 4, earlyWindowMin: 240 };

export function merchPlan(e: VenueEvent, attendance: number, p: MerchParams = MERCH_DEFAULTS, femaleShareOverride?: number, soldBySize: Record<string, number> = {}) {
  const genre: Genre = genreOf(e);
  const prior = MERCH_PRIORS[genre];
  const mix = genre === "kpop" ? KPOP_MIX : genre === "hockey" ? HOCKEY_MIX : BASE_MIX;
  const avgPrice = mix.reduce((t, m) => t + m.unitShare * m.price, 0);
  const gross = attendance * prior.perHead.value;
  const units = gross / avgPrice;
  const txns = attendance * prior.buyRate.value;
  const itemsPerTxn = units / Math.max(txns, 1);
  const female = femaleShareOverride ?? FEMALE_SHARE[genre].value;
  const curve = sizeCurve(sizePrior(female), 40, soldBySize);
  // Demand dispersion: merch nights vary more than food (negative binomial k = 8, assumption).
  const k = 8;
  const skus: (Sku & { label: string; size?: string; item: string })[] = [];
  for (const m of mix) {
    const mean = units * m.unitShare;
    const variance = mean + (mean * mean) / k;
    const cost = m.price * m.costShare;
    const salvage = Math.max(0, cost - p.carryCost); // carries to the next stop
    if (m.sized) {
      for (const s of curve.split(mean, variance)) if (s.mean > 0.5) skus.push({ id: `${m.id}:${s.size}`, item: m.id, label: m.label, size: s.size, mean: s.mean, sd: s.sd, price: m.price, unitCost: cost, salvage, weight: 1 });
    } else skus.push({ id: m.id, item: m.id, label: m.label, mean, sd: Math.sqrt(variance), price: m.price, unitCost: cost, salvage, weight: 1 });
  }
  const stock = multiNewsvendor(skus);
  // Registers: Erlang A at doors (before the set) and during the set, with the abandonment cliff.
  const serviceMin = (p.baseSec + p.perItemSec * itemsPerTxn) / 60;
  // K-pop crowds arrive hours early and the tour runs an outside booth (Weverse TXT notice): assume 40% shop early.
  const early = genre === "kpop" ? Math.max(p.earlyShare, 0.4) : p.earlyShare;
  const earlyQ = erlangA((txns * early) / p.earlyWindowMin, (p.baseSec + p.perItemSec * itemsPerTxn) / 60, p.earlyRegisters, 30);
  let earlyNeeded = 1;
  while (earlyNeeded < 60 && erlangA((txns * early) / p.earlyWindowMin, (p.baseSec + p.perItemSec * itemsPerTxn) / 60, earlyNeeded, 30).pAbandon > 0.05) earlyNeeded++;
  const walkUp = txns * (1 - p.preorderShare - early);
  const doorsMin = 90;
  const regs = p.booths * p.registersPerBooth;
  const before = erlangA((walkUp * p.shareBeforeSet) / doorsMin, serviceMin, regs, p.patienceMinBefore);
  const during = erlangA((walkUp * (1 - p.shareBeforeSet)) / 100, serviceMin, Math.max(1, Math.round(regs / 2)), p.patienceMinDuring);
  // Fewest registers keeping walk-aways under 5% before the set.
  let need = 1;
  while (need < 150 && erlangA((walkUp * p.shareBeforeSet) / doorsMin, serviceMin, need, p.patienceMinBefore).pAbandon > 0.05) need++;
  const lostSales = (walkUp * p.shareBeforeSet * before.pAbandon + walkUp * (1 - p.shareBeforeSet) * during.pAbandon) * (gross / Math.max(txns, 1));
  return {
    genre,
    priors: prior,
    femaleShare: { value: female, fromQloo: femaleShareOverride !== undefined },
    gross,
    venueShare: gross * p.hallFee,
    txns,
    itemsPerTxn,
    serviceMin,
    sizeShares: curve.shares,
    stock: stock.plans.map((pl, i) => ({ ...pl, label: skus[i].label, size: skus[i].size, item: skus[i].item, price: skus[i].price })),
    early: { share: early, registers: p.earlyRegisters, needed: earlyNeeded, waitMin: earlyQ.meanWaitMin, walkAway: earlyQ.pAbandon },
    registers: { open: regs, neededBeforeSet: need, before: { waitMin: before.meanWaitMin, walkAway: before.pAbandon }, during: { waitMin: during.meanWaitMin, walkAway: during.pAbandon, open: Math.max(1, Math.round(regs / 2)) } },
    lostSales,
    params: p,
  };
}
