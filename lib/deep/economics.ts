// Every number the planner uses, with where it came from. "sourced" values cite a
// publication; "assumption" values are judgement calls, kept in ranges and run
// through the sensitivity analysis. Research notes with quotes live outside the repo.

export type Param = { value: number; low: number; high: number; unit: string; status: "sourced" | "derived" | "assumption"; source: string };

const P = (value: number, low: number, high: number, unit: string, status: Param["status"], source: string): Param => ({ value, low, high, unit, status, source });

export const PARAMS = {
  // Spend per head. No public per-cap exists for NHL or arena concerts, so these are assumptions
  // anchored on: Live Nation US amphitheater ancillary spend "over $45" per fan (FY2025 10-K, includes
  // merch and upsells), and vendor-reported MLB general concessions per caps $20.92–$30.00, avg $22.85
  // (AECOM for Tampa Sports Authority, 2026-04-15).
  fnbPerCapGame: P(30, 20, 42, "USD/attendee", "assumption", "Anchored on AECOM 2026 MLB per caps ($22.85 avg) and Live Nation FY2025 10-K ($45+ ancillary)"),
  fnbPerCapConcert: P(30, 20, 40, "USD/attendee", "assumption", "Anchored on Live Nation FY2025 10-K ($45+ ancillary incl. merch) and AECOM 2026 stadium concert planning figure ($20)"),
  foodShare: P(0.35, 0.25, 0.45, "share of F&B revenue", "assumption", "Remainder after alcohol ~50% (AP survey of 21 stadiums, 2014) and non-alcoholic ~15%"),
  merchPerCapConcert: P(15, 9.95, 20.2, "USD/attendee", "sourced", "atVenu, merch per head by venue size, range $9.95–$20.20 (midpoint)"),
  merchPerCapGame: P(6, 3, 13, "USD/attendee", "assumption", "No public NHL merch per cap found"),
  avgTicket: P(23, 18, 28, "USD/transaction", "sourced", "Mashgin NFL 2024-25 report: $23 average transaction across 16 stadiums"),
  itemsPerTicket: P(2.2, 1.8, 2.6, "items/transaction", "derived", "Mashgin NFL 2024-25: 1.4M items / 634.8k transactions"),
  // Timing and service.
  shareBeforeStart: P(0.45, 0.35, 0.55, "share of transactions", "assumption", "Auburn thesis (Chen 2019): 46.8% of stand arrivals in the 75 min before kickoff"),
  shareIntermission: P(0.35, 0.25, 0.45, "share of transactions", "assumption", "Whisenant et al. 2013 citing Mulrooney & Farmer: 80% of sales by end of halftime"),
  serviceMin: P(52.3 / 60, 39.7 / 60, 75 / 60, "min/transaction", "sourced", "Chen 2019 (Auburn): 52.3 s mean at a traditional stand; Mashgin cites 60–90 s manual checkout"),
  patienceMin: P(10, 6, 15, "min", "sourced", "Oracle Food and Beverage survey 2019: 10 minutes is the longest fans say they will wait"),
  doorsWindowMin: P(75, 60, 90, "min", "assumption", "Doors-to-start window; matches the Auburn arrival study window"),
  intermissionMin: P(18, 15, 20, "min per break", "assumption", "NHL intermissions; concerts treated as one ~30 min changeover"),
  changeoverMin: P(30, 20, 40, "min", "assumption", "Concert opener-to-headliner changeover"),
  // Margins and waste.
  foodCostPct: P(0.3, 0.22, 0.38, "COGS share of price", "assumption", "No public figure for this venue"),
  perishableSalvage: P(0, 0, 0.1, "share of unit cost recovered", "assumption", "Prepared food left over is discarded"),
  packagedSalvage: P(0.9, 0.8, 1, "share of unit cost recovered", "assumption", "Packaged items carry over to the next event"),
  demandDispersion: P(20, 8, 60, "negative-binomial k", "assumption", "var = mean + mean²/k; smaller k = more uncertain nights"),
  // Venue and plan.
  fill: P(0.92, 0.8, 1, "share of capacity", "assumption", "Tickets sold are not public"),
  levelShareMain: P(0.5, 0.4, 0.6, "share of fans", "assumption", "Lower bowl (LL2 main concourse)"),
  levelShareClub: P(0.08, 0.05, 0.12, "share of fans", "assumption", "Club and suite ticket holders"),
  cartWeight: P(0.5, 0.3, 0.8, "pull of a cart vs a stand", "assumption", "Carts draw fewer fans than a full stand"),
  incremental: P(0.5, 0.3, 0.8, "share of a flex location's sales that is new spend", "assumption", "The rest moves from nearby stands"),
  changeoverCost: P(250, 100, 500, "USD per concept change", "assumption", "Setup, delivery and training to swap what a location runs"),
  // How much a Qloo affinity moves demand: multiplier exp(beta × z), z = standardised affinity
  // among tonight's candidates. beta 0 is the without-Qloo ablation.
  tasteBeta: P(0.15, 0, 0.3, "log-demand per SD of affinity", "assumption", "Untested until live data; the sensitivity view shows when it changes the plan"),
} satisfies Record<string, Param>;

export type ParamKey = keyof typeof PARAMS;
export type Values = Record<ParamKey, number>;

export function defaults(): Values {
  return Object.fromEntries(Object.entries(PARAMS).map(([k, p]) => [k, p.value])) as Values;
}
