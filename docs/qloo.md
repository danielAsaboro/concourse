# How Concourse uses Qloo

## 1. The rule we enforce

No stand is assigned, recoloured or swapped unless a Qloo affinity for tonight's anchor entities backs it; when Qloo can't answer, the plan fails with a named state instead of falling back to a guess.

## 2. Enforcement layers

| Layer | Where | What it blocks if the others fail |
|---|---|---|
| Entity resolution | `lib/qloo/live.ts` `resolveEntityId` (`/search`) | An event whose anchors don't resolve stops with `NO_SIGNAL`; unresolved vendors are left unranked and reported in the ledger, never scored 0 |
| Ranking | `lib/qloo/index.ts` `rankShortlist` (`/v2/insights` + `filter.results.entities`) | Only vendors Qloo scored can be assigned; the greedy assigner in `lib/agent/plan.ts` reads nothing else |
| Agent tools | `lib/agent/chat.ts` | `swap_stand` refuses unknown stands or vendors and cross-category swaps; the model gets affinities only from tool results |
| Transport | `lib/qloo/live.ts` `qlooGet` | Key only on the server (`import "server-only"`), 10 s timeout, every failure is a named error |

## 3. Flow

1. The operator picks tonight's event, for example Bad Bunny (anchors: Bad Bunny, Karol G).
2. Server resolves the anchors and the venue's 42-vendor shortlist to Qloo ids via `/search` (cached in memory and in `.cache/`).
3. `/v2/insights?filter.type=urn:entity:brand|place&signal.interests.entities=<anchors>&filter.results.entities=<shortlist>&feature.explainability=true` scores **our** candidates, one call per entity type.
4. `/v2/insights?filter.type=urn:demographics&signal.interests.entities=<anchors>` gives age and gender offsets.
5. `/v2/analysis/compare` with `a.` = tonight's anchors and `b.` = last night's gives the taste shift.
6. The plan assigns each stand the best unused vendor of its category, weighted by zone (club favours premium partners). Last night's plan is rebuilt the same way, and changed stands are scored against tonight's crowd.
7. Every call is written to the evidence ledger (endpoint, redacted params, summary, ms) and shown in the UI.
8. The agent answers questions and swaps stands through tools that call steps 3–5.

## 4. Endpoints used

| Endpoint | Purpose | Auth | Host |
|---|---|---|---|
| `GET /search?query=&types=&take=3` | Name → entity id | `X-Api-Key` header, server only | `hackathon.api.qloo.com` |
| `GET /v2/insights` (`filter.type=urn:entity:brand` / `urn:entity:place`, `filter.results.entities`, `feature.explainability=true`, `take=50`) | Rank the shortlist; per-result driver scores | same | same |
| `GET /v2/insights` (`filter.type=urn:demographics`) | Crowd age and gender offsets | same | same |
| `GET /v2/analysis/compare` (`a.signal.interests.entities`, `b.signal.interests.entities`) | Tonight vs last night | same | same |

## 5. Failure handling

| Failure | Detected where | Resulting state | What the user sees |
|---|---|---|---|
| No `QLOO_API_KEY` | `qlooMode()` | `mock`: synthetic demo data | "Demo data" pill plus a banner saying numbers are synthetic |
| Key set but call made without it | `qlooGet` | `NO_KEY` | Plan error in the loader |
| Qloo slower than 10 s | `qlooGet` | `TIMEOUT` | Plan error naming the endpoint |
| Non-2xx from Qloo | `qlooGet` | `HTTP_ERROR` (status + first 200 chars) | Plan error |
| DNS or connection failure | `qlooGet` | `NETWORK` | Plan error |
| Non-JSON body | `qlooGet` | `MALFORMED` | Plan error |
| No anchor resolves | `rankShortlist` | `NO_SIGNAL` | Plan error naming the anchors |
| Some vendors don't resolve | `rankShortlist` | Ranked without them; count noted in the ledger | Ledger line "N vendor names not found in Qloo" |
| Compare row missing a or b affinity | `compareCrowds` | Row dropped (not zero-filled) | Fewer diff rows, or the diff panel hides |
| Explainability missing | `rankShortlist` | Empty drivers | No driver bar; affinity still shown |

A timeout is never shown as "no change", and a failed call is never shown as a low score.

## 6. Docs vs live API differences

**Not tested yet: there was no hackathon key on 2026-10-14.** These are discrepancies between the docs and our code that the first live run must settle:

| Question | Docs say | Code assumes | Test |
|---|---|---|---|
| Compare response shape | OpenAPI types `results` as an array of entities; the `filter.type` enum lists entity types only (no `urn:tag`) | Tag rows with `query.a.affinity`, `query.b.affinity`, optional `query.delta`; accepts either `results.tags` or an array | Call compare for Bad Bunny vs Dave Chappelle, record the top-level keys |
| Explainability meaning | "normalized scores between 0 and 1"; entities below 0.1 may be omitted | Per-result `query.explainability["signal.interests.entities"]` keyed by entity id | Check that keys are entity ids and whether scores sum to 1 (the UI must not call them shares if they don't) |
| `filter.results.entities` on the hackathon host | Listed as optional for brand and place | Restricts results to our shortlist | Count results vs shortlist size |
| `/search` `types` param for places | Not pinned down | `types=urn:entity:place` | Resolve Nobu, Shake Shack |

## 7. Config

`QLOO_API_KEY` (server only), `QLOO_BASE_URL` (default `https://hackathon.api.qloo.com`), `QLOO_MODE=mock` (force demo data), `ANTHROPIC_API_KEY` (optional; enables the Claude agent). Names only; values never go in the repo.

## 8. Live proof

| Action | Endpoint | Request id / timestamp | Result summary |
|---|---|---|---|
| — | — | — | **No live calls yet.** Rows are added from the first live run, with redacted URLs and counts only (no Qloo response bodies in the repo). |

## 9. Honest scope

- All numbers in the hosted demo are **synthetic** until the key is set; the UI says so.
- The stand layout, the vendor catalogue and the "previous night" schedule are synthetic demo data. Qloo knows nothing about stadium sections.
- Real venues lock most concessions into long contracts, so the nightly levers are partner activations, menu and merch mix, pop-up stands and sponsor placements. "Swap" means changing what a stand features tonight, not re-tendering a contract.
- Affinities are relative to each query and are never compared across events. Demographics are offsets, not audience shares. "Per-cap lift" is our heuristic, not a Qloo output.
- Qloo describes aggregate taste. Nothing here infers anything about an individual attendee, and no personal data is sent to Qloo.
