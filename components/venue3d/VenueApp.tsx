"use client";
// Explore Climate Pledge Arena in 3D: orbit the building, walk the concourses, sit in any section.
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  CAPACITY, CENTER, CITY, ENTRIES, EVENTS, FOOTPRINT, RING, RINK, SECTIONS, SPOTS, TIERS, eventKind, footprintEdge,
  ring, ringOffset, tierEnd, type Level,
} from "./geometry";
import { Nav, joy, navState, seatPose, walkable, type Mode, type NavRequest, type SeatPos } from "./Nav";
import { VenueScene, type View } from "./Scene";
import s from "./venue.module.css";
import { candidates, conceptName, layoutAssignment, slotByVenueId, usd, usePlan, whatIf, type Layout, type NightPlan } from "./Plan";
import { Tour, TOUR_KEY } from "./Tour";
import { goal, pulse, resetClock, setSound, showFor } from "./beat";
import { game } from "./Show";
import { Icon, Island, Ornament, PopRow, TabBar } from "./Hud";
import { HOME_HREF, NIGHT_HREF } from "@/components/lib";

/** One row per stand from the event-night planner (GET /api/night?event=&view=stands). */
type PlanRow = { standId: string; kind: "fixed" | "flex"; concept: string; servedTx: number; waitMin: number | null; par: number; contribution: number | null; z: number | null; tied: boolean };
type ColorBy = "category" | "wait" | "served" | "flex";

function waitColor(w: number | null) {
  if (w == null) return "#6b7280";
  if (w < 0.5) return "#2fa66a";
  if (w < 1) return "#9cc23a";
  if (w < 2) return "#e3a21a";
  if (w < 5) return "#e5622a";
  return "#d0342c";
}
const SERVED_RAMP = ["#3d4c16", "#66841a", "#a2c825", "#c8f02a", "#d7ff3a"];

const OCCUPANCY = { hockey: 0.92, basketball: 0.8, concert: 0.9 };

