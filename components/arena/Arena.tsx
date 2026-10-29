"use client";
// The arena model: a two-tier oval bowl with concourses, branded kiosks,
// event-specific floor, daylight (light theme) or event-night (dark theme) lighting.
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, Environment, Html, Lightformer } from "@react-three/drei";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Assignment } from "@/lib/agent/plan";
import type { Zone } from "@/lib/venue/arena";
import { brandOf, fitLevel, fmt, fitWord, ZONE_SHORT } from "@/components/lib";
import {
  CLUB_ARC, EX, FACADE_R, FLOOR_R, LOWER, LOWER_CONCOURSE, LOWER_END, PRESETS, UPPER, UPPER_CONCOURSE, UPPER_END,
  onOval, place, standCamera, type Placement, type Preset,
} from "./layout";

export type ArenaStand = Pick<Assignment, "vendorId" | "vendorName" | "fit" | "alternatives"> & {
  stand: Pick<Assignment["stand"], "id" | "label" | "zone" | "category" | "angle" | "radius" | "y" | "priority" | "traffic">;
  changed?: boolean;
};

export type ArenaProps = {
  stands: ArenaStand[];
  kind: string;
  theme: "light" | "dark";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onSwap?: (standId: string, vendorId: string) => void;
  preset?: Preset;
  focusZone?: Zone | null;
  interactive?: boolean;
  /** Slow orbit for decorative previews. */
  drift?: boolean;
  /** Bumped by the parent to re-run the current camera move. */
  resetKey?: number;
  /** Expected attendance; fills seats, the floor and the queues. */
  crowd?: number;
};

/** Seats in the model stand for this many people. */
const CAPACITY = 20000;

type Palette = ReturnType<typeof palette>;
function palette(theme: "light" | "dark") {
  const light = theme === "light";
  return {
    light,
    bg: light ? "#e9e6db" : "#10130d",
    ground: light ? "#e2dfd3" : "#13160f",
    paving: light ? "#dad6c9" : "#1e2219",
    concrete: light ? "#d7d3c6" : "#363b2f",
    riser: light ? "#cdc9bb" : "#33382c",
    concourse: light ? "#efede5" : "#474c40",
    facade: light ? "#c5c1b3" : "#282c22",
    glass: light ? "#a7af9a" : "#263021",
    seat: light ? "#5c6351" : "#3c4535",
    seatAlt: light ? "#676f5a" : "#46503e",
    clubFloor: light ? "#cdbb9f" : "#4b3d2c",
    floor: light ? "#c1bdaf" : "#24281f",
    stage: light ? "#2a2e24" : "#0d0f0a",
    body: light ? "#d6d2c5" : "#393e32",
    interior: light ? "#8c8f82" : "#1b1e17",
    counter: light ? "#c2beb0" : "#2b2f25",
    canopy: light ? "#2d3127" : "#151812",
    accent: light ? "#3d5a00" : "#d7ff3a",
    fit: light ? ["#d6d2c3", "#d9ef94", "#b5dc3f", "#7fab12", "#4d7000"] : ["#2e3427", "#3d4c16", "#66841a", "#a2c825", "#d7ff3a"],
    warm: "#ffd9a8",
  };
}

/* ---------- Sign textures ---------- */

