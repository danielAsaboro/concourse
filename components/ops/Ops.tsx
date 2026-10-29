"use client";
// Event-night operations for Climate Pledge Arena: registers per 15 minutes for
// every stand, shifts, the Seattle 14-day lock, prep waves and call-downs, merch
// count-in by size, the crowd's taste from Qloo and forecasts updated from the
// operator's own sales. Styles are scoped (op-*) and use the shared tokens only.
import { useEffect, useMemo, useState } from "react";
import { island, useIslandTask } from "@/components/island/Island";

type Ev = { id: string; title: string; date: string; start: string; kind: string; genre: string };
type Src = { value: number; status: string; source: string };
type Wave = { phase: string; kind: string; at: string; demand: number; readyAtStart: number; cookToOrderAfter: number; expectedWasteUnits: number; callDownAt: number };
type Stand = { id: string; name: string; level: string; category: string; hero: string | null; capped: number; prep: Wave[] | null; demandTx: number; registers: number[]; sipp: number[]; abandonShare: number; peakQueue: number; meanWaitMin: number };
type LockPt = { q: number; scheduled?: number; expected: number; predictabilityPay: number; addedHours?: number; cutHours?: number; lostMargin?: number };
type Fc = { key: string; priorMean: number; mean: number; interval80: [number, number]; dataWeight: number; effectiveEvents: number; analogs: { label: string; weight: number; unitsPer1000: number }[] };
type Call = { endpoint: string; params: Record<string, string>; ok: boolean; ms: number; note: string };
type Crowd =
  | { status: "pending"; reason: string; calls: Call[] }
  | { status: "live"; anchors: { name: string; role: string }[]; demographics: { anchor: string; age: Record<string, number>; gender: Record<string, number> }[]; pour: { name: string; category: string; affinity: number; rank: number }[]; dishes: { name: string; affinity: number }[]; homeCity: { city: string; source: string; places: { name: string; affinity: number; tags: string[] }[] } | null; nearby: { name: string; affinity: number; tags: string[] }[]; calls: Call[] };
type Merch = {
  genre: string; priors: { buyRate: Src; perHead: Src }; femaleShare: { value: number; fromQloo: boolean }; gross: number; venueShare: number; txns: number; itemsPerTxn: number; serviceMin: number;
  sizeShares: Record<string, number>;
  stock: { id: string; label: string; size?: string; item: string; quantity: number; expectedSales: number; expectedLeftover: number; fillRate: number; criticalRatio: number; price: number }[];
  registers: { open: number; neededBeforeSet: number; before: { waitMin: number; walkAway: number }; during: { waitMin: number; walkAway: number; open: number } };
  early: { share: number; registers: number; needed: number; waitMin: number; walkAway: number };
  lostSales: number; params: { hallFee: number; preorderShare: number; booths: number; registersPerBooth: number };
};
type Ops = {
  error?: string;
  event: Ev; genre: { id: string; label: string }; mix: { foodShare: Src; alcoholShareOfDrink: Src; note: string }; attendance: number;
  phases: { name: string; kind: string; fromClock: string; toClock: string; from: number; to: number }[];
  intervals: string[]; stands: Stand[];
  totals: { transactions: number; lostTx: number; registerHoursBurstAware: number; registerHoursSipp: number; paidHours: number; headcount: number; rostered: number; laborCost: number; laborPctOfSales: number; sales: number };
  shifts: { standId: string; start: string; end: string; hours: number; count: number }[];
  volunteer: { id: string; group: number; cost: number }[];
  seattle: { forecastHours: number; optimal: LockPt; postAtForecast: LockPt; savingVsForecast: number; sharperForecast: { cv: number; expected: number; saving: number }; curve: LockPt[]; marginPerHour: number; rules: { minimumWage2026: number; cancelledGame: string; sources: Record<string, string> } };
  solver: { name: string; ms: number; variables: number; constraints: number; programs: number };
  params: { shiftLengths: number[]; setupMin: number; maxAbandon: number; maxMeanWaitMin: number; barServiceSec: number; maxRegistersStand: number; hourlyWage: number; loadFactor: number; cv14: number; cvDay: number; noShow: number; addFillRate: number; lostIfShort: number };
  merch: Merch; crowd: Crowd; forecasts: Fc[]; history: { rows: number; errors: string[] };
};

const usd = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : "–");
const int = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "–");
const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
const LEVEL: Record<string, string> = { main: "Main", upper: "Upper", club: "Club", both: "Main + upper" };
const TABS = [
  ["staff", "Registers & shifts"],
  ["lock", "14-day lock"],
  ["prep", "Prep & call-downs"],
  ["merch", "Merch"],
  ["crowd", "Crowd taste"],
  ["forecast", "Your sales"],
  ["method", "Methods"],
] as const;
type Tab = (typeof TABS)[number][0];

const SAMPLE = `date,kind,genre,start,attendance,key,units,label
2026-03-14,concert,country,19:30,16900,cpa-10512,1450,Example row (replace with your POS export)`;

