"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, ContactShadows } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Assignment } from "@/lib/agent/plan";

const LOW = new THREE.Color("#cdd1d6"), MID = new THREE.Color("#f2b58a"), HIGH = new THREE.Color("#ff4d1c");
export function fitColorObj(fit: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (fit - 0.3) / 0.6));
  const c = new THREE.Color();
  if (t < 0.5) c.lerpColors(LOW, MID, t * 2); else c.lerpColors(MID, HIGH, (t - 0.5) * 2);
  return c;
}
export function fitColor(fit: number): string { return `#${fitColorObj(fit).getHexString()}`; }

const SX = 1.18; // the bowl is an ellipse: x is stretched

/** Stepped seating tiers, a floor, a stage with a light rig, and an outer plaza. */
function Bowl() {
  const tiers = useMemo(() => {
    const mk = (r0: number, r1: number, y0: number, y1: number, steps: number) => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const r = r0 + (r1 - r0) * t, y = y0 + (y1 - y0) * t;
        pts.push(new THREE.Vector2(r, y));
        if (i < steps) pts.push(new THREE.Vector2(r + (r1 - r0) / steps, y));
      }
      pts.push(new THREE.Vector2(r1, y1 - 0.5), new THREE.Vector2(r0, y0 - 0.5));
      return new THREE.LatheGeometry(pts, 96);
    };
    return [mk(5.0, 8.4, 0.25, 2.5, 7), mk(8.9, 11.9, 2.9, 5.4, 7), mk(12.4, 14.6, 5.9, 8.0, 6)];
  }, []);
  const rig = useMemo(() => new THREE.TorusGeometry(13.4, 0.05, 8, 160), []);
  return (
    <group scale={[SX, 1, 1]}>
      {tiers.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial color={["#d9d4c7", "#e1dccf", "#e8e3d7"][i]} roughness={0.95} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* concourse walkways between tiers */}
      {[[8.4, 8.9, 2.55], [11.9, 12.4, 5.45]].map(([a, b, y], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
          <ringGeometry args={[a, b, 96]} />
          <meshStandardMaterial color="#c9c3b4" roughness={1} />
        </mesh>
      ))}
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[5.0, 96]} />
        <meshStandardMaterial color="#efebe1" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[4.6, 4.75, 96]} />
        <meshBasicMaterial color="#171614" transparent opacity={0.25} />
      </mesh>
      {/* stage */}
      <group position={[0, 0, 3.1]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[4.4, 1, 2]} />
          <meshStandardMaterial color="#ffffff" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.2, 1.8]} />
          <meshBasicMaterial color="#ff4d1c" />
        </mesh>
        {/* truss + lights */}
        <mesh position={[0, 7.2, 0]}>
          <boxGeometry args={[5.2, 0.12, 0.12]} />
          <meshStandardMaterial color="#171614" />
        </mesh>
        {[-2, -1, 0, 1, 2].map((x) => (
          <mesh key={x} position={[x, 7.05, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshBasicMaterial color="#171614" />
          </mesh>
        ))}
      </group>
      {/* roof light ring */}
      <mesh geometry={rig} rotation={[Math.PI / 2, 0, 0]} position={[0, 9.4, 0]}>
        <meshBasicMaterial color="#171614" transparent opacity={0.35} />
      </mesh>
      {/* outer plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <ringGeometry args={[14.8, 19.5, 128]} />
        <meshStandardMaterial color="#e6e1d5" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.49, 0]}>
        <ringGeometry args={[14.8, 14.9, 128]} />
        <meshBasicMaterial color="#171614" transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

function Stand({ a, selected, hovered, onSelect, setHovered, dim }: { a: Assignment; selected: boolean; hovered: boolean; onSelect: () => void; setHovered: (b: boolean) => void; dim: boolean }) {
  const body = useRef<THREE.Mesh>(null);
  const strip = useRef<THREE.Mesh>(null);
  const pad = useRef<THREE.Mesh>(null);
  const roof = useRef<THREE.Mesh>(null);
  const grp = useRef<THREE.Group>(null);
  const col = useRef(fitColorObj(a.fit));
  const target = useMemo(() => fitColorObj(a.fit), [a.fit]);
  const x = Math.cos(a.stand.angle) * a.stand.radius * SX;
  const z = Math.sin(a.stand.angle) * a.stand.radius;
  const sponsor = a.stand.category === "sponsor";
  const w = sponsor ? 2.4 : 1.6, h = sponsor ? 1.4 : 1.15, d = 1.1;
  useFrame((state, dt) => {
    const k = Math.min(1, dt * 5);
    col.current.lerp(target, k);
    const bm = body.current?.material as THREE.MeshStandardMaterial | undefined;
    const sm = strip.current?.material as THREE.MeshBasicMaterial | undefined;
    const pm = pad.current?.material as THREE.MeshBasicMaterial | undefined;
    const rm = roof.current?.material as THREE.MeshStandardMaterial | undefined;
    const pulse = selected ? 0.5 + Math.sin(state.clock.elapsedTime * 3.5) * 0.5 : 0;
    if (rm) { rm.color.copy(col.current); rm.emissive.copy(col.current); rm.emissiveIntensity = THREE.MathUtils.lerp(rm.emissiveIntensity, (dim ? 0 : 0.15 + a.fit * 0.3) + (hovered || selected ? 0.25 : 0) + pulse * 0.25, k); }
    if (bm) { bm.emissiveIntensity = 0; bm.color.set("#ffffff"); }
    if (sm) { sm.color.copy(col.current); }
    if (pm) { pm.color.copy(col.current); pm.opacity = THREE.MathUtils.lerp(pm.opacity, dim ? 0.04 : 0.18 + a.fit * 0.35 + (hovered || selected ? 0.2 : 0), k); }
    if (grp.current) { const s = selected ? 1.12 : hovered ? 1.06 : 1; grp.current.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 10)); }
  });
  return (
    <group position={[x, a.stand.y, z]} rotation={[0, -a.stand.angle + Math.PI / 2, 0]}>
      <group ref={grp}>
        <mesh ref={body} position={[0, h / 2, 0]} castShadow onClick={(e) => { e.stopPropagation(); onSelect(); }}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} metalness={0} />
        </mesh>
        {/* canopy */}
        <mesh ref={roof} position={[0, h + 0.08, 0.1]} castShadow>
          <boxGeometry args={[w + 0.3, 0.1, d + 0.5]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} roughness={0.5} />
        </mesh>
        {/* light strip on the canopy edge: this is what blooms */}
        <mesh ref={strip} position={[0, h + 0.08, d / 2 + 0.3]}>
          <boxGeometry args={[w + 0.3, 0.06, 0.06]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* floor glow */}
        <mesh ref={pad} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0.2]}>
          <circleGeometry args={[sponsor ? 2.1 : 1.6, 48]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      </group>
      <Html position={[0, h + 0.55, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
        <div className={`lbl ${selected ? "sel" : ""}`} style={{ opacity: dim ? 0.25 : selected || hovered ? 1 : 0.9 }}>
          <div className="n"><i style={{ background: fitColor(a.fit), boxShadow: `0 0 8px ${fitColor(a.fit)}` }} />{a.vendorName}</div>
          <div className="s">{a.stand.label} · {a.fit.toFixed(2)}</div>
        </div>
      </Html>
    </group>
  );
}

function Rig({ active }: { active: boolean }) {
  // Gentle camera drift while nothing is selected.
  useFrame((state) => {
    if (!active) return;
    const t = state.clock.elapsedTime * 0.08;
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, Math.sin(t) * 6, 0.01);
  });
  return null;
}

