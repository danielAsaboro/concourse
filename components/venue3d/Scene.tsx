"use client";
// Climate Pledge Arena and the Seattle Center blocks around it.
import { useFrame } from "@react-three/fiber";
import { Html, Sky, Stars } from "@react-three/drei";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { ConcertShow, HockeyShow, ShowClock, houseLevel, useRibbonMaterial } from "./Show";
import type { ShowSpec } from "./beat";
import * as THREE from "three";
import {
  CENTER, FOOTPRINT, RINK, SECTIONS, SPOTS, TIERS, Y, ring, ringNormal, tierEnd,
  RING, type EventKind, type Level, type StandSpot, type TierKey, type VenueEvent,
} from "./geometry";
import {
  chairGeometry, cityGeometry, courtTexture, facadeGeometry, getWindowTexture, iceTexture, personGeometry,
  ringPoly, roofGeometry, roundedRect, seatSpots, shapeOf, sweep, tierProfile, treeSpots, type SeatSpot,
} from "./build";

export type View = "exterior" | "bowl" | "upper" | "ll2";
export type SceneOpts = {
  view: View;
  night: boolean;
  /** Inside the building on foot or in a seat: show the full building. */
  inside: boolean;
  event: VenueEvent;
  kind: EventKind;
  occupancy: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Optional colour per arena stand id (e.g. from the event-night planner), overriding the category colour. */
  standColors?: Record<string, string> | null;
  /** Sign text per arena stand id (e.g. the concept tonight's plan puts at a flexible location). */
  signNames?: Record<string, string> | null;
  /** People queueing per arena stand id, from the planner's demand. */
  queueLen?: Record<string, number> | null;
  onFloorDoubleClick?: (p: THREE.Vector3) => void;
  /** The act or game on tonight: screens, stage colours, music style. */
  spec: ShowSpec;
  /** Light show running (house lights down for concerts). */
  show: boolean;
  /** Hockey pre-game show: house dark, projection on the ice. */
  intro: boolean;
};

export function visibility(view: View, inside: boolean) {
  if (inside) return { roof: "solid" as const, t3: true, upper: true, glass: true };
  return {
    roof: view === "exterior" ? ("solid" as const) : ("none" as const),
    t3: view === "exterior" || view === "bowl",
    upper: view !== "ll2",
    glass: view !== "ll2",
  };
}

/* ---------- Materials ---------- */

function usePalette(night: boolean) {
  return useMemo(() => ({
    concrete: new THREE.MeshStandardMaterial({ color: night ? "#7d7a75" : "#bdb8b0", roughness: 0.92 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: night ? "#4d4b48" : "#8f8a82", roughness: 0.95 }),
    ll2Floor: new THREE.MeshStandardMaterial({ color: night ? "#8c8780" : "#a9a39a", roughness: 0.45, metalness: 0.05 }),
    upperFloor: new THREE.MeshStandardMaterial({ color: night ? "#9a958d" : "#b8b2a8", roughness: 0.5, metalness: 0.05 }),
    eventFloor: new THREE.MeshStandardMaterial({ color: "#1b1c1f", roughness: 0.8 }),
    seat: new THREE.MeshStandardMaterial({ color: "#2b2f37", roughness: 0.6 }),
    rail: new THREE.MeshPhysicalMaterial({ color: "#cfe2ea", roughness: 0.05, transparent: true, opacity: 0.22, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
    glass: new THREE.MeshStandardMaterial({ color: night ? "#2a3a4c" : "#a7bccb", roughness: 0.06, metalness: 0.35, transparent: true, opacity: night ? 0.28 : 0.38, side: THREE.DoubleSide, depthWrite: false, emissive: night ? "#ffcf8f" : "#000000", emissiveIntensity: night ? 0.08 : 0 }),
    mullion: new THREE.MeshStandardMaterial({ color: "#3a3d42", roughness: 0.5, metalness: 0.6 }),
    roof: new THREE.MeshStandardMaterial({ color: night ? "#6d6c69" : "#c9c6bf", roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide }),
    ribbon: new THREE.MeshStandardMaterial({ color: "#001628", emissive: "#2fb3c4", emissiveIntensity: night ? 1.2 : 0.7, roughness: 0.4 }),
    sign: new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.5 }),
  }), [night]);
}

/* ---------- Text textures ---------- */

