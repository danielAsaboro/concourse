"use client";
import { useEffect, useRef, useState } from "react";
import type { Plan, Assignment } from "@/lib/agent/plan";
import type { LedgerEntry } from "@/lib/qloo/types";
import { CATEGORY_LABEL, ZONE_LABEL } from "@/lib/venue/arena";
import { vendorById } from "@/lib/venue/catalogue";
import { IconArrowUp, IconClose, IconDatabase, IconHistory, IconSpark, IconStands, IconSwap } from "@/components/icons";
import { driverWord, fitVar, fitWord, fmt } from "@/components/lib";
import { FitBar } from "./parts";
import { reasonFor, type Msg } from "./useConcourse";

/* ---------- Stand inspector ---------- */

export function Inspector({ a, plan, onSwap }: { a: Assignment; plan: Plan; onSwap: (vendorId: string) => void }) {
  const drivers = Object.entries(a.drivers).sort((x, y) => y[1] - x[1]);
  const max = drivers[0]?.[1] ?? 1;
  // Where each alternative already sits tonight, so a higher score elsewhere isn't a surprise.
  const placedAt = new Map(plan.assignments.filter((x) => x.stand.id !== a.stand.id).map((x) => [x.vendorId, x.stand.label]));
  const busyBetter = a.alternatives.find((alt) => alt.fit > a.fit && placedAt.has(alt.vendorId));
  return (
    <div className="dock-b">
      <div className="insp-id">
        <span className="t-cap">{a.stand.label} · {ZONE_LABEL[a.stand.zone]}</span>
        <h3 className="t-title3">{a.vendorName}</h3>
        <span className="t-cap">{CATEGORY_LABEL[a.stand.category]}{vendorById.get(a.vendorId)?.premium ? " · Premium tier" : ""}</span>
      </div>

      <div className="insp-fit">
        <div>
          <span className="t-cap" style={{ display: "block", marginBottom: 4 }}>Crowd fit</span>
          <span className="t-kpi">{fmt.fit(a.fit)}</span>
        </div>
        <div className="word">
          <span className="t-label" style={{ color: fitVar(a.fit) }}>{fitWord(a.fit)}</span>
          <span className="t-cap">For tonight&apos;s crowd</span>
        </div>
        <FitBar fit={a.fit} />
      </div>

      <section className="insp-sec">
        <h4 className="t-eyebrow">What drives it</h4>
        <div className="drivers">
          {drivers.map(([name, share]) => (
            <div className="d" key={name}>
              <span>{name} fans</span><em>{driverWord(share, max)}</em>
              <div className="fitbar"><span style={{ width: `${(share / max) * 100}%`, background: "var(--fit-3)" }} /></div>
            </div>
          ))}
        </div>
        <p className="t-body" style={{ fontSize: 14, lineHeight: "22px" }}>
          {reasonFor(a, plan)}
          {busyBetter && ` ${busyBetter.name} scores higher here but is already placed at ${placedAt.get(busyBetter.vendorId)} tonight.`}
        </p>
      </section>

      {a.previous && (
        <div className="prev"><IconHistory /><span>Last night ({plan.previousEvent?.title}) this stand had <b style={{ color: "var(--fg)", fontWeight: 500 }}>{a.previous.name}</b>, which scores {fmt.fit(a.previous.affinity)} for tonight&apos;s crowd.</span></div>
      )}

      <section className="insp-sec">
        <h4 className="t-eyebrow">Alternatives</h4>
        <ul className="alts">
          {a.alternatives.map((alt) => (
            <li key={alt.vendorId}>
              <span className="fitdot" style={{ background: fitVar(alt.fit) }} />
              <span className="nm"><strong>{alt.name}</strong>{placedAt.has(alt.vendorId) && <small>At {placedAt.get(alt.vendorId)} tonight</small>}</span>
              <span className="f">{fmt.fit(alt.fit)}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => onSwap(alt.vendorId)} aria-label={`Swap ${a.stand.label} to ${alt.name}`}><IconSwap />Swap</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function NoStand() {
  return (
    <div className="dock-b">
      <div className="empty"><IconStands /><span className="t-head" style={{ color: "var(--fg)" }}>No stand selected</span><span className="t-body">Pick a stand in the arena or the list.</span></div>
    </div>
  );
}

/* ---------- Agent ---------- */

export function Agent({ plan, msgs, asking, onAsk, engine, onSelectStand }: {
  plan: Plan; msgs: Msg[]; asking: boolean; onAsk: (q: string) => void; engine: string; onSelectStand: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [msgs, asking]);
  const pick = (i: number) => plan.assignments[i];
  const a2 = pick(2), a3 = pick(3);
  const sugs = [
    "What changes from last night?",
    a2 ? `Why ${a2.vendorName} at ${a2.stand.label}?` : "",
    a3?.alternatives[0] ? `Swap ${a3.stand.label} to ${a3.alternatives[0].name}` : "",
    "Who is the crowd tonight?",
  ].filter(Boolean);
  const send = (text: string) => { if (!text.trim() || asking) return; onAsk(text); setQ(""); };
  const standName = (id: string) => plan.assignments.find((x) => x.stand.id === id)?.stand.label ?? id;

  return (
    <div className="chat">
      <div className="chat-log" ref={log} aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-intro">
            <p className="t-body" style={{ fontSize: 14, lineHeight: "22px" }}>
              Ask about any stand or vendor for {plan.event.title}, or tell the agent to swap one. Swaps show up in the arena straight away.
            </p>
            <div className="sugs">
              {sugs.map((s) => <button key={s} className="chip" onClick={() => send(s)} disabled={asking}><IconSpark />{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => m.role === "u" ? (
          <div key={m.id} className="msg u">{m.text}</div>
        ) : (
          <div key={m.id} className="msg a">
            <p style={m.error ? { color: "var(--bad)" } : undefined}>{m.text}</p>
            {m.swaps && m.swaps.length > 0 && (
              <div className="swaps">
                {m.swaps.map((s) => <button key={s.standId} className="chip" onClick={() => onSelectStand(s.standId)}><IconSwap />{standName(s.standId)} → {vendorById.get(s.vendorId)?.name ?? s.vendorId}</button>)}
              </div>
            )}
            {!m.error && (
              <span className="meta">
                {m.engine === "claude" ? "Claude" : "Offline planner"}
                {m.ledger && m.ledger.length > 0 && <> · {m.ledger.length} data lookup{m.ledger.length > 1 ? "s" : ""}</>}
              </span>
            )}
          </div>
        ))}
        {asking && <div className="msg a"><span className="typing" aria-label="The agent is answering"><i /><i /><i /></span></div>}
      </div>
      <div className="composer">
        <form onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <label htmlFor="agent-q" className="sr">Ask the agent</label>
          <textarea
            id="agent-q" rows={1} value={q} placeholder="Ask about a stand or vendor"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q); } }}
          />
          <button className="send" type="submit" disabled={asking || !q.trim()} aria-label="Send"><IconArrowUp /></button>
        </form>
        <p className="hint">{engine === "claude" ? "Answers come from Claude, using the same data as the plan." : "Running the offline planner: answers come straight from tonight's plan."}</p>
      </div>
    </div>
  );
}

/* ---------- Evidence ---------- */

const PARAM_LABEL: Record<string, string> = {
  "filter.type": "type",
  "signal.interests.entities": "signal",
  "filter.results.entities": "shortlist",
  "feature.explainability": "explain",
  take: "take",
};

function short(v: string) {
  const ids = v.split(",");
  if (ids.length > 1 && ids.every((x) => /^[0-9A-F-]{20,}$/i.test(x))) return `${ids.length} entity IDs`;
  if (/^[0-9A-F-]{30,}$/i.test(v)) return "1 entity ID";
  return v;
}

export function Evidence({ ledger, mode, onClose }: { ledger: LedgerEntry[]; mode: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ev-title" ref={ref} tabIndex={-1}>
        <span className="sheet-grab" />
        <div className="dock-h">
          <h2 className="t-head" id="ev-title">Evidence</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close evidence"><IconClose /></button>
        </div>
        <div className="dock-b">
          <div className="source">
            <span className="mk"><IconDatabase /></span>
            <div>
              <p className="t-head">Taste data from the Qloo Insights API</p>
              <p className="t-cap" style={{ marginTop: 2 }}>Called from the server only. Keys never reach the browser.</p>
            </div>
          </div>
          <p className="t-body" style={{ fontSize: 14, lineHeight: "22px" }}>
            Every number in tonight&apos;s plan traces back to one of these calls. Affinities are relative to each query, so they compare vendors within one night, not across events.
            {mode === "mock" && " These rows come from synthetic fixtures until the live key is set."}
          </p>
          <ul className="ledger">
            {ledger.map((e) => (
              <li key={e.id}>
                <div className="h">
                  <span className="ep"><b>GET</b>{e.endpoint}</span>
                  {e.mode === "mock" ? <span className="badge badge-warn"><i />Demo data (synthetic)</span> : <span className="badge badge-ok"><i />Live</span>}
                </div>
                <p>{e.summary}</p>
                <dl>
                  {Object.entries(e.params).map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}><dt>{PARAM_LABEL[k] ?? k}</dt><dd title={v}>{short(v)}</dd></div>
                  ))}
                </dl>
                <span className="ms">{e.ms < 1 ? "Under 1" : e.ms} ms</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
