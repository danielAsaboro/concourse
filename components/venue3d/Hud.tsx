"use client";
// Liquid-glass chrome for the 3D venue: the Dynamic Island for the live show, the floating tab bar,
// and the ornament of controls on the right with its popovers.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { pulse, type ShowSpec } from "./beat";
import { game } from "./Show";
import type { Mode } from "./Nav";
import s from "./venue.module.css";

/* ---------- Icons (SF Symbols-like strokes) ---------- */

const P = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Icon = {
  orbit: () => <svg {...P}><ellipse cx="12" cy="12" rx="9" ry="4" /><circle cx="12" cy="12" r="2.2" /><path d="M12 3v2M12 19v2" /></svg>,
  walk: () => <svg {...P}><circle cx="13" cy="4.5" r="1.8" /><path d="M10 21l2-6 3 2v4M8 12l3-4 3 1 2 3M12 8l-1 5" /></svg>,
  seat: () => <svg {...P}><path d="M6 20v-6h12v6M7 14V7a2 2 0 012-2h6a2 2 0 012 2v7" /></svg>,
  layers: () => <svg {...P}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>,
  camera: () => <svg {...P}><rect x="3" y="7" width="13" height="10" rx="2.5" /><path d="M16 11l5-3v8l-5-3" /></svg>,
  stairs: () => <svg {...P}><path d="M3 20h5v-5h5v-5h5V5h3" /></svg>,
  moon: () => <svg {...P}><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></svg>,
  sun: () => <svg {...P}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  search: () => <svg {...P}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>,
  palette: () => <svg {...P}><path d="M12 3a9 9 0 100 18c1.2 0 1.6-.9 1.6-1.7 0-1.3-1-1.6-1-2.7 0-1 .8-1.6 1.8-1.6H17a4 4 0 004-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /></svg>,
  spark: () => <svg {...P}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7L19 16z" /></svg>,
  speaker: () => <svg {...P}><path d="M4 10v4h3l5 4V6L7 10H4z" /><path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" /></svg>,
  mute: () => <svg {...P}><path d="M4 10v4h3l5 4V6L7 10H4z" /><path d="M16 10l5 5M21 10l-5 5" /></svg>,
  flag: () => <svg {...P}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>,
  goal: () => <svg {...P}><path d="M4 18V8h16v10" /><path d="M4 8l3 4h10l3-4M7 12v6M17 12v6M10 12v6M14 12v6" /></svg>,
  check: () => <svg {...P} width={15} height={15}><path d="M5 12l4.5 4.5L19 7" /></svg>,
  chevron: () => <svg {...P} width={14} height={14}><path d="M6 9l6 6 6-6" /></svg>,
  close: () => <svg {...P} width={14} height={14}><path d="M6 6l12 12M18 6L6 18" /></svg>,
};

/* ---------- Dynamic Island ---------- */

const PHASE: Record<string, string> = { intro: "Opening", build: "Building", drop: "Peak", break: "Ballad" };
const STYLE_LABEL: Record<string, string> = { rock: "Rock", pop: "Pop", rnb: "R&B", country: "Country", indie: "Indie", electro: "Electronic", orchestral: "Orchestral rock", hockey: "Arena organ" };