const texCache = new Map<string, THREE.CanvasTexture>();
export function textTexture(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; bar?: string; weight?: number; sub?: string } = {}) {
  const { w = 512, h = 96, bg = "#111214", fg = "#ffffff", bar, weight = 650, sub } = opts;
  const key = [text, w, h, bg, fg, bar, weight, sub].join("|");
  const hit = texCache.get(key); if (hit) return hit;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (bar) { g.fillStyle = bar; g.fillRect(0, h - h * 0.12, w, h * 0.12); }
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  const fam = "Geist, -apple-system, 'Helvetica Neue', Arial, sans-serif";
  let size = sub ? h * 0.42 : h * 0.56;
  g.font = `${weight} ${size}px ${fam}`;
  while (g.measureText(text).width > w * 0.9 && size > 8) { size -= 2; g.font = `${weight} ${size}px ${fam}`; }
  g.fillText(text, w / 2, sub ? h * 0.38 : h * 0.47);
  if (sub) { g.globalAlpha = 0.75; g.font = `500 ${h * 0.2}px ${fam}`; g.fillText(sub, w / 2, h * 0.75); g.globalAlpha = 1; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/* ---------- Bowl ---------- */

const Bowl = memo(function Bowl({ night, vis, ribbon }: { night: boolean; vis: ReturnType<typeof visibility>; ribbon?: THREE.Material }) {
  const m = usePalette(night);
  const geo = useMemo(() => {
    const t1 = sweep(tierProfile("t1"), 260);
    const t2 = sweep(tierProfile("t2"), 260);
    const t3 = sweep(tierProfile("t3"), 260);
    const ll2 = sweep([[RING.ll2.inner - 0.6, Y.ll2], [RING.ll2.outer, Y.ll2]], 200);
    const ll2Wall = sweep([[RING.ll2.outer, Y.ll2], [RING.ll2.outer, -0.4]], 200);
    const t1End = tierEnd(TIERS.t1), t2End = tierEnd(TIERS.t2);
    const rail1 = sweep([[t1End.d + 0.25, Y.ll2], [t1End.d + 0.25, Y.ll2 + 1.05]], 220);
    const rail2 = sweep([[t2End.d + 0.35, 0], [t2End.d + 0.35, 1.05]], 220);
    const ribbon2 = sweep([[TIERS.t2.d0 - 0.03, TIERS.t2.y0 - 0.52], [TIERS.t2.d0 - 0.03, TIERS.t2.y0 - 0.02]], 260);
    const ribbon3 = sweep([[TIERS.t3.d0 - 0.03, TIERS.t3.y0 - 0.52], [TIERS.t3.d0 - 0.03, TIERS.t3.y0 - 0.02]], 260);
    // Upper concourse slab: the footprint with the bowl opening cut out.
    const upper = new THREE.ExtrudeGeometry(shapeOf(FOOTPRINT, [ringPoly(t2End.d + 0.3).reverse()]), { depth: 0.4, bevelEnabled: false });
    upper.rotateX(-Math.PI / 2); upper.translate(0, -0.4, 0);
    return { t1, t2, t3, ll2, ll2Wall, rail1, rail2, ribbon2, ribbon3, upper };
  }, []);
  return (
    <group>
      <mesh geometry={geo.t1} material={m.concrete} receiveShadow castShadow />
      <mesh geometry={geo.ll2} material={m.ll2Floor} receiveShadow />
      <mesh geometry={geo.ll2Wall} material={m.concreteDark} receiveShadow />
      <mesh geometry={geo.rail1} material={m.rail} />
      {vis.upper && (
        <>
          <mesh geometry={geo.t2} material={m.concrete} receiveShadow castShadow />
          <mesh geometry={geo.ribbon2} material={ribbon ?? m.ribbon} />
          <mesh geometry={geo.upper} material={m.upperFloor} receiveShadow castShadow />
          <mesh geometry={geo.rail2} material={m.rail} />
        </>
      )}
      {vis.t3 && (
        <>
          <mesh geometry={geo.t3} material={m.concrete} receiveShadow castShadow />
          <mesh geometry={geo.ribbon3} material={ribbon ?? m.ribbon} />
        </>
      )}
      {/* Event-level floor under the bowl */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTER[0], Y.floor - 0.02, CENTER[1]]} material={m.eventFloor} receiveShadow>
        <planeGeometry args={[RINK.hx * 2 + 8, RINK.hz * 2 + 8]} />
      </mesh>
      <SectionSigns vis={vis} />
      <ClubFloors />
    </group>
  );
});

function SectionSigns({ vis }: { vis: ReturnType<typeof visibility> }) {
  return (
    <group>
      {SECTIONS.filter((s) => (s.tier === "t3" ? vis.t3 : s.tier === "t2" ? vis.upper : true)).map((s) => {
        const t = TIERS[s.tier], end = tierEnd(t);
        if (s.tier === "t3" && s.n >= 218 && s.n <= 223) return null;
        const d = s.tier === "t1" ? end.d + 0.2 : end.d - 0.1;
        const y = s.tier === "t1" ? Y.ll2 + 1.6 : end.y + (s.tier === "t2" ? 1.7 : 0.9);
        const [x, z] = ring(s.theta, d);
        const [nx, nz] = ringNormal(s.theta, d);
        const tex = textTexture(s.id, { w: 128, h: 72, bg: s.club ? "#6b4a2b" : "#0d1b2a", fg: "#e8f4f6", weight: 700 });
        return (
          <mesh key={s.id} position={[x, y, z]} rotation={[0, Math.atan2(-nx, -nz), 0]}>
            <planeGeometry args={[1.5, 0.84]} />
            <meshBasicMaterial map={tex} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Warm wood floor in the two club areas on LL2 (WaFd Bank Club west, Symetra Club east). */
function ClubFloors() {
  const geo = useMemo(() => {
    const arcs: [number, number][] = [
      [SECTIONS.find((s) => s.id === "15")!.theta + 0.12, SECTIONS.find((s) => s.id === "13")!.theta - 0.12],
      [SECTIONS.find((s) => s.id === "26")!.theta + 0.12, SECTIONS.find((s) => s.id === "02")!.theta - 0.12],
    ];
    const pos: number[] = [];
    for (const [a0, a1raw] of arcs) {
      let a1 = a1raw; const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      const N = 30;
      for (let i = 0; i < N; i++) {
        const ta = lo + ((hi - lo) * i) / N, tb = lo + ((hi - lo) * (i + 1)) / N;
        const p = [ring(ta, 30), ring(tb, 30), ring(tb, 45.8), ring(ta, 45.8)];
        const y = Y.ll2 + 0.02;
        pos.push(p[0][0], y, p[0][1], p[2][0], y, p[2][1], p[1][0], y, p[1][1], p[0][0], y, p[0][1], p[3][0], y, p[3][1], p[2][0], y, p[2][1]);
      }
      void a1;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }, []);
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial color="#8a6646" roughness={0.55} side={THREE.DoubleSide} /></mesh>;
}

/* ---------- Event floor ---------- */

const EventFloor = memo(function EventFloor({ kind, event, night }: { kind: EventKind; event: VenueEvent; night: boolean }) {
  const ice = useMemo(() => (typeof document === "undefined" ? null : iceTexture()), []);
  const court = useMemo(() => (typeof document === "undefined" ? null : courtTexture()), []);
  const rink = useMemo(() => {
    const g = new THREE.ShapeGeometry(roundedRect(RINK.hx, RINK.hz, RINK.corner), 24);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (RINK.hx * 2) + 0.5, uv.getY(i) / (RINK.hz * 2) + 0.5);
    return g;
  }, []);
  const boards = useMemo(() => {
    const s = roundedRect(RINK.hx + 0.15, RINK.hz + 0.15, RINK.corner + 0.15);
    s.holes.push(roundedRect(RINK.hx, RINK.hz, RINK.corner));
    const b = new THREE.ExtrudeGeometry(s, { depth: 1.07, bevelEnabled: false, curveSegments: 24 }); b.rotateX(-Math.PI / 2);
    const gl = new THREE.ExtrudeGeometry(s, { depth: 1.9, bevelEnabled: false, curveSegments: 24 }); gl.rotateX(-Math.PI / 2); gl.translate(0, 1.07, 0);
    return { b, gl };
  }, []);
  const [cx, cz] = CENTER;
  const y = Y.floor;
  if (kind === "hockey") {
    return (
      <group position={[cx, y, cz]}>
        <mesh geometry={rink} position={[0, 0.02, 0]} receiveShadow>
          <meshStandardMaterial map={ice} roughness={0.12} metalness={0.05} />
        </mesh>
        <mesh geometry={boards.b} castShadow receiveShadow><meshStandardMaterial color="#f2f2f0" roughness={0.5} /></mesh>
        <mesh geometry={boards.gl}><meshPhysicalMaterial color="#dff2f7" roughness={0.03} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} /></mesh>
        {[-1, 1].map((d) => (
          <group key={d} position={[0, 0, d * (RINK.hz - 3.6)]}>
            <mesh position={[0, 0.6, d * 0.5]} castShadow><boxGeometry args={[1.83, 1.22, 1.1]} /><meshStandardMaterial color="#c8102e" wireframe /></mesh>
          </group>
        ))}
        {/* Benches on the west side, penalty boxes on the east */}
        <mesh position={[-RINK.hx - 1.3, 0.5, -6]}><boxGeometry args={[2.2, 1, 9]} /><meshStandardMaterial color="#20262e" /></mesh>
        <mesh position={[-RINK.hx - 1.3, 0.5, 6]}><boxGeometry args={[2.2, 1, 9]} /><meshStandardMaterial color="#20262e" /></mesh>
        <mesh position={[RINK.hx + 1.3, 0.5, 0]}><boxGeometry args={[2.2, 1, 7]} /><meshStandardMaterial color="#20262e" /></mesh>
        <Players kind="hockey" />
      </group>
    );
  }
  if (kind === "basketball") {
    return (
      <group position={[cx, y, cz]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
          <planeGeometry args={[16.5, 30.8]} />
          <meshStandardMaterial map={court} roughness={0.35} />
        </mesh>
        {[-1, 1].map((d) => (
          <group key={d} position={[0, 0, d * 15.1]}>
            <mesh position={[0, 1.6, d * 0.6]}><boxGeometry args={[0.3, 3.2, 0.3]} /><meshStandardMaterial color="#222" /></mesh>
            <mesh position={[0, 3.3, -d * 0.2]}><boxGeometry args={[1.8, 1.05, 0.05]} /><meshPhysicalMaterial color="#fff" transparent opacity={0.4} /></mesh>
          </group>
        ))}
        <Players kind="basketball" />
      </group>
    );
  }
  // Concert: end stage at the south end ("South Stage" on the arena's maps), general admission floor.
  const stageZ = RINK.hz - 7;
  return (
    <group position={[cx, y, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[RINK.hx * 2 + 2, RINK.hz * 2 + 2]} />
        <meshStandardMaterial color="#232428" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1, stageZ]} castShadow receiveShadow><boxGeometry args={[20, 2, 13]} /><meshStandardMaterial color="#121215" roughness={0.6} /></mesh>
      {/* Truss and line arrays */}
      <mesh position={[0, 13, stageZ]}><boxGeometry args={[22, 0.6, 0.6]} /><meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} /></mesh>
      <mesh position={[0, 13, stageZ - 5]}><boxGeometry args={[22, 0.6, 0.6]} /><meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} /></mesh>
      {[-11.5, 11.5].map((x) => (
        <mesh key={x} position={[x, 8.5, stageZ - 4]} castShadow><boxGeometry args={[1.3, 6, 1.4]} /><meshStandardMaterial color="#141416" /></mesh>
      ))}
      {/* Front-of-house desk */}
      <mesh position={[0, 0.7, -10]}><boxGeometry args={[6, 1.4, 4]} /><meshStandardMaterial color="#1a1a1c" /></mesh>
    </group>
  );
});

function Players({ kind }: { kind: "hockey" | "basketball" }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => personGeometry(false), []);
  const n = kind === "hockey" ? 12 : 10;
  const base = useMemo(() => Array.from({ length: n }, (_, i) => ({
    team: i % 2, x: (Math.random() - 0.5) * (kind === "hockey" ? 18 : 10), z: (Math.random() - 0.5) * (kind === "hockey" ? 40 : 22),
    ph: Math.random() * 10, sp: 0.3 + Math.random() * 0.5,
  })), [n, kind]);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const c = new THREE.Color();
    base.forEach((b, i) => mesh.setColorAt(i, c.set(b.team ? "#001628" : "#f5f5f5")));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [base]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame(({ clock }) => {
    const mesh = ref.current; if (!mesh) return;
    const t = clock.elapsedTime;
    base.forEach((b, i) => {
      const x = b.x + Math.sin(t * b.sp + b.ph) * 4, z = b.z + Math.cos(t * b.sp * 0.7 + b.ph) * 8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(Math.cos(t * b.sp + b.ph), -Math.sin(t * b.sp * 0.7 + b.ph)));
      m.compose(new THREE.Vector3(x, 0.02, z), q, new THREE.Vector3(1.05, 1.05, 1.05));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, undefined, n]} castShadow><meshStandardMaterial roughness={0.7} /></instancedMesh>;
}

/* ---------- Building shell ---------- */

const Shell = memo(function Shell({ night, vis }: { night: boolean; vis: ReturnType<typeof visibility> }) {
  const m = usePalette(night);
  const geo = useMemo(() => ({ roof: roofGeometry(), facade: facadeGeometry() }), []);
  const mullRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = mullRef.current; if (!mesh) return;
    geo.facade.mullions.forEach((mx, i) => mesh.setMatrixAt(i, mx));
    mesh.instanceMatrix.needsUpdate = true;
  }, [geo, vis.glass]);
  return (
    <group>
      {vis.roof === "solid" && (
        <>
          <mesh geometry={geo.roof} material={m.roof} receiveShadow />
          {night && <mesh geometry={geo.roof} position={[0, -0.25, 0]}><meshBasicMaterial color="#2a2621" side={THREE.BackSide} /></mesh>}
        </>
      )}
      {vis.glass && (
        <>
          <mesh geometry={geo.facade.glass} material={m.glass} renderOrder={2} />
          <instancedMesh ref={mullRef} args={[undefined, undefined, geo.facade.mullions.length]} material={m.mullion} castShadow>
            <boxGeometry args={[0.1, 1, 0.22]} />
          </instancedMesh>
        </>
      )}
      {/* Below-grade retaining walls at the footprint, seen from the cutaway views */}
      <BelowGrade />
    </group>
  );
});

function BelowGrade() {
  const geo = useMemo(() => {
    const pos: number[] = [];
    for (let i = 0; i < FOOTPRINT.length; i++) {
      const [ax, az] = FOOTPRINT[i], [bx, bz] = FOOTPRINT[(i + 1) % FOOTPRINT.length];
      pos.push(ax, Y.floor, az, bx, 0, bz, bx, Y.floor, bz, ax, Y.floor, az, ax, 0, az, bx, 0, bz);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }, []);
  return <mesh geometry={geo}><meshStandardMaterial color="#6f6a63" roughness={1} side={THREE.DoubleSide} /></mesh>;
}

/* ---------- Seats and crowd ---------- */

let seatCache: SeatSpot[] | null = null;
export function getSeats() { return (seatCache ??= seatSpots()); }

function hash(i: number) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

const Seats = memo(function Seats({ vis }: { vis: ReturnType<typeof visibility> }) {
  const seats = getSeats();
  const geo = useMemo(() => chairGeometry(), []);
  const groups = useMemo(() => (["t1", "t2", "t3"] as TierKey[]).map((t) => seats.filter((s) => s.tier === t)), [seats]);
  return (
    <>
      {groups.map((list, gi) => {
        const key = (["t1", "t2", "t3"] as TierKey[])[gi];
        if ((key === "t2" && !vis.upper) || (key === "t3" && !vis.t3)) return null;
        return <InstancedSpots key={key} list={list} geo={geo} color="#2b2f37" />;
      })}
    </>
  );
});

function InstancedSpots({ list, geo, color, colors, castShadow = false }: { list: { x: number; y: number; z: number; rotY: number }[]; geo: THREE.BufferGeometry; color?: string; colors?: string[]; castShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const c = new THREE.Color();
    list.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rotY);
      m.compose(v.set(s.x, s.y, s.z), q, one);
      mesh.setMatrixAt(i, m);
      if (colors) mesh.setColorAt(i, c.set(colors[i % colors.length]));
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list, colors]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, Math.max(1, list.length)]} castShadow={castShadow} receiveShadow frustumCulled={false}>
      <meshStandardMaterial color={colors ? "#ffffff" : color} roughness={0.75} />
    </instancedMesh>
  );
}

