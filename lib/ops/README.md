# Event-night operations (`/ops`, `/api/ops`)

Built on `lib/deep` (venue data, demand, economics). Research behind every number: `research-v2/05–09` in the project folder.

| Question an operator asks | File | Method |
|---|---|---|
| How many registers at each stand, every 15 minutes? | `erlangA.ts`, `staffing.ts`, `night.ts` | Time-varying Erlang A (M/M/c+M) solved from the Kolmogorov forward equations, queue carried between intervals; steady-state SIPP shown beside it (Green, Kolesar & Whitt 2007) |
| Which shifts? | `staffing.ts`, `lp.ts` | Dantzig covering integer program, exact with HiGHS |
| What does Seattle's 14-day schedule rule cost, and where should we post? | `seattle.ts` | Two-stage newsvendor in labour hours; predictability-pay table from SHRR ch. 120; Q&A §I.38 (no cancelled-game exception) |
| When to cook, how much, when to call the runner? | `prep.ts` | Newsvendor per hold window; reorder point over the runner lead time; 4-hour TPHC rule (WAC 246-215-03530) |
| What merch to count in, by size, and how many registers? | `merch.ts`, `inventory.ts`, `profile.ts` | atVenu genre priors, multi-item newsvendor with carry-over salvage (Lagrangian), Dirichlet size curve, Erlang A with faster walk-aways during the set |
| What does tonight's crowd like? | `crowd.ts` | Qloo, live only: demographics, pour-list ranking, dish tags, home-city and nearby places. Pending without a key; nothing synthesised |
| How do my own sales change the forecast? | `forecast.ts` | Analog-event weights + conjugate Gamma–Poisson shrinkage; in-event update for call-downs |

Checks: `npx tsx --test lib/ops/*.test.mts` (Erlang A → Erlang C limit, overload, M/M/1+M by direct sum, the 400-in-15-minutes burst at 11.0% / 2.5% walk-aways matching an independent solver, transient → stationary, covering program feasibility, forecast shrinkage, Lagrangian capacity, size-curve learning, lock optimality, night-plan targets). MCP tools: `staff_event`, `merch_plan`, `erlang_a`.

Labelled assumptions (not published anywhere we found): genre of each act (our reading), bar service time 40 s, register cap 8 per stand, 14-day forecast error 30%, 70% of short-notice shifts filled, merch service time 45 s + 17.5 s per item, female share by genre until Qloo demographics are live.
