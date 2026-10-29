"use client";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/theme";
import { IconClose, IconEvidence, IconInfo, IconReset } from "@/components/icons";
import { VIEWS, fmt, type View } from "@/components/lib";
import { island, useIslandTask } from "@/components/island/Island";
import { DataBadge, Sidebar, TopBar, TabBar } from "./parts";
import { Events, Overview, Tonight } from "./views";
import { Agent, Evidence, Inspector, NoStand } from "./panels";
import { useConcourse } from "./useConcourse";

function readView(): View {
  const h = typeof location === "undefined" ? "" : location.hash.replace("#", "");
  return (VIEWS as string[]).includes(h) ? (h as View) : "overview";
}

function go(view: View) {
  if (location.hash !== `#${view}`) location.hash = view;
}

export default function DashboardApp() {
  const [theme] = useTheme();
  const c = useConcourse();
  const [view, setView] = useState<View>("overview");
  const [dockTab, setDockTab] = useState<"stand" | "agent" | null>(null);
  const [evidence, setEvidence] = useState(false);

  useEffect(() => {
    const sync = () => { setView(readView()); window.scrollTo({ top: 0 }); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Selecting a stand opens the inspector; clearing it closes the inspector.
  const { selected, setSelected } = c;
  useEffect(() => {
    if (selected) setDockTab((t) => (t === "agent" ? t : "stand"));
    else setDockTab((t) => (t === "stand" ? null : t));
  }, [selected]);

  const openStand = useCallback((id: string) => { setSelected(id); setDockTab("stand"); go("tonight"); }, [setSelected]);
  const toggleAgent = () => setDockTab((t) => (t === "agent" ? (selected ? "stand" : null) : "agent"));
  const pickEvent = (id: string) => { c.switchEvent(id); go("tonight"); };
  const closeDock = useCallback(() => { if (dockTab === "stand") setSelected(null); setDockTab(null); }, [dockTab, setSelected]);

  // Escape closes the side panel (the evidence sheet handles its own).
  useEffect(() => {
    if (!dockTab || evidence) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.closest?.(".menu")) return;
      closeDock();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [dockTab, evidence, closeDock]);

  // Dynamic Island: what the agent is doing right now, and tonight's plan at rest.
  const evTitle = c.events.find((e) => e.id === c.eventId)?.title;
  useIslandTask(c.loading, { title: `Ranking partners for ${evTitle ?? "tonight"}`, detail: "Scoring every partner against tonight's crowd, then placing the club, concourse and plaza." });
  useIslandTask(c.asking, { title: "Agent is working through tonight's plan", detail: c.msgs.filter((m) => m.role === "u").at(-1)?.text });
  useEffect(() => {
    const t = c.toast;
    if (!t) return;
    island.show({ tone: "done", title: t.text, ttl: 5200, ...(t.undo ? { action: { label: "Undo", onClick: () => { t.undo?.(); c.dismissToast(); } } } : {}) });
  }, [c.toast]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = c.plan;
    if (!p) return;
    island.rest({
      title: `${p.event.title} · tonight`,
      value: `fit ${fmt.fit(p.summary.averageFit)}`,
      detail: `${p.summary.standsChanged} of ${p.assignments.length} stands change${p.previousEvent ? ` from ${p.previousEvent.title}` : ""}. Crowd fit is scored from Qloo taste data${c.mode === "mock" ? "; this demo runs on synthetic data" : ""}.`,
      facts: [
        { label: "Changed", value: `${p.summary.standsChanged}/${p.assignments.length}` },
        { label: "Expected", value: p.event.expectedAttendance.toLocaleString("en-US") },
        { label: "Data", value: c.mode === "live" ? "Live" : "Synthetic" },
      ],
    });
  }, [c.plan, c.mode]);
  useEffect(() => () => island.rest(null), []);

  const plan = c.plan;
  const sel = plan?.assignments.find((a) => a.stand.id === selected) ?? null;
  const dockOpen = !!plan && dockTab !== null;

  return (
    <div className="app">
      <Sidebar view={view} dockTab={dockTab} onAgent={toggleAgent} onEvidence={() => setEvidence(true)} changes={plan?.summary.standsChanged} eventsCount={c.events.length} />
      <div className="main">
        <TopBar view={view} mode={c.mode} events={c.events} eventId={c.eventId} onPick={pickEvent} onAgent={toggleAgent} onEvidence={() => setEvidence(true)} agentOn={dockTab === "agent"} />
        {c.loading && plan && <div className="progress" role="progressbar" aria-label="Updating tonight's plan" />}
        <div className={dockOpen ? "with-dock" : undefined}>
          <main className="content" id="main">
            <div className="show-sm" style={{ display: undefined }}><span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><DataBadge mode={c.mode} />{plan && <button className="btn btn-quiet btn-sm" onClick={() => setEvidence(true)}><IconEvidence />Evidence</button>}</span></div>
            {c.error && !plan && (
              <div className="state err" role="alert">
                <span className="ico"><IconInfo /></span>
                <h2 className="t-title3">Tonight&apos;s plan isn&apos;t available</h2>
                <p className="t-body">{c.error.replace(/\.$/, "")}. Nothing was guessed or filled in, so there is no plan to show until the data comes back.</p>
                <button className="btn btn-primary" onClick={c.retry}><IconReset />Try again</button>
              </div>
            )}
            {c.error && plan && (
              <div className="state err" role="alert" style={{ maxWidth: "none", padding: 16, gridTemplateColumns: "auto 1fr auto", alignItems: "center", display: "grid" }}>
                <span className="ico"><IconInfo /></span>
                <p className="t-body" style={{ fontSize: 14 }}>{c.error.replace(/\.$/, "")}. You are still looking at the last plan that loaded.</p>
                <button className="btn btn-secondary btn-sm" onClick={c.retry}>Try again</button>
              </div>
            )}
            {!plan && !c.error && (
              <div className="skel-page" aria-busy="true" aria-label="Ranking every stand for tonight's crowd">
                <div style={{ display: "grid", gap: 12 }}><div className="skel" style={{ height: 16, width: 180 }} /><div className="skel" style={{ height: 32, width: 280 }} /><div className="skel" style={{ height: 20, width: "min(480px, 100%)" }} /></div>
                <div className="row">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 160 }} />)}</div>
                <div className="skel" style={{ height: 420 }} />
              </div>
            )}
            {plan && view === "overview" && <Overview plan={plan} theme={theme} events={c.events} onOpenStand={openStand} onAgent={() => setDockTab("agent")} onPickEvent={pickEvent} />}
            {plan && view === "events" && <Events events={c.events} eventId={c.eventId} featured={c.featured} onPick={pickEvent} />}
            {plan && view === "tonight" && (
              <Tonight plan={plan} theme={theme} selected={selected} onSelect={setSelected} onSwap={c.swap} overrides={c.overrides} onReset={c.resetSwaps} />
            )}
            {plan && (
              <footer className="t-cap" style={{ paddingTop: 8 }}>
                {c.mode === "mock" ? "Demo data (synthetic). " : ""}Crowd fit compares vendors within one night; it is not comparable across events. Concourse is open source under the MIT License.
              </footer>
            )}
          </main>
          {dockOpen && plan && (
            <>
              <div className="scrim dock-scrim" onClick={closeDock} />
              <aside className="dock" aria-label={dockTab === "agent" ? "Agent" : "Stand inspector"}>
                <span className="sheet-grab" />
                <div className="dock-h">
                  {sel ? (
                    <div className="seg" role="tablist" style={{ flex: 1, maxWidth: 220 }}>
                      <button role="tab" aria-pressed={dockTab === "stand"} onClick={() => setDockTab("stand")} style={{ flex: 1 }}>Stand</button>
                      <button role="tab" aria-pressed={dockTab === "agent"} onClick={() => setDockTab("agent")} style={{ flex: 1 }}>Agent</button>
                    </div>
                  ) : <h2 className="t-head">{dockTab === "agent" ? "Agent" : "Stand"}</h2>}
                  <span style={{ flex: 1 }} />
                  <button className="icon-btn" onClick={closeDock} aria-label="Close panel"><IconClose /></button>
                </div>
                {dockTab === "stand" && (sel ? <Inspector key={sel.stand.id} a={sel} plan={plan} onSwap={(v) => c.swap(sel.stand.id, v)} /> : <NoStand />)}
                {dockTab === "agent" && (
                  <Agent plan={plan} msgs={c.msgs} asking={c.asking} onAsk={c.ask} engine={c.engine} onSelectStand={(id) => { setSelected(id); setDockTab("stand"); go("tonight"); }} />
                )}
              </aside>
            </>
          )}
        </div>
      </div>
      <TabBar view={view} onAgent={toggleAgent} agentOn={dockTab === "agent"} />
      {evidence && plan && <Evidence ledger={plan.ledger} mode={c.mode} onClose={() => setEvidence(false)} />}
      {c.toast && (
        <div className="toast" role="status">
          <span>{c.toast.text}</span>
          {c.toast.undo && <button onClick={() => { c.toast?.undo?.(); c.dismissToast(); }}>Undo</button>}
          <button onClick={c.dismissToast} aria-label="Dismiss"><IconClose style={{ width: 14, height: 14 }} /></button>
        </div>
      )}
    </div>
  );
}