const KRAKEN = ["#001628", "#001628", "#99d9d9", "#355464", "#e9072b", "#68a2b9", "#2b2b2b", "#e6e6e6", "#5a6b7a"];
const STORM = ["#2c5235", "#fbe122", "#2c5235", "#1b1b1b", "#e6e6e6", "#6b7d6e", "#c8c8c8"];
const CONCERT = ["#1b1b1b", "#2b2b2b", "#e6e6e6", "#7a1f3d", "#3d3a6b", "#c47f2b", "#556b2f", "#8a8a8a", "#b3443a", "#1f3d6b"];

const Crowd = memo(function Crowd({ kind, occupancy, vis, queueLen }: { kind: EventKind; occupancy: number; vis: ReturnType<typeof visibility>; queueLen?: Record<string, number> | null }) {
  const seats = getSeats();
  const seatedGeo = useMemo(() => personGeometry(true), []);
  const standGeo = useMemo(() => personGeometry(false), []);
  const palette = kind === "hockey" ? KRAKEN : kind === "basketball" ? STORM : CONCERT;
  const seated = useMemo(() => {
    const out: Record<TierKey, SeatSpot[]> = { t1: [], t2: [], t3: [] };
    seats.forEach((s, i) => {
      let occ = occupancy;
      if (kind === "concert") {
        // Seats behind the south stage are not sold; the floor is general admission.
        const deg = (s.theta * 180) / Math.PI;
        const a = ((deg + 540) % 360) - 180;
        if (a < -52 && a > -128) occ = s.tier === "t3" ? occupancy * 0.25 : 0;
      }
      if (hash(i) < occ) out[s.tier].push(s);
    });
    return out;
  }, [seats, occupancy, kind]);
  const floor = useMemo(() => {
    if (kind !== "concert") return [];
    const out: { x: number; y: number; z: number; rotY: number }[] = [];
    const n = Math.round(1700 * occupancy);
    const [cx, cz] = CENTER;
    for (let i = 0; i < n; i++) {
      // Denser near the stage.
      const r = Math.pow(hash(i + 9000), 1.6);
      const z = cz + RINK.hz - 15 - r * (RINK.hz * 2 - 20);
      const x = cx + (hash(i + 19000) - 0.5) * (RINK.hx * 2 - 1.5);
      if (Math.abs(x - cx) < 3.5 && Math.abs(z - (cz - 10)) < 2.5) continue;
      out.push({ x, y: Y.floor + 0.03, z, rotY: Math.PI + (hash(i) - 0.5) * 0.6 });
    }
    return out;
  }, [kind, occupancy]);
  const colorsFor = (n: number, salt: number) => Array.from({ length: Math.min(n, 997) }, (_, i) => palette[Math.floor(hash(i * 3 + salt) * palette.length)]);
  return (
    <>
      <InstancedSpots list={seated.t1} geo={seatedGeo} colors={colorsFor(seated.t1.length, 1)} />
      {vis.upper && <InstancedSpots list={seated.t2} geo={seatedGeo} colors={colorsFor(seated.t2.length, 2)} />}
      {vis.t3 && <InstancedSpots list={seated.t3} geo={seatedGeo} colors={colorsFor(seated.t3.length, 3)} />}
      {floor.length > 0 && <InstancedSpots list={floor} geo={standGeo} colors={colorsFor(floor.length, 4)} castShadow />}
      <Walkers level="ll2" count={Math.round(360 * Math.max(0.3, occupancy))} palette={palette} />
      {vis.upper && <Walkers level="upper" count={Math.round(320 * Math.max(0.3, occupancy))} palette={palette} />}
      <Queues occupancy={occupancy} palette={palette} vis={vis} queueLen={queueLen} />
    </>
  );
});

