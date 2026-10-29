// Scene layout for the arena model. The venue data (lib/venue/arena.ts) gives
// each stand a zone and an angle; this file decides where that lands in 3D.
import type { Stand, Zone } from "@/lib/venue/arena";

/** The bowl is an oval: x is stretched by this factor. */
export const EX = 1.22;

export const FLOOR_R = 6;

export const LOWER = { r0: 6.4, y0: 0.4, rows: 10, depth: 0.42, rise: 0.26 };
export const LOWER_END = { r: LOWER.r0 + LOWER.rows * LOWER.depth, y: LOWER.y0 + LOWER.rows * LOWER.rise };
export const LOWER_CONCOURSE = { r0: LOWER_END.r, r1: 13.9, y: LOWER_END.y };
export const UPPER = { r0: 13.9, y0: 4.3, rows: 9, depth: 0.44, rise: 0.34 };
export const UPPER_END = { r: UPPER.r0 + UPPER.rows * UPPER.depth, y: UPPER.y0 + UPPER.rows * UPPER.rise };
export const UPPER_CONCOURSE = { r0: UPPER_END.r, r1: 20.4, y: UPPER_END.y };
export const FACADE_R = 20.4;

/** Club lounge arc on the lower concourse, behind the stage end. */
export const CLUB_ARC = { a0: Math.PI / 2 - 0.36, a1: Math.PI / 2 + 0.36 };

export type Placement = { x: number; y: number; z: number; rotY: number; size: "kiosk" | "store" | "tent"; outside: boolean };

export function onOval(angle: number, r: number): [number, number] {
  return [Math.cos(angle) * r * EX, Math.sin(angle) * r];
}

export function place(stand: Stand): Placement {
  let r: number, y: number, size: Placement["size"] = "kiosk", outside = false;
  let angle = stand.angle;
  switch (stand.zone as Zone) {
    case "club":
      r = 12.75; y = LOWER_CONCOURSE.y; angle = Math.PI / 2 + (stand.angle - Math.PI / 2) * 0.72; break;
    case "lower":
      if (stand.category === "merch") { r = FACADE_R + 1.7; y = 0; size = "store"; outside = true; }
      else { r = 13.05; y = LOWER_CONCOURSE.y; }
      break;
    case "upper":
      r = 19.55; y = UPPER_CONCOURSE.y; break;
    case "plaza":
      r = 27; y = 0; size = "tent"; outside = true; break;
  }
  const [x, z] = onOval(angle, r);
  // Face the bowl (or the plaza, for things outside the building).
  const rotY = outside ? Math.atan2(x, z) : Math.atan2(-x, -z);
  return { x, y, z, rotY, size, outside };
}

/** A camera position and target for a stand, looking at its front. */
export function standCamera(p: Placement): { pos: [number, number, number]; target: [number, number, number] } {
  const fx = Math.sin(p.rotY), fz = Math.cos(p.rotY);
  const dist = p.size === "tent" ? 14 : p.size === "store" ? 13 : 10.5;
  const up = p.size === "tent" ? 7 : 5.6;
  return {
    pos: [p.x + fx * dist + fz * 1.8, p.y + up, p.z + fz * dist - fx * 1.8],
    target: [p.x, p.y + 1.6, p.z],
  };
}

export type Preset = "bowl" | "lower" | "upper" | "club" | "plaza";
export const PRESETS: Record<Preset, { pos: [number, number, number]; target: [number, number, number] }> = {
  bowl: { pos: [-30, 34, -44], target: [0, 1.5, 1] },
  lower: { pos: [-16, 13, -21], target: [4, 2.6, 6] },
  upper: { pos: [-22, 24, -32], target: [2, 6.5, 9] },
  club: { pos: [-3, 9, 3.5], target: [0, 3.4, 12.8] },
  plaza: { pos: [-14, 17, -52], target: [0, 0, -24] },
};
export const PRESET_LABEL: Record<Preset, string> = { bowl: "Bowl", club: "Club", lower: "Lower", upper: "Upper", plaza: "Plaza" };
export const PRESET_ZONE: Record<Preset, Zone | null> = { bowl: null, club: "club", lower: "lower", upper: "upper", plaza: "plaza" };
