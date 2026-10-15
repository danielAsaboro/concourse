"use client";
// Event-night planner on real venue data. Self-contained on purpose: it uses the
// shared design tokens from globals.css but no shared components, so the UI
// thread can fold it into the dashboard later without merge conflicts.
import { useEffect, useMemo, useState } from "react";

type Ev = { id: string; title: string; date: string; start: string; kind: string; headliner: string; source: string };
type Slot = { id: string; label: string; level: string; kind: string; servers: number; statusQuo: string | null; capabilities: string[]; assumptions: string[]; source: string };
type Concept = { id: string; name: string; needs: string[]; hero: string; from: string | null };
type Param = { value: number; low: number; high: number; unit: string; status: string; source: string };
type Meta = { venue: { name: string; city: string; concessionaire: string; capacitySource: string; capacity: Record<string, number> }; retrieved: string; events: Ev[]; cancelled: Ev[]; slots: Slot[]; concepts: Concept[]; params: Record<string, Param> };
type Econ = { demandTx: number; demandInterval: [number, number]; servedTx: number; lostTx: number; worstWaitMin: number; par: { item: string; quantity: number; expectedLeftover: number }; revenue: number; contribution: number; parts: { margin: number; waste: number; changeover: number } };
type Decision = { slot: Slot; concept: Concept; economics: Econ; z: number | null; runnerUp: { concept: Concept; contribution: number } | null; tiedWith: string[] };
type Plan = { decisions: Decision[]; total: number; solver: { status: string; gap: number }; usedTaste: boolean };
type Analysis = {
  error?: string;
  event: Ev; attendance: number; fnbPerCap: number; plan: Plan;
  ablation: { plan: Plan; slotsDifferent: number; valueOfTaste: number | null; tiedSlotsWithoutTaste: number };
  baselines: { id: string; label: string; status: string; note: string; assignment?: Record<string, string>; total?: number; slotsDifferent?: number }[];
  sensitivity: { param: string; status: string; low: number; high: number; totalLow: number; totalHigh: number; planChangesLow: number; planChangesHigh: number }[];
  breakEvens: { slotId: string; incumbent: string; challenger: string | null; zNeeded: number | null }[];
  par: { standId: string; stand: string; level: string; item: string; demandTx: number; servedTx: number; worstWaitMin: number; quantity: number; expectedLeftover: number }[];
  taste: { status: "pending" | "live"; reason?: string; detail?: string; calls: { endpoint: string; at: string; ok: boolean; note: string }[]; localScouting?: { name: string; affinity: number; tags: string[] }[]; unresolved?: string[] };
  pinned: Record<string, string>;
};

