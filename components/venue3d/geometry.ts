// Climate Pledge Arena, in metres. x = east, z = south (north is -z), y = up, 0 = street level.
//
// Sources:
// - Building footprint, the 35 m height and the surrounding Seattle Center blocks:
//   OpenStreetMap (way 25123756 and the area around it), ODbL, see data/seattle-center.json.
// - Section numbering, which concourse each section opens onto, entries, clubs and stands:
//   the arena's own level maps (climatepledgearena.com/arena-maps, dated 2026-09-29) and
//   lib/deep/data/climate-pledge-arena.json (the arena's dining guide).
// - Rink: NHL standard, 200 x 85 ft with 28 ft corners.
// The seating bowl is a model: row counts, rakes and heights are plausible, not surveyed.
import city from "./data/seattle-center.json";
import venue from "@/lib/deep/data/climate-pledge-arena.json";

export type XZ = [number, number];
export type Level = "ll2" | "upper";

export const CITY = city as {
  origin: [number, number];
  license: string;
  retrieved: string;
  buildings: { id: number; name: string | null; h: number; min: number; poly: XZ[] }[];
  roads: { w: number; k: string; line: XZ[]; name?: string }[];
  green: XZ[][];
  water: XZ[][];
  arena: { poly: XZ[]; h: number; osm: string };
};

export const FOOTPRINT: XZ[] = CITY.arena.poly;
const fx = FOOTPRINT.map((p) => p[0]), fz = FOOTPRINT.map((p) => p[1]);
/** Centre of the footprint's bounding box: the bowl is centred here. */
export const CENTER: XZ = [(Math.min(...fx) + Math.max(...fx)) / 2, (Math.min(...fz) + Math.max(...fz)) / 2];
export const HALF: XZ = [(Math.max(...fx) - Math.min(...fx)) / 2, (Math.max(...fz) - Math.min(...fz)) / 2];

/* ---------- Bowl ---------- */

/** NHL rink half extents: 85 ft wide (east-west), 200 ft long (north-south). */
export const RINK = { hx: 12.95, hz: 30.48, corner: 8.53 };
/** Superellipse exponent for the rings of the bowl: between an oval and a rounded box. */
export const SQ = 3.4;

export const Y = {
  floor: -16,
  ll2: -9,
  upper: 0,
  roofLow: 22,
  roofHigh: 35,
};

/** Seating tiers as (start offset from the boards, start height, rows, row depth, rise). */
export const TIERS = {
  /** Sections 01-26, from the boards up to the LL2 Main Concourse cross-aisle. */
  t1: { d0: 1.6, y0: Y.floor + 0.9, rows: 16, depth: 0.84, rise: 0.39, label: "01-26" },
  /** Sections 101-126, from above the LL2 concourse up to street level. */
  t2: { d0: 16.6, y0: -5.6, rows: 14, depth: 0.9, rise: 0.42, label: "101-126" },
  /** Sections 201-226, the upper deck over the Upper Concourse. */
  t3: { d0: 30.6, y0: 4.2, rows: 14, depth: 0.85, rise: 0.56, label: "201-226" },
};
export type TierKey = keyof typeof TIERS;
export const tierEnd = (t: (typeof TIERS)[TierKey]) => ({ d: t.d0 + t.rows * t.depth, y: t.y0 + (t.rows - 1) * t.rise });

/** Ring offsets of the walkable concourses. */
export const RING = {
  ll2: { inner: tierEnd(TIERS.t1).d + 0.4, outer: 46 },
  upper: { inner: tierEnd(TIERS.t2).d + 0.5 },
};

/** Map angle (0 = east, 90 = north) to a unit direction in x/z. */
export function dir(theta: number): XZ {
  return [Math.cos(theta), -Math.sin(theta)];
}

/** Point on the bowl ring `d` metres outside the boards, at map angle theta (radians). */
export function ring(theta: number, d: number): XZ {
  const [c, s] = dir(theta);
  const A = RINK.hx + d, B = RINK.hz + d;
  const t = Math.pow(Math.pow(Math.abs(c / A), SQ) + Math.pow(Math.abs(s / B), SQ), -1 / SQ);
  return [CENTER[0] + c * t, CENTER[1] + s * t];
}

