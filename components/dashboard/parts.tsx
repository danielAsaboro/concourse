"use client";
import { useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme";
import {
  IconArena, IconCalendar, IconChat, IconChevron, IconChevronDown, IconEvidence, IconOverview, IconTarget, Logo,
} from "@/components/icons";
import { HOME_HREF, KIND_LABEL, NIGHT_HREF, SOURCE_URL, VENUE3D_LINK, VENUE, appHref, fitVar, type View } from "@/components/lib";
import type { EventRow } from "./useConcourse";
import { Island } from "@/components/island/Island";

export const VIEW_LABEL: Record<View, string> = { overview: "Overview", events: "Events", tonight: "Tonight's plan" };

export function FitBar({ fit, className }: { fit: number; className?: string }) {
  return (
    <div className={`fitbar ${className ?? ""}`} role="img" aria-label={`Crowd fit ${fit.toFixed(2)}`}>
      <span style={{ width: `${Math.max(4, Math.min(100, fit * 100))}%`, background: fitVar(fit) }} />
    </div>
  );
}

export function FitLegend() {
  return (
    <div className="fit-legend t-cap" aria-label="Crowd fit scale from weak to strong">
      <span>Weak</span>
      <span className="ramp">{[0, 1, 2, 3, 4].map((i) => <b key={i} style={{ background: `var(--fit-${i})` }} />)}</span>
      <span>Strong</span>
    </div>
  );
}

export function DataBadge({ mode }: { mode: string }) {
  if (mode === "live") return <span className="badge badge-ok"><i />Live data</span>;
  if (mode === "mock") return <span className="badge badge-warn" title="Every number here comes from synthetic fixtures until the live data key is set."><i />Demo data (synthetic)</span>;
  return <span className="badge"><i />Loading</span>;
}

type NavProps = { view: View; dockTab: "stand" | "agent" | null; onAgent: () => void; onEvidence: () => void; changes?: number; eventsCount: number };

export function Sidebar({ view, dockTab, onAgent, onEvidence, changes, eventsCount }: NavProps) {
  const item = (v: View, icon: React.ReactNode, count?: number) => (
    <a href={appHref(v)} aria-current={view === v ? "page" : undefined} title={VIEW_LABEL[v]}>
      {icon}<span className="label">{VIEW_LABEL[v]}</span>{count != null && <span className="count">{count}</span>}
    </a>
  );
  return (
    <aside className="sidebar" aria-label="Main">
      <a href={HOME_HREF} className="logo" title="Concourse home"><Logo /><span>Concourse</span></a>
      <div className="venue">
        <span className="mark">NA</span>
        <strong>{VENUE.name}</strong>
        <span>{VENUE.note}</span>
      </div>
      <nav className="nav">
        <p className="grp t-eyebrow">Event night</p>
        {item("overview", <IconOverview />)}
        {item("events", <IconCalendar />, eventsCount || undefined)}
        {item("tonight", <IconArena />, changes)}
        <p className="grp t-eyebrow">Tools</p>
        <button onClick={onAgent} aria-pressed={dockTab === "agent"} title="Agent"><IconChat /><span className="label">Agent</span></button>
        <button onClick={onEvidence} title="Evidence"><IconEvidence /><span className="label">Evidence</span></button>
        <p className="grp t-eyebrow">Real venue</p>
        {NIGHT_HREF && <a href={NIGHT_HREF} title="Event night at Climate Pledge Arena"><IconTarget /><span className="label">Climate Pledge Arena</span></a>}
        {NIGHT_HREF && <a href="/ops" title="Staffing, prep and merch at Climate Pledge Arena"><IconCalendar /><span className="label">Staffing &amp; prep</span></a>}
        <a {...VENUE3D_LINK} title="Walk the real arena in 3D"><IconArena /><span className="label">3D arena</span></a>
      </nav>
      <div className="side-foot">
        <div className="who"><span className="avatar">DO</span><span className="t-label" style={{ flex: 1 }}>Demo operator</span><ThemeToggle /></div>
        <small>
          Open source, MIT License{SOURCE_URL ? <> · <a href={SOURCE_URL} target="_blank" rel="noreferrer">Source</a></> : null}
        </small>
      </div>
    </aside>
  );
}

export function EventPicker({ events, eventId, onPick }: { events: EventRow[]; eventId: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = events.find((e) => e.id === eventId);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="event-pick" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        {cur ? <>{cur.title} <small>{cur.date}</small></> : "Loading events"}
        <IconChevronDown />
      </button>
      {open && (
        <div className="menu" role="listbox" aria-label="Choose an event">
          {events.map((e) => (
            <button key={e.id} role="option" aria-selected={e.id === eventId} onClick={() => { onPick(e.id); setOpen(false); }}>
              <strong>{e.title}</strong>
              <em>{KIND_LABEL[e.kind] ?? e.kind}</em>
              <span>{e.date} · {e.attendance.toLocaleString("en-US")} expected</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar({ view, mode, events, eventId, onPick, onAgent, onEvidence, agentOn }: {
  view: View; mode: string; events: EventRow[]; eventId: string; onPick: (id: string) => void; onAgent: () => void; onEvidence: () => void; agentOn: boolean;
}) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <span className="venue-name">{VENUE.name}</span>
        <IconChevron className="sep" />
        <b>{VIEW_LABEL[view]}</b>
      </div>
      <Island />
      <span className="hide-sm"><DataBadge mode={mode} /></span>
      <EventPicker events={events} eventId={eventId} onPick={onPick} />
      <button className="btn btn-secondary btn-sm hide-sm" onClick={onEvidence}><IconEvidence />Evidence</button>
      <button className="btn btn-sm btn-primary" onClick={onAgent} aria-pressed={agentOn}><IconChat />Agent</button>
    </header>
  );
}

export function TabBar({ view, onAgent, agentOn }: { view: View; onAgent: () => void; agentOn: boolean }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      <a href={appHref("overview")} aria-current={view === "overview" ? "page" : undefined}><IconOverview />Overview</a>
      <a href={appHref("tonight")} aria-current={view === "tonight" ? "page" : undefined}><IconArena />Tonight</a>
      <a href={appHref("events")} aria-current={view === "events" ? "page" : undefined}><IconCalendar />Events</a>
      <button onClick={onAgent} aria-pressed={agentOn}><IconChat />Agent</button>
    </nav>
  );
}
