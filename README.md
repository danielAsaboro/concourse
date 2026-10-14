# Concourse — the event-night agent for venues

**Qloo Agentic Hackathon 2026 entry.** Concourse sets up an arena for the specific crowd coming in tonight. Pick the event (Bad Bunny, Lakers vs Celtics, Metallica, …) and every stand in a 3D bowl lights up by how well its food, drink, merch or sponsor partner fits that crowd. Switch the event and the venue re-lights. Click a stand and the agent shows the Qloo evidence behind the pick, offers ranked alternatives, and swaps vendors on request.

## The problem

Venues run the same concessions every night. The Friday reggaeton crowd, the Saturday NBA crowd and the Sunday metal crowd walk the same concourse past the same stands. Operators know this costs per-cap revenue and sponsor value, but they have no taste signal to act on, so they guess or default.

## Why Qloo

Concourse would not work without Qloo. Every decision in the app is a Qloo call:

| Decision | Qloo call | Why it fits |
|---|---|---|
| Rank the venue's own vendor shortlist for tonight's crowd | `GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=<artist/athlete ids>&filter.results.entities=<vendor ids>&feature.explainability=true` | `filter.results.entities` scores *our* candidates, not Qloo's picks, and explainability says which anchor (headliner vs support act) drove each score |
| Who is tonight's crowd | `GET /v2/insights?filter.type=urn:demographics&signal.interests.entities=…` | Age and gender affinity offsets for the anchors |
| What to change from last night | `GET /v2/analysis/compare?a.signal.interests.entities=<tonight>&b.signal.interests.entities=<last night>` | Taste tags that differ most between the two crowds |
| Resolve names to ids | `GET /search?query=…&types=…` | Cached server-side |

The agent (`lib/agent/chat.ts`) is a Claude tool-use loop whose tools are those Qloo calls plus `swap_stand`. It cannot invent an affinity; every number in its answers comes back from a tool result and is recorded in the evidence ledger shown in the UI.

A side-by-side panel shows an **LLM-only guess** (most popular vendor per category, which is what an ungrounded prompt returns) against the **Qloo-grounded** plan.

## Running it

```bash
npm install
cp .env.example .env.local   # add QLOO_API_KEY when you have one
npm run dev                  # http://localhost:3000
```

### Data modes

- **Recorded fixtures (default, no key).** `lib/qloo/mock.ts` returns responses shaped exactly like Qloo's (`results.entities[].query.affinity`, `query.explainability`, `results.demographics`, `results.tags`), generated from hand-authored taste profiles. The UI labels this mode. Nothing in the fixtures is Qloo data.
- **Live.** Set `QLOO_API_KEY`. Calls go to `https://hackathon.api.qloo.com` from the server only (`lib/qloo/live.ts`); the key never reaches the client. Entity ids are resolved once via `/search` and cached in `.cache/` (gitignored). Set `QLOO_MODE=mock` to force fixtures even with a key.

### Agent modes

- Without `ANTHROPIC_API_KEY` the chat runs an offline planner that answers from the computed plan (still Qloo-grounded, no free text generation).
- With it, the agent is Claude with Qloo tools and can swap stands.

## Project layout

```
app/                 Next.js app router: page, /api/plan, /api/agent, /api/events
components/Arena.tsx react-three-fiber arena; stands lit by fit
components/Panels.tsx stand detail, compare diff, LLM-vs-Qloo, evidence ledger
lib/qloo/            types mirroring Qloo responses, live client, fixtures, unified access + ledger
lib/venue/           synthetic 20-stand arena, 42-vendor catalogue, 6 demo events
lib/agent/plan.ts    ranking → greedy stand assignment → compare diff → summary
lib/agent/chat.ts    Claude tool-use agent over the Qloo calls, with an offline fallback
```

## What the result does not establish

- Affinity scores are relative to each query. The app never compares scores across events; the lighting scale is per night.
- Demographics are offsets (−1..1), not audience shares.
- The stand layout and vendor catalogue are synthetic demo data. Qloo knows nothing about stadium sections.
- The "per-cap lift" number is our heuristic inference from traffic-weighted affinity, labelled as such in the UI. It is not a Qloo output.
- Qloo describes aggregate taste. Nothing here infers anything about an individual attendee.

## Deploy

Standard Next.js. Deploys to Vercel with `QLOO_API_KEY` (and optionally `ANTHROPIC_API_KEY`) as server environment variables. No login wall.

## License

MIT — see [LICENSE](LICENSE).
