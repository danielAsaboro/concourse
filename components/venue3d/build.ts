// Geometry builders for the venue scene. Pure three.js, no React.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  CENTER, CITY, FOOTPRINT, RINK, SECTIONS, TIERS, Y, ring, ringNormal, roofY, sectionAngle, inPoly,
  type TierKey, type XZ,
} from "./geometry";

/** Sweep a 2D profile of (ring offset, height) points around the bowl. Flat-shaded. */
export function sweep(profile: [number, number][], segments = 240, uvScale = 1): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  const thetas = Array.from({ length: segments + 1 }, (_, i) => (i / segments) * Math.PI * 2);
  const pts = thetas.map((t) => profile.map(([d, y]) => { const [x, z] = ring(t, d); return [x, y, z] as const; }));
  // Arc length along the ring for u, profile length for v.
  for (let i = 0; i < segments; i++) {
    let v = 0;
    for (let j = 0; j < profile.length - 1; j++) {
      const a = pts[i][j], b = pts[i + 1][j], c = pts[i + 1][j + 1], d = pts[i][j + 1];
      const seg = Math.hypot(profile[j + 1][0] - profile[j][0], profile[j + 1][1] - profile[j][1]);
      const u0 = (i / segments) * 600 * uvScale, u1 = ((i + 1) / segments) * 600 * uvScale;
      const v0 = v * uvScale, v1 = (v + seg) * uvScale;
      // Wind so faces point up/outward for profiles that run inward to outward.
      pos.push(...a, ...d, ...c, ...a, ...c, ...b);
      uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
      v += seg;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Stepped seating profile for a tier, with a front fascia and (optionally) a closed underside. */
export function tierProfile(key: TierKey): [number, number][] {
  const t = TIERS[key];
  const pts: [number, number][] = [];
  if (key === "t1") pts.push([t.d0 - 0.45, Y.floor], [t.d0 - 0.45, t.y0]);
  else pts.push([t.d0, t.y0 - 0.55], [t.d0, t.y0]);
  for (let i = 0; i < t.rows; i++) {
    const y = t.y0 + i * t.rise;
    pts.push([t.d0 + (i + 1) * t.depth, y]);
    if (i < t.rows - 1) pts.push([t.d0 + (i + 1) * t.depth, y + t.rise]);
  }
  const end = pts[pts.length - 1];
  if (key === "t2") pts.push([end[0], -0.5], [t.d0, t.y0 - 0.55]);
  if (key === "t3") pts.push([end[0] + 0.6, end[1] + 1.1], [end[0] + 0.6, end[1] - 4.5], [t.d0, t.y0 - 0.55]);
  return pts;
}

/* ---------- Seats ---------- */

export type SeatSpot = { x: number; y: number; z: number; rotY: number; tier: TierKey; theta: number; row: number };

const MISSING = new Set([5, 10, 18, 23]);
const T3_MISSING = new Set([218, 219, 220, 221, 222, 223]);
const SLOT = (2 * Math.PI) / 26;

function slotOf(theta: number): number {
  // Section number (1..26) whose slot contains theta.
  const first = sectionAngle(1);
  let k = Math.round((first - theta) / SLOT);
  k = ((k % 26) + 26) % 26;
  return k + 1;
}

export function seatSpots(): SeatSpot[] {
  const out: SeatSpot[] = [];
  const spacing = 0.58, aisle = 0.7;
  for (const key of ["t1", "t2", "t3"] as TierKey[]) {
    const t = TIERS[key];
    for (let row = 0; row < t.rows; row++) {
      const d = t.d0 + (row + 0.55) * t.depth;
      const y = t.y0 + row * t.rise;
      // Fine sampling of the ring for arc length.
      const N = 1440;
      const samples: { x: number; z: number; th: number; s: number }[] = [];
      let s = 0, prev: XZ | null = null;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const p = ring(th, d);
        if (prev) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        samples.push({ x: p[0], z: p[1], th, s });
        prev = p;
      }
      const total = s;
      let j = 0;
      for (let at = spacing / 2; at < total; at += spacing) {
        while (j < N && samples[j + 1].s < at) j++;
        const a = samples[j], b = samples[Math.min(N, j + 1)];
        const f = (at - a.s) / Math.max(1e-6, b.s - a.s);
        const th = a.th + (b.th - a.th) * f;
        const k = slotOf(th);
        const n = key === "t1" ? k : key === "t2" ? 100 + k : 200 + k;
        if (key === "t1" && MISSING.has(k)) continue;
        if (key === "t3" && T3_MISSING.has(n)) continue;
        // Aisle at each slot boundary.
        const centre = sectionAngle(k);
        let off = th - centre;
        off = Math.atan2(Math.sin(off), Math.cos(off));
        const rr = Math.hypot(a.x - CENTER[0], a.z - CENTER[1]);
        if (Math.abs(Math.abs(off) - SLOT / 2) * rr < aisle) continue;
        const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        const [nx, nz] = ringNormal(th, d);
        out.push({ x, y, z, rotY: Math.atan2(-nx, -nz), tier: key, theta: th, row });
      }
    }
  }
  return out;
}

/** A stadium chair: seat pan and back, facing +z in local space (rotY turns it to the bowl). */
export function chairGeometry(): THREE.BufferGeometry {
  const seat = new THREE.BoxGeometry(0.46, 0.06, 0.42); seat.translate(0, 0.44, 0.02);
  const back = new THREE.BoxGeometry(0.46, 0.46, 0.05); back.translate(0, 0.68, -0.2); back.rotateX(0);
  const post = new THREE.BoxGeometry(0.06, 0.42, 0.06); post.translate(0, 0.21, -0.05);
  const g = mergeGeometries([seat.toNonIndexed(), back.toNonIndexed(), post.toNonIndexed()])!;
  return g;
}

/** A low-poly person, about 1.75 m standing or 1.3 m seated, facing +z. */
export function personGeometry(seated: boolean): THREE.BufferGeometry {
  const torso = new THREE.CylinderGeometry(0.16, 0.19, 0.6, 7);
  const head = new THREE.IcosahedronGeometry(0.115, 1);
  let legs: THREE.BufferGeometry;
  if (seated) {
    torso.translate(0, 0.79, -0.06);
    head.translate(0, 1.21, -0.04);
    legs = new THREE.BoxGeometry(0.3, 0.45, 0.16); legs.translate(0, 0.24, 0.3);
    const thighs = new THREE.BoxGeometry(0.3, 0.14, 0.42); thighs.translate(0, 0.52, 0.12);
    legs = mergeGeometries([legs.toNonIndexed(), thighs.toNonIndexed()])!;
  } else {
    torso.translate(0, 1.15, 0);
    head.translate(0, 1.6, 0);
    legs = new THREE.CylinderGeometry(0.17, 0.13, 0.86, 6); legs.translate(0, 0.43, 0);
  }
  const parts = [torso, legs, head].map((g) => (g.index ? g.toNonIndexed() : g));
  parts.forEach((g) => g.deleteAttribute("uv"));
  return mergeGeometries(parts)!;
}

/* ---------- Rink and floors ---------- */

export function roundedRect(hx: number, hz: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz); s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, hz - r); s.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hz); s.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -hz + r); s.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Ice markings, NHL layout, long axis along the texture's v (north at the top). */
export function iceTexture(): THREE.CanvasTexture {
  const W = 512, H = 1200; // 1 px ≈ 5 cm
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const sx = W / (RINK.hx * 2), sz = H / (RINK.hz * 2);
  g.fillStyle = "#f3f7fa"; g.fillRect(0, 0, W, H);
  // Subtle scuffs.
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(160,180,195,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 30, 1 + Math.random() * 3); }
  const zline = (m: number, color: string, w: number) => { g.fillStyle = color; g.fillRect(0, H / 2 + m * sz - (w * sz) / 2, W, w * sz); };
  zline(0, "#c8102e", 0.3);
  zline(-7.62, "#1d4fbf", 0.3); zline(7.62, "#1d4fbf", 0.3);
  zline(-RINK.hz + 3.35, "#c8102e", 0.05); zline(RINK.hz - 3.35, "#c8102e", 0.05);
  const circle = (x: number, z: number, r: number, color: string, fill = false) => {
    g.beginPath(); g.arc(W / 2 + x * sx, H / 2 + z * sz, r * sx, 0, Math.PI * 2);
    if (fill) { g.fillStyle = color; g.fill(); } else { g.strokeStyle = color; g.lineWidth = 0.05 * sx; g.stroke(); }
  };
  circle(0, 0, 4.57, "#1d4fbf"); circle(0, 0, 0.15, "#1d4fbf", true);
  for (const z of [-RINK.hz + 9.45, RINK.hz - 9.45]) for (const x of [-6.71, 6.71]) { circle(x, z, 4.57, "#c8102e"); circle(x, z, 0.3, "#c8102e", true); }
  for (const z of [-7.62 + 1.52, 7.62 - 1.52, -7.62 - 1.52, 7.62 + 1.52].map((v) => v)) for (const x of [-6.71, 6.71]) circle(x, z, 0.3, "#c8102e", true);
  // Goal creases.
  g.fillStyle = "rgba(90,150,220,.55)";
  for (const dir of [-1, 1]) { g.beginPath(); g.arc(W / 2, H / 2 + dir * (RINK.hz - 3.35) * sz, 1.83 * sx, dir < 0 ? 0 : Math.PI, dir < 0 ? Math.PI : Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function courtTexture(): THREE.CanvasTexture {
  const W = 600, H = 1120; // 28.65 x 15.24 m court plus apron, long axis along v
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  for (let i = 0; i < W; i += 12) { g.fillStyle = `hsl(32, 48%, ${58 + ((i * 7) % 9)}%)`; g.fillRect(i, 0, 12, H); }
  const s = W / 16.5;
  g.strokeStyle = "#fff"; g.lineWidth = 4;
  const ox = (W - 15.24 * s) / 2, oz = (H - 28.65 * s) / 2;
  g.strokeRect(ox, oz, 15.24 * s, 28.65 * s);
  g.beginPath(); g.moveTo(ox, H / 2); g.lineTo(W - ox, H / 2); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, 1.8 * s, 0, Math.PI * 2); g.stroke();
  for (const d of [-1, 1]) {
    const by = d < 0 ? oz : H - oz;
    g.fillStyle = "rgba(20,60,50,.85)"; g.fillRect(W / 2 - 2.45 * s, d < 0 ? by : by - 5.8 * s, 4.9 * s, 5.8 * s);
    g.beginPath(); g.arc(W / 2, by + d * 1.575 * s, 6.75 * s, d < 0 ? 0 : Math.PI, d < 0 ? Math.PI : Math.PI * 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/* ---------- Building shell ---------- */

/** Saddle roof clipped to the footprint (grown slightly for an overhang). */
export function roofGeometry(): THREE.BufferGeometry {
  const grow = 1.04;
  const poly = FOOTPRINT.map(([x, z]) => [CENTER[0] + (x - CENTER[0]) * grow, CENTER[1] + (z - CENTER[1]) * grow] as XZ);
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const N = 72;
  const pos: number[] = [];
  const P = (i: number, j: number): [number, number, number] => {
    const x = x0 + ((x1 - x0) * i) / N, z = z0 + ((z1 - z0) * j) / N;
    return [x, roofY(x, z), z];
  };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = x0 + ((x1 - x0) * (i + 0.5)) / N, cz = z0 + ((z1 - z0) * (j + 0.5)) / N;
    if (!inPoly(cx, cz, poly)) continue;
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    pos.push(...a, ...d, ...c, ...a, ...c, ...b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Glass curtain wall along the footprint, from street level up to the roof edge. */
export function facadeGeometry(): { glass: THREE.BufferGeometry; mullions: THREE.Matrix4[] } {
  const pos: number[] = [];
  const mullions: THREE.Matrix4[] = [];
  for (let i = 0; i < FOOTPRINT.length; i++) {
    const [ax, az] = FOOTPRINT[i], [bx, bz] = FOOTPRINT[(i + 1) % FOOTPRINT.length];
    const ha = roofY(ax, az) - 0.4, hb = roofY(bx, bz) - 0.4;
    pos.push(ax, 0, az, bx, 0, bz, bx, hb, bz, ax, 0, az, bx, hb, bz, ax, ha, az);
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 4.5));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      const h = roofY(x, z) - 0.3;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(bx - ax, bz - az)), new THREE.Vector3(1, h, 1));
      mullions.push(m);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return { glass: g, mullions };
}

/** Footprint shape in the x/-z plane (for meshes rotated -90° about x). */
export function shapeOf(poly: XZ[], holes: XZ[][] = []): THREE.Shape {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return s;
}

/** Ring polygon at offset d (for holes). */
export function ringPoly(d: number, n = 160): XZ[] {
  return Array.from({ length: n }, (_, i) => ring((i / n) * Math.PI * 2, d));
}

/* ---------- City ---------- */

function windowTexture(night: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = night ? "#1a1d24" : "#c9c4ba"; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const lit = night ? Math.random() < 0.38 : false;
    g.fillStyle = lit ? `hsl(${36 + Math.random() * 10}, 90%, ${62 + Math.random() * 18}%)` : night ? "#262b36" : "#8d99a6";
    g.fillRect(x * 32 + 7, y * 32 + 8, 18, 17);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const cityTextures = { day: null as THREE.CanvasTexture | null, night: null as THREE.CanvasTexture | null };
export function getWindowTexture(night: boolean) {
  const k = night ? "night" : "day";
  if (!cityTextures[k]) cityTextures[k] = windowTexture(night);
  return cityTextures[k]!;
}

const NEEDLE_ID = 12903132;
export function cityGeometry() {
  const walls: THREE.BufferGeometry[] = [], roofs: THREE.BufferGeometry[] = [];
  let needle: XZ | null = null;
  for (const b of CITY.buildings) {
    if (b.id === NEEDLE_ID) {
      const xs = b.poly.map((p) => p[0]), zs = b.poly.map((p) => p[1]);
      needle = [xs.reduce((a, c) => a + c, 0) / xs.length, zs.reduce((a, c) => a + c, 0) / zs.length];
      continue;
    }
    if (b.poly.length < 3 || b.h <= 0.5) continue;
    // Parts of the arena itself (atrium, box office) are modelled by the venue scene.
    if (b.poly.some(([x, z]) => inPoly(x, z)) || inPoly(CENTER[0], CENTER[1], b.poly) || inPoly(b.poly.reduce((a, q) => a + q[0], 0) / b.poly.length, b.poly.reduce((a, q) => a + q[1], 0) / b.poly.length)) continue;
    let geo: THREE.BufferGeometry;
    try {
      geo = new THREE.ExtrudeGeometry(shapeOf(b.poly), { depth: Math.max(1, b.h - b.min), bevelEnabled: false, UVGenerator: undefined });
    } catch { continue; }
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, b.min, 0);
    const flat = geo.toNonIndexed();
    // Split caps (group 0) and sides (group 1).
    const groups = geo.groups;
    const take = (gi: number) => {
      const gr = groups[gi]; if (!gr) return null;
      const out = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"]) {
        const attr = flat.getAttribute(name) as THREE.BufferAttribute;
        const arr = (attr.array as Float32Array).slice(gr.start * attr.itemSize, (gr.start + gr.count) * attr.itemSize);
        out.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize));
      }
      return out;
    };
    const caps = take(0), sides = take(1);
    if (caps) roofs.push(caps);
    if (sides) {
      // World-unit UVs along the wall (u) and up (v) for the window texture.
      const p = sides.getAttribute("position") as THREE.BufferAttribute, uv = sides.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i += 3) {
        // Each triangle lies on one wall: use the wall direction from its horizontal extent.
        const x0 = p.getX(i), z0 = p.getZ(i);
        let dx = 0, dz = 0;
        for (let k = 1; k < 3; k++) { const ex = p.getX(i + k) - x0, ez = p.getZ(i + k) - z0; if (Math.hypot(ex, ez) > Math.hypot(dx, dz)) { dx = ex; dz = ez; } }
        const l = Math.hypot(dx, dz) || 1;
        for (let k = 0; k < 3; k++) {
          const along = (p.getX(i + k) * dx + p.getZ(i + k) * dz) / l;
          uv.setXY(i + k, along / 13.6, p.getY(i + k) / 13.6);
        }
      }
      uv.needsUpdate = true;
      walls.push(sides);
    }
    geo.dispose();
  }
  const road: number[] = [], foot: number[] = [];
  for (const r of CITY.roads) {
    const target = r.w <= 3 ? foot : road;
    const y = r.w <= 3 ? 0.035 : 0.03;
    for (let i = 0; i < r.line.length - 1; i++) {
      const [ax, az] = r.line[i], [bx, bz] = r.line[i + 1];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * r.w / 2, nz = (dx / l) * r.w / 2;
      target.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
    }
  }
  const mk = (arr: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(arr.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); return g; };
  const green = CITY.green.filter((p) => p.length >= 3).map((p) => { const g = new THREE.ShapeGeometry(shapeOf(p, inPoly(CENTER[0], CENTER[1], p) ? [FOOTPRINT.slice().reverse()] : [])); g.rotateX(-Math.PI / 2); g.translate(0, 0.04, 0); return g.toNonIndexed(); });
  const water = CITY.water.filter((p) => p.length >= 3).map((p) => { const g = new THREE.ShapeGeometry(shapeOf(p)); g.rotateX(-Math.PI / 2); g.translate(0, 0.06, 0); return g.toNonIndexed(); });
  const strip = (gs: THREE.BufferGeometry[]) => gs.map((g) => { const n = g.clone(); for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k); return n; });
  return {
    walls: walls.length ? mergeGeometries(walls)! : new THREE.BufferGeometry(),
    roofs: roofs.length ? mergeGeometries(strip(roofs))! : new THREE.BufferGeometry(),
    road: mk(road), foot: mk(foot),
    green: green.length ? mergeGeometries(strip(green))! : new THREE.BufferGeometry(),
    water: water.length ? mergeGeometries(strip(water))! : new THREE.BufferGeometry(),
    needle,
  };
}

/** Points for trees: scattered inside green areas, kept off buildings and the arena. */
export function treeSpots(max = 520): XZ[] {
  const out: XZ[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const areas = CITY.green.filter((p) => p.length >= 3);
  for (const poly of areas) {
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const area = (x1 - x0) * (z1 - z0);
    const n = Math.min(60, Math.floor(area / 260));
    for (let i = 0; i < n && out.length < max; i++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (!inPoly(x, z, poly) || inPoly(x, z)) continue;
      if (CITY.buildings.some((b) => inPoly(x, z, b.poly))) continue;
      out.push([x, z]);
    }
  }
  return out;
}

export { SECTIONS };
