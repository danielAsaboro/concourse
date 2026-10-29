"use client";
// The show inside the bowl: LED wall and side screens, moving-head lights, lasers, confetti and phone lights
// for concerts; a live scoreboard, ice projection and goal lights for hockey; scrolling ribbon boards for both.
// Everything runs on the beat clock in show.ts, so the lights keep time with the music when the sound is on.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CENTER, RINK, Y, type EventKind } from "./geometry";
import type { SeatSpot } from "./build";
import { pulse, tick, type ShowSpec } from "./beat";

const FONT = "Geist, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const STAGE_Z = RINK.hz - 7;
const col = (c: string) => new THREE.Color(c);

/** Advances the beat clock. Mount before anything that reads it. */
export function ShowClock() { useFrame(() => tick()); return null; }

/* ---------- Live canvas textures ---------- */

function useLiveCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number, now: number) => void, fps = 30) {
  const { canvas, tex } = useMemo(() => {
    const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
    if (canvas) { canvas.width = w; canvas.height = h; }
    const tex = canvas ? new THREE.CanvasTexture(canvas) : null;
    if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; }
    return { canvas, tex };
  }, [w, h]);
  const last = useRef(0);
  const drawRef = useRef(draw); drawRef.current = draw;
  useFrame(() => {
    if (!canvas || !tex) return;
    const now = performance.now();
    if (now - last.current < 1000 / fps) return;
    last.current = now;
    drawRef.current(canvas.getContext("2d")!, w, h, now);
    tex.needsUpdate = true;
  });
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

function fitText(g: CanvasRenderingContext2D, text: string, max: number, size: number, weight = 800) {
  g.font = `${weight} ${size}px ${FONT}`;
  while (g.measureText(text).width > max && size > 10) { size -= 2; g.font = `${weight} ${size}px ${FONT}`; }
  return size;
}

/* ---------- LED wall ---------- */

function drawWall(g: CanvasRenderingContext2D, w: number, h: number, spec: ShowSpec, on: boolean) {
  const { look } = spec, p = pulse, c = look.colors;
  const beat = p.beat, bar = Math.floor(beat / 4), sec = on ? p.section : "intro";
  g.fillStyle = look.wall; g.fillRect(0, 0, w, h);
  const pattern = !on ? 0 : sec === "intro" ? 0 : sec === "break" ? 3 : sec === "build" ? 1 : 2 + (Math.floor(bar / 4) % 2 ? 2 : 0);
  g.save();
  if (pattern === 1 || pattern === 2) {
    // Spectrum columns
    const n = 16, bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = p.bands[i], bh = v * h * 0.9;
      const grd = g.createLinearGradient(0, h, 0, h - bh);
      grd.addColorStop(0, c[0]); grd.addColorStop(1, c[1 % c.length]);
      g.fillStyle = grd; g.globalAlpha = 0.85;
      g.fillRect(i * bw + 3, h - bh, bw - 6, bh);
      if (pattern === 2) g.fillRect(i * bw + 3, 0, bw - 6, bh * 0.35);
    }
  } else if (pattern === 4) {
    // Rotating rays from the centre
    g.translate(w / 2, h / 2); g.rotate(beat * 0.25);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = c[i % c.length]; g.globalAlpha = 0.35 + 0.5 * p.kick;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w, (i / 12) * Math.PI * 2, (i / 12) * Math.PI * 2 + 0.22); g.closePath(); g.fill();
    }
  } else if (pattern === 3) {
    // Slow drifting light, a ballad look
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97 + beat * 6) % (w + 40)) - 20, y = (i * 53) % h, r = 2 + (i % 4);
      g.fillStyle = i % 3 ? look.ink : c[0]; g.globalAlpha = 0.25 + 0.25 * Math.sin(beat + i);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  } else {
    // Breathing gradient
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6);
    grd.addColorStop(0, c[0]); grd.addColorStop(1, look.wall);
    g.globalAlpha = 0.25 + 0.15 * Math.sin(beat * Math.PI * 0.5); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }
  g.restore();
  // The act's name
  const name = look.label;
  const size = fitText(g, name.toUpperCase(), w * 0.86, h * 0.3);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = c[0]; g.shadowBlur = 18 + 30 * (on ? p.kick : 0);
  g.fillStyle = look.ink; g.globalAlpha = on && sec === "drop" ? 0.75 + 0.25 * p.kick : 0.95;
  g.fillText(name.toUpperCase(), w / 2, h / 2);
  g.shadowBlur = 0; g.globalAlpha = 1;
  if (on && sec === "drop" && p.kick > 0.85 && bar % 4 === 0) { g.fillStyle = "rgba(255,255,255,0.55)"; g.fillRect(0, 0, w, h); }
  void size;
}

