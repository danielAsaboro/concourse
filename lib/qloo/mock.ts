// Recorded-fixture layer. Produces responses shaped exactly like Qloo's API so
// the app runs end to end without a key. Values are synthetic: they come from
// hand-authored taste profiles, not from Qloo. The UI labels this mode.
import type { Axis } from "@/lib/venue/catalogue";
import { VENDORS, vendorById } from "@/lib/venue/catalogue";
import { EVENTS, eventById } from "@/lib/venue/events";
import type { CompareResponse, DemographicsResponse, InsightsEntitiesResponse } from "./types";

const AXES: Axis[] = ["latin", "hiphop", "rock", "pop", "country", "kpop", "sports", "comedy", "premium", "family", "youth", "health"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function mockEntityId(slug: string): string {
  // Deterministic UUID-looking id so fixtures resemble real responses.
  const h = Array.from({ length: 4 }, (_, i) => Math.floor(hash(slug + i) * 0xffffffff).toString(16).padStart(8, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`.toUpperCase();
}

function dot(a: Partial<Record<Axis, number>>, b: Partial<Record<Axis, number>>) {
  let s = 0, na = 0, nb = 0;
  for (const k of AXES) {
    const x = a[k] ?? 0, y = b[k] ?? 0;
    s += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? s / Math.sqrt(na * nb) : 0;
}

function anchorsProfile(anchorIds: string[]) {
  // Find the event(s) whose anchors these are and blend their profiles.
  const profile: Partial<Record<Axis, number>> = {};
  let total = 0;
  for (const ev of EVENTS) {
    for (const a of ev.anchors) {
      if (!anchorIds.includes(a.id)) continue;
      for (const k of AXES) profile[k] = (profile[k] ?? 0) + (ev.profile[k] ?? 0) * a.weight;
      total += a.weight;
    }
  }
  if (total) for (const k of AXES) profile[k] = (profile[k] ?? 0) / total;
  return profile;
}

export function mockRank(anchorIds: string[], vendorIds: string[]): InsightsEntitiesResponse {
  const crowd = anchorsProfile(anchorIds);
  const entities = vendorIds
    .map((vid) => vendorById.get(vid))
    .filter((v): v is NonNullable<typeof v> => !!v)
    .map((v) => {
      const sim = dot(crowd, v.profile);
      const noise = (hash(anchorIds.join() + v.id) - 0.5) * 0.08;
      const affinity = Math.max(0.12, Math.min(0.98, 0.3 + sim * 0.68 + noise));
      const expl: Record<string, number> = {};
      const weights = anchorIds.map((a) => 0.5 + hash(a + v.id));
      const wsum = weights.reduce((x, y) => x + y, 0);
      anchorIds.forEach((a, i) => (expl[mockEntityId(a)] = +(weights[i] / wsum).toFixed(3)));
      return {
        name: v.name,
        entity_id: mockEntityId(v.id),
        type: "urn:entity" as const,
        subtype: v.qlooType,
        popularity: +(0.55 + hash(v.id) * 0.44).toFixed(4),
        tags: Object.entries(v.profile)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => ({ id: `urn:tag:keyword:brand:${k}`, name: k, type: "urn:tag:keyword:brand" })),
        query: { affinity: +affinity.toFixed(4), explainability: { "signal.interests.entities": expl } },
      };
    })
    .sort((a, b) => (b.query.affinity ?? 0) - (a.query.affinity ?? 0));
  return { success: true, results: { entities }, query: { explainability: { warning: "fixture" } }, duration: 3 };
}

export function mockDemographics(anchorIds: string[]): DemographicsResponse {
  const demographics = anchorIds.map((aid) => {
    const ev = EVENTS.find((e) => e.anchors.some((a) => a.id === aid));
    const d = ev?.demographics ?? { age: {}, gender: {} };
    const jitter = (k: string) => +((hash(aid + k) - 0.5) * 0.1).toFixed(2);
    return {
      entity_id: mockEntityId(aid),
      query: {
        age: Object.fromEntries(Object.entries(d.age).map(([k, v]) => [k, +(v + jitter(k)).toFixed(2)])),
        gender: Object.fromEntries(Object.entries(d.gender).map(([k, v]) => [k, +(v + jitter(k) / 2).toFixed(2)])),
      },
    };
  });
  return { success: true, results: { demographics } };
}

const TAG_NAMES: Record<Axis, string> = {
  latin: "Latin music", hiphop: "Hip hop", rock: "Hard rock", pop: "Pop", country: "Country",
  kpop: "K-pop", sports: "Sports fandom", comedy: "Stand-up comedy", premium: "Luxury & nightlife",
  family: "Family outings", youth: "Gen Z culture", health: "Wellness",
};

export function mockCompare(aIds: string[], bIds: string[]): CompareResponse {
  const a = anchorsProfile(aIds), b = anchorsProfile(bIds);
  const tags = AXES.map((k) => {
    const aa = +(0.3 + (a[k] ?? 0) * 0.65).toFixed(3);
    const bb = +(0.3 + (b[k] ?? 0) * 0.65).toFixed(3);
    return {
      tag_id: `urn:tag:keyword:crowd:${k}`,
      name: TAG_NAMES[k],
      subtype: "urn:tag:keyword:crowd",
      query: { a: { affinity: aa }, b: { affinity: bb }, delta: +(aa - bb).toFixed(3) },
    };
  }).sort((x, y) => Math.abs(y.query.delta) - Math.abs(x.query.delta));
  return { success: true, results: { tags } };
}

export function mockSearch(name: string) {
  const v = VENDORS.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const ev = EVENTS.flatMap((e) => e.anchors).find((a) => a.name.toLowerCase() === name.toLowerCase());
  const hit = v ?? ev;
  return { results: hit ? [{ name: hit.name, entity_id: mockEntityId(hit.id), types: [hit.qlooType] }] : [] };
}

export { eventById };
