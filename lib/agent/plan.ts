import "server-only";
import { STANDS, type Stand, type Category } from "@/lib/venue/arena";
import { VENDORS, vendorById } from "@/lib/venue/catalogue";
import { EVENTS, eventById, type VenueEvent } from "@/lib/venue/events";
import { Ledger, compareCrowds, demographics, rankShortlist, qlooMode, type Ranked, type Demographics, type CompareDiff } from "@/lib/qloo";
import type { LedgerEntry, QlooMode } from "@/lib/qloo/types";

export type Assignment = {
  stand: Stand;
  vendorId: string;
  vendorName: string;
  /** Qloo affinity of the vendor for tonight's crowd (relative to this query). */
  affinity: number;
  /** Affinity adjusted for the stand's zone (premium club, upper deck). Drives the lighting. */
  fit: number;
  drivers: Record<string, number>;
  tags: string[];
  /** Top alternatives for this stand, already filtered to its category. */
  alternatives: { vendorId: string; name: string; affinity: number; fit: number }[];
  /** What this stand had on the previous night, if it differs. */
  previous?: { vendorId: string; name: string; affinity: number };
  reason: string;
};

export type Plan = {
  event: Pick<VenueEvent, "id" | "title" | "kind" | "date" | "expectedAttendance"> & { anchors: string[] };
  previousEvent: { id: string; title: string } | null;
  mode: QlooMode;
  assignments: Assignment[];
  ranked: Record<Category, Ranked[]>;
  demographics: Demographics;
  compare: CompareDiff;
  summary: {
    averageFit: number;
    standsChanged: number;
    /** Inference, labelled as such in the UI. */
    projectedPerCapLiftPct: number;
    topAgeBand: string;
    genderSkew: string;
  };
  ledger: LedgerEntry[];
  llmOnly: { vendorId: string; name: string; stand: string }[];
};

const ZONE_MULT = (stand: Stand, premium: boolean) => {
  if (stand.zone === "club") return premium ? 1.08 : 0.82;
  if (stand.zone === "upper") return premium ? 0.9 : 1.0;
  return 1;
};

function fitFor(stand: Stand, r: Ranked) {
  const v = vendorById.get(r.vendorId);
  return +Math.min(0.99, r.affinity * ZONE_MULT(stand, !!v?.premium)).toFixed(3);
}

function reasonFor(stand: Stand, r: Ranked, anchors: string[]): string {
  const top = Object.entries(r.drivers).sort((a, b) => b[1] - a[1])[0];
  const v = vendorById.get(r.vendorId);
  const bits = [`Affinity ${r.affinity.toFixed(2)} for the ${anchors.join(" + ")} crowd`];
  // Explainability scores are normalised contributions, not shares, so never render them as percentages.
  if (top) bits.push(`${top[0]} fans drive most of that score (driver score ${top[1].toFixed(2)})`);
  if (stand.zone === "club" && v?.premium) bits.push("premium-tier partner, so it suits the club");
  if (stand.zone === "club" && !v?.premium) bits.push("not a premium partner, so the club score is discounted");
  return bits.join(". ") + ".";
}

/** Greedy assignment: stands in priority order take the best unused vendor of their category. */
export function assign(ranked: Record<Category, Ranked[]>, anchors: string[], stands = STANDS): Assignment[] {
  const used = new Set<string>();
  const perCategoryCount: Record<Category, number> = { food: 0, drink: 0, merch: 0, sponsor: 0 };
  for (const s of stands) perCategoryCount[s.category]++;
  const out: Assignment[] = [];
  for (const stand of [...stands].sort((a, b) => a.priority - b.priority)) {
    const pool = ranked[stand.category] ?? [];
    const scored = pool.map((r) => ({ r, fit: fitFor(stand, r) })).sort((a, b) => b.fit - a.fit);
    // Allow a vendor to repeat only when the category has more stands than vendors.
    const allowRepeat = perCategoryCount[stand.category] > pool.length;
    const pick = scored.find((x) => allowRepeat || !used.has(x.r.vendorId)) ?? scored[0];
    if (!pick) continue;
    used.add(pick.r.vendorId);
    out.push({
      stand,
      vendorId: pick.r.vendorId,
      vendorName: pick.r.name,
      affinity: pick.r.affinity,
      fit: pick.fit,
      drivers: pick.r.drivers,
      tags: pick.r.tags,
      alternatives: scored.filter((x) => x.r.vendorId !== pick.r.vendorId).slice(0, 5).map((x) => ({ vendorId: x.r.vendorId, name: x.r.name, affinity: x.r.affinity, fit: x.fit })),
      reason: reasonFor(stand, pick.r, anchors),
    });
  }
  return out.sort((a, b) => STANDS.indexOf(a.stand) - STANDS.indexOf(b.stand));
}

function groupRanked(ranked: Ranked[]): Record<Category, Ranked[]> {
  const g: Record<Category, Ranked[]> = { food: [], drink: [], merch: [], sponsor: [] };
  for (const r of ranked) {
    const v = vendorById.get(r.vendorId);
    if (v) g[v.category].push(r);
  }
  return g;
}

/**
 * The "LLM-only" baseline: what a model picks for this crowd with no taste
 * data. Deliberately generic (the most popular vendor of each category), which
 * is what an ungrounded prompt tends to return. Shown side by side in the UI.
 */