export default function Ops() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [eventId, setEventId] = useState("");
  const [d, setD] = useState<Ops | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("staff");
  const [view, setView] = useState<"burst" | "sipp">("burst");
  const [standId, setStandId] = useState("");
  const [csv, setCsv] = useState("");

  useEffect(() => {
    fetch("/api/ops").then((r) => r.json()).then((m: { events: Ev[] }) => {
      setEvents(m.events);
      const h = typeof window !== "undefined" ? window.location.hash.slice(1).split("/") : [];
      const id = m.events.some((e) => e.id === h[0]) ? h[0] : m.events[0]?.id ?? "";
      if (TABS.some(([t]) => t === h[1])) setTab(h[1] as Tab);
      setEventId(id);
    }).catch((e) => setErr(String(e)));
  }, []);

  const load = (body?: string) => {
    if (!eventId) return;
    setLoading(true); setErr(null);
    fetch(`/api/ops?event=${encodeURIComponent(eventId)}`, body ? { method: "POST", body } : undefined)
      .then((r) => r.json()).then((x: Ops) => { if (x.error) setErr(x.error); else { setD(x); setStandId((s) => (x.stands.some((y) => y.id === s) ? s : x.stands.find((y) => y.prep)?.id ?? "")); } })
      .catch((e) => setErr(String(e))).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (eventId && typeof window !== "undefined") history.replaceState(null, "", `#${eventId}/${tab}`); }, [eventId, tab]);

  const stand = useMemo(() => d?.stands.find((s) => s.id === standId) ?? null, [d, standId]);

  // Dynamic Island: the staffing solve while it runs, tonight's floor at rest.
  const evNow = events.find((e) => e.id === eventId);
  useIslandTask(
    loading,
    { title: `Staffing ${evNow?.title ?? "tonight"}`, detail: "Queueing model per 15 minutes, then shifts by an exact solver under Seattle's 14-day lock." },
    () => (d ? { title: "Rota solved", value: `${int(d.totals.headcount)} staff`, ttl: 2600 } : null),
  );
  useEffect(() => {
    if (!d) return;
    island.rest({
      title: `${d.event.title} · staffing`,
      value: `${int(d.totals.headcount)} staff`,
      detail: `${d.stands.length} stands staffed interval by interval. ${d.crowd.status === "live" ? "Qloo's audience data is live for this event." : "Qloo's audience signal is pending here, so the crowd mix uses genre priors."}`,
      facts: [
        { label: "Labour", value: usd(d.totals.laborCost) },
        { label: "Walk-aways", value: int(d.totals.lostTx) },
        { label: "Merch", value: usd(d.merch.gross) },
      ],
    });
  }, [d]);
  useEffect(() => () => island.rest(null), []);

  return (
    <main className="op">
      <Style />
      <header className="op-head">
        <div>
          <p className="op-eyebrow">Event-night operations · Climate Pledge Arena</p>
          <h1>Who works which register, when to cook, and what merch to count in</h1>
          <p className="op-muted">Every stand in the arena&apos;s own dining guide, staffed interval by interval from a queueing model that handles intermission rushes, scheduled into shifts by an exact solver, and costed under Seattle&apos;s 14-day scheduling law.</p>
        </div>
        <label className="op-select">
          <span>Event</span>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((e) => <option key={e.id} value={e.id}>{new Date(`${e.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {e.start} · {e.title}</option>)}
          </select>
        </label>
      </header>

      {err && <p className="op-err">Could not load the plan: {err}</p>}
      {!d && !err && <p className="op-muted">Solving tonight&apos;s staffing for every stand…</p>}

      {d && (
        <>
          <section className="op-strip">
            <Stat label="Crowd" value={d.genre.label} note={`${int(d.attendance)} expected · genre is our reading of the act`} />
            <Stat label="Staff on the floor" value={int(d.totals.headcount)} note={`${int(d.totals.rostered)} rostered for ${pct(d.params.noShow)} no-shows · ${int(d.totals.paidHours)} paid hours`} />
            <Stat label="Labour" value={usd(d.totals.laborCost)} note={`${pct(d.totals.laborPctOfSales, 1)} of expected F&B sales`} />
            <Stat label="Fans who give up" value={int(d.totals.lostTx)} note={`${pct(d.totals.lostTx / d.totals.transactions, 1)} of ${int(d.totals.transactions)} purchases`} tone={d.totals.lostTx / d.totals.transactions > 0.06 ? "warn" : undefined} />
            <Stat label="14-day lock, best posting" value={`${Math.round(d.seattle.optimal.q * 100)}th pct`} note={`saves ${usd(d.seattle.savingVsForecast)} vs posting the forecast`} tone="ok" />
            <Stat label="Merch tonight" value={usd(d.merch.gross)} note={`${usd(d.merch.venueShare)} to the venue at a ${pct(d.merch.params.hallFee, 1)} hall fee`} />
          </section>

          <p className="op-note"><b>Crowd mix:</b> {d.mix.note}. Food is {pct(d.mix.foodShare.value)} of F&amp;B tonight <Tag s={d.mix.foodShare} />; alcohol {pct(d.mix.alcoholShareOfDrink.value)} of drinks <Tag s={d.mix.alcoholShareOfDrink} />. {d.crowd.status === "live" ? "Qloo's audience data is live for this event." : "Qloo's audience signal is pending (no key here), so these are genre priors."}</p>

          <nav className="op-tabs" role="tablist">
            {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
          </nav>

          {tab === "staff" && (
            <section className="op-card">
              <div className="op-row">
                <div>
                  <h2>Registers per 15 minutes, every stand</h2>
                  <p className="op-muted">The fewest open registers that keep walk-aways under {pct(d.params.maxAbandon)} and the average wait under {d.params.maxMeanWaitMin} minutes, with each interval starting from the queue the last one left. Steady-state staffing (SIPP, what workforce tools do) ignores that carry-over.</p>
                </div>
                <div className="op-seg">
                  <button className={view === "burst" ? "on" : ""} onClick={() => setView("burst")}>Burst-aware</button>
                  <button className={view === "sipp" ? "on" : ""} onClick={() => setView("sipp")}>Steady-state (SIPP)</button>
                </div>
              </div>
              <p className="op-foot">Register-hours: <b>{int(d.totals.registerHoursBurstAware)}</b> burst-aware against <b>{int(d.totals.registerHoursSipp)}</b> steady-state. {d.stands.some((s) => s.capped) && <>Stands marked ▲ need more than the {d.params.maxRegistersStand} points of sale we assume they have at some point tonight: open a portable or pre-pour there.</>}</p>
              <div className="op-heat-wrap">
                <table className="op-heat">
                  <thead>
                    <tr><th>Stand</th><th className="r">Tx</th>{d.intervals.map((t, i) => <th key={i} className={phaseAt(d, i)}>{i % 2 === 0 ? t : ""}</th>)}<th className="r">Walk away</th></tr>
                    <tr className="op-phase"><th /><th />{d.intervals.map((_, i) => <th key={i} className={phaseAt(d, i)} title={phaseName(d, i)} />)}<th /></tr>
                  </thead>
                  <tbody>
                    {d.stands.map((s) => {
                      const row = view === "burst" ? s.registers : s.sipp;
                      return (
                        <tr key={s.id} onClick={() => { setStandId(s.id); if (s.prep) setTab("prep"); }} className={s.prep ? "op-click" : ""}>
                          <td><b>{s.name}</b>{s.capped > 0 && <span className="op-cap" title="Needs more points of sale than assumed"> ▲</span>}<span className="op-sub">{LEVEL[s.level] ?? s.level} · {s.category}</span></td>
                          <td className="r">{int(s.demandTx)}</td>
                          {row.map((c, i) => <td key={i} className="op-cell" style={{ background: `color-mix(in srgb, var(--accent) ${Math.min(100, c * 11)}%, transparent)`, color: c >= 6 ? "var(--bg)" : "var(--fg)" }}>{c || ""}</td>)}
                          <td className="r">{pct(s.abandonShare, 1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="op-grid">
                <div>
                  <h3>Shifts</h3>
                  <p className="op-muted">Solved per stand as a covering integer program (HiGHS): {d.solver.programs} programs, {int(d.solver.variables)} variables, {Math.round(d.solver.ms)} ms. Shifts of {d.params.shiftLengths.join(", ")} hours start on the 15-minute grid, with {d.params.setupMin} minutes of set-up before the first fans arrive. Washington law gives a paid 10-minute rest per 4 hours, so 4–5 hour shifts need one rest break.</p>
                  <ShiftSummary d={d} />
                </div>
                <div>
                  <h3>Volunteer groups or staff</h3>
                  <p className="op-muted">Nonprofit groups typically earn the greater of about 10% of stand sales or a per-volunteer minimum ($170 per volunteer per event at Lumen Field). Group size is the stand&apos;s peak registers plus two in the back.</p>
                  <VolunteerTable d={d} />
                </div>
              </div>
            </section>
          )}

          {tab === "lock" && <LockView d={d} />}

          {tab === "prep" && (
            <section className="op-card">
              <div className="op-row">
                <div>
                  <h2>Prep waves and call-downs</h2>
                  <p className="op-muted">Cook ahead only what sells within one hold window ({20} minutes, a quality rule), then cook to order. Call the commissary runner when stock falls to the call-down level, which covers a 15-minute run at the wave&apos;s peak rate 95% of the time.</p>
                </div>
                <label className="op-select">
                  <span>Food stand</span>
                  <select value={standId} onChange={(e) => setStandId(e.target.value)}>
                    {d.stands.filter((s) => s.prep).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </div>
              {stand?.prep && (
                <>
                  <div className="op-table-wrap">
                    <table className="op-table">
                      <thead><tr><th>Wave</th><th>Ready by</th><th className="r">Expected sales</th><th className="r">Cook ahead</th><th className="r">Cook to order</th><th className="r">Expected waste</th><th className="r">Call runner at</th></tr></thead>
                      <tbody>
                        {stand.prep.map((w) => (
                          <tr key={w.phase}><td><b>{w.phase}</b></td><td>{w.at}</td><td className="r">{int(w.demand)}</td><td className="r">{w.readyAtStart ? int(w.readyAtStart) : "–"}</td><td className="r">{int(w.cookToOrderAfter)}</td><td className="r">{w.expectedWasteUnits >= 0.5 ? int(w.expectedWasteUnits) : "–"}</td><td className="r">{int(w.callDownAt)} left</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="op-foot">Hero item: {stand.hero ?? "–"}. Food held hot at 135°F or above has no legal time limit; food out of temperature control must be used or discarded within 4 hours (WAC 246-215-03530, FDA Food Code 3-501.19). Leftovers still under temperature control can go to food rescue.</p>
                  <button className="op-btn" onClick={() => window.print()}>Print stand sheet</button>
                  <StandSheet d={d} s={stand} />
                </>
              )}
            </section>
          )}

          {tab === "merch" && <MerchView m={d.merch} />}
          {tab === "crowd" && <CrowdView c={d.crowd} />}

          {tab === "forecast" && (
            <section className="op-card">
              <h2>Update the forecast from your own sales</h2>
              <p className="op-muted">Paste a POS export, one row per stand per past event. Each row is weighted by how similar that night was to this one (same kind of event, genre, weekend or weekday, how recent), and the forecast moves from the model toward your history with Gamma–Poisson shrinkage, so one odd night cannot swing it. Nothing you paste is stored.</p>
              <textarea className="op-csv" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE} rows={6} spellCheck={false} />
              <div className="op-row" style={{ marginTop: 8 }}>
                <span className="op-sub">Columns: date, kind (game/concert), genre ({[...new Set(events.map((e) => e.genre))].join(", ")}), start, attendance, key (stand id), units, label. {d.history.rows ? `${d.history.rows} rows used.` : "No history loaded: forecasts equal the model."}{d.history.errors.length ? ` ${d.history.errors.length} rows skipped.` : ""}</span>
                <button className="op-btn" onClick={() => load(csv)} disabled={!csv.trim() || loading}>Update forecasts</button>
              </div>
              <div className="op-table-wrap">
                <table className="op-table">
                  <thead><tr><th>Stand</th><th className="r">Model</th><th className="r">Forecast</th><th className="r">80% range</th><th className="r">From your data</th><th>Closest past nights</th></tr></thead>
                  <tbody>
                    {d.forecasts.map((f) => {
                      const s = d.stands.find((x) => x.id === f.key);
                      return (
                        <tr key={f.key}><td><b>{s?.name}</b><span className="op-sub">{f.key}</span></td><td className="r">{int(f.priorMean)}</td><td className="r"><b>{int(f.mean)}</b></td><td className="r">{int(f.interval80[0])}–{int(f.interval80[1])}</td><td className="r">{pct(f.dataWeight)}</td><td className="op-sub">{f.analogs.slice(0, 2).map((a) => `${a.label} (w ${a.weight.toFixed(2)})`).join(", ") || "–"}</td></tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === "method" && <Methods d={d} />}
        </>
      )}
      {loading && d && <div className="op-loading">Updating…</div>}
    </main>
  );
}

function phaseAt(d: Ops, i: number) {
  const startMin = d.phases[0].from + i * 15;
  const p = d.phases.find((x) => startMin >= x.from && startMin < x.to);
  return p ? `op-ph-${p.kind}` : "";
}
function phaseName(d: Ops, i: number) {
  const startMin = d.phases[0].from + i * 15;
  return d.phases.find((x) => startMin >= x.from && startMin < x.to)?.name ?? "";
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "ok" | "warn" }) {
  return <div className={`op-stat ${tone ? `op-${tone}` : ""}`}><span>{label}</span><b>{value}</b><small>{note}</small></div>;
}
function Tag({ s }: { s: Src }) {
  return <span className={`op-tag op-${s.status}`} title={s.source}>{s.status}</span>;
}

function ShiftSummary({ d }: { d: Ops }) {
  const byStart = new Map<string, number>();
  for (const s of d.shifts) byStart.set(`${s.start}–${s.end} (${s.hours} h)`, (byStart.get(`${s.start}–${s.end} (${s.hours} h)`) ?? 0) + s.count);
  const rows = [...byStart.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <table className="op-table">
      <thead><tr><th>Shift</th><th className="r">Staff</th></tr></thead>
      <tbody>{rows.map(([k, n]) => <tr key={k}><td>{k}</td><td className="r">{n}</td></tr>)}</tbody>
    </table>
  );
}

function VolunteerTable({ d }: { d: Ops }) {
  const w = d.params.hourlyWage * d.params.loadFactor;
  const staffCost = (id: string) => d.shifts.filter((s) => s.standId === id).reduce((t, s) => t + s.count * s.hours * w, 0);
  const rows = d.volunteer.map((v) => ({ ...v, name: d.stands.find((s) => s.id === v.id)?.name ?? v.id, staff: staffCost(v.id) })).filter((r) => r.staff > 0).sort((a, b) => b.staff - a.staff).slice(0, 10);
  return (
    <table className="op-table">
      <thead><tr><th>Stand</th><th className="r">Group</th><th className="r">Group cost</th><th className="r">Staff cost</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td className="r">{r.group}</td><td className="r">{usd(r.cost)}</td><td className="r">{usd(r.staff)}</td></tr>)}</tbody>
    </table>
  );
}

function LockView({ d }: { d: Ops }) {
  const s = d.seattle;
  const max = Math.max(...s.curve.map((c) => c.expected));
  const min = Math.min(...s.curve.map((c) => c.expected));
  const W = 560, H = 180, pad = 28;
  const x = (q: number) => pad + q * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / Math.max(max - min, 1)) * (H - 2 * pad);
  const path = s.curve.map((c, i) => `${i ? "L" : "M"}${x(c.q).toFixed(1)},${y(c.expected).toFixed(1)}`).join(" ");
  return (
    <section className="op-card">
      <h2>Seattle&apos;s 14-day schedule lock</h2>
      <p className="op-muted">Seattle&apos;s Secure Scheduling Ordinance makes large food-service employers post schedules 14 days ahead. After that, adding hours costs an extra hour of pay per change and cutting hours costs half pay for the hours not worked. A Climate Pledge Arena concessions provider paid $353,280 to 685 workers in 2025, partly over schedule changes. The city says a cancelled game is no excuse: “{s.rules.cancelledGame}”</p>
      <div className="op-grid">
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="op-chart" role="img" aria-label="Expected labour cost by the percentile of the forecast posted 14 days out">
            <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="var(--line)" />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
            <circle cx={x(s.optimal.q)} cy={y(s.optimal.expected)} r="5" fill="var(--hot)" />
            <circle cx={x(0.5)} cy={y(s.postAtForecast.expected)} r="4" fill="var(--fg-3)" />
            <text x={x(s.optimal.q) + 8} y={y(s.optimal.expected) - 8} fontSize="12" fill="var(--fg)">best: {Math.round(s.optimal.q * 100)}th pct</text>
            <text x={pad} y={H - 8} fontSize="11" fill="var(--fg-3)">post low</text>
            <text x={W - pad} y={H - 8} fontSize="11" fill="var(--fg-3)" textAnchor="end">post high</text>
          </svg>
          <p className="op-foot">Expected cost of the night (wages, predictability pay, sales lost when a short-notice shift goes unfilled) against how high the posted schedule sits in the 14-day forecast&apos;s range.</p>
        </div>
        <table className="op-table">
          <tbody>
            <tr><td>Hours the forecast says tonight needs</td><td className="r">{int(s.forecastHours)}</td></tr>
            <tr><td>Post at the forecast</td><td className="r">{usd(s.postAtForecast.expected)}<span className="op-sub">{usd(s.postAtForecast.predictabilityPay)} predictability pay · {usd(s.postAtForecast.lostMargin ?? 0)} lost sales</span></td></tr>
            <tr><td><b>Post at the {Math.round(s.optimal.q * 100)}th percentile ({int(s.optimal.scheduled ?? 0)} h)</b></td><td className="r"><b>{usd(s.optimal.expected)}</b><span className="op-sub">{usd(s.optimal.predictabilityPay)} predictability pay · {usd(s.optimal.lostMargin ?? 0)} lost sales</span></td></tr>
            <tr><td>Saving per event</td><td className="r"><b>{usd(s.savingVsForecast)}</b></td></tr>
            <tr><td>Worth of a sharper 14-day forecast<span className="op-sub">error {pct(d.params.cv14)} → {pct(s.sharperForecast.cv)}, e.g. Qloo crowd signal plus your sales history</span></td><td className="r"><b>{usd(s.sharperForecast.saving)}</b><span className="op-sub">per event</span></td></tr>
          </tbody>
        </table>
      </div>
      <p className="op-foot">Assumptions, all adjustable in code: forecast error {pct(d.params.cv14)} at 14 days; {pct(d.params.addFillRate)} of short-notice shifts get filled; an unstaffed hour loses {pct(d.params.lostIfShort)} of its sales outright; wage ${d.params.hourlyWage.toFixed(2)} (Seattle 2026 minimum) × {d.params.loadFactor} loaded. Rules: <a href={s.rules.sources.rules}>SHRR ch. 120</a>, <a href={s.rules.sources.qa}>OLS Q&amp;A §I.38</a>, <a href={s.rules.sources.wage}>2026 minimum wage</a>. Right-to-rest (time-and-a-half inside 10 hours) applies to back-to-back nights such as Kacey Musgraves on Oct 26 and 27.</p>
    </section>
  );
}

function MerchView({ m }: { m: Merch }) {
  const items = [...new Set(m.stock.map((s) => s.item))];
  const sizes = Object.keys(m.sizeShares);
  return (
    <section className="op-card">
      <h2>Merch: what to count in, and how many registers</h2>
      <p className="op-muted">At this arena the venue sells concert merch for the tour, which owns the stock. So the plan is a recommended count-in by item and size to agree with the tour&apos;s merch rep, plus booths and registers. Leftover stock carries to the next stop, so it is stocked deeper than food.</p>
      <div className="op-strip">
        <Stat label="Fans who buy" value={pct(m.priors.buyRate.value)} note={m.priors.buyRate.source} />
        <Stat label="Spend per head" value={usd(m.priors.perHead.value)} note={m.priors.perHead.source} />
        <Stat label="Transactions" value={int(m.txns)} note={`${m.itemsPerTxn.toFixed(1)} items each · ${(m.serviceMin * 60).toFixed(0)} s per sale`} />
        <Stat label="Registers before the set" value={`${m.registers.neededBeforeSet} needed`} note={`${m.registers.open} planned (${m.params.booths} booths × ${m.params.registersPerBooth}) · ${pct(m.registers.before.walkAway)} walk away with ${m.registers.open}`} tone={m.registers.neededBeforeSet > m.registers.open ? "warn" : "ok"} />
        <Stat label="Before doors (plaza truck)" value={`${m.early.needed} registers`} note={`for the ${pct(m.early.share)} who shop early · ${m.early.registers} planned, ${pct(m.early.walkAway)} walk away`} tone={m.early.needed > m.early.registers ? "warn" : "ok"} />
        <Stat label="Sales lost to lines" value={usd(m.lostSales)} note={`fans give up faster once the headliner starts (${pct(m.registers.during.walkAway)} during the set)`} tone={m.lostSales > m.gross * 0.05 ? "warn" : undefined} />
      </div>
      <div className="op-table-wrap">
        <table className="op-table">
          <thead><tr><th>Item</th>{sizes.map((s) => <th key={s} className="r">{s}</th>)}<th className="r">Count in</th><th className="r">Sell-through</th></tr></thead>
          <tbody>
            {items.map((it) => {
              const rows = m.stock.filter((s) => s.item === it);
              const q = rows.reduce((t, r) => t + r.quantity, 0), sold = rows.reduce((t, r) => t + r.expectedSales, 0);
              return (
                <tr key={it}>
                  <td><b>{rows[0].label}</b><span className="op-sub">${rows[0].price}</span></td>
                  {sizes.map((sz) => { const r = rows.find((x) => x.size === sz); return <td key={sz} className="r">{r ? int(r.quantity) : rows[0].size ? "–" : ""}</td>; })}
                  <td className="r"><b>{int(q)}</b></td><td className="r">{pct(sold / Math.max(q, 1))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="op-foot">Size curve: unisex prior from 15,000+ band-shirt orders (two-thirds M and L) blended with a one-size-down women&apos;s curve at a {pct(m.femaleShare.value)} female share{m.femaleShare.fromQloo ? " from Qloo's audience data" : " (assumption until Qloo's audience data is live)"}. It updates from sales by size after each show (Dirichlet). When a size sells out about a quarter of those fans take the next size (Akchen &amp; Caro, M&amp;SOM). {m.genre === "kpop" ? "K-pop bundle: light sticks are 10–20% of units and 80% of light-stick buyers add batteries (atVenu). Run a separate light-stick and batteries express line." : ""} Pre-order is assumed at {pct(m.params.preorderShare)} of buyers; staff the pre-order line too, which is where fans gave up at Power Trip.</p>
    </section>
  );
}

function CrowdView({ c }: { c: Crowd }) {
  if (c.status === "pending") {
    return (
      <section className="op-card">
        <h2>Crowd taste from Qloo</h2>
        <p className="op-banner">Pending: {c.reason}. Nothing on this page is invented in its place. The plan runs on genre priors until the first live call.</p>
        <p className="op-muted">With a key, each event makes these calls (about 10, cached), and every number that comes back is shown with the call it came from:</p>
        <ol className="op-list">
          <li>Resolve the act (or home and visiting teams) with <code>/search</code>.</li>
          <li>Age and gender skew of the crowd: <code>/v2/insights</code> <code>filter.type=urn:demographics</code>. This sets the merch size curve and the non-alcoholic share.</li>
          <li>Rank the arena&apos;s own pour list (Coors Light, Hop Valley, Modelo, Corona, Kraken Rum, Pepsi, Starbucks) for this crowd: <code>filter.type=urn:entity:brand</code> with <code>filter.results.entities</code>.</li>
          <li>Dishes the crowd over-indexes on: <code>filter.type=urn:tag</code>, <code>filter.tag.types=urn:tag:specialty_dish:place</code>.</li>
          <li>Restaurants in the act&apos;s home city this crowd likes, for a themed item in the spirit of the arena&apos;s award-winning BodeGAGA program.</li>
          <li>Food and bars within 2 km of the arena this crowd likes, for local pop-up partners.</li>
        </ol>
      </section>
    );
  }
  return (
    <section className="op-card">
      <h2>Crowd taste from Qloo</h2>
      <p className="op-muted">Seeded from {c.anchors.map((a) => `${a.name} (${a.role})`).join(" and ")}. Scores compare items within one call only.</p>
      <div className="op-grid">
        <div>
          <h3>Who is coming</h3>
          {c.demographics.map((x) => (
            <div key={x.anchor} className="op-demo"><b>{x.anchor}</b>{Object.entries(x.age).map(([k, v]) => <span key={k}>{k.replace(/_/g, " ")}: {v > 0 ? "+" : ""}{v.toFixed(2)}</span>)}{Object.entries(x.gender).map(([k, v]) => <span key={k}>{k}: {v > 0 ? "+" : ""}{v.toFixed(2)}</span>)}</div>
          ))}
          <h3>The pour list, ranked for this crowd</h3>
          <ol className="op-list">{c.pour.map((p) => <li key={p.name}>{p.name} <span className="op-sub">{p.category}</span></li>)}</ol>
        </div>
        <div>
          <h3>Themed-night brief</h3>
          {c.homeCity && <p className="op-muted">Places in {c.homeCity.city} (home city from public bios, not Qloo) this crowd likes: {c.homeCity.places.slice(0, 5).map((p) => `${p.name}${p.tags.length ? ` (${p.tags.slice(0, 2).join(", ")})` : ""}`).join("; ") || "none returned"}.</p>}
          <p className="op-muted">Dishes this crowd over-indexes on: {c.dishes.slice(0, 8).map((x) => x.name).join(", ") || "none returned"}.</p>
          <p className="op-muted">Local partners near the arena: {c.nearby.slice(0, 5).map((x) => x.name).join(", ") || "none returned"}.</p>
        </div>
      </div>
      <details className="op-calls"><summary>{c.calls.length} Qloo calls</summary><ul>{c.calls.map((x, i) => <li key={i}><code>{x.endpoint}</code> {x.note} {x.ok ? "" : "(failed)"}</li>)}</ul></details>
    </section>
  );
}

function StandSheet({ d, s }: { d: Ops; s: Stand }) {
  return (
    <div className="op-sheet" aria-hidden>
      <h2>{s.name} · {d.event.title}</h2>
      <p>{d.event.date} · start {d.event.start} · {LEVEL[s.level] ?? s.level} · expected {int(s.demandTx)} purchases</p>
      <table>
        <thead><tr><th>Time</th>{d.intervals.map((t, i) => <th key={i}>{t}</th>)}</tr></thead>
        <tbody><tr><td>Registers open</td>{s.registers.map((c, i) => <td key={i}>{c}</td>)}</tr></tbody>
      </table>
      <table>
        <thead><tr><th>Wave</th><th>Ready by</th><th>Cook ahead</th><th>Then cook to order</th><th>Call runner at</th></tr></thead>
        <tbody>{s.prep?.map((w) => <tr key={w.phase}><td>{w.phase}</td><td>{w.at}</td><td>{w.readyAtStart ? int(w.readyAtStart) : "–"}</td><td>{int(w.cookToOrderAfter)}</td><td>{int(w.callDownAt)} left</td></tr>)}</tbody>
      </table>
      <p>Hot hold at 135°F or above. Out of temperature control: use within 4 hours. Leftovers under temperature control: food rescue.</p>
    </div>
  );
}

function Methods({ d }: { d: Ops }) {
  const rows: [string, string, string][] = [
    ["Registers per interval", "Time-varying Erlang A (M/M/c+M) solved exactly from the Kolmogorov forward equations, queue state carried between 15-minute intervals; checked against an independent solver (400 purchases in 15 minutes, 18 registers: 11% walk away vs 22.6% under steady-state SIPP).", "Garnett, Mandelbaum & Reiman 2002; Green, Kolesar & Whitt 2007"],
    ["Steady-state comparison", "SIPP: Erlang A at each interval's average rate, as workforce tools staff call centres. Square-root staffing shown in tests.", "Halfin & Whitt 1981; Jennings et al. 1996"],
    ["Shifts", "Covering integer program: staff per shift template ≥ registers needed in every interval it covers, minimum loaded wage cost. Exact with HiGHS.", "Dantzig 1954"],
    ["14-day lock", "Two-stage newsvendor in labour hours with Seattle's predictability-pay table as the recourse cost.", "SMC 14.22; SHRR ch. 120; OLS Q&A Aug 2025"],
    ["Demand per stand", "Attendance × spend per head × food share for the crowd's genre × level share, from the arena's own stand list (lib/deep).", "SBJ 'Menu mix' 2019; Live Nation 10-K; AECOM 2026"],
    ["Prep waves", "Newsvendor on what sells within one hold window at each wave; cook to order after. Call-down = demand over the runner's lead time at 95%.", "Winnow; FDA Food Code 3-501.19"],
    ["Your sales", "Analog-event weights (kind, genre, weekend, recency) with conjugate Gamma–Poisson shrinkage toward the model; in-event update for call-downs.", "Green & Armstrong 2007 (structured analogies)"],
    ["Merch", "atVenu genre priors (buy rate, $/head), multi-item newsvendor with carry-over salvage, Dirichlet size curve, Erlang A for registers with faster abandonment during the set.", "atVenu 2023–26; Hadley & Whitin 1963; Akchen & Caro"],
  ];
  return (
    <section className="op-card">
      <h2>Methods and sources</h2>
      <table className="op-table"><thead><tr><th>What</th><th>How</th><th>Source</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td className="op-sub">{r[2]}</td></tr>)}</tbody></table>
      <p className="op-foot">Assumptions are labelled where they appear. Not published anywhere we could find: per-stand sales at this arena, bar pour times (we use {d.params.barServiceSec} s), stadium labour share of sales, measured walk-away rates, merch hall fee here. Research notes: research-v2/ in the project.</p>
    </section>
  );
}

function Style() {
  return (
    <style>{`
.op{max-width:1280px;margin:0 auto;padding:32px 16px 80px;color:var(--fg);font-family:var(--sans);background:var(--bg);min-height:100vh}
.op h1{font-size:clamp(26px,3.4vw,38px);line-height:1.1;letter-spacing:-.02em;margin:6px 0 10px;font-weight:600}
.op h2{font-size:17px;margin:0 0 4px;font-weight:600} .op h3{font-size:14px;margin:16px 0 6px;font-weight:600}
.op-eyebrow{font:500 12px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin:0}
.op-muted{color:var(--fg-2);font-size:14px;line-height:1.5;margin:0 0 8px;max-width:820px}
.op-head{display:flex;gap:24px;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;margin-bottom:24px}
.op-select{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--fg-3);min-width:min(100%,340px)}
.op-select select{font:inherit;font-size:14px;color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:var(--r-ctl);padding:8px 10px;max-width:100%}
.op-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(46%,170px),1fr));gap:12px;margin-bottom:16px}
.op-stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-card);padding:14px 16px;display:flex;flex-direction:column;gap:4px;min-width:0}
.op-stat span{font-size:12px;color:var(--fg-3)} .op-stat b{font-size:21px;font-weight:600;letter-spacing:-.01em} .op-stat small{font-size:12px;color:var(--fg-3);line-height:1.4}
.op-stat.op-warn b{color:var(--warn)} .op-stat.op-ok b{color:var(--ok)}
.op-note{font-size:14px;color:var(--fg-2);margin:0 0 16px;line-height:1.5}
.op-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 16px}
.op-tabs button,.op-seg button,.op-btn{font:inherit;font-size:13px;background:var(--surface-2);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer}
.op-tabs button.on,.op-seg button.on{background:var(--btn);color:var(--btn-fg);border-color:transparent}
.op-btn:disabled{opacity:.5;cursor:default}
.op-seg{display:flex;gap:4px;flex-shrink:0}
.op-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-card);padding:18px;margin-bottom:16px;min-width:0}
.op-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
.op-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px;margin-top:8px}
.op-table-wrap,.op-heat-wrap{overflow-x:auto}
.op-table{width:100%;border-collapse:collapse;font-size:13px}
.op-table th{text-align:left;font-weight:500;color:var(--fg-3);font-size:12px;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.op-table td{padding:9px 10px;border-bottom:1px solid var(--line-2,var(--line));vertical-align:top}
.op .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.op-sub{display:block;font-size:12px;color:var(--fg-3);margin-top:2px;font-weight:400}
.op-heat{border-collapse:separate;border-spacing:2px;font-size:12px;min-width:100%}
.op-heat th{font-weight:500;color:var(--fg-3);font-size:11px;white-space:nowrap;text-align:left;padding:2px 4px}
.op-heat td{padding:3px 6px;white-space:nowrap}
.op-heat td:first-child{min-width:190px}
.op-cell{text-align:center;font-variant-numeric:tabular-nums;border-radius:4px;min-width:24px}
.op-phase th{height:5px;padding:0;border-radius:3px}
.op-phase .op-ph-doors{background:var(--fg-3);opacity:.35} .op-phase .op-ph-break{background:var(--hot)} .op-phase .op-ph-play{background:var(--line)}
.op-click{cursor:pointer} .op-click:hover td:first-child{color:var(--accent)}
.op-cap{color:var(--hot)}
.op-foot{font-size:13px;color:var(--fg-2);line-height:1.5;margin:10px 0}
.op-foot a{color:var(--accent)}
.op-tag{font:500 10px/1 var(--mono);padding:2px 5px;border-radius:4px;background:var(--surface-2);vertical-align:middle}
.op-sourced,.op-derived{background:var(--ok-soft);color:var(--ok)} .op-assumption{background:var(--warn-soft);color:var(--warn)}
.op-banner{background:var(--warn-soft);border:1px solid var(--line);border-radius:var(--r-card);padding:12px 16px;font-size:14px;line-height:1.5;margin:8px 0 12px}
.op-list{margin:0;padding-left:20px;font-size:14px;line-height:1.7}
.op-list code,.op-calls code{font:12px var(--mono);background:var(--surface-2);padding:1px 4px;border-radius:4px}
.op-csv{width:100%;font:12px/1.5 var(--mono);color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:var(--r-ctl);padding:10px;box-sizing:border-box}
.op-chart{width:100%;height:auto;display:block}
.op-demo{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:13px;margin-bottom:6px} .op-demo span{color:var(--fg-2)}
.op-loading{position:fixed;bottom:16px;right:16px;background:var(--fg);color:var(--bg);padding:8px 12px;border-radius:var(--r-ctl);font-size:13px}
.op-err{color:var(--bad,var(--hot))}
.op-sheet{display:none}
@media print{
  body *{visibility:hidden}
  .op-sheet,.op-sheet *{visibility:visible}
  .op-sheet{display:block;position:absolute;inset:0;padding:24px;color:#000;background:#fff;font:12px/1.4 system-ui}
  .op-sheet table{border-collapse:collapse;margin:10px 0;width:100%} .op-sheet td,.op-sheet th{border:1px solid #999;padding:4px;text-align:center}
}
`}</style>
  );
}
