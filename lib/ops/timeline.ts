// The event night as a minute-by-minute arrival curve for one stand. Phases follow
// the event's published start; durations are assumptions (labelled in economics).
import type { VenueEvent } from "../deep/venue";
import type { Values } from "../deep/economics";

export type Phase = { name: string; from: number; to: number; kind: "doors" | "break" | "play" };

/** Minutes relative to the published start time (0). */
export function phases(e: VenueEvent, v: Values): Phase[] {
  const d = Math.round(v.doorsWindowMin), im = Math.round(v.intermissionMin);
  if (e.kind === "game") {
    const p = 37; // a 20-minute period with stoppages runs ~35–40 min (assumption)
    return [
      { name: "Doors to puck drop", from: -d, to: 0, kind: "doors" },
      { name: "1st period", from: 0, to: p, kind: "play" },
      { name: "1st intermission", from: p, to: p + im, kind: "break" },
      { name: "2nd period", from: p + im, to: 2 * p + im, kind: "play" },
      { name: "2nd intermission", from: 2 * p + im, to: 2 * p + 2 * im, kind: "break" },
      { name: "3rd period", from: 2 * p + 2 * im, to: 3 * p + 2 * im, kind: "play" },
    ];
  }
  const co = Math.round(v.changeoverMin);
  return [
    { name: "Doors to opener", from: -d, to: 0, kind: "doors" },
    { name: "Opener", from: 0, to: 45, kind: "play" },
    { name: "Changeover", from: 45, to: 45 + co, kind: "break" },
    { name: "Headline set", from: 45 + co, to: 45 + co + 100, kind: "play" },
  ];
}

/**
 * Arrivals per minute at a stand with `total` transactions tonight. Doors ramp up
 * toward the start; a break front-loads (fans leave their seats at the horn and the
 * queue builds in the first minutes); play is flat and low.
 */
export function arrivalCurve(e: VenueEvent, v: Values, total: number): { from: number; to: number; perMin: Float64Array } {
  const ph = phases(e, v);
  const from = ph[0].from, to = ph[ph.length - 1].to;
  const perMin = new Float64Array(to - from);
  const breaks = ph.filter((p) => p.kind === "break");
  const plays = ph.filter((p) => p.kind === "play");
  const rest = Math.max(0, 1 - v.shareBeforeStart - v.shareIntermission);
  const put = (p: Phase, share: number, w: (i: number, n: number) => number) => {
    const n = p.to - p.from;
    const ws = Array.from({ length: n }, (_, i) => w(i, n));
    const s = ws.reduce((a, b) => a + b, 0) || 1;
    ws.forEach((x, i) => (perMin[p.from - from + i] += (total * share * x) / s));
  };
  put(ph[0], v.shareBeforeStart, (i) => 1 + i);
  breaks.forEach((b) => put(b, v.shareIntermission / breaks.length, (i, n) => Math.exp(-(3 * i) / n)));
  const playMin = plays.reduce((t, p) => t + p.to - p.from, 0);
  plays.forEach((p) => put(p, (rest * (p.to - p.from)) / playMin, () => 1));
  return { from, to, perMin };
}

export const clock = (e: VenueEvent, minFromStart: number) => {
  const [h, m] = e.start.split(":").map(Number);
  const t = h * 60 + m + minFromStart;
  const hh = Math.floor((((t % 1440) + 1440) % 1440) / 60), mm = ((t % 60) + 60) % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
};
