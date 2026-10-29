"use client";
import { Suspense, lazy, useMemo, useState } from "react";
import type { Plan, Assignment } from "@/lib/agent/plan";
import type { Zone } from "@/lib/venue/arena";
import { ZONE_LABEL, CATEGORY_LABEL } from "@/lib/venue/arena";
import {
  IconArrowRight, IconChat, IconChevron, IconExpand, IconReset,
} from "@/components/icons";
import { CAT_SHORT, KIND_LABEL, NIGHT_HREF, VENUE3D_LINK, ZONE_ORDER, appHref, fitVar, fitWord, fmt } from "@/components/lib";
import { PRESETS, PRESET_LABEL, PRESET_ZONE, type Preset } from "@/components/arena/layout";
import type { Theme } from "@/components/theme";
import { FitBar, FitLegend } from "./parts";
import type { EventRow } from "./useConcourse";

const ArenaLazy = lazy(() => import("@/components/arena/Arena"));
export function Arena(props: React.ComponentProps<typeof ArenaLazy>) {
  return <Suspense fallback={<div className="arena-loading">Loading the arena</div>}><ArenaLazy {...props} /></Suspense>;
}

/* ---------- Overview ---------- */

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "24 and under", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55 and over",
};

function Diverging({ rows, left, right }: { rows: { label: string; v: number }[]; left: string; right: string }) {
  const max = Math.max(0.0001, ...rows.map((r) => Math.abs(r.v)));
  return (
    <div className="diverge">
      {rows.map((r) => {
        const w = (Math.abs(r.v) / max) * 50;
        return (
          <div className="r" key={r.label}>
            <span>{r.label}</span>
            <div className="track" role="img" aria-label={`${r.label}: ${r.v > 0 ? "above" : r.v < 0 ? "below" : "level with"} the baseline`}>
              <span style={r.v >= 0 ? { left: "50%", width: `${w}%`, background: "var(--fit-3)" } : { right: "50%", width: `${w}%`, background: "var(--fit-1)" }} />
            </div>
          </div>
        );
      })}
      <div className="axis"><span /><span>{left}</span><span>{right}</span></div>
    </div>
  );
}

