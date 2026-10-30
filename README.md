# Concourse: the event-night agent for venues

**Qloo Agentic Hackathon 2026 entry.** Concourse sets up an arena for the crowd coming in tonight. Pick the event (Bad Bunny, Lakers vs Celtics, Metallica…) and every food, drink, merch and sponsor stand in a 3D bowl lights up by how well its partner fits that crowd. Switch the event and the venue re-lights. Click a stand to see the Qloo evidence behind the pick and ranked alternatives, or ask the agent to swap it.

> **Data status:** the hosted demo runs on **synthetic demo data shaped like Qloo responses** until the hackathon API key is active, and says so on screen. The proof table below shows what has been verified and how.

## Hackathon requirements

- [x] Hosted, public demo: https://concourse-eosin.vercel.app
- [ ] Public repository: _URL goes here once pushed_
- [x] Open-source license: MIT ([LICENSE](LICENSE)); shown in GitHub's About section once pushed
- [ ] Integrates the Qloo API: implemented in [`lib/qloo`](lib/qloo); live verification pending the key ([docs/qloo.md](docs/qloo.md))
- [ ] Agentic: Claude tool-use agent over Qloo tools ([`lib/agent/chat.ts`](lib/agent/chat.ts)); live run pending
- [x] No login wall; no test credentials needed
- [x] Qloo key server-side only; no Qloo response data in the repo

## The problem

Venues run the same concessions and activations every night. The Friday reggaeton crowd, the Saturday NBA crowd and the Sunday metal crowd walk past the same stands. Operators know this costs per-cap revenue and sponsor value, but they have no taste signal to act on, so they default to whatever is most popular.

## How it uses Qloo

| Decision | Qloo call |
|---|---|
| Rank the venue's own partner shortlist for tonight's crowd | `GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=<headliner ids>&filter.results.entities=<vendor ids>&feature.explainability=true` |
| Who tonight's crowd is | `GET /v2/insights?filter.type=urn:demographics&signal.interests.entities=…` |
| What changes from last night | `GET /v2/analysis/compare?a.signal.interests.entities=<tonight>&b.signal.interests.entities=<last night>` |
| Resolve names to ids | `GET /search?query=…&types=…` (cached server-side) |

`filter.results.entities` makes Qloo score **our** candidates rather than suggest its own, and explainability shows which headliner drove each score. The stand plan, the colours in the arena and the alternatives all come from those affinities; a popularity-only default is shown alongside for contrast. Every call appears in the on-screen evidence ledger with its redacted request. Failure handling, enforcement layers and open docs-vs-live questions are in **[docs/qloo.md](docs/qloo.md)**.

The agent ([`lib/agent/chat.ts`](lib/agent/chat.ts)) is a Claude tool-use loop with `qloo_rank`, `qloo_demographics`, `qloo_compare` and `swap_stand`. Without `ANTHROPIC_API_KEY` the chat falls back to a deterministic planner that answers from the same Qloo-derived plan.

## Proof table

| Claim | Status | How to check |
|---|---|---|
| Plans all 6 demo events, 20 stands each; bad input returns 400 | local test, synthetic data | `npm run build && npm start`, then `npm test` |
| Qloo key never reaches the browser | local test | `npm run build`, then `grep -rlE "QLOO_API_KEY\|X-Api-Key" .next/static` returns nothing |
| Ranking, demographics and compare against live Qloo | **pending: no key yet** | Set `QLOO_API_KEY`, open the app, expand the evidence bar (mode shows `live`) |
| Claude agent calls Qloo tools and swaps stands | **pending: not yet run live** | Set `ANTHROPIC_API_KEY`, ask "What changes from last night?" |
| Hosted demo | **pending** | Link above |

## Run it

```bash
git clone <repo-url> && cd concourse
npm install
cp .env.example .env.local     # optional: add QLOO_API_KEY and ANTHROPIC_API_KEY
npm run dev                    # http://localhost:3000
```

Verify: `npm run build && npm start`, then in another terminal `npm test` (typecheck plus [`scripts/smoke.mjs`](scripts/smoke.mjs); point it at a deploy with `BASE_URL=https://… npm run smoke`).

### Data modes

- **Demo data (default, no key).** `lib/qloo/mock.ts` returns responses shaped like Qloo's, generated from hand-authored taste profiles. None of it is Qloo data, and the UI labels it.
- **Live.** Set `QLOO_API_KEY`. Calls go to `https://hackathon.api.qloo.com` from the server only. `QLOO_MODE=mock` forces demo data even with a key.

## Project layout

```
app/                  Next.js app router: page, /api/plan, /api/agent, /api/events
components/           3D arena (react-three-fiber) and panels
lib/qloo/             response types, live client, synthetic fixtures, unified access + ledger
lib/venue/            synthetic 20-stand arena, 42-vendor catalogue, 6 demo events
lib/agent/plan.ts     ranking → stand assignment → last-night diff → summary
lib/agent/chat.ts     Claude tool-use agent with an offline fallback
docs/qloo.md          how the Qloo integration works and fails
scripts/smoke.mjs     end-to-end smoke test against a running server
```

## What the result does not establish

- Affinity scores are relative to each query. The app never compares scores across events; the lighting scale is per night.
- Demographics are offsets (−1..1), not audience shares.
- The stand layout, vendor catalogue and event schedule are synthetic demo data. Qloo knows nothing about stadium sections.
- Real venues lock most concessions into long contracts. The nightly levers are featured partners, menu and merch mix, pop-ups and sponsor activations.
- "Per-cap lift" is our heuristic inference, labelled in the UI. It is not a Qloo output and has not been measured.
- Qloo describes aggregate taste. Nothing here infers anything about an individual attendee.

## Deploy

Standard Next.js on Vercel. Set `QLOO_API_KEY` (and optionally `ANTHROPIC_API_KEY`) as server environment variables. No login wall.

## License

MIT. See [LICENSE](LICENSE).