let fontFamily = "";
function signFont() {
  if (!fontFamily && typeof document !== "undefined") fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
  return fontFamily || "sans-serif";
}
const texCache = new Map<string, THREE.CanvasTexture>();
function signTexture(vendorId: string, name: string, w: number, h: number, ver: number) {
  const key = `${vendorId}|${w}x${h}|${ver}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const scale = 160;
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const g = c.getContext("2d")!;
  const b = brandOf(vendorId);
  g.fillStyle = b.bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = b.fg;
  let size = c.height * 0.5;
  const fam = signFont();
  g.font = `600 ${size}px ${fam}`;
  const maxW = c.width * 0.86;
  while (g.measureText(name).width > maxW && size > 10) { size -= 2; g.font = `600 ${size}px ${fam}`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(name, c.width / 2, c.height / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** A backlit menu board: a header bar in the brand colour and rows of items with prices. */
const menuCache = new Map<string, THREE.CanvasTexture>();
function menuTexture(vendorId: string, light: boolean) {
  const key = `${vendorId}|${light}`;
  const hit = menuCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas"); c.width = 256; c.height = 96;
  const g = c.getContext("2d")!;
  const b = brandOf(vendorId);
  g.fillStyle = light ? "#1f221a" : "#151812"; g.fillRect(0, 0, 256, 96);
  g.fillStyle = b.bg; g.fillRect(0, 0, 256, 16);
  g.fillStyle = light ? "rgba(255,255,255,.62)" : "rgba(255,244,224,.85)";
  for (let col = 0; col < 3; col++) for (let row = 0; row < 4; row++) {
    const x = 12 + col * 82, y = 26 + row * 17, w = 34 + ((col * 7 + row * 13) % 22);
    g.fillRect(x, y, w, 5); g.fillRect(x + 58, y, 12, 5);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  menuCache.set(key, t);
  return t;
}

/* ---------- Bowl geometry ---------- */

function lathe(points: [number, number][], segments = 160) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

function stepped(r0: number, y0: number, rows: number, depth: number, rise: number, start: [number, number][]) {
  const pts: [number, number][] = [...start];
  let r = r0, y = y0;
  for (let i = 0; i < rows; i++) {
    pts.push([r + depth, y]);
    if (i < rows - 1) { y += rise; pts.push([r + depth, y]); }
    r += depth;
  }
  return pts;
}

const Bowl = memo(function Bowl({ p }: { p: Palette }) {
  const geo = useMemo(() => {
    const lower = lathe(stepped(LOWER.r0, LOWER.y0, LOWER.rows, LOWER.depth, LOWER.rise, [[FLOOR_R + 0.2, 0], [LOWER.r0, 0], [LOWER.r0, LOWER.y0]]));
    const lowerConc = lathe([[LOWER_CONCOURSE.r0, LOWER_CONCOURSE.y - 0.001], [LOWER_CONCOURSE.r1, LOWER_CONCOURSE.y - 0.001]]);
    const upper = lathe(stepped(UPPER.r0, UPPER.y0, UPPER.rows, UPPER.depth, UPPER.rise, [[UPPER.r0, LOWER_CONCOURSE.y], [UPPER.r0, UPPER.y0]]));
    const upperConc = lathe([[UPPER_CONCOURSE.r0, UPPER_CONCOURSE.y - 0.001], [UPPER_CONCOURSE.r1, UPPER_CONCOURSE.y - 0.001]]);
    const facade = lathe([[FACADE_R, 0], [FACADE_R, UPPER_CONCOURSE.y + 0.75], [FACADE_R - 0.18, UPPER_CONCOURSE.y + 0.75], [FACADE_R - 0.18, UPPER_CONCOURSE.y]]);
    const glass = lathe([[FACADE_R + 0.02, 0.6], [FACADE_R + 0.02, 2.4]]);
    const glass2 = lathe([[FACADE_R + 0.02, 4.4], [FACADE_R + 0.02, 5.6]]);
    // Club lounge floor: an arc of the lower concourse.
    const club = new THREE.RingGeometry(LOWER_CONCOURSE.r0 + 0.1, LOWER_CONCOURSE.r1 - 0.05, 48, 1, CLUB_ARC.a0, CLUB_ARC.a1 - CLUB_ARC.a0);
    // Light strip under the upper fascia, lit at night.
    const strip = lathe([[UPPER.r0 - 0.01, LOWER_CONCOURSE.y + 1.05], [UPPER.r0 - 0.01, LOWER_CONCOURSE.y + 1.12]]);
    return { lower, lowerConc, upper, upperConc, facade, glass, glass2, club, strip };
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const side = THREE.DoubleSide;
  return (
    <group scale={[EX, 1, 1]}>
      <mesh geometry={geo.lower} castShadow receiveShadow><meshStandardMaterial color={p.riser} roughness={0.92} side={side} /></mesh>
      <mesh geometry={geo.lowerConc} receiveShadow><meshStandardMaterial color={p.concourse} roughness={0.7} side={side} /></mesh>
      <mesh geometry={geo.upper} castShadow receiveShadow><meshStandardMaterial color={p.riser} roughness={0.92} side={side} /></mesh>
      <mesh geometry={geo.upperConc} receiveShadow><meshStandardMaterial color={p.concourse} roughness={0.7} side={side} /></mesh>
      <mesh geometry={geo.facade} castShadow receiveShadow><meshStandardMaterial color={p.facade} roughness={0.85} side={side} /></mesh>
      <mesh geometry={geo.glass}><meshStandardMaterial color={p.glass} roughness={0.15} metalness={0.4} emissive={p.light ? "#000000" : p.warm} emissiveIntensity={p.light ? 0 : 0.22} side={side} /></mesh>
      <mesh geometry={geo.glass2}><meshStandardMaterial color={p.glass} roughness={0.15} metalness={0.4} emissive={p.light ? "#000000" : p.warm} emissiveIntensity={p.light ? 0 : 0.12} side={side} /></mesh>
      <mesh geometry={geo.strip}><meshBasicMaterial color={p.light ? "#ffffff" : p.warm} toneMapped={false} side={side} /></mesh>
      <mesh geometry={geo.club} rotation={[-Math.PI / 2, 0, 0]} position={[0, LOWER_CONCOURSE.y + 0.006, 0]} scale={[1, -1, 1]} receiveShadow>
        <meshStandardMaterial color={p.clubFloor} roughness={0.55} side={side} />
      </mesh>
    </group>
  );
});

/** Facade fins, a roof crown and floodlight bars on the upper rim. */
const Architecture = memo(function Architecture({ p }: { p: Palette }) {
  const fins = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const N = 64, L = 16;
  const crown = useMemo(() => lathe([[FACADE_R - 0.3, UPPER_CONCOURSE.y + 0.75], [FACADE_R + 0.55, UPPER_CONCOURSE.y + 0.75], [FACADE_R + 0.55, UPPER_CONCOURSE.y + 1.05], [FACADE_R - 0.3, UPPER_CONCOURSE.y + 1.05]]), []);
  const base = useMemo(() => lathe([[FACADE_R + 0.6, 0], [FACADE_R + 0.6, 0.22], [FACADE_R, 0.22]]), []);
  useEffect(() => () => { crown.dispose(); base.dispose(); }, [crown, base]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const [x, z] = onOval(a, FACADE_R + 0.18);
      e.set(0, Math.atan2(x, z), 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, (UPPER_CONCOURSE.y + 0.75) / 2, z), q, sc);
      fins.current?.setMatrixAt(i, m);
    }
    for (let i = 0; i < L; i++) {
      const a = (i / L) * Math.PI * 2 + Math.PI / L;
      const [x, z] = onOval(a, FACADE_R - 0.4);
      e.set(-0.5, Math.atan2(-x, -z), 0, "YXZ"); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, UPPER_CONCOURSE.y + 1.6, z), q, sc);
      lights.current?.setMatrixAt(i, m);
    }
    if (fins.current) fins.current.instanceMatrix.needsUpdate = true;
    if (lights.current) lights.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={fins} args={[undefined, undefined, N]} castShadow receiveShadow>
        <boxGeometry args={[0.16, UPPER_CONCOURSE.y + 0.75, 0.36]} />
        <meshStandardMaterial color={p.light ? "#e2dfd4" : "#262a21"} roughness={0.8} />
      </instancedMesh>
      <mesh geometry={crown} scale={[EX, 1, 1]} castShadow receiveShadow><meshStandardMaterial color={p.light ? "#f2f0e8" : "#2a2e24"} roughness={0.7} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={base} scale={[EX, 1, 1]} receiveShadow><meshStandardMaterial color={p.light ? "#d3cfc2" : "#1a1d16"} roughness={0.9} side={THREE.DoubleSide} /></mesh>
      <instancedMesh ref={lights} args={[undefined, undefined, L]} castShadow>
        <boxGeometry args={[0.9, 0.32, 0.16]} />
        <meshStandardMaterial color={p.light ? "#373b31" : "#1f2219"} emissive={p.light ? "#000000" : "#fff1d6"} emissiveIntensity={p.light ? 0 : 0.35} roughness={0.4} metalness={0.5} />
      </instancedMesh>
    </group>
  );
});

/** Deterministic random numbers, so the crowd is the same on every render. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/** One seat: a pan and a backrest, facing local +z. */
function chairGeometry() {
  const pan = new THREE.BoxGeometry(0.2, 0.05, 0.16); pan.translate(0, 0, 0.01);
  const back = new THREE.BoxGeometry(0.2, 0.2, 0.035); back.translate(0, 0.1, -0.075);
  const g = mergeGeometries([pan, back]); pan.dispose(); back.dispose();
  return g;
}

/** One person as two meshes: a torso (clothing colour) and a head (skin and hair tones). */
function personGeometry(standing: boolean) {
  const h = standing ? 0.42 : 0.2;
  const body = new THREE.CylinderGeometry(0.06, 0.075, h, 5); body.translate(0, h / 2, 0);
  const head = new THREE.IcosahedronGeometry(0.054, 0); head.translate(0, h + 0.06, 0);
  return { body, head };
}

const HEADS = ["#3a2a22", "#5a3d2e", "#7a5640", "#a07a5c", "#c49a78", "#2a2420", "#1c1a19", "#8a6a4a"];

const CLOTHES_LIGHT = ["#2b2d31", "#3b3d42", "#55575c", "#76787d", "#a3a4a7", "#d4d4d2", "#efeeea", "#8c4a3c", "#6e6a52", "#b08a5a", "#2b2d31", "#55575c"];
const CLOTHES_DARK = ["#16171a", "#1f2023", "#2a2b2f", "#38393d", "#4b4c50", "#66676b", "#8a8a88", "#5e3a32", "#4f4c3c", "#7a6446", "#16171a", "#2a2b2f"];

type SeatSpot = { m: THREE.Matrix4; alt: boolean; pos: THREE.Vector3; rot: number };

/** Seats as instanced chairs on every riser, with aisles every sixteenth of the bowl. */
function useSeatSpots() {
  return useMemo(() => {
    const out: SeatSpot[] = [];
    const q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), e = new THREE.Euler();
    const ring = (r0: number, y0: number, rows: number, depth: number, rise: number, spacing: number) => {
      for (let i = 0; i < rows; i++) {
        const r = r0 + depth * (i + 0.55), y = y0 + rise * i;
        const circ = Math.PI * 2 * r * Math.sqrt((EX * EX + 1) / 2);
        const n = Math.floor(circ / spacing);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const sector = (a / (Math.PI * 2)) * 16;
          if (Math.abs(sector - Math.round(sector)) < 0.06) continue; // aisle
          const [x, z] = onOval(a, r);
          e.set(0, Math.atan2(-x, -z), 0); q.setFromEuler(e);
          v.set(x, y + 0.08, z);
          out.push({ m: new THREE.Matrix4().compose(v, q, s), alt: (i + Math.floor(sector)) % 2 === 0, pos: v.clone(), rot: e.y });
        }
      }
    };
    ring(LOWER.r0, LOWER.y0, LOWER.rows, LOWER.depth, LOWER.rise, 0.27);
    ring(UPPER.r0, UPPER.y0, UPPER.rows, UPPER.depth, UPPER.rise, 0.29);
    return out;
  }, []);
}

const Seats = memo(function Seats({ p, data }: { p: Palette; data: SeatSpot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => chairGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    const a = new THREE.Color(p.seat), b = new THREE.Color(p.seatAlt);
    data.forEach((d, i) => { m.setMatrixAt(i, d.m); m.setColorAt(i, d.alt ? a : b); });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [data, p]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, data.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.75} />
    </instancedMesh>
  );
});

/** The crowd: people in the seats, on a concert floor and queueing at the stands. */
const Crowd = memo(function Crowd({ p, seats, occupancy, kind, placed }: { p: Palette; seats: SeatSpot[]; occupancy: number; kind: string; placed: { s: ArenaStand; pl: Placement }[] }) {
  const seated = useRef<THREE.InstancedMesh>(null), seatedHeads = useRef<THREE.InstancedMesh>(null);
  const standing = useRef<THREE.InstancedMesh>(null), standingHeads = useRef<THREE.InstancedMesh>(null);
  const geoSeated = useMemo(() => personGeometry(false), []);
  const geoStanding = useMemo(() => personGeometry(true), []);
  useEffect(() => () => { for (const g of [geoSeated, geoStanding]) { g.body.dispose(); g.head.dispose(); } }, [geoSeated, geoStanding]);

  const sit = useMemo(() => {
    const r = rng(7), out: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
    for (const s of seats) {
      if (r() > occupancy) continue;
      e.set(0, s.rot + (r() - 0.5) * 0.4, 0); q.setFromEuler(e);
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(s.pos.x, s.pos.y + 0.03, s.pos.z), q, sc));
    }
    return out;
  }, [seats, occupancy]);

  const stand = useMemo(() => {
    const r = rng(11), out: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
    const put = (x: number, y: number, z: number, face: number) => {
      e.set(0, face + (r() - 0.5) * 0.6, 0); q.setFromEuler(e);
      sc.setScalar(0.92 + r() * 0.16);
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, sc));
    };
    if (kind === "concert" && occupancy > 0) {
      // General admission floor, densest at the stage.
      const n = Math.round(420 * occupancy);
      for (let i = 0; i < n; i++) {
        const z = 2.0 - Math.pow(r(), 1.6) * 8.4;
        const w = Math.sqrt(Math.max(0, 1 - (z * z) / (FLOOR_R * FLOOR_R))) * FLOOR_R * EX - 0.5;
        const x = (r() * 2 - 1) * w;
        if (Math.abs(x) < 1.1 && z < -6.2) continue; // mix position
        put(x, 0.02, z, 0);
      }
    }
    if (occupancy > 0) {
      for (const { s, pl } of placed) {
        const d = DIMS[pl.size];
        const n = Math.max(1, Math.min(6, Math.round(s.stand.traffic * 70 * occupancy)));
        const fx = Math.sin(pl.rotY), fz = Math.cos(pl.rotY), sx = Math.cos(pl.rotY), sz = -Math.sin(pl.rotY);
        for (let i = 0; i < n; i++) {
          const along = d.d / 2 + 0.75 + i * 0.36, side = (r() - 0.5) * 0.25 + (i % 2 ? 0.08 : -0.08);
          put(pl.x + fx * along + sx * side, pl.y, pl.z + fz * along + sz * side, pl.rotY + Math.PI);
        }
      }
    }
    return out;
  }, [kind, occupancy, placed]);

  useLayoutEffect(() => {
    const clothes = (p.light ? CLOTHES_LIGHT : CLOTHES_DARK).map((c) => new THREE.Color(c));
    const heads = HEADS.map((c) => new THREE.Color(c).multiplyScalar(p.light ? 1 : 0.6));
    const r = rng(3);
    const fill = (m: THREE.InstancedMesh | null, list: THREE.Matrix4[], pal: THREE.Color[]) => {
      if (!m) return;
      list.forEach((mat, i) => { m.setMatrixAt(i, mat); m.setColorAt(i, pal[Math.floor(r() * pal.length)]); });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    fill(seated.current, sit, clothes); fill(seatedHeads.current, sit, heads);
    fill(standing.current, stand, clothes); fill(standingHeads.current, stand, heads);
  }, [sit, stand, p]);

  if (occupancy <= 0) return null;
  return (
    <group>
      {sit.length > 0 && (
        <>
          <instancedMesh key={`s${sit.length}`} ref={seated} args={[geoSeated.body, undefined, sit.length]}><meshStandardMaterial roughness={0.85} /></instancedMesh>
          <instancedMesh key={`sh${sit.length}`} ref={seatedHeads} args={[geoSeated.head, undefined, sit.length]}><meshStandardMaterial roughness={0.7} flatShading /></instancedMesh>
        </>
      )}
      {stand.length > 0 && (
        <>
          <instancedMesh key={`f${stand.length}`} ref={standing} args={[geoStanding.body, undefined, stand.length]} castShadow><meshStandardMaterial roughness={0.85} /></instancedMesh>
          <instancedMesh key={`fh${stand.length}`} ref={standingHeads} args={[geoStanding.head, undefined, stand.length]} castShadow><meshStandardMaterial roughness={0.7} flatShading /></instancedMesh>
        </>
      )}
    </group>
  );
});

/* ---------- Event floor ---------- */

function courtTexture(light: boolean) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 544;
  const g = c.getContext("2d")!;
  g.fillStyle = light ? "#d7b98c" : "#7a5f3e"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + (i % 3) * 0.01})`; g.fillRect(0, i * 14, c.width, 7); }
  g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 5;
  g.strokeRect(24, 24, c.width - 48, c.height - 48);
  g.beginPath(); g.moveTo(c.width / 2, 24); g.lineTo(c.width / 2, c.height - 24); g.stroke();
  g.beginPath(); g.arc(c.width / 2, c.height / 2, 62, 0, Math.PI * 2); g.stroke();
  for (const side of [0, 1]) {
    const x0 = side ? c.width - 24 : 24, dir = side ? -1 : 1;
    g.fillStyle = light ? "rgba(31,79,224,.55)" : "rgba(80,110,220,.6)";
    g.fillRect(side ? x0 - 196 : x0, c.height / 2 - 64, 196, 128);
    g.strokeRect(side ? x0 - 196 : x0, c.height / 2 - 64, 196, 128);
    g.beginPath(); g.arc(x0 + dir * 50, c.height / 2, 236, -Math.PI / 2 + (side ? Math.PI : 0) + 0.2 * dir * 0, Math.PI / 2 + (side ? Math.PI : 0)); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const Floor = memo(function Floor({ kind, p }: { kind: string; p: Palette }) {
  const court = useMemo(() => (kind === "game" && typeof document !== "undefined" ? courtTexture(p.light) : null), [kind, p.light]);
  useEffect(() => () => court?.dispose(), [court]);
  const chairs = useMemo(() => {
    if (kind !== "comedy") return [];
    const out: [number, number][] = [];
    for (let row = 0; row < 9; row++) for (let i = -9; i <= 9; i++) { if (i === 0) continue; out.push([i * 0.42, -3.6 + row * 0.62]); }
    return out;
  }, [kind]);
  const chairRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = chairRef.current; if (!m) return;
    const mat = new THREE.Matrix4();
    chairs.forEach(([x, z], i) => { mat.makeTranslation(x, 0.16, z); m.setMatrixAt(i, mat); });
    m.instanceMatrix.needsUpdate = true;
  }, [chairs]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[EX, 1, 1]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[FLOOR_R + 0.4, 96]} />
        <meshStandardMaterial color={p.floor} roughness={0.8} />
      </mesh>
      {court && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
          <planeGeometry args={[11.2, 6]} />
          <meshStandardMaterial map={court} roughness={0.45} />
        </mesh>
      )}
      {kind === "game" && (
        <group position={[0, 8.4, 0]}>
          {/* Centre-hung scoreboard */}
          <mesh castShadow><boxGeometry args={[3.2, 1.6, 2.2]} /><meshStandardMaterial color={p.stage} roughness={0.4} metalness={0.3} /></mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]} position={[Math.sin((i * Math.PI) / 2) * (i % 2 ? 1.61 : 1.11), 0, Math.cos((i * Math.PI) / 2) * (i % 2 ? 1.61 : 1.11)]}>
              <planeGeometry args={[i % 2 ? 2.0 : 3.0, 1.35]} />
              <meshBasicMaterial color={p.light ? "#1f2a12" : "#2c3a12"} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 4, 0]}><cylinderGeometry args={[0.02, 0.02, 6.4]} /><meshStandardMaterial color={p.canopy} /></mesh>
        </group>
      )}
      {kind !== "game" && (
        <group position={[0, 0, kind === "comedy" ? 4.4 : 3.9]}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[kind === "comedy" ? 4.4 : 8.4, 1.1, kind === "comedy" ? 2 : 3.2]} />
            <meshStandardMaterial color={p.stage} roughness={0.6} />
          </mesh>
          {kind === "concert" && (
            <>
              {/* Stage truss and speaker hangs */}
              {[-4.1, 4.1].map((x) => (
                <mesh key={x} position={[x, 3.6, 0.9]} castShadow><boxGeometry args={[0.22, 5, 0.22]} /><meshStandardMaterial color={p.canopy} metalness={0.5} roughness={0.4} /></mesh>
              ))}
              <mesh position={[0, 6.1, 0.9]} castShadow><boxGeometry args={[8.6, 0.28, 0.4]} /><meshStandardMaterial color={p.canopy} metalness={0.5} roughness={0.4} /></mesh>
              <mesh position={[0, 6.1, -0.6]} castShadow><boxGeometry args={[8.6, 0.2, 0.3]} /><meshStandardMaterial color={p.canopy} metalness={0.5} roughness={0.4} /></mesh>
              {[-3.4, 3.4].map((x) => (
                <mesh key={x} position={[x, 4.2, -0.9]} castShadow><boxGeometry args={[0.8, 2.4, 0.7]} /><meshStandardMaterial color={p.stage} roughness={0.5} /></mesh>
              ))}
              <mesh position={[0, 3.6, 1.55]}>
                <planeGeometry args={[6.2, 3.2]} />
                <meshBasicMaterial color={p.light ? "#1b2412" : "#33461a"} toneMapped={false} side={THREE.BackSide} />
              </mesh>
              {/* Front-of-house mix position */}
              <mesh position={[0, 0.5, -7.2]} castShadow><boxGeometry args={[1.6, 1, 1.1]} /><meshStandardMaterial color={p.stage} roughness={0.6} /></mesh>
            </>
          )}
        </group>
      )}
      {chairs.length > 0 && (
        <instancedMesh ref={chairRef} args={[undefined, undefined, chairs.length]} castShadow>
          <boxGeometry args={[0.3, 0.32, 0.3]} />
          <meshStandardMaterial color={p.seat} roughness={0.8} />
        </instancedMesh>
      )}
    </group>
  );
});

