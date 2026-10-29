// Crowd taste beyond the concept ranking in lib/deep/taste.ts: who is coming
// (age/gender skew), which drinks on the pour list they lean to, which dishes they
// over-index on, and real places from the act's home city for a themed item.
// Live only. With no key every part is "pending"; nothing here is synthesised.
// Call shapes and pitfalls: research-v2/08-qloo-calls.md.
import "server-only";
import { anchorsFor, VENUE_POINT } from "../deep/taste";
import type { VenueEvent } from "../deep/venue";

export type Call = { endpoint: string; params: Record<string, string>; ok: boolean; ms: number; note: string };

/** On-site pour list at Climate Pledge Arena (pouring-rights partners and branded bars). */
export const POUR_LIST = [
  { name: "Coors Light", type: "urn:entity:brand", category: "domestic beer" },
  { name: "Hop Valley Brewing", type: "urn:entity:brand", category: "craft beer" },
  { name: "Modelo", type: "urn:entity:brand", category: "import beer" },
  { name: "Corona", type: "urn:entity:brand", category: "import beer" },
  { name: "Kraken Rum", type: "urn:entity:brand", category: "spirits" },
  { name: "Pepsi", type: "urn:entity:brand", category: "soft drink" },
  { name: "Starbucks", type: "urn:entity:brand", category: "coffee" },
];

/** Home city of each act, from public bios. NOT from Qloo (it exposes no reliable hometown); labelled on screen. */
export const HOME_CITY: Record<string, string> = {
  "MANÁ": "Guadalajara", "Phoebe Bridgers": "Pasadena", "Kacey Musgraves": "Golden, Texas", beabadoobee: "London", Gorillaz: "London",
  "Bryson Tiller": "Louisville", "Teddy Swims": "Conyers, Georgia", "The Smashing Pumpkins": "Chicago", "Lauryn Hill": "Newark", "Garth Brooks": "Tulsa",
  KATSEYE: "Los Angeles", "Trans-Siberian Orchestra": "New York",
};

export type Crowd =
  | { status: "pending"; reason: string; calls: Call[] }
  | {
      status: "live";
      anchors: { name: string; id: string; role: string }[];
      demographics: { anchor: string; age: Record<string, number>; gender: Record<string, number> }[];
      pour: { name: string; category: string; affinity: number; rank: number }[];
      dishes: { id: string; name: string; affinity: number }[];
      homeCity: { city: string; source: "public bio, not Qloo"; places: { name: string; affinity: number; tags: string[] }[] } | null;
      nearby: { name: string; affinity: number; tags: string[] }[];
      calls: Call[];
    };