/** People walking the concourses. */
function Walkers({ level, count, palette }: { level: Level; count: number; palette: string[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => personGeometry(false), []);
  const agents = useMemo(() => Array.from({ length: count }, (_, i) => {
    const d0 = level === "ll2" ? RING.ll2.inner + 2.5 : RING.upper.inner + 2;
    const d1 = level === "ll2" ? 41.2 : 42.2;
    return { th: hash(i + 1) * Math.PI * 2, d: d0 + hash(i + 2) * (d1 - d0), sp: (0.9 + hash(i + 3) * 0.7) * (hash(i + 4) < 0.5 ? 1 : -1), stop: hash(i + 5) < 0.25 };
  }), [count, level]);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const c = new THREE.Color();
    agents.forEach((_, i) => mesh.setColorAt(i, c.set(palette[Math.floor(hash(i * 7 + (level === "ll2" ? 11 : 13)) * palette.length)])));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [agents, palette, level]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), s: new THREE.Vector3(1, 1, 1) }), []);
  useFrame((_, dt) => {
    const mesh = ref.current; if (!mesh) return;
    const y = level === "ll2" ? Y.ll2 : Y.upper;
    const step = Math.min(dt, 0.05);
    agents.forEach((a, i) => {
      const [px, pz] = ring(a.th, a.d);
      const r = Math.hypot(px - CENTER[0], pz - CENTER[1]);
      if (!a.stop) a.th += (a.sp * step) / r;
      const [x, z] = ring(a.th, a.d);
      const [nx, nz] = ringNormal(a.th, a.d);
      // Tangent direction for facing.
      const tx = -nz * Math.sign(a.sp), tz = nx * Math.sign(a.sp);
      tmp.q.setFromAxisAngle(tmp.up, a.stop ? Math.atan2(-nx, -nz) : Math.atan2(-tx, -tz));
      tmp.m.compose(tmp.v.set(x, y, z), tmp.q, tmp.s);
      mesh.setMatrixAt(i, tmp.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false} castShadow>
      <meshStandardMaterial roughness={0.75} />
    </instancedMesh>
  );
}

/** A short line at each stand, longer when the building is fuller. */
function Queues({ occupancy, palette, vis, queueLen }: { occupancy: number; palette: string[]; vis: ReturnType<typeof visibility>; queueLen?: Record<string, number> | null }) {
  const geo = useMemo(() => personGeometry(false), []);
  const list = useMemo(() => {
    const out: { x: number; y: number; z: number; rotY: number }[] = [];
    SPOTS.forEach((s, si) => {
      if (s.level === "upper" && !vis.upper) return;
      const n = queueLen?.[s.stand.id] ?? Math.round((1 + hash(si + 77) * 7) * occupancy);
      const [nx, nz] = ringNormal(s.theta, 40);
      for (let i = 0; i < n; i++) {
        const off = 1.7 + i * 0.72;
        const jitter = (hash(si * 31 + i) - 0.5) * 0.3;
        out.push({ x: s.x - nx * off + nz * jitter, y: s.y, z: s.z - nz * off - nx * jitter, rotY: s.rotY + Math.PI });
      }
    });
    return out;
  }, [occupancy, vis.upper, queueLen]);
  const colors = useMemo(() => list.map((_, i) => palette[Math.floor(hash(i * 5 + 3) * palette.length)]), [list, palette]);
  return <InstancedSpots list={list} geo={geo} colors={colors} castShadow />;
}

/* ---------- Stands ---------- */

const CAT_COLOR: Record<string, string> = { food: "#ff6a2b", drink: "#d79a1e", merch: "#3aa76d" };

const Stand = memo(function Stand({ spot, selected, onSelect, override, name }: { spot: StandSpot; selected: boolean; onSelect: (k: string | null) => void; override?: string; name?: string }) {
  const club = !!spot.club || spot.stand.clubTicketRequired;
  const color = override ?? (club ? "#8a5a3a" : CAT_COLOR[spot.stand.category] ?? "#ff6a2b");
  const label = name ?? spot.stand.name;
  const sign = useMemo(() => textTexture(label, { w: 640, h: 104, bg: "#0f1012", fg: "#ffffff", bar: color }), [label, color]);
  const menu = useMemo(() => {
    const items = [...(spot.stand.items ?? []), ...(spot.stand.valueItems ?? [])].slice(0, 6);
    const c = document.createElement("canvas"); c.width = 512; c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#16181c"; g.fillRect(0, 0, 512, 128);
    g.fillStyle = color; g.fillRect(0, 0, 512, 14);
    g.fillStyle = "#f3efe6"; g.font = "600 17px Geist, -apple-system, Arial, sans-serif";
    (items.length ? items : [spot.stand.concept ?? spot.stand.name]).forEach((it, i) => g.fillText(it.slice(0, 26), 14 + (i % 2) * 250, 40 + Math.floor(i / 2) * 30));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [spot.stand, color]);
  return (
    <group
      position={[spot.x, spot.y, spot.z]} rotation={[0, spot.rotY, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : spot.key); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
    >
      <mesh position={[0, 1.75, -1.35]} castShadow receiveShadow><boxGeometry args={[4.8, 3.5, 0.35]} /><meshStandardMaterial color="#2a2b2f" roughness={0.8} /></mesh>
      <mesh position={[-2.3, 1.75, -0.45]} castShadow><boxGeometry args={[0.2, 3.5, 2.1]} /><meshStandardMaterial color="#2a2b2f" /></mesh>
      <mesh position={[2.3, 1.75, -0.45]} castShadow><boxGeometry args={[0.2, 3.5, 2.1]} /><meshStandardMaterial color="#2a2b2f" /></mesh>
      <mesh position={[0, 0.53, 0.25]} castShadow receiveShadow><boxGeometry args={[4.3, 1.06, 0.7]} /><meshStandardMaterial color={color} roughness={0.55} /></mesh>
      <mesh position={[0, 1.08, 0.3]}><boxGeometry args={[4.5, 0.06, 0.85]} /><meshStandardMaterial color="#e9e6df" roughness={0.3} /></mesh>
      <mesh position={[0, 2.3, -1.16]}><planeGeometry args={[4.2, 1.05]} /><meshBasicMaterial map={menu} toneMapped={false} /></mesh>
      <mesh position={[0, 3.25, 0.62]}><boxGeometry args={[4.8, 0.82, 0.12]} /><meshStandardMaterial color="#0f1012" /></mesh>
      <mesh position={[0, 3.25, 0.69]}><planeGeometry args={[4.7, 0.76]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
      <mesh position={[0, 3.25, 0.15]}><boxGeometry args={[4.8, 0.82, 1]} /><meshStandardMaterial color="#1a1b1e" /></mesh>
      {selected && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 1.5]}><ringGeometry args={[2.6, 3.0, 48]} /><meshBasicMaterial color="#d7ff3a" toneMapped={false} /></mesh>
          <pointLight position={[0, 3, 2]} intensity={30} distance={10} color="#9fb6ff" />
        </>
      )}
    </group>
  );
});

function Stands({ selected, onSelect, vis, colors, names }: { selected: string | null; onSelect: (k: string | null) => void; vis: ReturnType<typeof visibility>; colors?: Record<string, string> | null; names?: Record<string, string> | null }) {
  return (
    <group>
      {SPOTS.filter((s) => s.level === "ll2" || vis.upper).map((s) => (
        <Stand key={s.key} spot={s} selected={s.key === selected} onSelect={onSelect} override={colors?.[s.stand.id]} name={names?.[s.stand.id]} />
      ))}
    </group>
  );
}

/* ---------- City ---------- */

const City = memo(function City({ night }: { night: boolean }) {
  const geo = useMemo(() => cityGeometry(), []);
  const trees = useMemo(() => treeSpots(), []);
  const win = useMemo(() => (typeof document === "undefined" ? null : getWindowTexture(night)), [night]);
  const ground = useMemo(() => {
    const s = shapeOf([[-1600, -1600], [1600, -1600], [1600, 1600], [-1600, 1600]], [FOOTPRINT.slice().reverse()]);
    const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g;
  }, []);
  const trunk = useRef<THREE.InstancedMesh>(null), crown = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    trees.forEach(([x, z], i) => {
      const s = 0.8 + hash(i) * 0.6;
      m.makeScale(s, s, s).setPosition(x, 1.6 * s, z); trunk.current?.setMatrixAt(i, m);
      m.makeScale(s, s * (1 + hash(i + 3) * 0.4), s).setPosition(x, 5 * s, z); crown.current?.setMatrixAt(i, m);
    });
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true;
    if (crown.current) crown.current.instanceMatrix.needsUpdate = true;
  }, [trees]);
  return (
    <group>
      <mesh geometry={ground} position={[0, -0.02, 0]} receiveShadow>
        <meshStandardMaterial color={night ? "#3a3c40" : "#bcb8b0"} roughness={1} />
      </mesh>
      <mesh geometry={geo.road} receiveShadow><meshStandardMaterial color={night ? "#25272b" : "#6e6f72"} roughness={0.95} /></mesh>
      <mesh geometry={geo.foot} receiveShadow><meshStandardMaterial color={night ? "#45464a" : "#d8d3c9"} roughness={1} /></mesh>
      <mesh geometry={geo.green} receiveShadow><meshStandardMaterial color={night ? "#18241a" : "#7d9a62"} roughness={1} /></mesh>
      <mesh geometry={geo.water}><meshStandardMaterial color={night ? "#1d3446" : "#6f9ab3"} roughness={0.1} metalness={0.3} /></mesh>
      <mesh geometry={geo.walls} castShadow receiveShadow>
        <meshStandardMaterial map={win} emissiveMap={night ? win : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.55 : 0} roughness={0.8} />
      </mesh>
      <mesh geometry={geo.roofs} castShadow receiveShadow><meshStandardMaterial color={night ? "#2a2c30" : "#9d9a94"} roughness={0.9} /></mesh>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.18, 0.25, 3.2, 5]} /><meshStandardMaterial color="#4b3a2a" />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[2.6, 0]} /><meshStandardMaterial color={night ? "#1f3322" : "#5d7f45"} roughness={0.9} flatShading />
      </instancedMesh>
      {geo.needle && <SpaceNeedle at={geo.needle} night={night} />}
    </group>
  );
});