export function Island({ spec, concert, show, sound, intro, onShow, onSound, onIntro, onGoal, when }: {
  spec: ShowSpec; concert: boolean; show: boolean; sound: boolean; intro: boolean; when: string;
  onShow: () => void; onSound: () => void; onIntro: () => void; onGoal: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [goalLive, setGoalLive] = useState(false);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const phase = useRef<HTMLSpanElement>(null);
  const score = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const seenGoal = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const on = show;
      bars.current.forEach((b, i) => { if (b) b.style.transform = `scaleY(${on ? 0.18 + 0.82 * pulse.bands[(i * 3) % 16] : 0.15})`; });
      if (phase.current) phase.current.textContent = on ? PHASE[pulse.section] ?? "" : "House lights";
      if (score.current && spec.home && spec.away) score.current.textContent = `${spec.home.short} ${game.home} – ${game.away} ${spec.away.short}`;
      if (clock.current) {
        const secs = game.start ? Math.max(0, 1200 - (Math.floor((performance.now() - game.start) / 1000) % 1200)) : 1200;
        clock.current.textContent = `P${game.period} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      }
      if (pulse.goalAt && pulse.goalAt !== seenGoal.current) {
        seenGoal.current = pulse.goalAt; setGoalLive(true);
        window.setTimeout(() => setGoalLive(false), 4200);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [show, spec]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  const dot = spec.look.colors[0];
  const state = goalLive ? "goal" : open ? "open" : "compact";
  return (
    <div ref={root} className={s.island} data-state={state} style={{ ["--act" as string]: dot }}>
      <button className={s.islandBar} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Tonight's show">
        <i className={s.liveDot} data-live={show || undefined} />
        {concert ? (
          <span className={s.islandTitle}><b>{spec.look.label}</b><span ref={phase} /></span>
        ) : (
          <span className={s.islandTitle}><b ref={score} /><span ref={clock} /></span>
        )}
        <span className={s.eq} aria-hidden>{[0, 1, 2, 3, 4].map((i) => <span key={i} ref={(el) => { bars.current[i] = el; }} />)}</span>
      </button>
      {state === "goal" && (
        <div className={s.islandGoal}><b>GOAL</b><span>{spec.home?.name}</span></div>
      )}
      {open && !goalLive && (
        <div className={s.islandBody}>
          <div className={s.islandMeta}>
            <span>{concert ? "Live at Climate Pledge Arena" : "Tonight at Climate Pledge Arena"}</span>
            <span>{when} · {STYLE_LABEL[spec.style.id]} · {spec.style.bpm} BPM</span>
          </div>
          <div className={s.islandBtns}>
            <IslandBtn on={show} onClick={onShow} icon={<Icon.spark />} label={concert ? "Light show" : "Arena lights"} />
            <IslandBtn on={sound} onClick={onSound} icon={sound ? <Icon.speaker /> : <Icon.mute />} label={sound ? "Sound on" : "Sound off"} />
            {!concert && <IslandBtn on={intro} onClick={onIntro} icon={<Icon.flag />} label="Pre-game" />}
            {!concert && <IslandBtn hot onClick={onGoal} icon={<Icon.goal />} label="Goal" />}
          </div>
          <p className={s.islandNote}>Music is original, made in your browser in this {concert ? "act's" : "game's"} style. It is not the artist&apos;s recording and only plays after you turn it on.</p>
        </div>
      )}
    </div>
  );
}

function IslandBtn({ on, hot, onClick, icon, label }: { on?: boolean; hot?: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button className={s.islandBtn} data-on={on || undefined} data-hot={hot || undefined} onClick={onClick} aria-pressed={on}>
      <span className={s.islandIco}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ---------- Floating tab bar ---------- */

export function TabBar({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const tabs: [Mode, string, ReactNode][] = [["orbit", "Fly", <Icon.orbit key="o" />], ["walk", "Walk", <Icon.walk key="w" />], ["seat", "Seat", <Icon.seat key="s" />]];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const i = tabs.findIndex((t) => t[0] === mode), el = refs.current[i];
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  return (
    <nav className={s.tabbar} role="tablist" aria-label="How to explore">
      <span className={s.tabPill} style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden />
      {tabs.map(([m, label, icon], i) => (
        <button key={m} ref={(el) => { refs.current[i] = el; }} role="tab" aria-selected={mode === m} data-on={mode === m || undefined} onClick={() => setMode(m)} title={`${label} (${i + 1})`}>
          {icon}<span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ---------- Ornament: icon controls with popovers ---------- */

export type OrnItem = { id: string; label: string; icon: ReactNode; on?: boolean; onClick?: () => void; pop?: ReactNode };

export function Ornament({ items }: { items: OrnItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  const cur = items.find((it) => it.id === open && it.pop);
  const idx = cur ? items.indexOf(cur) : 0;
  return (
    <div ref={root} className={s.ornWrap}>
      <div className={s.ornament} role="toolbar" aria-label="View controls">
        {items.map((it) => (
          <button key={it.id} className={s.ornBtn} data-on={it.on || open === it.id || undefined} aria-label={it.label} title={it.label} aria-expanded={it.pop ? open === it.id : undefined}
            onClick={() => { if (it.pop) setOpen(open === it.id ? null : it.id); else { it.onClick?.(); setOpen(null); } }}>
            {it.icon}
          </button>
        ))}
      </div>
      {cur && (
        // A sibling of the toolbar, not a child, so its own lens blurs the arena rather than the toolbar glass.
        <div key={cur.id} className={s.popover} style={{ top: idx * 46 - 2 }} role="dialog" aria-label={cur.label}
          onClick={(e) => { if ((e.target as HTMLElement).closest("[data-close]")) setOpen(null); }}>
          <span className={s.popTitle}>{cur.label}</span>
          {cur.pop}
        </div>
      )}
    </div>
  );
}

/** A row in a popover list, with a check when selected. */
export function PopRow({ on, onClick, label, sub, close = true }: { on?: boolean; onClick: () => void; label: string; sub?: string; close?: boolean }) {
  return (
    <button className={s.popRow} data-on={on || undefined} data-close={close || undefined} onClick={onClick}>
      <span><b>{label}</b>{sub && <small>{sub}</small>}</span>
      {on && <Icon.check />}
    </button>
  );
}