export default function VenueApp({ embedded = false }: { embedded?: boolean }) {
  const [eventId, setEventId] = useState(EVENTS[0]?.id);
  const event = EVENTS.find((e) => e.id === eventId) ?? EVENTS[0];
  const kind = eventKind(event);
  const [mode, setMode] = useState<Mode>("orbit");
  const [view, setView] = useState<View>("bowl");
  const [night, setNight] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [seat, setSeat] = useState<SeatPos>({ section: "120", row: 6 });
  const [level, setLevel] = useState<Level | "street">("upper");
  const [req, setReq] = useState<NavRequest | null>(null);
  const [finder, setFinder] = useState(false);
  const [help, setHelp] = useState(true);
  const n = useRef(0);
  const send = (r: Omit<NavRequest, "n"> & Record<string, unknown>) => setReq({ ...(r as NavRequest), n: ++n.current });
  const occupancy = OCCUPANCY[kind];
  // Default seat: facing the stage for concerts, centre ice otherwise.
  useEffect(() => { setSeat(kind === "concert" ? { section: "120", row: 6 } : { section: "101", row: 6 }); }, [kind]);
  const spot = SPOTS.find((x) => x.key === selected) ?? null;

  // Tonight's show: the act on the screens, its stage colours and original music, on one beat clock.
  const spec = useMemo(() => showFor(event, kind), [event, kind]);
  const when = useMemo(() => {
    const d = new Date(`${event.date}T${event.start || "19:00"}`);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }, [event]);
  const [show, setShow] = useState(true);
  const [sound, setSoundOn] = useState(false);
  const [intro, setIntro] = useState(false);
  const soundRef = useRef(false);
  useEffect(() => {
    resetClock(spec.style.bpm); game.home = 0; game.away = 0; game.start = 0; setIntro(false);
    if (soundRef.current) setSound(true, spec);
    return () => setSound(false, spec);
  }, [spec]);
  useEffect(() => { pulse.intro = intro; }, [intro]);
  const toggleSound = () => { const on = !sound; soundRef.current = on; setSoundOn(on); setSound(on, spec); if (on) setShow(true); };

  // Tonight's plan from the HiGHS planner (lib/deep via /api/night), or the preview snapshot.
  const [pinned, setPinned] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<Layout>("plan");
  const [colorBy, setColorBy] = useState<ColorBy>("category");
  useEffect(() => { setPinned({}); setLayout("plan"); }, [event.id]);
  const { plan: basePlan } = usePlan(event.id, {});
  const { plan: pinnedPlan } = usePlan(event.id, pinned);
  const nightPlan: NightPlan | null = Object.keys(pinned).length ? pinnedPlan : basePlan;
  const planRows = useMemo(() => (nightPlan ? new Map(nightPlan.stands.map((r) => [r.standId, r])) : null), [nightPlan]);
  const assignment = useMemo(() => (nightPlan ? layoutAssignment(nightPlan, layout) : null), [nightPlan, layout]);
  const statusQuo = useMemo(() => (nightPlan ? layoutAssignment(nightPlan, "status-quo") : null), [nightPlan]);
  /** Sign text for the flexible locations under the chosen layout. */
  const signNames = useMemo(() => {
    if (!assignment) return null;
    const out: Record<string, string> = {};
    for (const [venueId, slot] of slotByVenueId) if (assignment[slot.id]) out[venueId] = conceptName(assignment[slot.id]);
    return out;
  }, [assignment]);
  /** People queueing per stand, sized from the planner's served orders (about one person per 40 orders). */
  const queueLen = useMemo(() => {
    if (!planRows) return null;
    const out: Record<string, number> = {};
    planRows.forEach((r, id) => { out[id] = Math.max(1, Math.min(14, Math.round(r.servedTx / 40))); });
    return out;
  }, [planRows]);
  const standColors = useMemo(() => {
    if (!planRows || colorBy === "category") return null;
    const out: Record<string, string> = {};
    for (const sp of SPOTS) out[sp.stand.id] = "#55595f";
    if (colorBy === "flex") {
      for (const [venueId, slot] of slotByVenueId) out[venueId] = assignment && statusQuo && assignment[slot.id] !== statusQuo[slot.id] ? "#ff6a2b" : "#d7ff3a";
    } else if (colorBy === "wait") planRows.forEach((r, id) => { out[id] = waitColor(r.waitMin); });
    else {
      const vals = [...planRows.values()].map((r) => r.servedTx).sort((a, b) => a - b);
      planRows.forEach((r, id) => { const q = vals.findIndex((v) => v >= r.servedTx) / Math.max(1, vals.length - 1); out[id] = SERVED_RAMP[Math.min(4, Math.floor(q * 5))]; });
    }
    return out;
  }, [planRows, colorBy, assignment, statusQuo]);
  const [tour, setTour] = useState<number | null>(null);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(TOUR_KEY) === "1"; } catch {}
    if (!seen && !embedded) setTour(0);
  }, [embedded]);
  const row = spot ? planRows?.get(spot.stand.id) ?? null : null;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT")) return;
      if (e.code === "Digit1") setMode("orbit");
      if (e.code === "Digit2") setMode("walk");
      if (e.code === "Digit3") setMode("seat");
      if (e.code === "Escape") { setSelected(null); setFinder(false); }
      if (e.code === "KeyN") setNight((v) => !v);
      if (e.code === "KeyH") setHelp((v) => !v);
      if (mode === "seat") {
        const tierSecs = SECTIONS.filter((x) => x.tier === SECTIONS.find((y) => y.id === seat.section)?.tier);
        const i = tierSecs.findIndex((x) => x.id === seat.section);
        if (e.code === "BracketRight") setSeat({ ...seat, section: tierSecs[(i + 1) % tierSecs.length].id });
        if (e.code === "BracketLeft") setSeat({ ...seat, section: tierSecs[(i - 1 + tierSecs.length) % tierSecs.length].id });
        if (e.code === "ArrowUp") setSeat({ ...seat, row: seat.row + 1 });
        if (e.code === "ArrowDown") setSeat({ ...seat, row: Math.max(0, seat.row - 1) });
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [mode, seat]);

  const goStand = (key: string) => {
    const sp = SPOTS.find((x) => x.key === key); if (!sp) return;
    setSelected(key);
    if (mode === "seat") setMode("walk");
    send({ kind: "stand", spot: sp });
    if (mode === "orbit") { const want = sp.level === "ll2" ? "ll2" : "upper"; if (view !== want) setView(want); }
  };

  return (
    <div className={s.root} data-embedded={embedded || undefined}>
      <Canvas
        className={s.canvas}
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 55, near: 0.1, far: 5000, position: [CENTER[0] - 190, 150, CENTER[1] + 230] }}
        gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: night ? 1.0 : 0.95 }}
        aria-label="3D model of Climate Pledge Arena and Seattle Center"
      >
        <VenueScene
          view={view} night={night} inside={mode !== "orbit"} event={event} kind={kind} occupancy={occupancy}
          selected={selected} onSelect={setSelected} standColors={standColors} signNames={signNames} queueLen={queueLen}
          spec={spec} show={show} intro={intro}
          onFloorDoubleClick={(p) => {
            if (mode === "orbit") send({ kind: "fly", x: p.x, y: p.y, z: p.z, dist: 30 });
            else if (mode === "walk") send({ kind: "walkTo", x: p.x, z: p.z, level: p.y < -4 ? "ll2" : p.y < 0.6 ? (navState.inside ? "upper" : "street") : undefined });
          }}
        />
        <Nav mode={mode} seat={seat} request={req} onLevel={setLevel} startNorth={kind === "concert"} />
      </Canvas>

      {/* Event card */}
      <header className={`${s.top} ${s.glass}`}>
        <span className={s.homeRow}>
          <a className={s.home} href={HOME_HREF} aria-label="Back to Concourse">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>Concourse
          </a>
          {NIGHT_HREF && <a className={s.home} href={NIGHT_HREF}>Planner</a>}
        </span>
        <span className={s.eyebrow}>Climate Pledge Arena · Seattle Center</span>
        <strong className={s.eventName}>{kind === "concert" ? spec.look.label : `Kraken vs ${(spec.away?.name ?? "").replace(/^(New York|Los Angeles|San Jose|St\. Louis|Tampa Bay|New Jersey|\S+) /, "")}`}</strong>
        <span className={s.eventSub}>{when} · {Math.round(occupancy * 100)}% of {CAPACITY[kind].toLocaleString()} seats (modelled)</span>
        <label className={s.picker}>
          <span>Change event</span><Icon.chevron />
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event">
            {EVENTS.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.title}</option>)}
          </select>
        </label>
      </header>

      <Island spec={spec} concert={kind === "concert"} show={show} sound={sound} intro={intro} when={when}
        onShow={() => setShow((v) => !v)} onSound={toggleSound}
        onIntro={() => { setIntro((v) => !v); setShow(true); }}
        onGoal={() => { game.home++; goal(); setIntro(false); }} />

      <Ornament items={[
        ...(mode === "orbit" ? [
          { id: "cut", label: "Cutaway", icon: <Icon.layers />, pop: (["exterior", "bowl", "upper", "ll2"] as View[]).map((v) => (
            <PopRow key={v} on={view === v} onClick={() => setView(v)} label={{ exterior: "Whole building", bowl: "Bowl", upper: "Upper concourse", ll2: "Main concourse" }[v]} sub={{ exterior: "Roof on", bowl: "Roof lifted off", upper: "Street level", ll2: "LL2, below street" }[v]} />
          )) },
          { id: "cam", label: "Camera", icon: <Icon.camera />, pop: <>
            <PopRow onClick={() => send({ kind: "view", preset: "aerial" })} label="Aerial" sub="Seattle Center from above" />
            <PopRow onClick={() => { send({ kind: "view", preset: "bowl" }); if (view === "exterior") setView("bowl"); }} label={kind === "concert" ? "Stage" : "Rink"} sub="Over the bowl" />
            <PopRow onClick={() => { send({ kind: "view", preset: "street" }); setView("exterior"); }} label="Street" sub="At an entry" />
          </> },
        ] : []),
        ...(mode === "walk" ? [
          { id: "floor", label: "Floor", icon: <Icon.stairs />, pop: <>
            <PopRow on={level === "upper" || level === "street"} onClick={() => send({ kind: "level", level: "upper" })} label="Upper concourse" sub="Street level" />
            <PopRow on={level === "ll2"} onClick={() => send({ kind: "level", level: "ll2" })} label="Main concourse" sub="LL2, below street" />
            {level === "street" && <p className={s.popNote}>You are outside on Seattle Center. Walk back in through any entry.</p>}
          </> },
        ] : []),
        ...(mode === "seat" ? [
          { id: "seat", label: `Section ${seat.section} · row ${seat.row + 1}`, icon: <Icon.seat />, pop: <>
            <PopRow close={false} onClick={() => setSeat({ ...seat, row: Math.max(0, seat.row - 1) })} label="Closer" sub="One row down" />
            <PopRow close={false} onClick={() => setSeat({ ...seat, row: Math.min(TIERS[SECTIONS.find((x) => x.id === seat.section)!.tier].rows - 1, seat.row + 1) })} label="Higher" sub="One row up" />
            <p className={s.popNote}>Pick any section on the map.</p>
          </> },
        ] : []),
        { id: "night", label: night ? "Switch to daylight" : "Switch to event night", icon: night ? <Icon.moon /> : <Icon.sun />, onClick: () => setNight((v) => !v) },
        { id: "find", label: "Find a stand", icon: <Icon.search />, on: finder, onClick: () => setFinder((v) => !v) },
        ...(planRows ? [{ id: "color", label: "Colour stands by", icon: <Icon.palette />, on: colorBy !== "category", pop: <>
          <PopRow on={colorBy === "category"} onClick={() => setColorBy("category")} label="Food or drink" />
          <PopRow on={colorBy === "flex"} onClick={() => setColorBy("flex")} label="Flexible locations" sub="Orange = changed tonight" />
          <PopRow on={colorBy === "wait"} onClick={() => setColorBy("wait")} label="Peak wait" sub="Erlang C, tonight's plan" />
          <PopRow on={colorBy === "served"} onClick={() => setColorBy("served")} label="Orders served" sub="Tonight's plan" />
          {colorBy === "wait" && <p className={s.popNote}>Green under 30 s · amber 1-2 min · red 5+ · grey = not in plan</p>}
          {colorBy === "served" && <p className={s.popNote}>Dark = fewest · bright lime = most · grey = not in plan</p>}
        </> }] : []),
      ]} />

      <TabBar mode={mode} setMode={setMode} />

      {finder && <Finder onPick={(k) => { goStand(k); setFinder(false); }} onClose={() => setFinder(false)} />}

      {spot && (
        <aside className={s.card}>
          <button className={s.close} onClick={() => setSelected(null)} aria-label="Close">×</button>
          <span className={s.kicker}>{spot.stand.category}{spot.club ? ` · ${spot.club}` : spot.stand.clubTicketRequired ? " · club ticket" : ""}</span>
          <h2>{spot.stand.name}</h2>
          {spot.stand.concept && <p>{spot.stand.concept}</p>}
          <dl>
            <dt>Where</dt><dd>Section {spot.section} · {spot.levelLabel}</dd>
            {!!spot.stand.items?.length && (<><dt>Favourites</dt><dd>{spot.stand.items.join(", ")}</dd></>)}
            {!!spot.stand.valueItems?.length && (<><dt>Value menu</dt><dd>{spot.stand.valueItems.join(", ")}</dd></>)}
            {!!spot.stand.tags?.length && (<><dt>Tags</dt><dd>{spot.stand.tags.join(" · ")}</dd></>)}
            {row && (<><dt>Tonight</dt><dd>{row.kind === "flex" ? `Runs ${row.concept} · ` : ""}{Math.round(row.servedTx).toLocaleString()} orders · {row.waitMin == null ? "line overflows at peak (lost orders counted)" : `peak wait ${row.waitMin.toFixed(1)} min`} · stock {Math.round(row.par).toLocaleString()}{row.contribution != null ? ` · ${usd(row.contribution)}` : ""}</dd></>)}
          </dl>
          {nightPlan && slotByVenueId.has(spot.stand.id) && (
            <WhatIf key={spot.stand.id + event.id} venueId={spot.stand.id} eventId={event.id} plan={nightPlan} basePlan={basePlan} pinned={pinned} setPinned={setPinned} />
          )}
          <div className={s.row}>
            <button className={s.primary} onClick={() => { setMode("walk"); setTimeout(() => send({ kind: "stand", spot }), 50); }}>Walk up to it</button>
            {mode === "orbit" && <button onClick={() => send({ kind: "stand", spot })}>Fly to it</button>}
          </div>
          <a className={s.src} href={spot.stand.source} target="_blank" rel="noreferrer">Source: arena dining guide</a>
        </aside>
      )}

      {nightPlan && tour === null && (
        <PlanPanel plan={nightPlan} basePlan={basePlan} layout={layout} setLayout={(l) => { setLayout(l); setColorBy("flex"); }} pinned={pinned} resetPins={() => setPinned({})}
          onGo={(venueId) => { const sp = SPOTS.find((x) => x.stand.id === venueId); if (sp) goStand(sp.key); }} />
      )}
      {tour !== null && (
        <Tour step={tour} setStep={setTour} plan={nightPlan} eventTitle={event.title}
          actions={{ setMode, setView, setNight, setColorBy: (c) => setColorBy(c as ColorBy), setSelected, setSeat, send, setLayout }} />
      )}

      <Minimap mode={mode} level={level} seat={seat} selected={selected}
        onPickSection={(id) => { setSeat({ section: id, row: Math.min(6, TIERS[SECTIONS.find((x) => x.id === id)!.tier].rows - 1) }); if (mode !== "seat") setMode("seat"); }}
        onPickStand={goStand}
        onPickPoint={(x, z) => {
          if (mode === "orbit") send({ kind: "fly", x, y: 0, z, dist: 60 });
          else if (mode === "walk") {
            const inside = FOOTPRINT && pointIn(x, z);
            const lvl: Level | "street" = !inside ? "street" : level === "ll2" && ringOffset(x, z).d < RING.ll2.outer ? "ll2" : "upper";
            if (walkable(lvl, x, z)) send({ kind: "walkTo", x, z, level: lvl });
          }
        }}
      />

      {mode === "walk" && <Joystick />}

      {help && tour === null && (
        <div className={`${s.help} ${s.glass}`}>
          {mode === "orbit" && <p><button className={s.linkBtn} onClick={() => setTour(0)}>Take the tour</button><b>Drag</b> to orbit · <b>right-drag</b> or <b>two fingers</b> to pan · <b>scroll</b> to zoom · <b>double-click</b> to fly there</p>}
          {mode === "walk" && <p><b>WASD</b> or the stick to walk · <b>drag</b> to look · <b>double-click</b> the floor to walk there</p>}
          {mode === "seat" && <p><b>Drag</b> to look around · <b>[ ]</b> next section · <b>↑ ↓</b> row</p>}
          <button className={s.hintClose} onClick={() => setHelp(false)} aria-label="Hide tips"><Icon.close /></button>
        </div>
      )}

      <footer className={s.attrib}>
        Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors (ODbL) · sections and stands from climatepledgearena.com · bowl, crowd and roof are modelled, not surveyed
      </footer>
    </div>
  );
}