export async function crowdFor(e: VenueEvent): Promise<Crowd> {
  const calls: Call[] = [];
  if (!process.env.QLOO_API_KEY || process.env.QLOO_MODE === "mock") return { status: "pending", reason: "No Qloo key on this deployment", calls };
  const { qlooGet, resolveEntityId } = await import("@/lib/qloo/live");
  const get = async <T,>(endpoint: string, params: Record<string, string>, note: string): Promise<T | null> => {
    const t0 = Date.now();
    try { const r = await qlooGet<T>(endpoint, params); calls.push({ endpoint, params, ok: true, ms: Date.now() - t0, note }); return r; }
    catch (err) { calls.push({ endpoint, params, ok: false, ms: Date.now() - t0, note: `${note}: ${(err as Error).message}` }); return null; }
  };
  const anchors: { name: string; id: string; role: string }[] = [];
  for (const a of anchorsFor(e)) {
    const id = await resolveEntityId(a.name, a.type).catch(() => null);
    calls.push({ endpoint: "/search", params: { query: a.name, types: a.type }, ok: !!id, ms: 0, note: id ? `resolved ${a.name}` : `${a.name} not found` });
    if (id) anchors.push({ name: a.name, id, role: a.role });
  }
  if (!anchors.length) return { status: "pending", reason: `${e.headliner} did not resolve to a Qloo entity`, calls };
  const signal = anchors.map((a) => a.id).join(",");

  // Demographics: one block per input entity, values are offsets in [-1, 1], not shares.
  type Demo = { results?: { demographics?: { entity_id?: string; query?: { age?: Record<string, number>; gender?: Record<string, number> } }[] } };
  const demo = await get<Demo>("/v2/insights", { "filter.type": "urn:demographics", "signal.interests.entities": signal }, "age and gender skew of tonight's crowd");
  const demographics = (demo?.results?.demographics ?? []).map((d) => ({ anchor: anchors.find((a) => a.id === d.entity_id)?.name ?? d.entity_id ?? "?", age: d.query?.age ?? {}, gender: d.query?.gender ?? {} }));

  // Pour list: rank OUR drinks for this crowd in one call (comparable within the call only).
  const pourIds: { id: string; name: string; category: string }[] = [];
  for (const p of POUR_LIST) {
    const id = await resolveEntityId(p.name, p.type).catch(() => null);
    if (id) pourIds.push({ id, name: p.name, category: p.category });
  }
  type Ents = { results?: { entities?: { name: string; entity_id: string; query?: { affinity?: number }; tags?: { name: string }[] }[] } };
  let pour: { name: string; category: string; affinity: number; rank: number }[] = [];
  if (pourIds.length) {
    const r = await get<Ents>("/v2/insights", { "filter.type": "urn:entity:brand", "signal.interests.entities": signal, "filter.results.entities": pourIds.map((p) => p.id).join(","), "signal.location": VENUE_POINT, take: String(pourIds.length) }, "rank the arena's pour list for tonight's crowd");
    const got = r?.results?.entities ?? [];
    // Guard against silently ignored filters: keep only entities we asked for.
    pour = got.filter((x) => pourIds.some((p) => p.id === x.entity_id)).map((x, i) => ({ name: x.name, category: pourIds.find((p) => p.id === x.entity_id)!.category, affinity: x.query?.affinity ?? 0, rank: i + 1 }));
  }

  // Dishes the crowd over-indexes on (themed-item fodder).
  type Tags = { results?: { tags?: { id?: string; tag_id?: string; name: string; query?: { affinity?: number } }[] } };
  const dishR = await get<Tags>("/v2/insights", { "filter.type": "urn:tag", "signal.interests.entities": signal, "filter.tag.types": "urn:tag:specialty_dish:place", "filter.parents.types": "urn:entity:place", take: "15" }, "dishes tonight's crowd over-indexes on");
  const dishes = (dishR?.results?.tags ?? []).map((t) => ({ id: t.id ?? t.tag_id ?? "", name: t.name, affinity: t.query?.affinity ?? 0 }));

  // Real restaurants in the act's home city that this crowd likes.
  const city = e.kind === "concert" ? HOME_CITY[anchors[0].name] ?? null : null;
  let homeCity: Extract<Crowd, { status: "live" }>["homeCity"] = null;
  if (city) {
    const r = await get<Ents>("/v2/insights", { "filter.type": "urn:entity:place", "signal.interests.entities": signal, "filter.location.query": city, "filter.tags": "urn:tag:genre:place:restaurant", take: "8" }, `restaurants in ${city} this crowd likes`);
    homeCity = { city, source: "public bio, not Qloo", places: (r?.results?.entities ?? []).map((x) => ({ name: x.name, affinity: x.query?.affinity ?? 0, tags: (x.tags ?? []).slice(0, 4).map((t) => t.name) })) };
  }

  // Food and bars near the arena (with the restaurant/bar filter the base planner lacks).
  const nearR = await get<Ents>("/v2/insights", { "filter.type": "urn:entity:place", "signal.interests.entities": signal, "filter.location": VENUE_POINT, "filter.location.radius": "2000", "filter.tags": "urn:tag:genre:place:restaurant,urn:tag:genre:place:bar", "operator.filter.tags": "union", take: "10" }, "food and bars near the arena tonight's crowd likes");
  const nearby = (nearR?.results?.entities ?? []).map((x) => ({ name: x.name, affinity: x.query?.affinity ?? 0, tags: (x.tags ?? []).slice(0, 3).map((t) => t.name) }));

  return { status: "live", anchors, demographics, pour, dishes, homeCity, nearby, calls };
}

/** Share of the crowd that is female, from Qloo's gender offsets (−1..1 around the population). */
export function femaleShareFromDemo(gender: Record<string, number> | undefined, base = 0.5): number | undefined {
  if (!gender || typeof gender.female !== "number") return undefined;
  const f = gender.female, m = typeof gender.male === "number" ? gender.male : -f;
  // Offsets are relative skews; map to a share with a logistic on the difference (inference, labelled).
  return 1 / (1 + Math.exp(-(Math.log(base / (1 - base)) + 2 * (f - m))));
}