/* ---------- Kiosks ---------- */

const DIMS = {
  kiosk: { w: 2.1, d: 1.25, h: 1.8, signH: 0.4 },
  store: { w: 3.6, d: 1.9, h: 2.4, signH: 0.52 },
  tent: { w: 3.0, d: 3.0, h: 2.1, signH: 0.5 },
};

type KioskProps = {
  s: ArenaStand; pl: Placement; p: Palette; selected: boolean; dimmed: boolean; interactive: boolean; fontVer: number;
  onHover: (id: string | null) => void; onClick: (id: string) => void; hovered: boolean;
};

const Kiosk = memo(function Kiosk({ s, pl, p, selected, dimmed, interactive, fontVer, onHover, onClick, hovered }: KioskProps) {
  const dim = DIMS[pl.size];
  const lift = useRef<THREE.Group>(null);
  const sign = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [shown, setShown] = useState({ id: s.vendorId, name: s.vendorName });
  const flip = useRef(0); // 0 idle, >0 animating
  const pending = useRef<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (s.vendorId === shown.id) return;
    pending.current = { id: s.vendorId, name: s.vendorName };
    flip.current = 0.0001;
  }, [s.vendorId, s.vendorName, shown.id]);

  const tex = useMemo(() => (typeof document === "undefined" ? null : signTexture(shown.id, shown.name, dim.w, dim.signH, fontVer)), [shown, dim, fontVer]);
  const menu = useMemo(() => (typeof document === "undefined" ? null : menuTexture(shown.id, p.light)), [shown, p.light]);
  const brand = brandOf(shown.id).bg;
  const fitColor = p.fit[fitLevel(s.fit)];

  useFrame((_, dt) => {
    const g = lift.current; if (!g) return;
    const target = selected ? 0.16 : hovered ? 0.1 : 0;
    g.position.y += (target - g.position.y) * Math.min(1, dt * 10);
    if (sign.current && flip.current > 0) {
      flip.current = Math.min(1, flip.current + dt * 2.4);
      const t = flip.current;
      if (t >= 0.5 && pending.current) { setShown(pending.current); pending.current = null; }
      sign.current.rotation.x = Math.sin(t * Math.PI) * (Math.PI / 2) * (t < 0.5 ? 1 : 1);
      if (t >= 1) { flip.current = 0; sign.current.rotation.x = 0; }
    }
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = selected ? 0.75 + Math.sin(performance.now() / 260) * 0.2 : 0;
    }
  });

  const over = (e: ThreeEvent<PointerEvent>) => { if (!interactive) return; e.stopPropagation(); onHover(s.stand.id); document.body.style.cursor = "pointer"; };
  const out = () => { if (!interactive) return; onHover(null); document.body.style.cursor = ""; };
  const click = (e: ThreeEvent<MouseEvent>) => { if (!interactive) return; e.stopPropagation(); onClick(s.stand.id); };

  const signEmissive = p.light ? 0.12 : 0.95;
  const bodyColor = dimmed ? (p.light ? "#e8e5dc" : "#2a2d25") : p.body;

  return (
    <group position={[pl.x, pl.y, pl.z]} rotation={[0, pl.rotY, 0]}>
      {/* Fit pad on the floor: the crowd-fit colour */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.25]} receiveShadow>
        <planeGeometry args={[dim.w + 0.5, dim.d + 1.1]} />
        <meshStandardMaterial color={dimmed ? p.fit[0] : fitColor} roughness={0.8} transparent opacity={dimmed ? 0.5 : 0.9} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.25]}>
        <ringGeometry args={[Math.max(dim.w, dim.d) * 0.78 + 0.25, Math.max(dim.w, dim.d) * 0.78 + 0.4, 48]} />
        <meshBasicMaterial color={p.accent} transparent opacity={0} toneMapped={false} />
      </mesh>
      <group ref={lift} onPointerOver={over} onPointerOut={out} onClick={click}>
        {pl.size === "tent" ? (
          <>
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
              <mesh key={i} position={[sx * (dim.w / 2 - 0.06), dim.h / 2, sz * (dim.d / 2 - 0.06)]} castShadow>
                <cylinderGeometry args={[0.035, 0.035, dim.h, 8]} /><meshStandardMaterial color={p.canopy} metalness={0.6} roughness={0.35} />
              </mesh>
            ))}
            <mesh position={[0, dim.h + 0.42, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[dim.w * 0.76, 0.85, 4, 1]} /><meshStandardMaterial color={brandOf(shown.id).bg} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.45, 0.2]} castShadow receiveShadow><boxGeometry args={[dim.w * 0.7, 0.9, 0.6]} /><meshStandardMaterial color={bodyColor} roughness={0.6} /></mesh>
          </>
        ) : (
          <>
            {/* Back wall, side walls, counter and canopy */}
            <mesh position={[0, dim.h / 2, -dim.d / 2 + 0.06]} castShadow receiveShadow><boxGeometry args={[dim.w, dim.h, 0.12]} /><meshStandardMaterial color={bodyColor} roughness={0.6} /></mesh>
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[sx * (dim.w / 2 - 0.05), dim.h / 2, 0]} castShadow receiveShadow><boxGeometry args={[0.1, dim.h, dim.d]} /><meshStandardMaterial color={bodyColor} roughness={0.6} /></mesh>
            ))}
            <mesh position={[0, 0.48, dim.d / 2 - 0.12]} castShadow receiveShadow><boxGeometry args={[dim.w - 0.08, 0.96, 0.24]} /><meshStandardMaterial color={p.counter} roughness={0.5} /></mesh>
            {/* Brand band along the counter front, with a kick plate */}
            <mesh position={[0, 0.8, dim.d / 2 + 0.003]}><planeGeometry args={[dim.w - 0.08, 0.2]} /><meshStandardMaterial color={brand} roughness={0.55} /></mesh>
            <mesh position={[0, 0.07, dim.d / 2 + 0.004]}><planeGeometry args={[dim.w - 0.08, 0.14]} /><meshStandardMaterial color={p.canopy} roughness={0.6} /></mesh>
            <mesh position={[0, 0.975, dim.d / 2 - 0.08]} castShadow><boxGeometry args={[dim.w + 0.04, 0.04, 0.36]} /><meshStandardMaterial color={p.light ? "#bbb7a9" : "#585c50"} roughness={0.3} metalness={0.4} /></mesh>
            {/* Dark interior so the serving hatch reads */}
            <mesh position={[0, dim.h / 2, -dim.d / 2 + 0.121]}><planeGeometry args={[dim.w - 0.2, dim.h]} /><meshStandardMaterial color={p.interior} emissive={p.light ? "#000000" : "#ffcf94"} emissiveIntensity={p.light ? 0 : 0.12} roughness={0.9} /></mesh>
            {/* Back counter and the backlit menu board */}
            <mesh position={[0, 0.45, -dim.d / 2 + 0.3]} castShadow receiveShadow><boxGeometry args={[dim.w - 0.24, 0.9, 0.34]} /><meshStandardMaterial color={p.counter} roughness={0.5} /></mesh>
            {menu && (
              <mesh position={[0, dim.h * 0.66, -dim.d / 2 + 0.13]}>
                <planeGeometry args={[dim.w * 0.74, dim.h * 0.26]} />
                <meshStandardMaterial map={menu} emissiveMap={menu} emissive="#ffffff" emissiveIntensity={p.light ? 0.25 : 0.9} roughness={0.3} />
              </mesh>
            )}
            {pl.size === "store" && (
              <mesh position={[0, dim.h * 0.55, dim.d / 2 + 0.002]}>
                <planeGeometry args={[dim.w - 0.3, dim.h * 0.5]} />
                <meshStandardMaterial color={p.glass} roughness={0.1} metalness={0.5} transparent opacity={0.55} />
              </mesh>
            )}
            <mesh position={[0, dim.h + 0.05, 0.08]} castShadow receiveShadow><boxGeometry args={[dim.w + 0.16, 0.1, dim.d + 0.28]} /><meshStandardMaterial color={p.canopy} roughness={0.5} /></mesh>
            {/* Roof in the vendor's colour, so stands read from above */}
            <mesh position={[0, dim.h + 0.105, 0.08]}><boxGeometry args={[dim.w + 0.04, 0.012, dim.d + 0.16]} /><meshStandardMaterial color={brandOf(shown.id).bg} roughness={0.6} /></mesh>
            {/* Under-canopy light strip in the fit colour */}
            <mesh position={[0, dim.h - 0.005, dim.d / 2 + 0.1]}>
              <boxGeometry args={[dim.w - 0.2, 0.02, 0.04]} />
              <meshBasicMaterial color={dimmed ? p.fit[0] : fitColor} toneMapped={false} />
            </mesh>
          </>
        )}
        {/* Fascia sign, flips when the vendor changes */}
        <group ref={sign} position={[0, pl.size === "tent" ? dim.h - 0.05 : dim.h - dim.signH / 2 + 0.02, (pl.size === "tent" ? dim.d / 2 : dim.d / 2 + 0.22)]}>
          <mesh position={[0, 0, 0.005]} castShadow>
            <boxGeometry args={[dim.w + (pl.size === "tent" ? -0.1 : 0.16), dim.signH, 0.05]} />
            <meshStandardMaterial color={brandOf(shown.id).bg} roughness={0.5} />
          </mesh>
          {tex && (
            <mesh position={[0, 0, 0.032]}>
              <planeGeometry args={[dim.w + (pl.size === "tent" ? -0.1 : 0.16), dim.signH]} />
              <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={signEmissive} roughness={0.45} toneMapped={!(!p.light)} />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
});