function pointIn(x: number, z: number) {
  let inside = false;
  for (let i = 0, j = FOOTPRINT.length - 1; i < FOOTPRINT.length; j = i++) {
    const [xi, zi] = FOOTPRINT[i], [xj, zj] = FOOTPRINT[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/* ---------- Finder ---------- */

function Finder({ onPick, onClose }: { onPick: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return SPOTS.filter((x) => !t || x.stand.name.toLowerCase().includes(t) || (x.stand.items ?? []).join(" ").toLowerCase().includes(t) || x.section === t)
      .sort((a, b) => a.stand.name.localeCompare(b.stand.name));
  }, [q]);
  return (
    <div className={s.finder}>
      <div className={s.finderHd}>
        <input autoFocus placeholder="Stand, item or section…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={s.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <ul>
        {list.map((x) => (
          <li key={x.key}>
            <button onClick={() => onPick(x.key)}>
              <i data-cat={x.stand.category} />
              <span>{x.stand.name}</span>
              <em>Sec {x.section} · {x.level === "ll2" ? "LL2" : "Upper"}</em>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Minimap ---------- */

function ringPath(d: number, n = 96) {
  return Array.from({ length: n }, (_, i) => ring((i / n) * Math.PI * 2, d)).map(([x, z], i) => `${i ? "L" : "M"}${x.toFixed(1)},${z.toFixed(1)}`).join("") + "Z";
}

function Minimap({ mode, level, seat, selected, onPickSection, onPickStand, onPickPoint }: {
  mode: Mode; level: Level | "street"; seat: SeatPos; selected: string | null;
  onPickSection: (id: string) => void; onPickStand: (key: string) => void; onPickPoint: (x: number, z: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const [zoomOut, setZoomOut] = useState(false);
  const youRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const g = youRef.current;
      if (g) {
        const fx = -Math.sin(navState.yaw), fz = -Math.cos(navState.yaw);
        g.setAttribute("transform", `translate(${navState.x.toFixed(1)},${navState.z.toFixed(1)}) rotate(${((Math.atan2(fz, fx) * 180) / Math.PI).toFixed(1)})`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const pad = zoomOut ? 260 : 14;
  const xs = FOOTPRINT.map((p) => p[0]), zs = FOOTPRINT.map((p) => p[1]);
  const vb = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...zs) - Math.min(...zs) + pad * 2];
  const showLevel: Level = mode === "walk" ? (level === "ll2" ? "ll2" : "upper") : "ll2";
  const secTier = mode === "seat" ? null : showLevel === "ll2" ? "t1" : "t2";
  const fp = FOOTPRINT.map(([x, z], i) => `${i ? "L" : "M"}${x},${z}`).join("") + "Z";
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current; if (!svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    onPickPoint(p.x, p.y);
  };
  if (!open) return <button className={s.mapToggle} onClick={() => setOpen(true)}>Map</button>;
  return (
    <div className={s.map}>
      <div className={s.mapHd}>
        <span>{mode === "seat" ? "Pick a section" : mode === "walk" ? (level === "ll2" ? "LL2 Main Concourse" : level === "street" ? "Seattle Center" : "Upper Concourse") : "Main concourse stands"}</span>
        <button onClick={() => setZoomOut((v) => !v)}>{zoomOut ? "Arena" : "Area"}</button>
        <button onClick={() => setOpen(false)} aria-label="Hide map">×</button>
      </div>
      <svg ref={svgRef} viewBox={vb.join(" ")} onClick={click}>
        {zoomOut && CITY.buildings.map((b) => <path key={b.id} d={b.poly.map(([x, z], i) => `${i ? "L" : "M"}${x},${z}`).join("") + "Z"} className={s.bldg} />)}
        <path d={fp} className={s.fp} />
        <path d={ringPath(RING.ll2.outer)} className={s.ringLine} />
        <path d={ringPath(tierEnd(TIERS.t2).d)} className={s.ringLine} />
        <path d={ringPath(tierEnd(TIERS.t1).d)} className={s.ringLine} />
        <rect x={CENTER[0] - RINK.hx} y={CENTER[1] - RINK.hz} width={RINK.hx * 2} height={RINK.hz * 2} rx={RINK.corner} className={s.rink} />
        {ENTRIES.map((en) => { const [x, z] = footprintEdge(en.theta); return <circle key={en.id} cx={x} cy={z} r={2.6} className={s.entry}><title>{en.label}</title></circle>; })}
        {SECTIONS.filter((x) => (secTier ? x.tier === secTier : true)).map((x) => {
          const t = TIERS[x.tier];
          const d = (t.d0 + tierEnd(t).d) / 2;
          const [px, pz] = ring(x.theta, d);
          const on = mode === "seat" && seat.section === x.id;
          return (
            <g key={x.id} className={`${s.sec} ${on ? s.secOn : ""}`} onClick={(e) => { e.stopPropagation(); onPickSection(x.id); }}>
              <circle cx={px} cy={pz} r={mode === "seat" ? 3.2 : 2.6} />
              <text x={px} y={pz + 1.1}>{x.id}</text>
            </g>
          );
        })}
        {mode !== "seat" && SPOTS.filter((x) => x.level === showLevel).map((x) => (
          <circle key={x.key} cx={x.x} cy={x.z} r={selected === x.key ? 3 : 1.9} className={s.stand} data-cat={x.stand.category} data-on={selected === x.key || undefined}
            onClick={(e) => { e.stopPropagation(); onPickStand(x.key); }}><title>{x.stand.name}</title></circle>
        ))}
        <g ref={youRef} className={s.you}>
          <path d="M0,0 L22,-11 A24,24 0 0 1 22,11 Z" className={s.fov} />
          <circle r={3.4} />
        </g>
      </svg>
      <div className={s.mapFt}>N ↑ · {mode === "seat" ? `Seat ${seatPose(seat).y > 0 ? "upper" : "lower"} bowl` : "click to go"}</div>
    </div>
  );
}

/* ---------- Joystick ---------- */

function Joystick() {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const update = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    joy.x = x; joy.y = y; joy.run = l > 0.92;
    setKnob({ x, y });
  };
  const end = () => { id.current = null; joy.x = 0; joy.y = 0; joy.run = false; setKnob({ x: 0, y: 0 }); };
  useEffect(() => end, []);
  return (
    <div
      ref={ref} className={s.joy}
      onPointerDown={(e) => { id.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={(e) => { if (id.current === e.pointerId) update(e); }}
      onPointerUp={end} onPointerCancel={end}
      aria-label="Walk joystick"
    >
      <span style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
    </div>
  );
}

/* ---------- Tonight's plan ---------- */

function PlanPanel({ plan, basePlan, layout, setLayout, pinned, resetPins, onGo }: {
  plan: NightPlan; basePlan: NightPlan | null; layout: Layout; setLayout: (l: Layout) => void;
  pinned: Record<string, string>; resetPins: () => void; onGo: (venueId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const sq = plan.baselines.find((b) => b.id === "status-quo");
  const cl = plan.baselines.find((b) => b.id === "claude-no-qloo");
  const assign = layoutAssignment(plan, layout);
  const pins = Object.keys(pinned).length;
  const live = plan.taste.status === "live";
  if (!open) return <button className={s.planToggle} onClick={() => setOpen(true)}>Tonight&apos;s plan · {usd(plan.plan.total)}</button>;
  return (
    <section className={s.plan} aria-label="Tonight's plan">
      <button className={s.close} onClick={() => setOpen(false)} aria-label="Hide plan">×</button>
      <span className={s.kicker}>Tonight&apos;s plan · HiGHS {plan.plan.solver.status.toLowerCase()}{plan.plan.solver.gap === 0 ? ", gap 0" : ""}</span>
      <h3>{usd(plan.plan.total)} <small>expected contribution, {plan.plan.decisions.length} flexible locations</small></h3>
      <p className={s.planSub}>{Math.round(plan.attendance).toLocaleString()} expected · {usd(plan.fnbPerCap)} food and drink per head (modelled)</p>
      <div className={s.seg} role="tablist" aria-label="Layout">
        {([["plan", "Plan"], ["status-quo", "Keep current"], ["claude-no-qloo", "Claude, no Qloo"]] as [Layout, string][]).map(([l, label]) => {
          const b = l === "plan" ? null : plan.baselines.find((x) => x.id === l);
          const off = b && b.status !== "scored";
          return <button key={l} className={layout === l ? s.on : ""} disabled={!!off} onClick={() => setLayout(l)} title={b?.note}>{label}</button>;
        })}
      </div>
      <ul className={s.planList}>
        {plan.plan.decisions.map((d) => {
          const c = assign[d.slot.id];
          const changed = sq?.assignment && c !== sq.assignment[d.slot.id];
          return (
            <li key={d.slot.id}>
              <button onClick={() => onGo(d.slot.venueId)}>
                <i data-changed={changed || undefined} />
                <span>{conceptName(c)}<em>{d.slot.label}</em></span>
                <b>{layout === "plan" ? usd(d.economics.contribution) : ""}{pinned[d.slot.id] ? " · pinned" : ""}</b>
              </button>
            </li>
          );
        })}
      </ul>
      <dl className={s.planCmp}>
        {sq?.status === "scored" && <><dt>Keep current</dt><dd>{usd(sq.total!)} · {sq.slotsDifferent} differ{sq.total! < plan.plan.total ? ` · plan +${usd(plan.plan.total - sq.total!)}` : ""}</dd></>}
        {cl?.status === "scored" ? <><dt>Claude, no Qloo</dt><dd>{usd(cl.total!)} · {cl.slotsDifferent} differ · plan {plan.plan.total >= cl.total! ? "+" : ""}{usd(plan.plan.total - cl.total!)}</dd></> : <><dt>Claude, no Qloo</dt><dd>recorded for 5 pre-registered events only</dd></>}
      </dl>
      <p className={s.planNote}>
        {live
          ? <>Qloo taste is live for this event: the plan uses it, and differs from the without-Qloo plan at {plan.ablation.slotsDifferent} locations.</>
          : <>Qloo taste is pending (no key yet), so this plan runs without it. Without taste, {plan.ablation.tiedSlotsWithoutTaste} of {plan.plan.decisions.length} picks are ties the model can&apos;t break; Qloo&apos;s read of tonight&apos;s crowd is what breaks them.</>}
      </p>
      {pins > 0 && <p className={s.planNote}>{pins} location{pins > 1 ? "s" : ""} pinned by you; the solver re-planned the rest. <button className={s.linkBtn} onClick={resetPins}>Reset</button>{basePlan ? ` · ${plan.plan.total >= basePlan.plan.total ? "+" : ""}${usd(plan.plan.total - basePlan.plan.total)} vs the solver's own plan` : ""}</p>}
      {plan.source === "snapshot" && <p className={s.planNote}>Snapshot of the planner&apos;s output for this preview. What-ifs re-solve only in the full app.</p>}
    </section>
  );
}

function WhatIf({ venueId, eventId, plan, basePlan, pinned, setPinned }: {
  venueId: string; eventId: string; plan: NightPlan; basePlan: NightPlan | null;
  pinned: Record<string, string>; setPinned: (p: Record<string, string>) => void;
}) {
  const slot = slotByVenueId.get(venueId)!;
  const decision = plan.plan.decisions.find((d) => d.slot.id === slot.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ concept: string; total: number; here: number; changed: number } | { error: string } | null>(null);
  const base = basePlan ?? plan;
  const run = async (conceptId: string) => {
    setBusy(conceptId); setRes(null);
    try {
      const p = await whatIf(eventId, { ...pinned, [slot.id]: conceptId });
      const here = p.plan.decisions.find((d) => d.slot.id === slot.id)?.economics.contribution ?? 0;
      const baseMap = layoutAssignment(base, "plan"), newMap = layoutAssignment(p, "plan");
      const changed = Object.keys(newMap).filter((k) => k !== slot.id && newMap[k] !== baseMap[k]).length;
      setRes({ concept: conceptId, total: p.plan.total, here, changed });
    } catch {
      setRes({ error: plan.source === "snapshot" ? "What-ifs need the full app (the solver runs on the server)." : "The solver did not answer." });
    } finally { setBusy(null); }
  };
  return (
    <div className={s.whatif}>
      <span className={s.label}>Flexible location · try a different concept</span>
      {pinned[slot.id] ? (
        <p className={s.planNote}>You pinned <b>{conceptName(pinned[slot.id])}</b> here ({usd(decision?.economics.contribution ?? 0)}). The solver&apos;s own pick was <b>{base.plan.decisions.find((d) => d.slot.id === slot.id)?.concept.name ?? "–"}</b>.{" "}
          <button className={s.linkBtn} onClick={() => { const n = { ...pinned }; delete n[slot.id]; setPinned(n); }}>Unpin</button></p>
      ) : <p className={s.planNote}>{decision ? <>The solver picked <b>{decision.concept.name}</b> ({usd(decision.economics.contribution)}){decision.tiedWith.length ? `, tied with ${decision.tiedWith.length} others without taste` : decision.runnerUp ? (decision.economics.contribution >= decision.runnerUp.contribution ? `, ${usd(decision.economics.contribution - decision.runnerUp.contribution)} ahead of ${decision.runnerUp.concept.name}` : `. ${decision.runnerUp.concept.name} would earn ${usd(decision.runnerUp.contribution)} here, but the plan places it at another location`) : ""}.</> : null}</p>}
      <div className={s.chips}>
        {candidates(venueId).map((c) => (
          <button key={c.id} className={decision?.concept.id === c.id ? s.on : ""} disabled={!!busy} onClick={() => run(c.id)}>{busy === c.id ? "Solving…" : c.name}</button>
        ))}
      </div>
      {res && "error" in res && <p className={s.planNote}>{res.error}</p>}
      {res && !("error" in res) && (
        <div className={s.result}>
          <p>HiGHS re-solve with <b>{conceptName(res.concept)}</b> here: plan {usd(res.total)} (<b>{res.total >= base.plan.total ? "+" : ""}{usd(res.total - base.plan.total)}</b> vs the solver&apos;s pick), this location {usd(res.here)}{res.changed ? `, ${res.changed} other location${res.changed > 1 ? "s" : ""} re-planned` : ""}.</p>
          <div className={s.row}>
            <button className={s.primary} onClick={() => { setPinned({ ...pinned, [slot.id]: res.concept }); setRes(null); }}>Pin it</button>
            <button onClick={() => setRes(null)}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
