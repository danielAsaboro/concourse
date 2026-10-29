"use client";
// Camera navigation: orbit (drag, pan, zoom, fly-to), walk (first person on the concourses) and seat view.
import { useFrame, useThree } from "@react-three/fiber";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  CENTER, CITY, ENTRIES, FOOTPRINT, RING, SECTIONS, SPOTS, TIERS, Y, footprintEdge, inPoly, ring, ringNormal, ringOffset,
  type Level, type StandSpot, type XZ,
} from "./geometry";

export type Mode = "orbit" | "walk" | "seat";

/** Live camera state, read by the HUD (minimap) without re-rendering the scene. */
export const navState = { x: 0, z: 0, y: 0, yaw: 0, level: "upper" as Level | "street", mode: "orbit" as Mode, inside: true };
/** Inputs from the on-screen joystick. */
export const joy = { x: 0, y: 0, run: false };

export type NavRequest =
  | { kind: "fly"; x: number; y: number; z: number; dist?: number; n: number }
  | { kind: "walkTo"; x: number; z: number; level?: Level | "street"; yaw?: number; n: number }
  | { kind: "stand"; spot: StandSpot; n: number }
  | { kind: "level"; level: Level; n: number }
  | { kind: "view"; preset: "aerial" | "bowl" | "street" | "concourse"; n: number };

export type SeatPos = { section: string; row: number };

const EYE = 1.65;
const ENTRY_PTS: XZ[] = ENTRIES.map((e) => footprintEdge(e.theta));
const BUILDINGS = CITY.buildings.map((b) => {
  const xs = b.poly.map((p) => p[0]), zs = b.poly.map((p) => p[1]);
  return { poly: b.poly, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
});
const SHRUNK: XZ[] = FOOTPRINT.map(([x, z]) => {
  const dx = x - CENTER[0], dz = z - CENTER[1], l = Math.hypot(dx, dz);
  return [x - (dx / l) * 1.2, z - (dz / l) * 1.2];
});

function hitsStand(level: Level, x: number, z: number) {
  for (const s of SPOTS) {
    if (s.level !== level) continue;
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz > 16) continue;
    const c = Math.cos(-s.rotY), si = Math.sin(-s.rotY);
    const lx = dx * c + dz * si, lz = -dx * si + dz * c;
    if (Math.abs(lx) < 2.7 && lz > -1.8 && lz < 0.95) return true;
  }
  return false;
}

function inBuilding(x: number, z: number) {
  for (const b of BUILDINGS) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && inPoly(x, z, b.poly)) return true;
  return false;
}

/** Can a walker stand here? `level` is the floor they are on. */
export function walkable(level: Level | "street", x: number, z: number): boolean {
  if (level === "street") return !inPoly(x, z) && !inBuilding(x, z) && Math.hypot(x - CENTER[0], z - CENTER[1]) < 650;
  const { d } = ringOffset(x, z);
  if (level === "ll2") return d >= RING.ll2.inner - 0.2 && d <= RING.ll2.outer - 0.5 && !hitsStand("ll2", x, z);
  return inPoly(x, z, SHRUNK) && d >= RING.upper.inner - 0.2 && !hitsStand("upper", x, z);
}

function nearEntry(x: number, z: number) {
  return ENTRY_PTS.some(([ex, ez]) => Math.hypot(ex - x, ez - z) < 7);
}

const levelY = (l: Level | "street") => (l === "ll2" ? Y.ll2 : 0);

export function seatPose(seat: SeatPos) {
  const sec = SECTIONS.find((s) => s.id === seat.section) ?? SECTIONS[0];
  const t = TIERS[sec.tier];
  const row = Math.max(0, Math.min(t.rows - 1, seat.row));
  const d = t.d0 + (row + 0.55) * t.depth;
  const [x, z] = ring(sec.theta, d);
  const y = t.y0 + row * t.rise + 1.2;
  const dx = CENTER[0] - x, dz = CENTER[1] - z;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = -Math.atan2(y - (Y.floor + 1), Math.hypot(dx, dz) * 0.8);
  return { x, y, z, yaw, pitch };
}

function standPose(spot: StandSpot) {
  const [nx, nz] = ringNormal(spot.theta, 40);
  const x = spot.x - nx * 5.5, z = spot.z - nz * 5.5;
  return { x, z, yaw: Math.atan2(-nx, -nz), level: spot.level };
}