/** The Space Needle (184 m), simplified: three leg pairs, waist, halo and saucer, spire. */
function SpaceNeedle({ at, night }: { at: [number, number]; night: boolean }) {
  const legs = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, y = t * 150;
      // Hourglass: wide at the base, narrow waist near 115 m, flaring into the top house.
      const r = 2.2 + 11 * Math.pow(1 - Math.min(1, y / 115), 2.2) + (y > 120 ? (y - 120) * 0.22 : 0);
      pts.push(new THREE.Vector3(r, y, 0));
    }
    return pts;
  }, []);
  const white = night ? "#d9d4c8" : "#f2efe8";
  return (
    <group position={[at[0], 0, at[1]]}>
      {[0, 1, 2].map((k) => (
        <group key={k} rotation={[0, (k * Math.PI * 2) / 3, 0]}>
          {[-0.18, 0.18].map((o) => (
            <group key={o} rotation={[0, o, 0]}>
              {legs.slice(0, -1).map((p, i) => {
                const q = legs[i + 1];
                const mid = p.clone().add(q).multiplyScalar(0.5);
                const len = p.distanceTo(q);
                const ang = Math.atan2(q.x - p.x, q.y - p.y);
                return (
                  <mesh key={i} position={[mid.x, mid.y, 0]} rotation={[0, 0, -ang]} castShadow>
                    <boxGeometry args={[0.9, len + 0.05, 0.9]} /><meshStandardMaterial color={white} roughness={0.6} />
                  </mesh>
                );
              })}
            </group>
          ))}
        </group>
      ))}
      <mesh position={[0, 152, 0]} castShadow><cylinderGeometry args={[17.5, 12, 6, 48]} /><meshStandardMaterial color={white} roughness={0.5} /></mesh>
      <mesh position={[0, 157, 0]}><cylinderGeometry args={[13, 17, 4, 48]} /><meshStandardMaterial color="#c79a4a" metalness={0.5} roughness={0.35} emissive={night ? "#ffb85c" : "#000"} emissiveIntensity={night ? 0.5 : 0} /></mesh>
      <mesh position={[0, 161, 0]}><cylinderGeometry args={[7, 12, 4, 32]} /><meshStandardMaterial color={white} /></mesh>
      <mesh position={[0, 172, 0]}><cylinderGeometry args={[0.4, 1.4, 22, 8]} /><meshStandardMaterial color="#cfcfcf" /></mesh>
      <mesh position={[0, 1, 0]}><cylinderGeometry args={[6, 7, 2, 24]} /><meshStandardMaterial color="#9a958c" /></mesh>
    </group>
  );
}