/** Ring offset `d` of a point: inverse of ring() for the angle the point is at. */
export function ringOffset(x: number, z: number): { d: number; theta: number } {
  const dx = x - CENTER[0], dz = z - CENTER[1];
  const theta = Math.atan2(-dz, dx);
  const r = Math.hypot(dx, dz);
  // Solve ring(theta, d) distance = r by bisection; distance grows monotonically with d.
  let lo = -RINK.hx, hi = 200;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const [px, pz] = ring(theta, mid);
    if (Math.hypot(px - CENTER[0], pz - CENTER[1]) < r) lo = mid; else hi = mid;
  }
  return { d: (lo + hi) / 2, theta };
}

/** Outward normal of the ring at angle theta (numeric). */
export function ringNormal(theta: number, d: number): XZ {
  const a = ring(theta - 0.002, d), b = ring(theta + 0.002, d);
  const tx = b[0] - a[0], tz = b[1] - a[1];
  const l = Math.hypot(tx, tz) || 1;
  // Increasing theta runs counter-clockwise seen from above; outward is to the right of that.
  return [-tz / l, tx / l];
}

/* ---------- Sections ---------- */

const DEG = Math.PI / 180;
/** 26 slots per ring; section 01/101/201 sits just north of due east and numbers run clockwise. */
const SLOT = (2 * Math.PI) / 26;
const FIRST = 6.9 * DEG;
export function sectionAngle(n: number): number {
  const k = n % 100;
  return FIRST - (k - 1) * SLOT;
}
/** Sections that exist on the map. 05, 10, 18 and 23 are vomitories and corners. */
const T1_SECTIONS = [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 24, 25, 26];
export type Section = { id: string; n: number; tier: TierKey; theta: number; club?: string };
export const SECTIONS: Section[] = [
  ...T1_SECTIONS.map((n) => ({
    id: String(n).padStart(2, "0"), n, tier: "t1" as const, theta: sectionAngle(n),
    club: [13, 14, 15].includes(n) ? "WaFd Bank Club" : [1, 2, 26].includes(n) ? "Symetra Club" : undefined,
  })),
  ...Array.from({ length: 26 }, (_, i) => 101 + i).map((n) => ({ id: String(n), n, tier: "t2" as const, theta: sectionAngle(n) })),
  ...Array.from({ length: 26 }, (_, i) => 201 + i).map((n) => ({ id: String(n), n, tier: "t3" as const, theta: sectionAngle(n) })),
];
export const sectionById = new Map(SECTIONS.map((s) => [s.id, s]));

/** Building entries from the Upper Concourse map, as map angles. */
export const ENTRIES: { id: string; label: string; theta: number }[] = [
  { id: "e1", label: "Entry 1", theta: -128 * DEG },
  { id: "e2", label: "Entry 2 · Press", theta: -170 * DEG },
  { id: "e3", label: "Entry 3", theta: 138 * DEG },
  { id: "e6", label: "Entry 6", theta: 42 * DEG },
  { id: "e7", label: "Entry 7 · Amex", theta: -10 * DEG },
  { id: "e8", label: "Entry 8", theta: -52 * DEG },
  { id: "e10", label: "Entry 10 · Atrium", theta: -82 * DEG },
  { id: "e11", label: "Entry 11 · Atrium", theta: -98 * DEG },
];

/* ---------- Footprint helpers ---------- */

export function inPoly(x: number, z: number, poly: XZ[] = FOOTPRINT): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Where a ray from the bowl centre at map angle theta leaves the footprint. */
export function footprintEdge(theta: number): XZ {
  const [c, s] = dir(theta);
  let best = 0;
  for (let i = 0, j = FOOTPRINT.length - 1; i < FOOTPRINT.length; j = i++) {
    const [ax, az] = FOOTPRINT[j], [bx, bz] = FOOTPRINT[i];
    const ex = bx - ax, ez = bz - az;
    const den = c * ez - s * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - CENTER[0]) * ez - (az - CENTER[1]) * ex) / den;
    const u = ((ax - CENTER[0]) * s - (az - CENTER[1]) * c) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
  }
  return [CENTER[0] + c * best, CENTER[1] + s * best];
}

