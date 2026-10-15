# Event-night planner (real venue)

`/night` and `/api/night` plan one real arena, **Climate Pledge Arena, Seattle**, from the arena's own dining guide, level maps and event feed (retrieved 2026-10-15; every stand, item and event in `data/climate-pledge-arena.json` carries its source URL).

## The decision

Fixed restaurants and pouring-rights partners (Coors Light, Hop Valley, Modelo, Pepsi) do not change per event. What does:

- **Which concept runs in the flexible locations.** Chef's Table (club, the arena says it rotates), The Pepsi Marketplace ("Rotating Chef Favorites") and four portable points. Candidates are concepts already operating in the building, so contracts and permits exist.
- **How much each stand preps.** A par sheet per fixed food stand.

## Method

| Step | File | What it does |
|---|---|---|
| Demand | `planner.ts` | attendance (capacity × fill) × level share × F&B per head × food share, split across the outlets on that level; a Qloo affinity moves demand by `exp(β·z)`, z standardised within tonight's single Qloo call |
| Timing and queues | `queue.ts` | demand split into doors, intermission(s) and play windows; Erlang C per location gives wait and lost sales, with exponential patience for walk-aways |
| Par levels | `newsvendor.ts` | newsvendor quantity at critical ratio (price − cost)/(price − salvage) |
| Plan | `solver.ts` | integer program solved exactly with HiGHS: one concept per location, each concept once, equipment fit, pins; objective is margin × incremental share − waste − changeover |
| Does Qloo matter | `analysis.ts` | without-Qloo ablation, baselines (keep what runs now, last similar event, a recorded Claude-without-Qloo answer, most popular via Qloo), one-at-a-time sensitivity on every assumption, break-even affinity gap per location |
| Taste | `taste.ts` | live only: resolves the headliner or team, ranks every concept's cuisine tag in one `/v2/insights` call, scouts local places near the arena; raw responses kept privately in `.cache/qloo-raw/` |

Every input is in `economics.ts` with its value, range, status (sourced / derived / assumption) and source. There are no per-head F&B figures for NHL games or arena concerts in public sources, so those are assumptions anchored on Live Nation's 10-K and vendor-reported MLB per caps, and they are swept in the sensitivity view.

## Honest limits

- No Qloo key yet: the taste signal is **pending** and the plan equals the ablation. The page says so, and shows in how many locations the model cannot separate the top concepts without it.
- No POS data: stands on the same level get the same volume. Prices are not published (only "under $10" on the value menu), so item price is derived from the average transaction.
- The value of the taste signal is computed under a model that assumes taste moves demand. The outside checks (pre-registered predictions in `/predictions`, blind review by venue F&B managers) are what test that.

## Tests

`npx tsx --test lib/deep/*.test.mts` checks Erlang C against a published worked example (Call Centre Helper: 10 Erlangs, AHT 180 s), the newsvendor against a hand calculation, the solver against exhaustive search on 40 random instances, and planner properties (feasibility, ablation identity, pins, monotonicity).
