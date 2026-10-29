"use client";
// Dynamic Island: one black capsule at the top of every page that carries live state
// (the agent ranking stands, the solver running, a swap that just landed) and rests
// on a one-line summary of tonight. Pages talk to it through `island`, so any
// component can raise an activity without threading props.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type Tone = "idle" | "busy" | "done" | "warn";
export type Activity = {
  tone?: Tone;
  title: string;
  /** short trailing figure in the compact capsule, e.g. "$4,089" */
  value?: string;
  /** second line, shown when expanded */
  detail?: string;
  /** small facts shown as a row when expanded */
  facts?: { label: string; value: string }[];
  action?: { label: string; href?: string; onClick?: () => void };
  /** ms before a transient activity hands back to the resting state */
  ttl?: number;
};

type State = { rest: Activity | null; live: (Activity & { key: number }) | null };
let state: State = { rest: null, live: null };
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
const emit = (s: Partial<State>) => { state = { ...state, ...s }; subs.forEach((f) => f()); };

export const island = {
  /** The resting summary (what the page is about right now). */
  rest(a: Activity | null) { emit({ rest: a }); },
  /** A transient activity; busy ones stay until replaced, others clear after ttl. */
  show(a: Activity): number {
    clearTimeout(timer);
    const key = ++seq;
    emit({ live: { ...a, key } });
    const tone = a.tone ?? "done";
    if (tone !== "busy") timer = setTimeout(() => emit({ live: null }), a.ttl ?? 3600);
    return key;
  },
  /** Clear the live activity, or only the one with this key if it is still showing. */
  clear(key?: number) {
    if (key !== undefined && state.live?.key !== key) return;
    clearTimeout(timer); emit({ live: null });
  },
};

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => state;
const server = () => state;

function Glyph({ tone }: { tone: Tone }) {
  if (tone === "busy") return <span className="di-spin" aria-hidden />;
  if (tone === "done") return (
    <span className="di-ok" aria-hidden>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </span>
  );
  return <span className="di-dot" data-tone={tone} aria-hidden />;
}

export function Island({ className, fallback }: { className?: string; fallback?: Activity }) {
  const s = useSyncExternalStore(subscribe, snap, server);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const a = s.live ?? s.rest ?? fallback ?? null;

  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setPinned(false); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [pinned]);

  if (!a) return <div className={`di-slot ${className ?? ""}`} aria-hidden />;
  const tone = a.tone ?? (s.live ? "done" : "idle");
  const rich = !!(a.detail || a.facts?.length || a.action);
  // Activities open by themselves; the resting state opens on hover or tap.
  const open = rich && (!!s.live || hover || pinned);
  const Act = a.action?.href ? "a" : "button";

  return (
    <div className={`di-slot ${className ?? ""}`}>
      <div
        ref={root}
        className="di"
        data-open={open || undefined}
        data-tone={tone}
        role="status"
        aria-live="polite"
        onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <button className="di-bar" onClick={() => rich && setPinned((p) => !p)} aria-expanded={rich ? open : undefined} aria-label={a.title}>
          <Glyph tone={tone} />
          <b key={s.live?.key ?? "rest"}>{a.title}</b>
          {a.value && <span className="di-val">{a.value}</span>}
        </button>
        {open && (
          <div className="di-body">
            {a.detail && <p>{a.detail}</p>}
            {!!a.facts?.length && (
              <dl>{a.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
            )}
            {a.action && (
              <Act className="di-act" {...(a.action.href ? { href: a.action.href } : {})} onClick={() => { a.action?.onClick?.(); island.clear(s.live?.key); setPinned(false); }}>
                {a.action.label}
              </Act>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Raise a busy activity while `busy` is true; hand back a result when it settles. */
export function useIslandTask(busy: boolean, running: Activity, done?: () => Activity | null) {
  const mine = useRef<number | null>(null);
  useEffect(() => {
    // A confirmation that is still showing (a swap, say) wins over the quick re-plan it triggered.
    if (busy) { if (!state.live || state.live.tone === "busy") mine.current = island.show({ ...running, tone: "busy" }); }
    else if (mine.current !== null) {
      // Hand over only if our activity is still the one showing (a swap toast may have replaced it).
      const d = done?.();
      if (state.live?.key === mine.current) { if (d) island.show({ tone: "done", ...d }); else island.clear(); }
      mine.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
}

