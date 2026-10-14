"use client";
import { useState } from "react";
import type { Plan, Assignment } from "@/lib/agent/plan";
import type { LedgerEntry } from "@/lib/qloo/types";
import { ZONE_LABEL, CATEGORY_LABEL } from "@/lib/venue/arena";
import { fitColor } from "./Arena";

const AGE_SHORT: Record<string, string> = { "24_and_younger": "≤24", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };

export function Tonight({ plan }: { plan: Plan }) {
  const s = plan.summary;
  const r = 40, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(1, (s.averageFit - 0.3) / 0.6));
  const d = plan.demographics[0];
  const peak = d ? Object.entries(d.age).sort((x, y) => y[1] - x[1])[0]?.[0] : "";
  return (
    <section className="glass card">
      <h2>Tonight <span className="pill">{plan.event.date}</span></h2>
      <div className="score">
        <div className="ring">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--paper-2)" strokeWidth="7" />
            <circle cx="48" cy="48" r={r} fill="none" stroke={fitColor(s.averageFit)} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1), stroke .4s" }} />
          </svg>
          <div className="v">{s.averageFit.toFixed(2)}<small>fit</small></div>
        </div>
        <div className="kpis">
          <div className="kpi"><span>Stands changed</span><b>{s.standsChanged}<span style={{ color: "var(--ink-3)", fontWeight: 400 }}>/{plan.assignments.length}</span></b></div>
          <div className="kpi"><span>Peak age band</span><b>{peak ? AGE_SHORT[peak] ?? peak : "—"}</b></div>
          <div className="kpi"><span>Gender</span><b style={{ fontFamily: "var(--sans)", fontSize: 12 }}>{s.genderSkew.replace("skews ", "")}</b></div>
          <div className="kpi"><span>Per-cap lift<span className="inf">inference</span></span><b style={{ color: "var(--high)" }}>+{s.projectedPerCapLiftPct}%</b></div>
        </div>
      </div>
      {d && (
        <div className="demo" title="Qloo demographic affinity offsets for the headliner (−1..1)">
          {Object.entries(d.age).map(([k, v]) => (
            <div className="b" key={k}><i className={v < 0 ? "neg" : ""} style={{ height: `${Math.max(4, Math.abs(v) * 70)}%` }} /><span>{AGE_SHORT[k] ?? k}</span></div>
          ))}
        </div>
      )}
      <p className="fine">Fit is the traffic-weighted Qloo affinity of every stand&apos;s partner for the {plan.event.anchors[0]} crowd. Age bars are affinity offsets, not shares. Per-cap lift is our heuristic, not a Qloo output.</p>
    </section>
  );
}