export function Overview({ plan, theme, events, onOpenStand, onAgent, onPickEvent }: {
  plan: Plan; theme: Theme; events: EventRow[]; onOpenStand: (id: string) => void; onAgent: () => void; onPickEvent: (id: string) => void;
}) {
  const changes = plan.assignments.filter((a) => a.previous);
  const primary = plan.demographics[0];
  const ageRows = primary ? Object.entries(primary.age).map(([k, v]) => ({ label: AGE_LABEL[k] ?? k.replace(/_/g, " "), v })) : [];
  const shift = plan.compare.filter((c) => c.delta !== 0).slice(0, 6).map((c) => ({ label: c.name, v: c.delta }));
  const idx = events.findIndex((e) => e.id === plan.event.id);
  const upcoming = events.slice(idx + 1, idx + 4);
  const stands = useMemo(() => plan.assignments.map((a) => ({ ...a, changed: !!a.previous })), [plan]);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="t-cap">Tonight · {plan.event.date} · {KIND_LABEL[plan.event.kind]}</span>
          <h1 className="t-title2">{plan.event.title}</h1>
          <p className="t-body" style={{ marginTop: 4 }}>The crowd is coming for {plan.event.anchors.join(" and ")}. {fmt.int(plan.event.expectedAttendance)} expected.</p>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={onAgent}><IconChat />Ask the agent</button>
          <a className="btn btn-primary" href={appHref("tonight")}>Open tonight&apos;s plan<IconArrowRight /></a>
        </div>
      </div>

      <section className="kpis" aria-label="Key numbers">
        <div className="card kpi">
          <div className="top"><span className="t-label">Crowd fit</span><span className="via" title="Affinity scores come from the Qloo Insights API">via Qloo</span></div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span className="t-kpi">{fmt.fit(plan.summary.averageFit)}</span><span className="t-label" style={{ color: fitVar(plan.summary.averageFit) }}>{fitWord(plan.summary.averageFit)}</span></div>
          <FitBar fit={plan.summary.averageFit} />
          <span className="sub">Average across 20 stands, weighted by foot traffic.</span>
        </div>
        <div className="card kpi">
          <div className="top"><span className="t-label">Stands changed</span></div>
          <span className="t-kpi">{plan.summary.standsChanged}<span style={{ fontSize: 20, color: "var(--fg-3)", fontWeight: 500 }}> / {plan.assignments.length}</span></span>
          <span className="sub">{plan.previousEvent ? `Compared with ${plan.previousEvent.title}, the night before.` : "First event in the calendar, so nothing to compare."}</span>
        </div>
        <div className="card kpi">
          <div className="top"><span className="t-label">Per-cap spend lift</span><span className="tag-inf" title="Our estimate from the change in crowd fit. Not a Qloo output.">Inference</span></div>
          <span className="t-kpi">+{plan.summary.projectedPerCapLiftPct.toFixed(1)}%</span>
          <span className="sub">Projected from the change in fit since last night. An estimate, not measured.</span>
        </div>
        <div className="card kpi">
          <div className="top"><span className="t-label">Expected crowd</span></div>
          <span className="t-kpi">{fmt.int(plan.event.expectedAttendance)}</span>
          <span className="sub">Skews {plan.summary.topAgeBand}; {plan.summary.genderSkew === "balanced" ? "balanced on gender" : plan.summary.genderSkew}.</span>
        </div>
      </section>

      <div className="grid-ov">
        <div className="stack">
          <section className="card">
            <div className="card-h">
              <div><h2 className="t-head">Arena</h2><p className="t-cap">Each stand is coloured by how well it fits tonight&apos;s crowd</p></div>
              <a className="card-link" href={appHref("tonight")}>Open in 3D<IconChevron /></a>
            </div>
            <a className="preview" href={appHref("tonight")} aria-label="Open the arena in tonight's plan" style={{ display: "block" }}>
              <Arena stands={stands} kind={plan.event.kind} crowd={plan.event.expectedAttendance} theme={theme} interactive={false} drift preset="bowl" />
              <span className="open btn btn-secondary btn-sm" aria-hidden="true"><IconExpand />Explore</span>
            </a>
          </section>
          <section className="card">
            <div className="card-h">
              <div><h2 className="t-head">Changes from last night</h2><p className="t-cap">{plan.previousEvent ? `${changes.length} stands differ from ${plan.previousEvent.title}` : "No previous night"}</p></div>
              <FitLegend />
            </div>
            {changes.length === 0 ? <p className="t-body card-b">Every stand keeps last night&apos;s partner.</p> : (
              <ul className="changes">
                {changes.slice(0, 8).map((a) => (
                  <li key={a.stand.id}>
                    <button onClick={() => onOpenStand(a.stand.id)}>
                      <span className="sid">{a.stand.id}</span>
                      <span className="what"><strong>{a.previous!.name} → {a.vendorName}</strong><span>{a.stand.label} · {CATEGORY_LABEL[a.stand.category]}</span></span>
                      <span className="badge" style={{ background: "transparent" }}><span className="fitdot" style={{ background: fitVar(a.fit) }} />{fmt.fit(a.fit)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {changes.length > 8 && <div className="card-b" style={{ borderTop: "1px solid var(--line)", paddingBlock: 12 }}><a className="card-link" href={appHref("tonight")}>See all {changes.length} in tonight&apos;s plan<IconChevron /></a></div>}
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-h"><div><h2 className="t-head">Who is coming</h2><p className="t-cap">Age skew for {primary?.anchor ?? "tonight"} fans against the average</p></div></div>
            <div className="card-b">{ageRows.length ? <Diverging rows={ageRows} left="Less likely" right="More likely" /> : <p className="t-body">No crowd profile for this event.</p>}</div>
          </section>
          <section className="card">
            <div className="card-h"><div><h2 className="t-head">Taste shift</h2><p className="t-cap">{plan.previousEvent ? `Tonight against ${plan.previousEvent.title}` : "No previous night to compare"}</p></div></div>
            <div className="card-b">{shift.length ? <Diverging rows={shift} left={plan.previousEvent?.title ?? ""} right={plan.event.title} /> : <p className="t-body">Nothing to compare.</p>}</div>
          </section>
          <section className="card">
            <div className="card-h"><h2 className="t-head">Coming up</h2><a className="card-link" href={appHref("events")}>All events<IconChevron /></a></div>
            <ul className="changes">
              {upcoming.length === 0 && <li><p className="t-body card-b">Nothing else scheduled.</p></li>}
              {upcoming.map((e) => (
                <li key={e.id}>
                  <button onClick={() => onPickEvent(e.id)}>
                    <span className="sid">{e.date.split(" ").slice(1).join(" ")}</span>
                    <span className="what"><strong>{e.title}</strong><span>{KIND_LABEL[e.kind]} · {fmt.int(e.attendance)} expected</span></span>
                    <IconChevron style={{ width: 16, height: 16, color: "var(--fg-3)" }} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

/* ---------- Events ---------- */

export function Events({ events, eventId, featured, onPick }: { events: EventRow[]; eventId: string; featured: string; onPick: (id: string) => void }) {
  return (
    <>
      <div className="page-head">
        <div>
          <span className="t-cap">{events.length} events this week</span>
          <h1 className="t-title2">Events</h1>
          <p className="t-body" style={{ marginTop: 4 }}>Open an event to rank every stand for its crowd.</p>
        </div>
        <div className="actions">
          <a className="btn btn-secondary" {...VENUE3D_LINK}>3D arena</a>
          {NIGHT_HREF && <a className="btn btn-secondary" href={NIGHT_HREF}>Event night at a real venue<IconArrowRight /></a>}
        </div>
      </div>
      <section className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Event</th><th>Date</th><th className="hide-sm">Type</th><th className="r hide-sm">Expected</th><th aria-label="Status" /></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} aria-selected={e.id === eventId} onClick={() => onPick(e.id)} tabIndex={0} onKeyDown={(k) => { if (k.key === "Enter") onPick(e.id); }}>
                  <td><div className="ev"><strong>{e.title}</strong><span>For fans of {e.anchors.join(", ")}</span></div></td>
                  <td className="num">{e.date}</td>
                  <td className="hide-sm">{KIND_LABEL[e.kind] ?? e.kind}</td>
                  <td className="r num hide-sm">{fmt.int(e.attendance)}</td>
                  <td className="r">
                    {e.id === eventId ? <span className="badge badge-accent">Open</span> : e.id === featured ? <span className="badge">Tonight</span> : <IconChevron style={{ width: 16, height: 16, color: "var(--fg-3)", marginLeft: "auto" }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------- Tonight ---------- */

function StandRow({ a, selected, onSelect }: { a: Assignment; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <li>
      <button className="stand-row" aria-pressed={selected} onClick={() => onSelect(a.stand.id)}>
        <span className="sid">{a.stand.id}</span>
        <span className="who">
          <strong>{a.vendorName}{a.previous && <span className="chg" title={`Was ${a.previous.name} last night`} />}</strong>
          <span>{CAT_SHORT[a.stand.category]} · {a.stand.label}</span>
        </span>
        <span className="fit"><span className="num">{fitWord(a.fit)} · {fmt.fit(a.fit)}</span><FitBar fit={a.fit} /></span>
      </button>
    </li>
  );
}

export function Tonight({ plan, theme, selected, onSelect, onSwap, overrides, onReset }: {
  plan: Plan; theme: Theme; selected: string | null; onSelect: (id: string | null) => void; onSwap: (s: string, v: string) => void;
  overrides: Record<string, string>; onReset: () => void;
}) {
  const [preset, setPreset] = useState<Preset>("bowl");
  const [resetKey, setResetKey] = useState(0);
  const stands = useMemo(() => plan.assignments.map((a) => ({ ...a, changed: !!a.previous })), [plan]);
  const byZone = useMemo(() => {
    const m = new Map<Zone, Assignment[]>();
    for (const z of ZONE_ORDER) m.set(z, []);
    for (const a of plan.assignments) m.get(a.stand.zone)!.push(a);
    return m;
  }, [plan]);
  const swaps = Object.keys(overrides).length;
  const choose = (p: Preset) => { onSelect(null); setPreset(p); setResetKey((k) => k + 1); };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="t-cap">{plan.event.title} · {plan.event.date}</span>
          <h1 className="t-title2">Tonight&apos;s plan</h1>
          <p className="t-body" style={{ marginTop: 4 }}>Select a stand in the arena or the list to see why it was chosen and swap its partner.</p>
        </div>
        <div className="actions">
          {swaps > 0 && <button className="btn btn-secondary" onClick={onReset}><IconReset />Restore agent&apos;s plan ({swaps})</button>}
        </div>
      </div>

      <section className="card arena-card">
        <div className="arena-tools">
          <div className="seg" role="group" aria-label="Camera">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <button key={p} aria-pressed={preset === p && !selected} onClick={() => choose(p)}>{PRESET_LABEL[p]}</button>
            ))}
          </div>
          <span className="spacer" />
          <FitLegend />
          <button className="icon-btn" onClick={() => choose(preset)} title="Reset camera" aria-label="Reset camera"><IconReset /></button>
        </div>
        <div className="arena-view">
          <Arena
            stands={stands} kind={plan.event.kind} crowd={plan.event.expectedAttendance} theme={theme} selectedId={selected} onSelect={onSelect} onSwap={onSwap}
            preset={preset} focusZone={PRESET_ZONE[preset]} resetKey={resetKey}
          />
          {!selected && <span className="arena-hint">Drag to orbit · scroll to zoom · click a stand</span>}
        </div>
      </section>

      <div className="stand-groups">
        {ZONE_ORDER.map((z) => (
          <section className="card" key={z}>
            <div className="card-h">
              <div><h2 className="t-head">{ZONE_LABEL[z]}</h2><p className="t-cap">{byZone.get(z)!.length} stands</p></div>
              <button className="card-link" onClick={() => choose(z as Preset)}>Show in arena<IconChevron /></button>
            </div>
            <ul className="stand-list">
              {byZone.get(z)!.map((a) => <StandRow key={a.stand.id} a={a} selected={a.stand.id === selected} onSelect={(id) => { onSelect(id === selected ? null : id); if (id !== selected) document.querySelector(".arena-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />)}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