const usd = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : "–");
const int = (n: number) => Math.round(n).toLocaleString("en-US");
const LEVEL: Record<string, string> = { main: "Main concourse", upper: "Upper concourse", club: "Club", both: "Main + upper" };
const fmtDate = (d: string, t: string) => new Date(`${d}T${t}:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + ` · ${t}`;

export default function Night() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [eventId, setEventId] = useState<string>("");
  const [pins, setPins] = useState<Record<string, string>>({});
  const [a, setA] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/night").then((r) => r.json()).then((m: Meta) => {
      setMeta(m);
      const fromHash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      setEventId(m.events.some((e) => e.id === fromHash) ? fromHash : m.events[0]?.id ?? "");
    }).catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true); setErr(null);
    if (typeof window !== "undefined") history.replaceState(null, "", `#${eventId}`);
    const pin = Object.entries(pins).map(([s, c]) => `${s}:${c}`).join(",");
    fetch(`/api/night?event=${encodeURIComponent(eventId)}${pin ? `&pin=${encodeURIComponent(pin)}` : ""}`)
      .then((r) => r.json()).then((x: Analysis) => { if (x.error) setErr(x.error); else setA(x); })
      .catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }, [eventId, pins]);

  const cname = useMemo(() => new Map((meta?.concepts ?? []).map((c) => [c.id, c.name])), [meta]);
  const n = (id: string | null | undefined) => (id ? cname.get(id) ?? id : "–");

  if (err && !a) return <main className="nt"><Style /><p className="nt-err">Could not load the plan: {err}</p></main>;
  if (!meta) return <main className="nt"><Style /><p className="nt-muted">Loading the venue…</p></main>;

  const sensMax = a ? Math.max(...a.sensitivity.map((s) => Math.max(s.totalLow, s.totalHigh)), 1) : 1;

  return (
    <main className="nt">
      <Style />
      <header className="nt-head">
        <div>
          <p className="nt-eyebrow">Event night · {meta.venue.name}, {meta.venue.city}</p>
          <h1>What to run where tonight, and how much to prep</h1>
          <p className="nt-muted">
            Stands, menus and events from the arena&apos;s own dining guide, maps and calendar (retrieved {meta.retrieved}). Food and drink by {meta.venue.concessionaire}.
            Fixed restaurants stay put; the plan covers the rotating stands, portable carts and par levels.
          </p>
        </div>
        <label className="nt-select">
          <span>Event</span>
          <select value={eventId} onChange={(e) => { setPins({}); setEventId(e.target.value); }}>
            {meta.events.map((e) => <option key={e.id} value={e.id}>{fmtDate(e.date, e.start)} · {e.title}</option>)}
          </select>
        </label>
      </header>

      {a && (
        <>
          <section className="nt-strip">
            <Stat label="Expected attendance" value={int(a.attendance)} note={`capacity × ${meta.params.fill.value} fill (assumption)`} />
            <Stat label="F&B spend per head" value={usd(a.fnbPerCap)} note="assumption, range in sensitivity" />
            <Stat label="Flexible locations, expected contribution" value={usd(a.plan.total)} note="margin − waste − changeover" />
            <Stat label="Solver" value={a.plan.solver.status} note={`HiGHS, gap ${(a.plan.solver.gap * 100).toFixed(2)}%`} />
            <Stat label="Qloo taste signal" value={a.taste.status === "live" ? "Live" : "Pending"} note={a.taste.status === "live" ? `${a.taste.calls.length} calls tonight` : "no key on this deployment"} tone={a.taste.status === "live" ? "ok" : "warn"} />
          </section>

          {a.taste.status !== "live" && (
            <p className="nt-banner">
              No Qloo key is configured here, so tonight&apos;s plan runs without a taste signal. That makes it the same as the without-Qloo ablation below.
              {a.ablation.tiedSlotsWithoutTaste > 0 && <> In {a.ablation.tiedSlotsWithoutTaste} of {a.plan.decisions.length} locations the model cannot tell the top concepts apart without it.</>}
            </p>
          )}

          <section className="nt-card">
            <div className="nt-card-head">
              <h2>Flexible locations</h2>
              <p className="nt-muted">Each pick maximises expected contribution given tonight&apos;s crowd size, purchase timing, registers and waste. Pin a concept to override; the solver re-plans the rest.</p>
            </div>
            <div className="nt-table-wrap">
              <table className="nt-table">
                <thead><tr><th>Location</th><th>Tonight</th><th className="r">Demand (80% range)</th><th className="r">Served</th><th className="r">Worst wait</th><th className="r">Par</th><th className="r">Contribution</th><th>Why</th></tr></thead>
                <tbody>
                  {a.plan.decisions.map((d) => {
                    const allowed = meta.concepts.filter((c) => c.needs.every((x) => d.slot.capabilities.includes(x)));
                    return (
                      <tr key={d.slot.id}>
                        <td><b>{d.slot.label}</b><span className="nt-sub">{LEVEL[d.slot.level]} · {d.slot.kind === "cart" ? "cart" : "rotating stand"} · {d.slot.servers} registers</span></td>
                        <td>
                          <select className="nt-pin" value={pins[d.slot.id] ?? d.concept.id} onChange={(e) => setPins({ ...pins, [d.slot.id]: e.target.value })}>
                            {allowed.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <span className="nt-sub">{d.concept.hero}{pins[d.slot.id] ? " · pinned" : ""}</span>
                        </td>
                        <td className="r">{int(d.economics.demandTx)}<span className="nt-sub">{int(d.economics.demandInterval[0])}–{int(d.economics.demandInterval[1])}</span></td>
                        <td className="r">{int(d.economics.servedTx)}<span className="nt-sub">{d.economics.lostTx >= 1 ? `${int(d.economics.lostTx)} lost` : "none lost"}</span></td>
                        <td className="r">{Number.isFinite(d.economics.worstWaitMin) ? `${d.economics.worstWaitMin.toFixed(1)} min` : "overloaded"}</td>
                        <td className="r">{int(d.economics.par.quantity)}<span className="nt-sub">~{int(d.economics.par.expectedLeftover)} left</span></td>
                        <td className="r">{usd(d.economics.contribution)}</td>
                        <td className="nt-why">
                          {d.slot.statusQuo === d.concept.id ? "Already runs here, so no changeover cost. " : ""}
                          {d.tiedWith.length > 0
                            ? `Tied with ${d.tiedWith.length} other concept${d.tiedWith.length > 1 ? "s" : ""} (${d.tiedWith.slice(0, 2).map(n).join(", ")}${d.tiedWith.length > 2 ? "…" : ""}); a taste signal would break the tie.`
                            : d.runnerUp ? `Beats ${d.runnerUp.concept.name} by ${usd(d.economics.contribution - d.runnerUp.contribution)}.` : ""}
                          {d.z !== null ? ` Qloo affinity ${d.z >= 0 ? "+" : ""}${d.z.toFixed(1)} SD vs tonight's other candidates.` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="nt-grid">
            <section className="nt-card">
              <div className="nt-card-head">
                <h2>With and without Qloo</h2>
                <p className="nt-muted">Every alternative is scored by the same model, so the gaps come from the choices, not the scoring.</p>
              </div>
              <table className="nt-table">
                <thead><tr><th>Plan</th><th className="r">Expected</th><th className="r">Locations different</th></tr></thead>
                <tbody>
                  <tr><td><b>Concourse{a.plan.usedTaste ? " (with Qloo)" : " (no taste signal yet)"}</b></td><td className="r">{usd(a.plan.total)}</td><td className="r">–</td></tr>
                  <tr><td>Without Qloo (ablation)<span className="nt-sub">same model, taste effect set to zero</span></td><td className="r">{usd(a.ablation.plan.total)}</td><td className="r">{a.ablation.slotsDifferent}</td></tr>
                  {a.baselines.map((b) => (
                    <tr key={b.id}>
                      <td>{b.label}<span className="nt-sub">{b.note}</span></td>
                      <td className="r">{b.status === "scored" ? usd(b.total ?? NaN) : b.status === "pending" ? "pending" : "n/a"}</td>
                      <td className="r">{b.status === "scored" ? b.slotsDifferent : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="nt-foot">
                {a.ablation.valueOfTaste !== null
                  ? `Under the model, the Qloo signal is worth ${usd(a.ablation.valueOfTaste)} tonight across the flexible locations. The model assumes taste moves demand, so the outside checks are what show whether it does.`
                  : "The value of the taste signal is reported once a live Qloo call has run. Until then the plan equals the ablation."}
              </p>
            </section>

            <section className="nt-card">
              <div className="nt-card-head">
                <h2>What Qloo would have to show</h2>
                <p className="nt-muted">How far above the current pick (in standard deviations of tonight&apos;s affinity) the best challenger must score before the plan changes.</p>
              </div>
              <table className="nt-table">
                <thead><tr><th>Location</th><th>Current pick</th><th>Best challenger</th><th className="r">Gap needed</th></tr></thead>
                <tbody>
                  {a.breakEvens.map((b) => {
                    const slot = meta.slots.find((s) => s.id === b.slotId);
                    return (
                      <tr key={b.slotId}>
                        <td>{slot?.label.replace(/\s*\(.*\)/, "")}</td>
                        <td>{n(b.incumbent)}</td>
                        <td>{n(b.challenger)}</td>
                        <td className="r">{b.zNeeded === null ? "> 3 SD" : b.zNeeded <= 0.005 ? "any edge" : `+${b.zNeeded.toFixed(2)} SD`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </div>

          <section className="nt-card">
            <div className="nt-card-head">
              <h2>Which assumptions matter</h2>
              <p className="nt-muted">Each assumption moved to the low and high end of its range, everything else held. Bars show expected contribution; the count is locations whose pick changes (ties ignored).</p>
            </div>
            <div className="nt-sens">
              {a.sensitivity.slice(0, 10).map((s) => {
                const p = meta.params[s.param];
                const lo = Math.min(s.totalLow, s.totalHigh), hi = Math.max(s.totalLow, s.totalHigh);
                return (
                  <div className="nt-sens-row" key={s.param}>
                    <div className="nt-sens-label"><b>{label(s.param)}</b><span className="nt-sub">{fmtParam(s.low, p)} to {fmtParam(s.high, p)} · {s.status}</span></div>
                    <div className="nt-sens-bar"><span style={{ left: `${(lo / sensMax) * 100}%`, width: `${Math.max(1, ((hi - lo) / sensMax) * 100)}%` }} /><i style={{ left: `${(a.plan.total / sensMax) * 100}%` }} /></div>
                    <div className="nt-sens-val">{usd(lo)}–{usd(hi)}<span className="nt-sub">{s.planChangesLow + s.planChangesHigh === 0 ? "plan holds" : `${Math.max(s.planChangesLow, s.planChangesHigh)} location${Math.max(s.planChangesLow, s.planChangesHigh) > 1 ? "s" : ""} change`}</span></div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="nt-card">
            <div className="nt-card-head nt-row">
              <div>
                <h2>Par sheet, fixed food stands</h2>
                <p className="nt-muted">Prep quantity for each stand&apos;s signature item: the newsvendor quantity for tonight&apos;s expected demand, with leftovers costed at zero salvage. Stands on the same level get the same volume until stand-level sales data or a per-stand taste signal tells them apart.</p>
              </div>
              <button className="nt-btn" onClick={() => window.print()}>Print</button>
            </div>
            <div className="nt-table-wrap">
              <table className="nt-table">
                <thead><tr><th>Stand</th><th>Level</th><th>Item</th><th className="r">Expected orders</th><th className="r">Worst wait</th><th className="r">Prep</th><th className="r">Likely left</th></tr></thead>
                <tbody>
                  {a.par.map((p) => (
                    <tr key={p.standId}>
                      <td><b>{p.stand}</b></td><td>{LEVEL[p.level]}</td><td>{p.item}</td>
                      <td className="r">{int(p.servedTx)}</td>
                      <td className="r">{Number.isFinite(p.worstWaitMin) ? `${p.worstWaitMin.toFixed(1)} min` : "overloaded"}</td>
                      <td className="r"><b>{int(p.quantity)}</b></td>
                      <td className="r">{int(p.expectedLeftover)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {a.taste.status === "live" && (a.taste.localScouting?.length ?? 0) > 0 && (
            <section className="nt-card">
              <div className="nt-card-head"><h2>Local places tonight&apos;s crowd likes</h2><p className="nt-muted">Qloo places near the arena, for scouting future guest stands. Not contracted, so not placed.</p></div>
              <ul className="nt-list">{a.taste.localScouting!.map((l) => <li key={l.name}><b>{l.name}</b> <span className="nt-sub">{l.tags.join(", ")}</span></li>)}</ul>
            </section>
          )}

          <section className="nt-card">
            <div className="nt-card-head"><h2>Every number and where it comes from</h2><p className="nt-muted">Sourced values cite a publication. Assumptions are judgement calls and are swept above.</p></div>
            <table className="nt-table">
              <thead><tr><th>Input</th><th className="r">Value</th><th>Range</th><th>Status</th><th>Source</th></tr></thead>
              <tbody>
                {Object.entries(meta.params).map(([k, p]) => (
                  <tr key={k}><td>{label(k)}</td><td className="r">{fmtParam(p.value, p)}</td><td>{fmtParam(p.low, p)} to {fmtParam(p.high, p)}</td><td><span className={`nt-tag nt-${p.status}`}>{p.status}</span></td><td className="nt-why">{p.source}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="nt-foot">Venue capacity from <a href={meta.venue.capacitySource}>the arena FAQ</a>. Event: <a href={a.event.source}>{a.event.title}</a>. Location assumptions: {meta.slots.map((s) => `${s.label}: ${s.assumptions.join(", ")}`).join("; ")}.</p>
          </section>
          {loading && <p className="nt-loading">Re-planning…</p>}
        </>
      )}
    </main>
  );
}

const LABELS: Record<string, string> = {
  fnbPerCapGame: "F&B per head, Kraken games", fnbPerCapConcert: "F&B per head, concerts", foodShare: "Food share of F&B", merchPerCapConcert: "Merch per head, concerts", merchPerCapGame: "Merch per head, games",
  avgTicket: "Average transaction", itemsPerTicket: "Items per transaction", shareBeforeStart: "Share bought before the start", shareIntermission: "Share bought at the break", serviceMin: "Service time per order",
  patienceMin: "Longest fans will wait", doorsWindowMin: "Doors-to-start window", intermissionMin: "Intermission length", changeoverMin: "Concert changeover", foodCostPct: "Food cost", perishableSalvage: "Salvage, prepared food",
  packagedSalvage: "Salvage, packaged", demandDispersion: "Night-to-night variability (k)", fill: "Share of seats filled", levelShareMain: "Fans on the main concourse", levelShareClub: "Fans in club areas", cartWeight: "Pull of a cart vs a stand",
  incremental: "Share of flex sales that is new spend", changeoverCost: "Cost to change a concept", tasteBeta: "Demand shift per SD of Qloo affinity",
};
const label = (k: string) => LABELS[k] ?? k;
function fmtParam(x: number, p?: Param) {
  if (!p) return String(x);
  if (p.unit.startsWith("USD")) return `$${x % 1 ? x.toFixed(2) : x}`;
  if (p.unit.startsWith("share") || p.unit.startsWith("COGS")) return `${Math.round(x * 100)}%`;
  if (p.unit === "min/transaction") return `${Math.round(x * 60)} s`;
  if (p.unit.startsWith("min")) return `${Math.round(x)} min`;
  return `${+x.toFixed(2)}`;
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "ok" | "warn" }) {
  return <div className={`nt-stat ${tone ? `nt-${tone}` : ""}`}><span>{label}</span><b>{value}</b><small>{note}</small></div>;
}

function Style() {
  return (
    <style>{`
.nt{max-width:1240px;margin:0 auto;padding:32px 16px 80px;color:var(--fg);font-family:var(--sans);background:var(--bg);min-height:100vh}
.nt h1{font-size:clamp(26px,3.4vw,38px);line-height:1.1;letter-spacing:-.02em;margin:6px 0 10px;font-weight:600}
.nt h2{font-size:17px;margin:0 0 4px;font-weight:600}
.nt-eyebrow{font:500 12px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin:0}
.nt-muted{color:var(--fg-2);font-size:14px;line-height:1.5;margin:0;max-width:760px}
.nt-head{display:flex;gap:24px;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;margin-bottom:24px}
.nt-select{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--fg-3);min-width:min(100%,340px)}
.nt-select select,.nt-pin{font:inherit;font-size:14px;color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:var(--r-ctl);padding:8px 10px;max-width:100%}
.nt-pin{font-size:13px;padding:5px 8px;width:100%}
.nt-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(46%,180px),1fr));gap:12px;margin-bottom:16px}
.nt-stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-card);padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.nt-stat span{font-size:12px;color:var(--fg-3)} .nt-stat b{font-size:22px;font-weight:600;letter-spacing:-.01em} .nt-stat small{font-size:12px;color:var(--fg-3)}
.nt-stat.nt-warn b{color:var(--warn)} .nt-stat.nt-ok b{color:var(--ok)}
.nt-banner{background:var(--warn-soft);border:1px solid var(--line);border-radius:var(--r-card);padding:12px 16px;font-size:14px;line-height:1.5;margin:0 0 16px}
.nt-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-card);padding:18px;margin-bottom:16px;min-width:0}
.nt-card-head{margin-bottom:12px} .nt-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.nt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:16px}
.nt-table-wrap{overflow-x:auto}
.nt-table{width:100%;border-collapse:collapse;font-size:13px}
.nt-table th{text-align:left;font-weight:500;color:var(--fg-3);font-size:12px;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.nt-table td{padding:10px;border-bottom:1px solid var(--line-2,var(--line));vertical-align:top}
.nt-table .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.nt-sub{display:block;font-size:12px;color:var(--fg-3);margin-top:2px;font-weight:400}
.nt-why{color:var(--fg-2);font-size:12.5px;line-height:1.45;min-width:220px}
.nt-foot{font-size:13px;color:var(--fg-2);line-height:1.5;margin:12px 0 0}
.nt-foot a{color:var(--accent)}
.nt-sens{display:flex;flex-direction:column;gap:10px}
.nt-sens-row{display:grid;grid-template-columns:minmax(150px,260px) 1fr minmax(110px,150px);gap:14px;align-items:center}
.nt-sens-bar{position:relative;height:10px;background:var(--bg-2);border-radius:5px}
.nt-sens-bar span{position:absolute;top:0;bottom:0;background:var(--accent);opacity:.75;border-radius:5px}
.nt-sens-bar i{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--fg)}
.nt-sens-val{font-size:13px;text-align:right;font-variant-numeric:tabular-nums}
.nt-tag{font:500 11px/1 var(--mono);padding:3px 6px;border-radius:var(--r-chip);background:var(--surface-2)}
.nt-sourced,.nt-derived{background:var(--ok-soft);color:var(--ok)} .nt-assumption{background:var(--warn-soft);color:var(--warn)}
.nt-btn{font:inherit;font-size:13px;background:var(--surface-2);color:var(--fg);border:1px solid var(--line);border-radius:var(--r-ctl);padding:7px 12px;cursor:pointer}
.nt-list{margin:0;padding-left:18px;font-size:14px;line-height:1.7}
.nt-loading{position:fixed;bottom:16px;right:16px;background:var(--fg);color:var(--bg);padding:8px 12px;border-radius:var(--r-ctl);font-size:13px}
.nt-err{color:var(--bad)}
@media (max-width:640px){.nt-sens-row{grid-template-columns:1fr;gap:6px}.nt-sens-val{text-align:left}.nt-row{flex-direction:column}}
@media print{.nt-select,.nt-btn,.nt-pin,.nt-banner{display:none}.nt-card{break-inside:avoid;border:none}}
`}</style>
  );
}