/* ---------- Camera ---------- */

function CameraRig({ preset, focus, drift, resetKey }: { preset: Preset; focus: Placement | null; drift: boolean; resetKey: number }) {
  const ref = useRef<CameraControls>(null);
  const first = useRef(true);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const shot = focus ? standCamera(focus) : PRESETS[preset];
    c.setLookAt(...shot.pos, ...shot.target, !first.current);
    first.current = false;
  }, [preset, focus, resetKey]);
  useFrame((_, dt) => { if (drift && ref.current) ref.current.azimuthAngle += dt * 0.035; });
  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.55}
      minDistance={4}
      maxDistance={95}
      maxPolarAngle={Math.PI * 0.46}
      dollyToCursor
      enabled={!drift}
    />
  );
}

function SceneBg({ color }: { color: string }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(color);
    scene.fog = new THREE.Fog(color, 70, 150);
  }, [scene, color]);
  return null;
}

/* ---------- Scene ---------- */

function Scene(props: ArenaProps & { fontVer: number }) {
  const { stands, kind, theme, selectedId = null, onSelect, onSwap, preset = "bowl", focusZone = null, interactive = true, drift = false, resetKey = 0, crowd = 0, fontVer } = props;
  const seats = useSeatSpots();
  const occupancy = Math.min(0.96, Math.max(0, crowd / CAPACITY));
  const p = useMemo(() => palette(theme), [theme]);
  const [hover, setHover] = useState<string | null>(null);
  const placed = useMemo(() => stands.map((s) => ({ s, pl: place(s.stand as Assignment["stand"]) })), [stands]);
  const sel = placed.find((x) => x.s.stand.id === selectedId) ?? null;
  const hov = placed.find((x) => x.s.stand.id === hover) ?? null;
  const focus = sel?.pl ?? null;
  const shadowSize = 34;

  return (
    <>
      <SceneBg color={p.bg} />
      <CameraRig preset={preset} focus={interactive ? focus : null} drift={drift} resetKey={resetKey} />
      {p.light ? (
        <>
          <hemisphereLight args={["#ffffff", "#cfcbbd", 1.25]} />
          <directionalLight
            position={[22, 38, -16]} intensity={2.4} castShadow
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
            shadow-camera-left={-shadowSize} shadow-camera-right={shadowSize} shadow-camera-top={shadowSize} shadow-camera-bottom={-shadowSize} shadow-camera-far={120}
          />
          <Environment resolution={64} frames={1}>
            <Lightformer form="rect" intensity={1.6} position={[0, 10, -10]} scale={[20, 6, 1]} />
            <Lightformer form="rect" intensity={0.8} position={[-12, 6, 10]} scale={[10, 4, 1]} />
          </Environment>
        </>
      ) : (
        <>
          <hemisphereLight args={["#5d6a4c", "#14160f", 1.1]} />
          <pointLight position={[0, 22, 0]} intensity={900} distance={60} decay={1.7} color="#ffe6c4" />
          <directionalLight
            position={[-18, 34, -20]} intensity={0.55} color="#c9d8a8" castShadow
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
            shadow-camera-left={-shadowSize} shadow-camera-right={shadowSize} shadow-camera-top={shadowSize} shadow-camera-bottom={-shadowSize} shadow-camera-far={120}
          />
          {/* Event lighting: warm floods on the floor and the concourses */}
          <spotLight position={[0, 16, -6]} angle={0.55} penumbra={0.8} intensity={420} distance={40} color="#ffe2b8" />
          <spotLight position={[0, 14, 8]} angle={0.5} penumbra={0.9} intensity={260} distance={34} color="#e6ffb0" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2 + 0.3;
            const [x, z] = onOval(a, 12);
            return <pointLight key={i} position={[x, 4.6, z]} intensity={18} distance={9} decay={1.6} color="#ffd6a0" />;
          })}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            const [x, z] = onOval(a, 19);
            return <pointLight key={`u${i}`} position={[x, 9, z]} intensity={16} distance={9} decay={1.6} color="#ffd6a0" />;
          })}
          <Environment resolution={32} frames={1}>
            <Lightformer form="rect" intensity={0.25} position={[0, 10, -10]} scale={[20, 6, 1]} color="#b3c48a" />
          </Environment>
        </>
      )}

      {/* Plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[120, 64]} />
        <meshStandardMaterial color={p.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, -2]} scale={[1.18, 1, 1]} receiveShadow>
        <circleGeometry args={[33, 96]} />
        <meshStandardMaterial color={p.paving} roughness={0.95} />
      </mesh>

      <Bowl p={p} />
      <Seats p={p} data={seats} />
      <Crowd p={p} seats={seats} occupancy={occupancy} kind={kind} placed={placed} />
      <Architecture p={p} />
      <Floor kind={kind} p={p} />

      {placed.map(({ s, pl }) => (
        <Kiosk
          key={s.stand.id} s={s} pl={pl} p={p} fontVer={fontVer}
          selected={s.stand.id === selectedId} hovered={s.stand.id === hover}
          dimmed={!!focusZone && s.stand.zone !== focusZone}
          interactive={interactive} onHover={setHover} onClick={(id) => onSelect?.(id === selectedId ? null : id)}
        />
      ))}

      {interactive && hov && hov.s.stand.id !== selectedId && (
        <Html position={[hov.pl.x, hov.pl.y + 2.3, hov.pl.z]} zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
          <div className="scene-tip">{hov.s.stand.label} · {hov.s.vendorName}</div>
        </Html>
      )}
      {interactive && sel && (
        <Html position={[sel.pl.x, sel.pl.y + (sel.pl.size === "kiosk" ? 1.9 : 2.6), sel.pl.z]} zIndexRange={[25, 10]}>
          <div className="scene-pop" onPointerDown={(e) => e.stopPropagation()}>
            <div className="hd">
              <strong>{sel.s.vendorName}</strong>
              <span className="badge" style={{ height: 20, background: "transparent", padding: 0 }}>
                <i style={{ color: p.fit[fitLevel(sel.s.fit)] }} />{fitWord(sel.s.fit)}
              </span>
              <span>{sel.s.stand.label} · {ZONE_SHORT[sel.s.stand.zone]}</span>
            </div>
            <ul>
              {sel.s.alternatives.slice(0, 3).map((a) => (
                <li key={a.vendorId}>
                  <button onClick={() => onSwap?.(sel.s.stand.id, a.vendorId)} title={`Swap to ${a.name}`}>
                    <span className="fitdot" style={{ width: 8, height: 8, background: p.fit[fitLevel(a.fit)] }} />
                    <span>Swap to {a.name}</span>
                    <em>{fmt.fit(a.fit)}</em>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Html>
      )}
    </>
  );
}

export default function Arena(props: ArenaProps) {
  const [fontVer, setFontVer] = useState(0);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) { fontFamily = ""; texCache.clear(); setFontVer((v) => v + 1); } });
    return () => { alive = false; document.body.style.cursor = ""; };
  }, []);
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: 32, near: 0.5, far: 400, position: PRESETS.bowl.pos }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={() => props.interactive !== false && props.onSelect?.(null)}
      style={{ position: "absolute", inset: 0 }}
      aria-label="3D model of the arena with every stand"
    >
      <Scene {...props} fontVer={fontVer} />
    </Canvas>
  );
}
