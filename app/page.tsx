"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Plan } from "@/lib/agent/plan";
import type { LedgerEntry } from "@/lib/qloo/types";
import { Tonight, Diff, Versus, Inspector, LedgerBar } from "@/components/Panels";

const Arena = dynamic(() => import("@/components/Arena"), { ssr: false });

type EventMeta = { id: string; title: string; kind: string; date: string; anchors: string[] };
type Msg = { role: "u" | "a"; text: string; engine?: string; ledger?: LedgerEntry[] };

export default function Page() {
  const [events, setEvents] = useState<EventMeta[]>([]);
  const [mode, setMode] = useState("");
  const [engine, setEngine] = useState("");
  const [eventId, setEventId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/events").then((r) => r.json()).then((d) => { setEvents(d.events); setMode(d.mode); setEngine(d.agent); setEventId((c) => c || d.events[0]?.id || ""); });
  }, []);

  const ov = useMemo(() => Object.entries(overrides).map(([k, v]) => `${k}:${v}`).join(","), [overrides]);
  useEffect(() => {
    if (!eventId) return;
    let alive = true; setLoading(true); setError(null);
    fetch(`/api/plan?event=${encodeURIComponent(eventId)}${ov ? `&overrides=${encodeURIComponent(ov)}` : ""}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d as Plan; })
      .then((p) => alive && setPlan(p)).catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [eventId, ov]);

  const switchEvent = (id: string) => { if (id === eventId) return; setEventId(id); setOverrides({}); setSelected(null); setMsgs([]); };
  const swap = useCallback((standId: string, vendorId: string) => setOverrides((o) => ({ ...o, [standId]: vendorId })), []);

  const ask = async (question: string) => {
    if (!question.trim() || !plan) return;
    setMsgs((m) => [...m, { role: "u", text: question }]); setQ(""); setAsking(true);
    try {
      const r = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, event: plan.event.id, overrides }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText);
      setMsgs((m) => [...m, { role: "a", text: d.text, engine: d.engine, ledger: d.ledger }]);
      if (d.swaps?.length) { setOverrides((o) => { const n = { ...o }; for (const s of d.swaps) n[s.standId] = s.vendorId; return n; }); setSelected(d.swaps[d.swaps.length - 1].standId); }
    } catch (e) { setMsgs((m) => [...m, { role: "a", text: `Something went wrong: ${(e as Error).message}` }]); }
    finally { setAsking(false); }
  };
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [msgs, asking]);

  const sel = plan?.assignments.find((a) => a.stand.id === selected) ?? null;
  const chips = plan ? ["What changes from last night?", `Why ${plan.assignments[2]?.vendorName} at ${plan.assignments[2]?.stand.label}?`, "Who is tonight's crowd?", `Swap ${plan.assignments[3]?.stand.label} to ${plan.assignments[3]?.alternatives[0]?.name}`] : [];

  return (
    <div className="shell">
      <div className="stage">
        {plan && <Arena assignments={plan.assignments} selectedId={selected} onSelect={setSelected} />}
        <div className="vignette" />
      </div>

      {mode === "mock" && <div className="banner">Demo data: these numbers are synthetic placeholders shaped like Qloo responses, not Qloo output. Live mode switches on when the key is set.</div>}
      {(loading || !plan) && <div className="loader"><div className="glass l">{error ? <span className="err">{error}</span> : <><i />Ranking the shortlist for tonight&apos;s crowd</>}</div></div>}

      <header className="topbar">
        <div className="glass brand"><span className="mark" /><b>Concourse</b><span>event-night agent for venues</span></div>
        <div className="pills">
          <span className={`pill ${mode}`}><i />{mode === "live" ? "Live Qloo" : mode === "mock" ? "Demo data (synthetic)" : "…"}</span>
          <span className="pill"><i />{engine === "claude" ? "Claude agent" : engine ? "Offline planner" : "…"}</span>
        </div>
        <div className="spacer" />
        <span className="hint">Stands light by fit for tonight&apos;s crowd · click one to see why</span>
      </header>

      <nav className="strip glass">
        {events.map((e) => (
          <button key={e.id} className={`ev ${e.id === eventId ? "active" : ""}`} onClick={() => switchEvent(e.id)}>
            <span className="dot" />
            <b>{e.title}</b><small><em>{e.kind}</em> · {e.date}</small>
          </button>
        ))}
      </nav>

      <aside className="dock-l">
        {plan && <Tonight plan={plan} />}
        {plan && <Diff plan={plan} />}
        {plan && <Versus plan={plan} />}
      </aside>

      <aside className="dock-r">
        <Inspector a={sel} anchors={plan?.event.anchors ?? []} onSwap={(v) => sel && swap(sel.stand.id, v)} />
        <section className="glass card agent">
          <h2>Ask the agent <span className="pill">{engine === "claude" ? "claude + qloo tools" : "qloo-grounded"}</span></h2>
          <div className="log" ref={logRef}>
            {msgs.length === 0 && <p className="empty" style={{ margin: 0 }}>Answers come from Qloo rankings, demographics and crowd comparisons. It can swap stands for you.</p>}
            {msgs.map((m, i) => <div key={i} className={`m ${m.role}`}>{m.text}{m.role === "a" && m.ledger && m.ledger.length > 0 && <span className="meta">{m.ledger.length} Qloo call{m.ledger.length > 1 ? "s" : ""} · {m.engine}</span>}</div>)}
            {asking && <div className="m a think">Checking with Qloo…</div>}
          </div>
          <div className="chips">{chips.map((c) => <button key={c} className="chip" disabled={asking} onClick={() => ask(c)}>{c}</button>)}</div>
          <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Why Modelo at Lower 2? Swap Club East to Nobu…" disabled={asking || !plan} />
            <button type="submit" disabled={asking || !q.trim()} aria-label="Ask">→</button>
          </form>
        </section>
      </aside>

      {plan && <LedgerBar entries={plan.ledger} />}
    </div>
  );
}