export function Diff({ plan }: { plan: Plan }) {
  if (!plan.compare.length) return null;
  return (
    <section className="glass card">
      <h2>vs {plan.previousEvent?.title} <span className="pill">compare</span></h2>
      <div className="diff">
        {plan.compare.slice(0, 6).map((c) => {
          const up = c.delta >= 0, w = Math.min(50, Math.abs(c.delta) * 100);
          return (
            <div className="drow" key={c.name}>
              <div><div className="n"><span>{c.name}</span></div>
                <div className="track"><span className="c" /><i style={{ left: up ? "50%" : `${50 - w}%`, width: `${w}%`, background: up ? "var(--high)" : "var(--low)" }} /></div></div>
              <div className={`dv ${up ? "up" : "down"}`}>{up ? "+" : ""}{c.delta.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
      <p className="fine">Taste tags where tonight&apos;s crowd differs most from last night&apos;s, from /v2/analysis/compare.</p>
    </section>
  );
}

export function Versus({ plan }: { plan: Plan }) {
  const cats = ["food", "drink", "merch", "sponsor"] as const;
  return (
    <section className="glass card">
      <h2>Popularity vs crowd fit</h2>
      <div className="vs">
        <div className="col">
          <h4>Popularity only</h4>
          {plan.llmOnly.map((x) => <div className="row" key={x.stand}><span>{x.stand}</span><span style={{ color: "var(--ink-2)" }}>{x.name}</span></div>)}
        </div>
        <div className="mid">VS</div>
        <div className="col q">
          <h4>With Qloo</h4>
          {cats.map((c) => { const a = plan.assignments.filter((x) => x.stand.category === c).sort((x, y) => y.fit - x.fit)[0]; return a ? <div className="row" key={c}><span>{c}</span><span style={{ color: fitColor(a.fit) }}>{a.vendorName}</span></div> : null; })}
        </div>
      </div>
      <p className="fine">Left: most popular partner per category, no crowd signal. Right: ranked by this crowd&apos;s Qloo affinity.</p>
    </section>
  );
}

export function Inspector({ a, anchors, onSwap }: { a: Assignment | null; anchors: string[]; onSwap: (vendorId: string) => void }) {
  if (!a) return (
    <section className="glass card">
      <h2>Stand</h2>
      <p className="empty"><b>Click a stand</b> in the arena to see who is there tonight, the Qloo evidence behind the pick, and ranked alternatives you can swap in.</p>
    </section>
  );
  const drivers = Object.entries(a.drivers).sort((x, y) => y[1] - x[1]);
  const top = drivers[0];
  return (
    <section className="glass card insp">
      <div className="head">
        <div>
          <div className="crumb">{a.stand.label} · {ZONE_LABEL[a.stand.zone]} · {CATEGORY_LABEL[a.stand.category]}</div>
          <h3>{a.vendorName}</h3>
        </div>
        <div className="big" style={{ color: fitColor(a.fit) }}>{a.fit.toFixed(2)}<small>fit</small></div>
      </div>
      <p className="why">
        Affinity <b>{a.affinity.toFixed(2)}</b> for the {anchors.join(" + ")} crowd{top ? <>. {top[0]} fans contribute most (driver score <b>{top[1].toFixed(2)}</b>)</> : null}.
        {a.stand.zone === "club" ? " Club stands weight premium partners." : a.stand.zone === "upper" ? " Upper deck discounts premium partners." : ""}
        {a.reason.startsWith("Operator") ? <> <b>Operator override.</b></> : null}
      </p>
      {drivers.length > 0 && (
        <div className="drv">
          {drivers.map(([n, v]) => <div className="r" key={n}><span>{n}</span><div className="track"><i style={{ left: 0, width: `${Math.round(v * 100)}%`, background: "var(--ink)" }} /></div><span className="dv">{v.toFixed(2)}</span></div>)}
        </div>
      )}
      {a.previous && <div className="prev"><span>Last night</span><b>{a.previous.name}</b><span style={{ marginLeft: "auto", fontFamily: "var(--mono)", color: fitColor(a.previous.affinity) }}>{a.previous.affinity.toFixed(2)}</span></div>}
      <h2 style={{ marginTop: 16 }}>Alternatives</h2>
      <div className="alts">
        {a.alternatives.map((alt) => (
          <div className="alt" key={alt.vendorId}>
            <span>{alt.name}</span>
            <span className="dv" style={{ color: fitColor(alt.fit) }}>{alt.fit.toFixed(2)}</span>
            <button className="sw" onClick={() => onSwap(alt.vendorId)}>Swap in</button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LedgerBar({ entries }: { entries: LedgerEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ledger glass">
      <div className="bar">
        <div className="legend"><span>Fit</span><span className="g" /><span>low → high</span></div>
        <b style={{ marginLeft: 8 }}>Evidence</b>
        <div className="calls">
          {entries.map((e) => <div className="call" key={e.id}><code>GET {e.endpoint}</code>{e.summary.length > 46 ? e.summary.slice(0, 46) + "…" : e.summary}</div>)}
        </div>
        <button className="toggle" onClick={() => setOpen(!open)}>{open ? "Hide requests" : `${entries.length} Qloo calls`}</button>
      </div>
      {open && (
        <div className="open">
          {entries.map((e) => <div className="entry" key={e.id}>{e.summary} <span className="pill" style={{ padding: "1px 6px", fontSize: 9 }}>{e.mode}</span><code>GET {e.endpoint}?{Object.entries(e.params).map(([k, v]) => `${k}=${v.length > 48 ? v.slice(0, 48) + "…" : v}`).join("&")}</code></div>)}
        </div>
      )}
    </div>
  );
}
