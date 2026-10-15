// Smoke test against a running server: `npm run build && npm start`, then
// `npm run smoke` (or BASE_URL=https://your-deploy npm run smoke).
// Exits non-zero on the first failed check. Doubles as an uptime probe.
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failed++; };
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json().catch(() => null) }; };
const post = async (p, body) => { const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body }); return { status: r.status, body: await r.json().catch(() => null) }; };

const home = await fetch(BASE + "/");
ok(home.status === 200, `GET / -> ${home.status}`);

const ev = await get("/api/events");
ok(ev.status === 200 && Array.isArray(ev.body?.events) && ev.body.events.length > 0, `GET /api/events -> ${ev.body?.events?.length ?? 0} events, mode=${ev.body?.mode}, agent=${ev.body?.agent}`);

for (const e of ev.body?.events ?? []) {
  const t0 = Date.now();
  const p = await get(`/api/plan?event=${encodeURIComponent(e.id)}`);
  const a = p.body?.assignments ?? [];
  ok(p.status === 200 && a.length > 0 && a.every((x) => x.fit >= 0 && x.fit <= 1 && x.vendorName) && (p.body?.ledger?.length ?? 0) > 0,
    `plan ${e.id}: ${a.length} stands, ${p.body?.ledger?.length ?? 0} Qloo calls, prev=${p.body?.previousEvent?.id ?? "none"}, ${Date.now() - t0}ms`);
}

const bad = await get("/api/plan?event=does-not-exist");
ok(bad.status === 400, `unknown event -> ${bad.status}`);
const badJson = await post("/api/agent", "not json");
ok(badJson.status === 400, `agent with invalid JSON -> ${badJson.status}`);
const empty = await post("/api/agent", "{}");
ok(empty.status === 400, `agent with no question -> ${empty.status}`);

// Real-venue planner (lib/deep): page renders and the API returns the venue and its events.
const nightPage = await fetch(BASE + "/night");
ok(nightPage.status === 200, `GET /night -> ${nightPage.status}`);
const night = await get("/api/night");
ok(night.status === 200 && night.body?.venue && Array.isArray(night.body?.events), `GET /api/night -> ${night.body?.events?.length ?? 0} events at ${night.body?.venue?.name ?? "?"}`);

const featured = ev.body?.featured ?? ev.body?.events?.[0]?.id;

// Driver scores are normalised contributions, never shown as percentages.
const fp = await get(`/api/plan?event=${encodeURIComponent(featured)}`);
const pct = (fp.body?.assignments ?? []).filter((x) => /\d%/.test(x.reason));
ok(fp.status === 200 && pct.length === 0, `no percentage in stand reasons (${pct.length} found)`);

// Swapping a stand to a vendor that holds another stand exchanges the two; no duplicates.
const as = fp.body?.assignments ?? [];
const pair = as.flatMap((a) => as.filter((b) => b !== a && b.stand.category === a.stand.category).map((b) => [a, b]))[0];
if (pair) {
  const [a, b] = pair;
  const sw = await get(`/api/plan?event=${encodeURIComponent(featured)}&overrides=${encodeURIComponent(`${a.stand.id}:${b.vendorId}`)}`);
  const sa = sw.body?.assignments ?? [];
  const ids = sa.map((x) => x.vendorId);
  const na = sa.find((x) => x.stand.id === a.stand.id), nb = sa.find((x) => x.stand.id === b.stand.id);
  ok(sw.status === 200 && new Set(ids).size === ids.length && na?.vendorId === b.vendorId && nb?.vendorId === a.vendorId,
    `swap ${a.stand.label} to ${b.vendorName} exchanges with ${b.stand.label}, no duplicate vendors`);
}
const ans = await post("/api/agent", JSON.stringify({ question: "What changes from last night?", event: featured }));
ok(ans.status === 200 && typeof ans.body?.text === "string" && ans.body.text.length > 0, `agent answers (${ans.body?.engine}): ${String(ans.body?.text).slice(0, 80)}…`);

console.log(failed ? `\n${failed} check(s) failed against ${BASE}` : `\nAll checks passed against ${BASE}`);
process.exit(failed ? 1 : 0);