export function Nav({ mode, seat, request, onLevel, startNorth = false }: { mode: Mode; seat: SeatPos; request: NavRequest | null; onLevel?: (l: Level | "street") => void; startNorth?: boolean }) {
  const { camera, gl } = useThree();
  const controls = useRef<CameraControlsImpl>(null);
  const walk = useRef({ x: 0, z: 0, level: "upper" as Level | "street", yaw: 0, pitch: 0, target: null as null | { x: number; z: number } });
  const trans = useRef<null | { t0: number; dur: number; p0: THREE.Vector3; q0: THREE.Quaternion; p1: THREE.Vector3; q1: THREE.Quaternion }>(null);
  const keys = useRef(new Set<string>());
  const handled = useRef(0);
  const firstOrbit = useRef(true);

  const flyTo = (pos: THREE.Vector3, yaw: number, pitch: number, dur = 1.1) => {
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
    trans.current = { t0: performance.now(), dur: dur * 1000, p0: camera.position.clone(), q0: camera.quaternion.clone(), p1: pos, q1 };
  };
  const setLevel = (l: Level | "street") => { walk.current.level = l; onLevel?.(l); };

  /* ----- Keyboard ----- */
  useEffect(() => {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA"); };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      keys.current.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        if (controls.current) controls.current.mouseButtons.left = CameraControlsImpl.ACTION.TRUCK;
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        if (controls.current) controls.current.mouseButtons.left = CameraControlsImpl.ACTION.ROTATE;
      }
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  /* ----- Drag to look (walk and seat) ----- */
  useEffect(() => {
    if (mode === "orbit") return;
    const el = gl.domElement;
    let drag: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const k = e.pointerType === "touch" ? 0.006 : 0.0042;
      walk.current.yaw += (e.clientX - drag.x) * k;
      walk.current.pitch = Math.max(-1.25, Math.min(1.25, walk.current.pitch + (e.clientY - drag.y) * k));
      drag.x = e.clientX; drag.y = e.clientY;
      walk.current.target = null;
    };
    const up = (e: PointerEvent) => { if (drag?.id === e.pointerId) drag = null; };
    const wheel = (e: WheelEvent) => {
      if (mode !== "walk") return;
      e.preventDefault();
      const w = walk.current, step = -e.deltaY * 0.012;
      const nx = w.x - Math.sin(w.yaw) * step, nz = w.z - Math.cos(w.yaw) * step;
      if (walkable(w.level, nx, nz)) { w.x = nx; w.z = nz; }
    };
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.style.cursor = "";
      el.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [mode, gl]);

  /* ----- Mode changes ----- */
  useEffect(() => {
    navState.mode = mode;
    if (mode === "walk") {
      // Start on the Upper Concourse rail at the south end, looking north over the bowl,
      // unless the camera is already near a walkable spot.
      const w = walk.current;
      // For an end-stage concert, start at the north end facing the stage.
      const [x, z] = ring(startNorth ? Math.PI / 2 : -Math.PI / 2, RING.upper.inner + 3.2);
      const yaw = startNorth ? Math.PI : 0;
      w.x = x; w.z = z; w.yaw = yaw; w.pitch = -0.18; w.target = null;
      setLevel("upper");
      flyTo(new THREE.Vector3(x, EYE, z), yaw, -0.18, 1.4);
    } else if (mode === "seat") {
      const p = seatPose(seat);
      walk.current.yaw = p.yaw; walk.current.pitch = p.pitch;
      flyTo(new THREE.Vector3(p.x, p.y, p.z), p.yaw, p.pitch, 1.3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "seat") return;
    const p = seatPose(seat);
    walk.current.yaw = p.yaw; walk.current.pitch = p.pitch;
    flyTo(new THREE.Vector3(p.x, p.y, p.z), p.yaw, p.pitch, 0.8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seat.section, seat.row]);

  /* ----- Orbit controls setup ----- */
  useEffect(() => {
    const c = controls.current; if (!c || mode !== "orbit") return;
    const A = CameraControlsImpl.ACTION;
    c.mouseButtons.left = A.ROTATE; c.mouseButtons.right = A.TRUCK; c.mouseButtons.middle = A.DOLLY; c.mouseButtons.wheel = A.DOLLY;
    c.touches.one = A.TOUCH_ROTATE; c.touches.two = A.TOUCH_DOLLY_TRUCK; c.touches.three = A.TOUCH_TRUCK;
    if (firstOrbit.current) {
      firstOrbit.current = false;
      c.setLookAt(CENTER[0] - 190, 150, CENTER[1] + 230, CENTER[0], -4, CENTER[1], false);
    } else {
      // Leave walk/seat: look at what was in front of the camera.
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const tgt = camera.position.clone().add(f.multiplyScalar(25));
      tgt.y = Math.max(Y.floor, tgt.y);
      const back = camera.position.clone().sub(f.normalize().multiplyScalar(30)).add(new THREE.Vector3(0, 18, 0));
      c.setLookAt(camera.position.x, camera.position.y, camera.position.z, tgt.x, tgt.y, tgt.z, false);
      c.setLookAt(back.x, back.y, back.z, tgt.x, tgt.y, tgt.z, true);
    }
  }, [mode, camera]);

  /* ----- Requests from the HUD ----- */
  useEffect(() => {
    if (!request || request.n === handled.current) return;
    handled.current = request.n;
    const w = walk.current;
    if (request.kind === "view") {
      const c = controls.current; if (!c) return;
      const [cx, cz] = CENTER;
      if (request.preset === "aerial") c.setLookAt(cx - 190, 150, cz + 230, cx, -4, cz, true);
      if (request.preset === "concourse") c.setLookAt(cx - 62, 78, cz + 92, cx, -6, cz + 4, true);
      if (request.preset === "bowl") c.setLookAt(cx + 34, 22, cz - 66, cx, Y.floor + 3, cz + 8, true);
      if (request.preset === "street") {
        // Stand on the plaza outside an entry with a clear line to the building.
        for (const e of [ENTRIES[0], ENTRIES[6], ENTRIES[5], ENTRIES[1]]) {
          const [ex, ez] = footprintEdge(e.theta), dx = ex - cx, dz = ez - cz, l = Math.hypot(dx, dz);
          const px = ex + (dx / l) * 48, pz = ez + (dz / l) * 48;
          let clear = true;
          for (let k = 0.1; k <= 1; k += 0.1) if (inBuilding(ex + (px - ex) * k, ez + (pz - ez) * k)) clear = false;
          if (!clear) continue;
          c.setLookAt(px, 1.8, pz, cx, 16, cz, true);
          return;
        }
        c.setLookAt(cx - 60, 40, cz + 175, cx, 16, cz, true);
      }
      return;
    }
    if (request.kind === "fly") {
      const c = controls.current; if (!c) return;
      const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
      c.getPosition(pos); c.getTarget(tgt);
      const dirv = pos.sub(tgt).normalize();
      const dist = request.dist ?? 26;
      if (dirv.y < 0.35) { dirv.y = 0.35; dirv.normalize(); }
      c.setLookAt(request.x + dirv.x * dist, request.y + dirv.y * dist, request.z + dirv.z * dist, request.x, request.y, request.z, true);
      return;
    }
    if (request.kind === "stand") {
      const p = standPose(request.spot);
      if (mode === "orbit") {
        const c = controls.current; if (!c) return;
        const [nx, nz] = ringNormal(request.spot.theta, 40);
        const s = request.spot;
        c.setLookAt(s.x - nx * 13, s.y + 6.5, s.z - nz * 13, s.x, s.y + 1.8, s.z, true);
        return;
      }
      w.x = p.x; w.z = p.z; w.yaw = p.yaw; w.pitch = -0.05; w.target = null; setLevel(p.level);
      flyTo(new THREE.Vector3(p.x, levelY(p.level) + EYE, p.z), p.yaw, -0.05, 1.2);
      return;
    }
    if (request.kind === "level") {
      const { theta } = ringOffset(w.x, w.z);
      const d = request.level === "ll2" ? 38.5 : 40.5;
      let [x, z] = ring(theta, d);
      for (let i = 0; i < 12 && !walkable(request.level, x, z); i++) [x, z] = ring(theta + 0.03 * (i + 1), d);
      w.x = x; w.z = z; w.target = null; setLevel(request.level);
      flyTo(new THREE.Vector3(x, levelY(request.level) + EYE, z), w.yaw, w.pitch, 1.0);
      return;
    }
    if (request.kind === "walkTo") {
      const lvl = request.level ?? w.level;
      if (lvl !== w.level || !walkable(lvl, request.x, request.z)) {
        // Different floor: take the escalator (jump), then face the same way.
        if (walkable(lvl, request.x, request.z)) {
          w.x = request.x; w.z = request.z; setLevel(lvl); w.target = null;
          flyTo(new THREE.Vector3(w.x, levelY(lvl) + EYE, w.z), request.yaw ?? w.yaw, w.pitch, 1.0);
        }
        return;
      }
      w.target = { x: request.x, z: request.z };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  /* ----- Per frame ----- */
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current;
    const tr = trans.current;
    if (tr) {
      const t = Math.min(1, (performance.now() - tr.t0) / tr.dur);
      const e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(tr.p0, tr.p1, e);
      camera.quaternion.slerpQuaternions(tr.q0, tr.q1, e);
      if (t >= 1) trans.current = null;
    } else if (mode === "orbit") {
      const c = controls.current;
      if (c) {
        const run = k.has("ShiftLeft") || k.has("ShiftRight") ? 3 : 1;
        const sp = 40 * run * dt;
        const fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
        const side = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
        if (fwd) c.forward(fwd * sp, false);
        if (side) c.truck(side * sp, 0, false);
        if (k.has("KeyQ")) c.rotate(-1.2 * dt, 0, false);
        if (k.has("KeyE")) c.rotate(1.2 * dt, 0, false);
        if (k.has("KeyR")) c.elevate(sp * 0.6, false);
        if (k.has("KeyF")) c.elevate(-sp * 0.6, false);
      }
    } else if (mode === "walk") {
      const w = walk.current;
      const run = k.has("ShiftLeft") || k.has("ShiftRight") || joy.run;
      const speed = run ? 10 : 4.2;
      let fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - joy.y;
      let side = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) + joy.x;
      if (k.has("KeyQ")) w.yaw += 1.6 * dt;
      if (k.has("KeyE")) w.yaw -= 1.6 * dt;
      if (w.target && !fwd && !side) {
        const dx = w.target.x - w.x, dz = w.target.z - w.z, dist = Math.hypot(dx, dz);
        if (dist < 0.6) w.target = null;
        else {
          const want = Math.atan2(-dx, -dz);
          let dy = want - w.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          w.yaw += dy * Math.min(1, dt * 5);
          fwd = Math.min(1, dist / 2);
        }
      }
      if (fwd || side) {
        const l = Math.hypot(fwd, side); if (l > 1) { fwd /= l; side /= l; }
        const sx = Math.sin(w.yaw), cz = Math.cos(w.yaw);
        const mx = (-sx * fwd + cz * side) * speed * dt, mz = (-cz * fwd - sx * side) * speed * dt;
        const tryMove = (nx: number, nz: number) => {
          const go = () => { w.x = nx; w.z = nz; return true; };
          if (w.level === "ll2") return walkable("ll2", nx, nz) ? go() : false;
          const wasIn = inPoly(w.x, w.z), isIn = inPoly(nx, nz);
          // Doors: in and out of the building only at an entry.
          if (wasIn !== isIn) {
            if (!nearEntry(nx, nz)) return false;
            setLevel(isIn ? "upper" : "street");
            return go();
          }
          if (isIn) return walkable("upper", nx, nz) || nearEntry(nx, nz) ? go() : false;
          return walkable("street", nx, nz) ? go() : false;
        };
        if (!tryMove(w.x + mx, w.z + mz)) { if (!tryMove(w.x + mx, w.z)) { if (!tryMove(w.x, w.z + mz)) w.target = null; } }
      }
      const bob = fwd || side ? Math.sin(performance.now() / 160) * 0.025 : 0;
      camera.position.set(w.x, levelY(w.level) + EYE + bob, w.z);
      camera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
    } else if (mode === "seat") {
      const p = seatPose(seat);
      const w = walk.current;
      if (k.has("KeyQ") || k.has("ArrowLeft")) w.yaw += 1.2 * dt;
      if (k.has("KeyE") || k.has("ArrowRight")) w.yaw -= 1.2 * dt;
      camera.position.set(p.x, p.y, p.z);
      camera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
    }
    // Publish for the HUD.
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    navState.x = camera.position.x; navState.z = camera.position.z; navState.y = camera.position.y; navState.yaw = e.y;
    navState.level = mode === "walk" ? walk.current.level : camera.position.y < -2 ? "ll2" : "upper";
    navState.inside = inPoly(camera.position.x, camera.position.z);
  });

  return mode === "orbit" ? (
    <CameraControls
      ref={controls}
      makeDefault
      smoothTime={0.32}
      draggingSmoothTime={0.08}
      minDistance={2}
      maxDistance={1200}
      maxPolarAngle={Math.PI * 0.497}
      dollyToCursor
      dollySpeed={0.6}
      truckSpeed={1.6}
    />
  ) : null;
}