/* ---------- Lighting ---------- */

function Lights({ night, inside, house = 1 }: { night: boolean; inside: boolean; house?: number }) {
  const [cx, cz] = CENTER;
  const sun = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => { sun.current?.target.position.set(cx, 0, cz); sun.current?.target.updateMatrixWorld(); }, [cx, cz]);
  return (
    <>
      {night ? (
        <>
          <color attach="background" args={["#0d100b"]} />
          <fog attach="fog" args={["#0d100b", 260, 1500]} />
          <Stars radius={900} depth={200} count={3000} factor={6} fade speed={0.3} />
          <hemisphereLight args={["#c3cdea", "#4a4238", (inside ? 1.25 : 1.1) * (0.18 + 0.82 * house)]} />
          <ambientLight intensity={0.25 * (0.3 + 0.7 * house)} color="#ffe9cc" />
          <directionalLight ref={sun} position={[cx - 160, 260, cz - 120]} intensity={0.35} color="#9fb2dd" castShadow
            shadow-mapSize={[2048, 2048]} shadow-camera-left={-140} shadow-camera-right={140} shadow-camera-top={140} shadow-camera-bottom={-140} shadow-camera-far={700} shadow-bias={-0.0004} shadow-normalBias={0.05} />
          {/* Sports lighting over the event floor */}
          {[-18, -6, 6, 18].map((z) => [-8, 8].map((x) => (
            <spotLight key={`${x}${z}`} position={[cx + x, 24, cz + z]} target-position={[cx + x * 0.5, Y.floor, cz + z]} angle={0.5} penumbra={0.7} intensity={1600 * house} distance={60} decay={1.6} color="#fff6ea" />
          )))}
          {/* Concourse light: warm wash on both levels */}
          {Array.from({ length: 8 }, (_, i) => {
            const th = (i / 8) * Math.PI * 2 + 0.2;
            const [x, z] = ring(th, 40);
            return <group key={i}>
              <pointLight position={[x, Y.ll2 + 4.2, z]} intensity={180} distance={36} decay={1.5} color="#ffd9a6" />
              <pointLight position={[x, 4.6, z]} intensity={160} distance={34} decay={1.5} color="#ffe2b8" />
            </group>;
          })}
        </>
      ) : (
        <>
          <Sky distance={4500} sunPosition={[-0.4, 0.55, -0.6]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
          <fog attach="fog" args={["#cdd7e2", 400, 2200]} />
          <hemisphereLight args={["#eaf2ff", "#a69d8f", 1.1 * (0.45 + 0.55 * house)]} />
          <directionalLight ref={sun} position={[cx - 160, 260, cz - 220]} intensity={2.6} color="#fff3e0" castShadow
            shadow-mapSize={[2048, 2048]} shadow-camera-left={-150} shadow-camera-right={150} shadow-camera-top={150} shadow-camera-bottom={-150} shadow-camera-far={800} shadow-bias={-0.0004} shadow-normalBias={0.05} />
          {[-14, 0, 14].map((z) => (
            <spotLight key={z} position={[cx, 24, cz + z]} target-position={[cx, Y.floor, cz + z]} angle={0.7} penumbra={0.8} intensity={900 * house} distance={60} decay={1.6} color="#ffffff" />
          ))}
          {Array.from({ length: 6 }, (_, i) => {
            const th = (i / 6) * Math.PI * 2 + 0.3;
            const [x, z] = ring(th, 40);
            return <pointLight key={i} position={[x, Y.ll2 + 4.2, z]} intensity={150} distance={34} decay={1.5} color="#fff1dc" />;
          })}
        </>
      )}
    </>
  );
}

