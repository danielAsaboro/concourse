// Seattle Secure Scheduling Ordinance (SMC 14.22) as a cost model. Rules from the
// Office of Labor Standards' rules (SHRR ch. 120) and Q&A (updated Aug 2025).
// Covered: employers with 500+ employees worldwide in food service (NAICS 722,
// which includes food concession contractors at venues); Delaware North at the
// arena is almost certainly covered (inference).
import { PhiInv } from "../deep/stats";

export const SEATTLE = {
  minimumWage2026: 21.3,
  advanceNoticeDays: 14,
  addedHoursPremiumHours: 1,
  cutHoursShare: 0.5,
  clopeningMultiplier: 1.5,
  restHours: 10,
  graceMin: 15,
  sources: {
    wage: "http://laborstandards.seattle.gov/2025/09/30/office-of-labor-standards-announces-seattles-2026-minimum-wage/",
    rules: "https://www.seattle.gov/documents/Departments/LaborStandards/SS_Rules120.pdf",
    qa: "https://www.seattle.gov/documents/Departments/LaborStandards/SS_QA_FINAL_082025v2.pdf",
  },
  /** Q&A §I.38, verbatim. */
  cancelledGame: "No. … The cancellation of a game is not analogous to any of the identified exceptions.",
};

/**
 * Two-stage schedule. At T−14 days the plan posts S hours = H·Q(q), where H is the
 * forecast need and the true need is H·m, m lognormal with CV `cv14`. On the day:
 * extra hours cost wage plus one hour of predictability pay per added shift; cut
 * hours cost half pay. Short-notice shifts are not always filled (`addFillRate`); an
 * unfilled hour loses the margin a register earns in an hour. q* minimises expected
 * cost; it is a newsvendor in hours.
 */
export function lockCost(H: number, p: { hourlyWage: number; loadFactor: number; cv14: number; cvDay: number; shiftLengths: number[]; addFillRate: number }, marginPerHour: number) {
  const w = p.hourlyWage * p.loadFactor;
  const L = p.shiftLengths.reduce((a, b) => a + b, 0) / p.shiftLengths.length;
  const cost = (q: number, cv: number) => {
    const s2 = Math.log(1 + cv * cv), mu = -s2 / 2, s = Math.sqrt(s2);
    const S = H * Math.exp(mu + s * PhiInv(q));
    // Expectation over m by 400-point quantile grid.
    let tot = 0, prem = 0, added = 0, cut = 0, lost = 0;
    const K = 400;
    for (let i = 0; i < K; i++) {
      const m = Math.exp(mu + s * PhiInv((i + 0.5) / K));
      const N = H * m;
      const short = Math.max(0, N - S), down = Math.max(0, S - N);
      const up = short * p.addFillRate;
      const pp = (up / L) * SEATTLE.addedHoursPremiumHours * p.hourlyWage + down * SEATTLE.cutHoursShare * p.hourlyWage;
      tot += (Math.min(N, S) + up) * w + pp + (short - up) * marginPerHour;
      prem += pp; added += up; cut += down; lost += (short - up) * marginPerHour;
    }
    return { q, scheduled: S, expected: tot / K, predictabilityPay: prem / K, addedHours: added / K, cutHours: cut / K, lostMargin: lost / K };
  };
  const grid = (cv: number) => Array.from({ length: 49 }, (_, i) => cost(0.02 + i * 0.02, cv));
  const best = (cv: number) => grid(cv).reduce((a, b) => (b.expected < a.expected ? b : a));
  const atMedian = cost(0.5, p.cv14);
  const opt = best(p.cv14);
  // Value of a sharper 14-day forecast: the same law at a 10-point lower CV.
  const sharper = best(Math.max(0.02, p.cv14 - 0.1));
  return {
    forecastHours: H,
    optimal: opt,
    postAtForecast: atMedian,
    savingVsForecast: atMedian.expected - opt.expected,
    sharperForecast: { cv: Math.max(0.02, p.cv14 - 0.1), expected: sharper.expected, saving: opt.expected - sharper.expected },
    curve: grid(p.cv14).filter((_, i) => i % 4 === 0).map((c) => ({ q: c.q, expected: c.expected, predictabilityPay: c.predictabilityPay })),
    marginPerHour,
    rules: SEATTLE,
  };
}