/* ---------- Light beams ---------- */

const beamVert = `
varying float vAlong; varying vec3 vN; varying vec3 vView;
void main() {
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;
const beamFrag = `
uniform vec3 color; uniform float intensity;
varying float vAlong; varying vec3 vN; varying vec3 vView;
void main() {
  float edge = 0.3 + 0.7 * pow(abs(dot(normalize(vN), normalize(vView))), 1.2);
  float a = clamp(intensity * (0.25 + 0.75 * pow(vAlong, 1.2)) * edge * 1.6, 0.0, 1.0);
  gl_FragColor = vec4(color * a, a);
}`;

function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color("#ffffff") }, intensity: { value: 0 } },
    vertexShader: beamVert, fragmentShader: beamFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function beamGeometry(len: number, radius: number) {
  const g = new THREE.ConeGeometry(radius, len, 20, 1, true);
  g.translate(0, -len / 2, 0); // apex at the fixture, pointing down
  return g;
}

type Fixture = { pos: [number, number, number]; up: boolean; i: number };

/** Moving-head fixtures: positions in the floor-local frame (origin at the rink centre on the event floor). */
function concertFixtures(): Fixture[] {
  const out: Fixture[] = [];
  let i = 0;
  for (const z of [STAGE_Z, STAGE_Z - 5]) for (let k = 0; k < 8; k++) out.push({ pos: [-10.5 + k * 3, 12.6, z], up: false, i: i++ });
  for (let k = 0; k < 6; k++) out.push({ pos: [-8.5 + k * 3.4, 2.3, STAGE_Z - 6.2], up: true, i: i++ });
  return out;
}

function aim(f: Fixture, beat: number, sec: string, n: number): [number, number] {
  const ph = f.i * 0.7, slow = beat * 0.12, fast = beat * 0.5;
  if (f.up) {
    // Floor fixtures throw beams up into the roof and over the crowd.
    const spread = sec === "drop" ? 0.5 : 0.25;
    return [Math.sin(fast + ph) * spread * 1.5, Math.PI - (0.25 + spread * (0.5 + 0.5 * Math.sin(slow * 2 + ph)))];
  }
  if (sec === "break") return [((f.i % 8) - 3.5) * 0.06, 0.55];
  if (sec === "intro") return [Math.sin(slow + ph) * 0.5, 0.35 + 0.15 * Math.sin(slow * 1.3 + ph)];
  if (sec === "build") return [((f.i % 8) - 3.5) * 0.12 + Math.sin(slow * 3) * 0.3, 0.3 + 0.35 * ((beat % 32) / 32)];
  // Drop: alternating ballyhoo on the beat
  const dir = f.i % 2 ? 1 : -1;
  return [dir * Math.sin(fast + ph * 0.3) * 0.7, 0.45 + 0.3 * Math.sin(beat * Math.PI * 0.5 + ph)];
}

export function ConcertShow({ spec, on, seats }: { spec: ShowSpec; on: boolean; seats: SeatSpot[] }) {
  const [cx, cz] = CENTER;
  const wallTex = useLiveCanvas(512, 256, (g, w, h) => drawWall(g, w, h, spec, on), 30);
  const fixtures = useMemo(concertFixtures, []);
  const geoDown = useMemo(() => beamGeometry(36, 2.0), []);
  const geoUp = useMemo(() => beamGeometry(40, 2.4), []);
  const mats = useMemo(() => fixtures.map(() => beamMaterial()), [fixtures]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const spots = useRef<(THREE.SpotLight | null)[]>([]);
  const strobe = useRef<THREE.PointLight>(null);
  const wash = useRef<THREE.PointLight>(null);
  const lasers = useRef<THREE.Group>(null);
  const colors = useMemo(() => spec.look.colors.map(col), [spec]);
  const targets = useMemo(() => [0, 1, 2, 3].map(() => new THREE.Object3D()), []);
  useFrame(() => {
    const p = pulse, beat = p.beat, sec = p.section, bar = Math.floor(beat / 4);
    fixtures.forEach((f, k) => {
      const grp = groups.current[k]; if (!grp) return;
      const [pan, tilt] = aim(f, beat, sec, fixtures.length);
      grp.rotation.set(tilt, pan, 0, "YXZ");
      const m = mats[k];
      const ci = sec === "drop" ? (f.i + bar) % colors.length : sec === "break" ? 2 % colors.length : f.up ? 1 % colors.length : 0;
      (m.uniforms.color.value as THREE.Color).copy(colors[ci]);
      let inten = !on ? 0 : sec === "break" ? (f.up ? 0 : 0.18) : sec === "intro" ? 0.22 : sec === "build" ? 0.3 + 0.3 * ((beat % 32) / 32) : 0.45 + 0.4 * p.kick;
      if (on && sec === "drop" && !f.up && (Math.floor(beat * 2) + f.i) % 4 === 0) inten *= 0.25; // chase
      m.uniforms.intensity.value = inten;
    });
    // Real lights follow four of the beams so the crowd and floor take the colour.
    spots.current.forEach((s, k) => {
      if (!s) return;
      const f = fixtures[k * 4 + 1];
      const [pan, tilt] = aim(f, beat, sec, fixtures.length);
      const d = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(tilt, pan, 0, "YXZ"));
      const tgt = targets[k];
      tgt.position.set(cx + f.pos[0] + d.x * 30, Y.floor + f.pos[1] + d.y * 30, cz + f.pos[2] + d.z * 30);
      tgt.updateMatrixWorld();
      s.target = tgt;
      s.color.copy(colors[(k + (sec === "drop" ? bar : 0)) % colors.length]);
      s.intensity = on ? (sec === "break" ? 250 : 600 + 1400 * p.kick * p.energy) : 0;
    });
    if (strobe.current) strobe.current.intensity = on && sec === "drop" && bar % 4 === 0 && p.kick > 0.8 ? 6000 : 0;
    if (wash.current) { wash.current.color.copy(colors[0]); wash.current.intensity = on ? 300 + 900 * p.energy * (0.6 + 0.4 * p.kick) : 120; }
    const L = lasers.current;
    if (L) {
      const show = on && sec === "drop" && Math.floor(bar / 4) % 2 === 1;
      L.visible = show;
      if (show) L.children.forEach((b, k) => { b.rotation.set(0.08 + 0.1 * Math.sin(beat * 0.5 + k), ((k - 4.5) / 4.5) * (0.5 + 0.25 * Math.sin(beat * 0.25)), 0, "YXZ"); });
    }
  });
  const laserGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.03, 0.03, 70, 4, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, -35); return g; }, []);
  const laserMat = useMemo(() => new THREE.MeshBasicMaterial({ color: colors[0].clone().lerp(new THREE.Color("#ffffff"), 0.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), [colors]);
  return (
    <group position={[cx, Y.floor, cz]}>
      {/* LED wall behind the stage and two side screens */}
      <mesh position={[0, 6.5, STAGE_Z + 5.8]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[18, 9]} />
        <meshBasicMaterial map={wallTex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 15.5, 8.5, STAGE_Z - 1]} rotation={[0, Math.PI + sx * 0.35, 0]}>
          <mesh><planeGeometry args={[7.2, 4.05]} /><meshBasicMaterial map={wallTex} toneMapped={false} side={THREE.DoubleSide} /></mesh>
          <mesh position={[0, 0, -0.08]}><boxGeometry args={[7.5, 4.3, 0.1]} /><meshStandardMaterial color="#0b0b0d" /></mesh>
        </group>
      ))}
      {/* Fixtures and beams */}
      {fixtures.map((f, k) => (
        <group key={k} position={f.pos}>
          <mesh position={[0, f.up ? -0.25 : 0.25, 0]}><boxGeometry args={[0.45, 0.5, 0.45]} /><meshStandardMaterial color="#111" metalness={0.6} roughness={0.4} /></mesh>
          <group ref={(el) => { groups.current[k] = el; }}>
            <mesh geometry={f.up ? geoUp : geoDown} material={mats[k]} renderOrder={5} frustumCulled={false} />
          </group>
        </group>
      ))}
      {[0, 1, 2, 3].map((k) => (
        <spotLight key={k} ref={(el) => { spots.current[k] = el; }} position={fixtures[k * 4 + 1].pos} angle={0.22} penumbra={0.5} distance={90} decay={1.4} intensity={0} />
      ))}
      <pointLight ref={wash} position={[0, 8, STAGE_Z + 3]} distance={45} decay={1.5} />
      <pointLight ref={strobe} position={[0, 14, STAGE_Z - 8]} distance={120} decay={1.2} color="#ffffff" intensity={0} />
      <group ref={lasers} position={[0, 9.5, STAGE_Z - 6]} visible={false}>
        {Array.from({ length: 10 }, (_, k) => (
          <mesh key={k} geometry={laserGeo} material={laserMat} renderOrder={6} />
        ))}
      </group>
      <Confetti spec={spec} on={on} />
      <Phones seats={seats} on={on} />
    </group>
  );
}

/* ---------- Confetti on the big drops ---------- */

function Confetti({ spec, on }: { spec: ShowSpec; on: boolean }) {
  const N = 1400;
  const { geo, vel } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), c = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const cs = spec.look.colors.map(col);
    for (let i = 0; i < N; i++) { const k = cs[i % cs.length]; c.set([k.r, k.g, k.b], i * 3); pos[i * 3 + 1] = -100; }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return { geo: g, vel };
  }, [spec]);
  const lastSec = useRef("");
  const lastBurst = useRef(-999);
  useFrame((_, dt) => {
    const p = pulse, pos = geo.getAttribute("position") as THREE.BufferAttribute, a = pos.array as Float32Array;
    const sixteenBar = Math.floor(p.beat / 64);
    if (on && p.section === "drop" && lastSec.current !== "drop" && sixteenBar !== lastBurst.current) {
      lastBurst.current = sixteenBar;
      for (let i = 0; i < N; i++) {
        a[i * 3] = (Math.random() - 0.5) * 30; a[i * 3 + 1] = 22 + Math.random() * 6; a[i * 3 + 2] = STAGE_Z - 4 - Math.random() * 40;
        vel[i * 3] = (Math.random() - 0.5) * 1.2; vel[i * 3 + 1] = -(1.2 + Math.random() * 1.3); vel[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      }
    }
    lastSec.current = p.section;
    const t = performance.now() / 1000, d = Math.min(dt, 0.1);
    for (let i = 0; i < N; i++) {
      if (a[i * 3 + 1] < 0) continue;
      a[i * 3] += (vel[i * 3] + Math.sin(t * 2 + i) * 0.6) * d;
      a[i * 3 + 1] += vel[i * 3 + 1] * d;
      a[i * 3 + 2] += (vel[i * 3 + 2] + Math.cos(t * 1.7 + i) * 0.6) * d;
      if (a[i * 3 + 1] < 0.05) a[i * 3 + 1] = -100;
    }
    pos.needsUpdate = true;
  });
  return <points geometry={geo} frustumCulled={false}><pointsMaterial size={0.16} vertexColors sizeAttenuation /></points>;
}

/* ---------- Phone lights in the quiet songs ---------- */

const phoneVert = `
attribute float phase; uniform float time; uniform float alpha; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.55 + 0.45 * sin(time * (1.0 + fract(phase * 7.3)) + phase * 40.0);
  vA = alpha * tw * step(0.35, fract(phase * 13.7));
  gl_PointSize = 26.0 / -mv.z * 6.0;
  gl_Position = projectionMatrix * mv;
}`;
const phoneFrag = `
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5; float r = length(d);
  float a = vA * smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a, a);
}`;

function Phones({ seats, on }: { seats: SeatSpot[]; on: boolean }) {
  const [cx, cz] = CENTER;
  const geo = useMemo(() => {
    const pts: number[] = [], ph: number[] = [];
    seats.forEach((s, i) => {
      if (i % 3) return;
      const deg = (s.theta * 180) / Math.PI, a = ((deg + 540) % 360) - 180;
      if (a < -52 && a > -128) return; // no one sits behind the stage
      pts.push(s.x - cx, s.y + 1.25 - Y.floor, s.z - cz); ph.push(Math.random());
    });
    for (let i = 0; i < 900; i++) {
      const r = Math.pow(Math.random(), 1.6);
      pts.push((Math.random() - 0.5) * (RINK.hx * 2 - 2), 1.9, RINK.hz - 15 - r * (RINK.hz * 2 - 20)); ph.push(Math.random());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute("phase", new THREE.Float32BufferAttribute(ph, 1));
    return g;
  }, [seats, cx, cz]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, alpha: { value: 0 } }, vertexShader: phoneVert, fragmentShader: phoneFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);
  useFrame(() => {
    mat.uniforms.time.value = performance.now() / 1000;
    const want = on && (pulse.section === "break" || pulse.section === "intro") ? (pulse.section === "break" ? 1 : 0.35) : 0;
    mat.uniforms.alpha.value += (want - mat.uniforms.alpha.value) * 0.03;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={7} />;
}

/* ---------- Ribbon boards ---------- */

/** Scrolling material for the LED ribbons on the fascia between levels. */
export function useRibbonMaterial(spec: ShowSpec, on: boolean) {
  const canvas = useMemo(() => (typeof document === "undefined" ? null : document.createElement("canvas")), []);
  const state = useRef({ goal: false, key: "" });
  const tex = useMemo(() => {
    if (!canvas) return null;
    canvas.width = 2048; canvas.height = 64;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(-1 / 36, 2); t.anisotropy = 8;
    return t;
  }, [canvas]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  const draw = (goal: boolean, flip: boolean) => {
    if (!canvas || !tex) return;
    const g = canvas.getContext("2d")!, { look } = spec, w = canvas.width, h = canvas.height;
    const bg = goal ? (flip ? "#e9072b" : look.wall) : look.wall;
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textBaseline = "middle"; g.font = `800 ${h * 0.62}px ${FONT}`;
    const items = goal ? Array(6).fill(spec.home ? `GOAL ${spec.home.name.toUpperCase()}` : "GOAL") : look.banners;
    let x = 20, k = 0;
    while (x < w) {
      const txt = items[k % items.length];
      g.fillStyle = goal ? "#ffffff" : k % 2 ? look.colors[0] : look.ink;
      g.fillText(txt, x, h / 2 + 2); x += g.measureText(txt).width + 30;
      g.fillStyle = look.colors[1 % look.colors.length]; g.beginPath(); g.arc(x - 15, h / 2, 6, 0, Math.PI * 2); g.fill();
      x += 14; k++;
    }
    tex.needsUpdate = true;
  };
  useEffect(() => { state.current.key = ""; }, [spec]);
  useFrame((_, dt) => {
    if (!tex) return;
    const goal = performance.now() - pulse.goalAt < 7000 && pulse.goalAt > 0;
    const flip = goal && Math.floor(performance.now() / 250) % 2 === 0;
    const key = `${goal}|${flip}|${spec.look.label}`;
    if (key !== state.current.key) { state.current.key = key; draw(goal, flip); }
    tex.offset.x -= Math.min(dt, 0.1) * (goal ? 0.25 : 0.05);
    const b = on ? 0.75 + 0.35 * pulse.kick * pulse.energy : 0.9;
    mat.color.setScalar(b);
  });
  return mat;
}

/* ---------- Hockey: live scoreboard, ice projection, goal lights ---------- */

export const game = { home: 0, away: 0, period: 1, start: 0 };

function drawBoard(g: CanvasRenderingContext2D, w: number, h: number, spec: ShowSpec, now: number) {
  const home = spec.home!, away = spec.away!;
  const goal = pulse.goalAt > 0 && now - pulse.goalAt < 7000;
  if (!game.start) game.start = now;
  if (goal) {
    const flip = Math.floor(now / 220) % 2 === 0;
    g.fillStyle = flip ? "#e9072b" : home.colors[1]; g.fillRect(0, 0, w, h);
    g.fillStyle = flip ? "#ffffff" : home.colors[0]; g.textAlign = "center"; g.textBaseline = "middle";
    fitText(g, "GOAL!", w * 0.8, h * 0.5, 900); g.fillText("GOAL!", w / 2, h * 0.42);
    g.font = `700 ${h * 0.1}px ${FONT}`; g.fillText(home.name.toUpperCase(), w / 2, h * 0.78);
    return;
  }
  g.fillStyle = "#04121f"; g.fillRect(0, 0, w, h);
  const half = w / 2;
  [[home, game.home, 0], [away, game.away, half]].forEach(([t, s, x]) => {
    const team = t as typeof home;
    g.fillStyle = team.colors[0] === "#090909" ? "#6cace4" : team.colors[0]; g.fillRect((x as number) + 16, 16, half - 32, h * 0.16);
    g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `800 ${h * 0.1}px ${FONT}`;
    g.fillText(team.short, (x as number) + half / 2, 16 + h * 0.08);
    g.fillStyle = "#e9fbff"; g.font = `800 ${h * 0.4}px ${FONT}`; g.fillText(String(s), (x as number) + half / 2, h * 0.5);
  });
  // Period clock counts down live
  const secs = Math.max(0, 20 * 60 - Math.floor((now - game.start) / 1000) % (20 * 60));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  g.fillStyle = "#ffcf3a"; g.font = `700 ${h * 0.13}px ${FONT}`; g.fillText(clock, half, h * 0.5);
  g.fillStyle = "#9fb2c4"; g.font = `600 ${h * 0.06}px ${FONT}`; g.fillText(`PERIOD ${game.period}`, half, h * 0.62);
  // Ticker
  g.fillStyle = "#001628"; g.fillRect(0, h * 0.8, w, h * 0.2);
  g.fillStyle = "#99d9d9"; g.font = `700 ${h * 0.08}px ${FONT}`;
  const banner = spec.look.banners[Math.floor(now / 3500) % spec.look.banners.length];
  g.fillText(banner, half, h * 0.9);
}

export function HockeyShow({ spec, on }: { spec: ShowSpec; on: boolean }) {
  const [cx, cz] = CENTER;
  const board = useLiveCanvas(1024, 576, (g, w, h, now) => drawBoard(g, w, h, spec, now), 15);
  const ice = useLiveCanvas(512, 1024, (g, w, h, now) => drawIce(g, w, h, now), 30);
  const iceMat = useRef<THREE.MeshBasicMaterial>(null);
  const beacons = useRef<(THREE.Group | null)[]>([]);
  const goalLight = useRef<THREE.PointLight>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const beams = useRef<(THREE.Group | null)[]>([]);
  const beamMats = useMemo(() => Array.from({ length: 8 }, () => beamMaterial()), []);
  const beamGeo = useMemo(() => beamGeometry(30, 1.6), []);
  const cols = useMemo(() => spec.look.colors.map(col), [spec]);
  useFrame(() => {
    const now = performance.now(), goal = pulse.goalAt > 0 && now - pulse.goalAt < 7000;
    const intro = on && pulse.intro;
    if (iceMat.current) iceMat.current.opacity += ((intro ? 0.95 : 0) - iceMat.current.opacity) * 0.05;
    beacons.current.forEach((b) => { if (b) { b.visible = goal; b.rotation.y = now / 120; } });
    if (goalLight.current) goalLight.current.intensity = goal ? 700 * (0.5 + 0.5 * Math.sin(now / 90)) : 0;
    if (ringMat.current) { ringMat.current.emissive.set(goal ? (Math.floor(now / 220) % 2 ? "#e9072b" : "#ffffff") : "#2fb3c4"); ringMat.current.emissiveIntensity = 1.2 + (on ? pulse.kick * 0.8 : 0); }
    beams.current.forEach((b, k) => {
      if (!b) return;
      const m = beamMats[k];
      const t = pulse.beat;
      b.rotation.set(0.35 + 0.25 * Math.sin(t * 0.4 + k), (k / 8) * Math.PI * 2 + t * 0.15, 0, "YXZ");
      (m.uniforms.color.value as THREE.Color).copy(goal ? (k % 2 ? col("#e9072b") : col("#ffffff")) : cols[k % cols.length]);
      m.uniforms.intensity.value = intro || goal ? 0.5 + 0.3 * pulse.kick : 0;
    });
  });
  return (
    <group position={[cx, 0, cz]}>
      {/* Centre-hung scoreboard */}
      <group position={[0, 12.5, 0]}>
        <mesh castShadow><boxGeometry args={[9.6, 5.6, 7.2]} /><meshStandardMaterial color="#0b0c0e" roughness={0.4} metalness={0.4} /></mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2, w = i % 2 ? 7.0 : 9.4, off = i % 2 ? 4.82 : 3.62;
          return <mesh key={i} position={[Math.sin(a) * off, 0.1, Math.cos(a) * off]} rotation={[0, a, 0]}><planeGeometry args={[w, 5.2]} /><meshBasicMaterial map={board} toneMapped={false} /></mesh>;
        })}
        <mesh position={[0, -3.1, 0]}><boxGeometry args={[7.6, 0.6, 5.4]} /><meshStandardMaterial ref={ringMat} color="#001628" emissive="#2fb3c4" emissiveIntensity={1.4} /></mesh>
        <mesh position={[0, 11, 0]}><cylinderGeometry args={[0.05, 0.05, 16]} /><meshStandardMaterial color="#444" /></mesh>
        {Array.from({ length: 8 }, (_, k) => (
          <group key={k} position={[Math.sin((k / 8) * Math.PI * 2) * 3.5, -3.4, Math.cos((k / 8) * Math.PI * 2) * 3.5]} ref={(el) => { beams.current[k] = el; }}>
            <mesh geometry={beamGeo} material={beamMats[k]} renderOrder={5} frustumCulled={false} />
          </group>
        ))}
      </group>
      {/* Pre-game projection on the ice */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y.floor + 0.05, 0]} renderOrder={4}>
        <planeGeometry args={[RINK.hx * 2, RINK.hz * 2]} />
        <meshBasicMaterial ref={iceMat} map={ice} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* Goal lights behind each net */}
      {[-1, 1].map((d, k) => (
        <group key={d} position={[0, Y.floor + 2.4, d * (RINK.hz + 0.6)]} ref={(el) => { beacons.current[k] = el; }} visible={false}>
          <mesh><cylinderGeometry args={[0.25, 0.25, 0.4, 12]} /><meshBasicMaterial color="#ff2020" /></mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[1.6, 0, 0]}><coneGeometry args={[0.6, 3.2, 12, 1, true]} /><meshBasicMaterial color="#ff2a2a" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
        </group>
      ))}
      <pointLight ref={goalLight} position={[0, Y.floor + 8, 0]} color="#ff2a2a" distance={90} decay={1.3} intensity={0} />
    </group>
  );
}

function drawIce(g: CanvasRenderingContext2D, w: number, h: number, now: number) {
  const t = now / 1000;
  g.fillStyle = "#000000"; g.fillRect(0, 0, w, h);
  // Deep-sea waves rolling down the ice
  for (let k = 0; k < 14; k++) {
    g.strokeStyle = k % 3 ? "rgba(60,180,200,0.55)" : "rgba(153,217,217,0.9)"; g.lineWidth = 6;
    g.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const y = ((k / 14) * h + t * 60) % h + Math.sin(x / 50 + t * 2 + k) * 18;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Tentacles curling in from the corners
  for (let k = 0; k < 6; k++) {
    const sx = k % 2 ? w : 0, sy = (k / 6) * h + 80;
    g.strokeStyle = "rgba(233,7,43,0.75)"; g.lineWidth = 22 - k; g.lineCap = "round";
    g.beginPath(); g.moveTo(sx, sy);
    for (let i = 1; i <= 20; i++) {
      const f = i / 20, dir = k % 2 ? -1 : 1;
      g.lineTo(sx + dir * f * w * 0.55 + Math.sin(t * 2 + f * 6 + k) * 30 * f, sy + Math.sin(t + f * 4 + k) * 80 * f);
    }
    g.stroke();
  }
  g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
  g.fillStyle = "#e9fbff"; g.textAlign = "center"; g.textBaseline = "middle";
  const pulseA = 0.6 + 0.4 * Math.sin(t * 3);
  g.globalAlpha = pulseA; g.font = `900 ${w * 0.3}px ${FONT}`; g.fillText("KRAKEN", 0, 0);
  g.restore(); g.globalAlpha = 1;
}

/** How much the house lights are on: dimmed for the show. */
export function houseLevel(kind: EventKind, on: boolean, intro: boolean) {
  if (!on) return 1;
  if (kind === "concert") return 0.12;
  return intro ? 0.1 : 1;
}