/* ---------- Scene ---------- */

export function VenueScene(o: SceneOpts) {
  const vis = visibility(o.view, o.inside);
  const ribbon = useRibbonMaterial(o.spec, o.show);
  return (
    <>
      <ShowClock />
      <Lights night={o.night} inside={o.inside} house={houseLevel(o.kind, o.show, o.intro)} />
      <group
        onDoubleClick={(e) => { e.stopPropagation(); o.onFloorDoubleClick?.(e.point.clone()); }}
        onPointerMissed={() => o.onSelect(null)}
      >
        <City night={o.night} />
        <Shell night={o.night} vis={vis} />
        <Bowl night={o.night} vis={vis} ribbon={ribbon} />
        <EventFloor kind={o.kind} event={o.event} night={o.night} />
        {o.kind === "concert" ? <ConcertShow spec={o.spec} on={o.show} seats={getSeats()} /> : <HockeyShow spec={o.spec} on={o.show} />}
        <Seats vis={vis} />
        <Crowd kind={o.kind} occupancy={o.occupancy} vis={vis} queueLen={o.queueLen} />
        <Stands selected={o.selected} onSelect={o.onSelect} vis={vis} colors={o.standColors} names={o.signNames} />
      </group>
      {o.selected && <SelectedLabel spotKey={o.selected} />}
    </>
  );
}

function SelectedLabel({ spotKey }: { spotKey: string }) {
  const s = SPOTS.find((x) => x.key === spotKey);
  if (!s) return null;
  return (
    <Html position={[s.x, s.y + 4.6, s.z]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ background: "rgba(12,13,16,.86)", color: "#fff", padding: "4px 9px", borderRadius: 999, font: "600 12px/1.3 var(--sans, sans-serif)", whiteSpace: "nowrap" }}>
        {s.stand.name} · Sec {s.section}
      </div>
    </Html>
  );
}