export default function Arena({ assignments, selectedId, onSelect, focusCategory }: { assignments: Assignment[]; selectedId: string | null; onSelect: (id: string | null) => void; focusCategory?: string | null }) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 34, 48], fov: 36, near: 0.5, far: 200 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={["#f3f0e8"]} />
      <fog attach="fog" args={["#f3f0e8", 50, 95]} />
      <hemisphereLight args={["#ffffff", "#cfc9bb", 1.2]} />
      <directionalLight position={[-16, 12, -14]} intensity={0.4} />
      <directionalLight position={[14, 26, 10]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005}>
        <orthographicCamera attach="shadow-camera" args={[-28, 28, 28, -28, 1, 80]} />
      </directionalLight>
            <Bowl />
      {assignments.map((a) => (
        <Stand key={a.stand.id} a={a} selected={selectedId === a.stand.id} hovered={hoverId === a.stand.id}
          setHovered={(b) => setHoverId(b ? a.stand.id : null)} onSelect={() => onSelect(a.stand.id)}
          dim={!!focusCategory && a.stand.category !== focusCategory} />
      ))}
      <ContactShadows position={[0, -0.48, 0]} opacity={0.35} scale={60} blur={2.5} far={12} color="#5a5448" />
      <Rig active={!selectedId} />
      <OrbitControls enablePan={false} minDistance={22} maxDistance={70} maxPolarAngle={Math.PI / 2.2} minPolarAngle={0.3} target={[0, 1.5, 0]} enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
