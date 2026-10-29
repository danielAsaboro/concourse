// Prep waves and call-downs for a food stand. Cooking ahead is where waste comes
// from (Winnow: 5–15% overproduction when prepared in advance vs 1–10% cook-to-
// order; Mizzou audit: 96% of pre-game prep waste was unsold food). Hot food held
// at ≥135°F has no code time limit; out of temperature control it gets 4 hours
// (WAC 246-215-03530, FDA Food Code 3-501.19). What forces waves is quality
// (fries 5–7 min, burgers ~10 min): company rules, set here as `holdMin`.
import type { VenueEvent } from "../deep/venue";
import type { Values } from "../deep/economics";
import { arrivalCurve, clock, phases } from "./timeline";
import { newsvendor } from "../deep/newsvendor";
import { nbVariance } from "../deep/stats";
import { reorderPoint } from "./inventory";

export type PrepParams = { holdMin: number; runnerLeadMin: number; callDownService: number };
export const PREP_DEFAULTS: PrepParams = { holdMin: 20, runnerLeadMin: 15, callDownService: 0.95 };

export function prepWaves(e: VenueEvent, v: Values, demandTx: number, p: PrepParams = PREP_DEFAULTS) {
  const curve = arrivalCurve(e, v, demandTx);
  const price = v.avgTicket / v.itemsPerTicket, cost = v.foodCostPct * price;
  return phases(e, v).map((ph) => {
    const a = ph.from - curve.from, b = ph.to - curve.from;
    const slice = curve.perMin.subarray(a, b);
    const phaseDemand = slice.reduce((x, y) => x + y, 0);
    const firstHold = slice.subarray(0, p.holdMin).reduce((x, y) => x + y, 0);
    // Ready at the start of the wave: what sells within one hold window, at the newsvendor ratio.
    const nv = newsvendor({ meanDemand: firstHold, sdDemand: Math.sqrt(nbVariance(firstHold, v.demandDispersion)), price, unitCost: cost, salvage: 0 });
    const peakPerMin = Math.max(...slice, 0);
    const rop = reorderPoint(peakPerMin, p.runnerLeadMin, 0.2, p.callDownService);
    return {
      phase: ph.name,
      kind: ph.kind,
      at: clock(e, ph.from - (ph.kind === "break" ? 5 : 0)),
      demand: phaseDemand,
      readyAtStart: ph.kind === "play" ? 0 : nv.quantity,
      cookToOrderAfter: Math.max(0, phaseDemand - nv.expectedSales),
      expectedWasteUnits: ph.kind === "play" ? 0 : nv.expectedLeftover,
      callDownAt: rop.rop,
    };
  });
}
