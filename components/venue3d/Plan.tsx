"use client";
// Tonight's event-night plan (lib/deep, served by /api/night) brought into the 3D view:
// the solved mix at the flexible locations, baselines, ties, per-stand demand and what-if re-solves.
import { useEffect, useState } from "react";
import { CONCEPTS, FLEX_SLOTS, canRun } from "@/lib/deep/venue";

export type PlanStandRow = { standId: string; kind: "fixed" | "flex"; concept: string; servedTx: number; waitMin: number | null; par: number; contribution: number | null; z: number | null; tied: boolean };
export type Decision = {
  slot: { id: string; label: string; venueId: string; statusQuo: string | null };
  concept: { id: string; name: string; hero: string };
  /** Registers opened at the location. */
  servers?: number;
  economics: { servedTx: number; worstWaitMin: number; contribution: number; demandTx: number };
  tiedWith: string[];
  runnerUp: { concept: { id: string; name: string }; contribution: number } | null;
};
export type Baseline = { id: string; label: string; status: string; note: string; assignment?: Record<string, string>; total?: number; slotsDifferent?: number };
export type NightPlan = {
  event: { id: string; title: string };
  attendance: number;
  fnbPerCap: number;
  plan: { decisions: Decision[]; total: number; solver: { status: string; gap: number; solver?: string }; usedTaste: boolean };
  ablation: { slotsDifferent: number; valueOfTaste: number | null; tiedSlotsWithoutTaste: number };
  baselines: Baseline[];
  stands: PlanStandRow[];
  taste: { status: string; reason?: string; detail?: string };
  /** "live" = from this app's server; "snapshot" = baked into the static preview. */
  source: "live" | "snapshot";
};

declare global { interface Window { __VENUE_PLANS__?: Record<string, Omit<NightPlan, "source">> } }

export const usd = (n: number) => (n < 0 ? "−" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
/** Accepts a concept id or an assignment value ("concept#registers"). */
export const conceptName = (id: string) => { const c = id.split("#")[0]; return CONCEPTS.find((x) => x.id === c)?.name ?? c; };
export const slotByVenueId = new Map(FLEX_SLOTS.map((s) => [s.venueId, s]));

function trim(j: NightPlan): NightPlan {
  const a = j.ablation;
  return { ...j, ablation: { slotsDifferent: a.slotsDifferent, valueOfTaste: a.valueOfTaste, tiedSlotsWithoutTaste: a.tiedSlotsWithoutTaste }, plan: { ...j.plan, decisions: j.plan.decisions.map((d) => ({ slot: d.slot, concept: d.concept, servers: d.servers, economics: d.economics, tiedWith: d.tiedWith, runnerUp: d.runnerUp })) } };
}

/** Fetch the plan for an event; fall back to the preview snapshot when there is no server. */
export function usePlan(eventId: string, pinned: Record<string, string>) {
  const [plan, setPlan] = useState<NightPlan | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const pin = Object.entries(pinned).map(([s, c]) => `${s}:${c}`).join(",");
  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`/api/night?event=${encodeURIComponent(eventId)}${pin ? `&pin=${encodeURIComponent(pin)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { if (alive) { setPlan(trim({ ...j, source: "live" })); setState("ok"); } })
      .catch(() => {
        if (!alive) return;
        const snap = typeof window !== "undefined" ? window.__VENUE_PLANS__?.[eventId] : undefined;
        if (snap && !pin) { setPlan({ ...snap, source: "snapshot" }); setState("ok"); } else { setPlan(null); setState("none"); }
      });
    return () => { alive = false; };
  }, [eventId, pin]);
  return { plan, state };
}

/** Re-solve with one location pinned to a concept and report the difference. */
export async function whatIf(eventId: string, pinned: Record<string, string>) {
  const pin = Object.entries(pinned).map(([s, c]) => `${s}:${c}`).join(",");
  const r = await fetch(`/api/night?event=${encodeURIComponent(eventId)}&pin=${encodeURIComponent(pin)}`);
  if (!r.ok) throw new Error(String(r.status));
  return trim({ ...(await r.json()), source: "live" }) as NightPlan;
}

export function candidates(venueId: string) {
  const slot = slotByVenueId.get(venueId);
  if (!slot) return [];
  return CONCEPTS.filter((c) => canRun(slot, c));
}

export type Layout = "plan" | "status-quo" | "claude-no-qloo";

/** "concept#registers" per flexible location under the chosen layout (the planner's baseline format). */
export function layoutAssignment(p: NightPlan, layout: Layout): Record<string, string> {
  const plan = Object.fromEntries(p.plan.decisions.map((d) => [d.slot.id, d.servers ? `${d.concept.id}#${d.servers}` : d.concept.id]));
  if (layout === "plan") return plan;
  return p.baselines.find((x) => x.id === layout)?.assignment ?? plan;
}