/** Height of the saddle roof (a hyperbolic paraboloid, as on the 1962 building) at x/z. */
export function roofY(x: number, z: number): number {
  const u = (x - CENTER[0]) / HALF[0], v = (z - CENTER[1]) / HALF[1];
  const mid = (Y.roofHigh + Y.roofLow) / 2, amp = (Y.roofHigh - Y.roofLow) / 2;
  return mid + amp * (v * v - u * u);
}

/* ---------- Stands from the arena's dining guide ---------- */

export type GuideStand = {
  id: string; name: string; concept?: string; level: string; sections: string[]; category: string;
  items?: string[]; valueItems?: string[]; tags?: string[]; clubTicketRequired?: boolean; source: string;
  note?: string;
};
export const GUIDE: GuideStand[] = [
  ...(venue.stands as GuideStand[]),
  ...((venue.carts ?? []) as GuideStand[]).map((c) => ({ ...c, category: "drink", concept: c.note ? "Beverage point" : c.concept })),
];

export type StandSpot = {
  key: string;
  stand: GuideStand;
  section: string;
  level: Level;
  /** Where this section's concourse meets the stand row. */
  theta: number;
  x: number; y: number; z: number;
  /** Facing (rotation about y) so the counter faces the concourse. */
  rotY: number;
  levelLabel: string;
  club?: string;
};

const LOUNGE_THETA = (sectionAngle(207) + sectionAngle(208)) / 2;

function spotLevel(section: string): { level: Level; theta: number; label: string; club?: string } {
  const n = Number(section);
  if (!Number.isFinite(n)) return { level: "upper", theta: LOUNGE_THETA, label: "Space Needle Lounge (sections 206-209)" };
  if (n < 100) {
    const sec = sectionById.get(section.padStart(2, "0"));
    return { level: "ll2", theta: sectionAngle(n), label: "LL2 Main Concourse", club: sec?.club };
  }
  if (n >= 118 && n <= 123) return { level: "upper", theta: sectionAngle(n), label: "LL1 PitchBook Suite Level (shown on the Upper Concourse)" };
  return { level: "upper", theta: sectionAngle(n), label: "Upper Concourse (street level)" };
}

/** Row of stands along the outer side of each concourse. */
export const STAND_D: Record<Level, number> = { ll2: 43.2, upper: 44.5 };

function buildSpots(): StandSpot[] {
  const groups = new Map<string, { stand: GuideStand; section: string }[]>();
  for (const stand of GUIDE) {
    for (const section of stand.sections) {
      const { level, theta } = spotLevel(section);
      const key = `${level}|${theta.toFixed(3)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ stand, section });
    }
  }
  const spots: StandSpot[] = [];
  for (const list of groups.values()) {
    list.forEach(({ stand, section }, i) => {
      const info = spotLevel(section);
      const d = STAND_D[info.level];
      // Spread several stands at one section along the concourse, 5.2 m apart.
      const [px, pz] = ring(info.theta, d);
      const r = Math.hypot(px - CENTER[0], pz - CENTER[1]);
      const theta = info.theta + ((i - (list.length - 1) / 2) * 5.2) / r;
      const [x, z] = ring(theta, d);
      const [nx, nz] = ringNormal(theta, d);
      spots.push({
        key: `${stand.id}@${section}`, stand, section, level: info.level, theta, x, z,
        y: info.level === "ll2" ? Y.ll2 : Y.upper,
        rotY: Math.atan2(-nx, -nz), levelLabel: info.label, club: info.club,
      });
    });
  }
  return spots;
}
export const SPOTS = buildSpots();

/* ---------- Events ---------- */

export type EventKind = "hockey" | "basketball" | "concert";
export type VenueEvent = { id: string; title: string; date: string; start: string; kind: string; family?: boolean; headliner?: string; source: string; cancelled?: boolean };
export const EVENTS = (venue.events as VenueEvent[]).filter((e) => !e.cancelled);
export const CAPACITY = venue.venue.capacity as { hockey: number; basketball: number; concert: number };
export function eventKind(e: VenueEvent): EventKind {
  if (e.kind === "concert") return "concert";
  if (/storm|basketball/i.test(e.title)) return "basketball";
  return "hockey";
}