function llmOnlyBaseline(ranked: Ranked[]) {
  const g = groupRanked(ranked);
  const pick = (c: Category) => [...g[c]].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
  return (["food", "drink", "merch", "sponsor"] as Category[])
    .map((c) => ({ c, r: pick(c) }))
    .filter((x) => x.r)
    .map((x) => ({ vendorId: x.r.vendorId, name: x.r.name, stand: x.c }));
}

export function previousEventFor(ev: VenueEvent): VenueEvent | null {
  const i = EVENTS.findIndex((e) => e.id === ev.id);
  // EVENTS is in date order, so the previous night is the entry before. The first has none.
  return i > 0 ? EVENTS[i - 1] : null;
}

export async function buildPlan(eventId: string, overrides: Record<string, string> = {}): Promise<Plan> {
  const ev = eventById.get(eventId);
  if (!ev) throw new Error(`Unknown event ${eventId}`);
  const prev = previousEventFor(ev);
  const ledger = new Ledger();
  const anchors = ev.anchors.map((a) => a.name);

  const [ranked, demo, cmp, prevRanked] = await Promise.all([
    rankShortlist(ev.anchors, VENDORS, ledger),
    demographics(ev.anchors, ledger),
    prev ? compareCrowds(ev.anchors, prev.anchors, ledger) : Promise.resolve([] as CompareDiff),
    prev ? rankShortlist(prev.anchors, VENDORS, new Ledger()) : Promise.resolve([] as Ranked[]),
  ]);

  const grouped = groupRanked(ranked);
  let assignments = assign(grouped, anchors);

  // Operator overrides from the UI ("swap this stand to X"). If X already holds another
  // stand, the two stands exchange vendors, so a vendor never ends up on two stands.
  const place = (a: Assignment, r: Ranked, why: string) => {
    a.vendorId = r.vendorId; a.vendorName = r.name; a.affinity = r.affinity; a.fit = fitFor(a.stand, r);
    a.drivers = r.drivers; a.tags = r.tags; a.reason = `${why} ${reasonFor(a.stand, r, anchors)}`;
    a.alternatives = (grouped[a.stand.category] ?? []).filter((x) => x.vendorId !== r.vendorId).map((x) => ({ vendorId: x.vendorId, name: x.name, affinity: x.affinity, fit: fitFor(a.stand, x) })).sort((x, y) => y.fit - x.fit).slice(0, 5);
  };
  for (const a of assignments) {
    const forced = overrides[a.stand.id];
    if (!forced || forced === a.vendorId) continue;
    const r = ranked.find((x) => x.vendorId === forced);
    if (!r) continue;
    const holder = assignments.find((x) => x !== a && x.vendorId === forced);
    const displaced = ranked.find((x) => x.vendorId === a.vendorId);
    place(a, r, "Operator override.");
    if (holder && displaced && holder.stand.category === a.stand.category) {
      place(holder, displaced, `Exchanged with ${a.stand.label} by an operator override.`);
    }
  }

  let changed = 0;
  if (prev) {
    const prevAssign = assign(groupRanked(prevRanked), prev.anchors.map((a) => a.name));
    for (const a of assignments) {
      const p = prevAssign.find((x) => x.stand.id === a.stand.id);
      if (p && p.vendorId !== a.vendorId) {
        changed++;
        // Score last night's vendor against tonight's crowd so the diff is like-for-like.
        const tonightScore = ranked.find((r) => r.vendorId === p.vendorId)?.affinity ?? 0;
        a.previous = { vendorId: p.vendorId, name: p.vendorName, affinity: tonightScore };
      }
    }
  }

  const avgFit = assignments.reduce((s, a) => s + a.fit * a.stand.traffic, 0) / assignments.reduce((s, a) => s + a.stand.traffic, 0);
  const baselineFit = assignments.reduce((s, a) => s + (a.previous?.affinity ?? a.fit) * a.stand.traffic, 0) / assignments.reduce((s, a) => s + a.stand.traffic, 0);
  const primary = demo[0];
  const topAge = primary ? Object.entries(primary.age).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "" : "";
  const g = primary?.gender ?? {};
  const skew = (g.male ?? 0) > 0.1 ? "skews male" : (g.female ?? 0) > 0.1 ? "skews female" : "balanced";

  return {
    event: { id: ev.id, title: ev.title, kind: ev.kind, date: ev.date, expectedAttendance: ev.expectedAttendance, anchors },
    previousEvent: prev ? { id: prev.id, title: prev.title } : null,
    mode: qlooMode(),
    assignments,
    ranked: grouped,
    demographics: demo,
    compare: cmp,
    summary: {
      averageFit: +avgFit.toFixed(3),
      standsChanged: changed,
      // Heuristic inference: each 0.1 of traffic-weighted affinity lift ≈ 4% per-cap. Not a Qloo output.
      projectedPerCapLiftPct: +Math.max(0, ((avgFit - baselineFit) / 0.1) * 4).toFixed(1),
      topAgeBand: topAge.replace(/_/g, " "),
      genderSkew: skew,
    },
    ledger: ledger.entries,
    llmOnly: llmOnlyBaseline(ranked),
  };
}
