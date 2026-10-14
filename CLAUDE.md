# Concourse
One line: an event-night agent that sets up every stand in an arena for the crowd coming in tonight, grounded in Qloo taste data.
For: venue and arena operators · Job: decide tonight's partner, menu, merch and sponsor mix per stand · Done: pick an event, see every stand ranked and explained, swap with the agent.
Sponsor mechanism (critical path): Qloo `/v2/insights` with `filter.results.entities` + `feature.explainability` ranks the venue's own shortlist for tonight's anchor entities (docs/qloo.md).
Features in scope: event switcher + 3D arena lit by fit · stand inspector with Qloo evidence + swap · tonight-vs-last-night diff · evidence ledger · agent chat. Not building: ticketing, POS integration, accounts, real venue maps.

Stack: Next.js 16 app router, react-three-fiber, @anthropic-ai/sdk. Node ≥ 20.9.
Run: `npm install && npm run dev` · Test: `npm run build && npm start` then `npm test` (typecheck + scripts/smoke.mjs; `BASE_URL=` for a deploy) · Deploy: Vercel, env in docs/qloo.md §7.
CI does NOT cover: anything live (Qloo or Claude), the 3D render, mobile layout.

Repo map:
- app/ pages + API routes (/api/events, /api/plan, /api/agent)
- components/ Arena (3D), Panels (cards, inspector, ledger)
- lib/qloo/ types → live client → synthetic fixtures (mock.ts) → unified access + ledger (index.ts)
- lib/agent/ plan.ts (ranking → assignment → diff), chat.ts (Claude tools + offline planner)
- lib/venue/ synthetic arena, vendor catalogue, events (date order; first event has no previous night)
- docs/ judge-facing docs and screenshots only

API contract: response types in lib/qloo/types.ts first; mock.ts must return the same shapes.

Invariants (never):
- never call Qloo from the client or put the key in a NEXT_PUBLIC_ var, a log, a screenshot or a recording
- never commit Qloo response data (kit rule); `.cache/` stays gitignored
- never compare affinities across events; never present demographics as shares
- never let the model invent an affinity: numbers come from tool results only
- never turn a Qloo failure into a low score or "no change": fail with a named state (docs/qloo.md §5)
- never show synthetic data without the "Demo data" label
- never infer anything about an individual attendee; no PII to Qloo

Design: follow design.md when it exists; tokens live in app/globals.css (`:root`). Don't copy values here.
Rules that disqualify: no hosted demo · repo not public · license not visible in GitHub About · not using Qloo meaningfully or not agentic · login wall without credentials · down before Nov 16, 2026 11:45 pm ET. Deadline Oct 30, 2026 11:45 pm EDT.
Evidence rules: a claim is done only with a row in the private hackathon/evidence.md and an artifact. Mocks are never evidence. Public copy (README proof table, Devpost text) may only state `live` rows as results; everything else carries its label.
Forbidden artifacts: plans, research, briefs, QA notes, tracker and submission drafts live in the private parent folder (`../hackathon/`), never in this repo. If one lands here, move it back; recover, don't delete.
Workflow: prompt → debug → deploy → verify live → polish. Deploy before polishing further.
Context rules: no MCP unless the event requires it; cite Qloo docs by URL (docs.qloo.com).
