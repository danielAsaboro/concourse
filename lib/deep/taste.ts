// Qloo taste signal for the deeper planner. Live only: with no key every
// function returns a named "pending" state and the planner runs without taste,
// which is also the ablation. No synthetic affinities are produced here.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONCEPTS, type Concept, type VenueEvent } from "./venue";

/** Climate Pledge Arena, Seattle Center (WKT is lon lat). */
export const VENUE_POINT = "POINT(-122.3540 47.6221)";

export type TasteCall = { endpoint: string; params: Record<string, string>; at: string; ms: number; ok: boolean; note: string };

export type Taste =
  | { status: "pending"; reason: "NO_KEY" | "ERROR"; detail: string; calls: TasteCall[] }
  | {
      status: "live";
      anchors: { name: string; id: string }[];
      /** concept id -> affinity from ONE call, so values are comparable within tonight only. */
      affinity: Record<string, number>;
      /** concept id -> the tag id the score came from. */
      tagIds: Record<string, string>;
      unresolved: string[];
      /** Places near the venue that tonight's crowd likes. Not contracted; shown for scouting. */
      localScouting: { name: string; id: string; affinity: number; tags: string[] }[];
      calls: TasteCall[];
    };

/**
 * Who the crowd came for. Concerts: the headliner as an artist. Kraken games:
 * the team. The entity types are checked on the first live call (docs/qloo.md §8).
 */
export function anchorsFor(e: VenueEvent): { name: string; type: string }[] {
  if (e.kind === "game") return [{ name: "Seattle Kraken", type: "urn:entity:brand" }];
  const name = e.headliner.replace(/:.*$/, "").replace(/\s*&.*$/, "").trim();
  return [{ name, type: "urn:entity:artist" }];
}

const RAW_DIR = path.join(process.cwd(), ".cache", "qloo-raw");

/** Keep every raw response privately (gitignored .cache), so each number traces to a call. */
function keepRaw(endpoint: string, params: Record<string, string>, body: unknown) {
  try {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    const h = crypto.createHash("sha1").update(endpoint + JSON.stringify(params)).digest("hex").slice(0, 10);
    fs.writeFileSync(path.join(RAW_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${h}.json`), JSON.stringify({ endpoint, params, body }, null, 1));
  } catch { /* read-only host: the in-memory ledger still records the call */ }
}

export async function tasteFor(e: VenueEvent, concepts: Concept[] = CONCEPTS): Promise<Taste> {
  const calls: TasteCall[] = [];
  if (!process.env.QLOO_API_KEY || process.env.QLOO_MODE === "mock") {
    return { status: "pending", reason: "NO_KEY", detail: "No Qloo key on this deployment, so the plan runs without a taste signal (identical to the without-Qloo ablation).", calls };
  }
  const { qlooGet, resolveEntityId } = await import("@/lib/qloo/live");
  const get = async <T,>(endpoint: string, params: Record<string, string>, note: string): Promise<T> => {
    const t0 = Date.now();
    try {
      const r = await qlooGet<T>(endpoint, params);
      keepRaw(endpoint, params, r);
      calls.push({ endpoint, params, at: new Date().toISOString(), ms: Date.now() - t0, ok: true, note });
      return r;
    } catch (err) {
      calls.push({ endpoint, params, at: new Date().toISOString(), ms: Date.now() - t0, ok: false, note: `${note}: ${(err as Error).message}` });
      throw err;
    }
  };
  try {
    const anchors: { name: string; id: string }[] = [];
    for (const a of anchorsFor(e)) {
      const id = await resolveEntityId(a.name, a.type);
      if (id) anchors.push({ name: a.name, id });
    }
    if (!anchors.length) return { status: "pending", reason: "ERROR", detail: `NO_SIGNAL: ${e.headliner} did not resolve to a Qloo entity`, calls };
    const signal = anchors.map((a) => a.id).join(",");

    // Resolve each concept's cuisine/product tag to a real tag id.
    const tagIds: Record<string, string> = {};
    const unresolved: string[] = [];
    for (const c of concepts) {
      const r = await get<{ results?: { tags?: { id: string; name: string }[] } }>("/v2/tags", { "filter.query": c.qloo.tag, take: "3" }, `tag for ${c.name}`);
      const t = r.results?.tags?.[0];
      if (t) tagIds[c.id] = t.id; else unresolved.push(c.name);
    }
    // One call ranks all concept tags for tonight's crowd, so the scores are comparable.
    const uniq = [...new Set(Object.values(tagIds))];
    const ranked = await get<{ results?: { tags?: { id?: string; tag_id?: string; query?: { affinity?: number } }[] } }>(
      "/v2/insights",
      { "filter.type": "urn:tag", "signal.interests.entities": signal, "filter.results.tags": uniq.join(","), take: String(Math.min(50, uniq.length)) },
      "rank concept tags for tonight's crowd",
    );
    const byTag = new Map<string, number>();
    for (const t of ranked.results?.tags ?? []) {
      const id = t.id ?? t.tag_id;
      if (id && typeof t.query?.affinity === "number") byTag.set(id, t.query.affinity);
    }
    const affinity: Record<string, number> = {};
    for (const [cid, tid] of Object.entries(tagIds)) {
      const a = byTag.get(tid);
      if (a === undefined) unresolved.push(`${cid} (tag not scored)`); else affinity[cid] = a;
    }

    // Scouting: local places near the venue that tonight's crowd likes.
    let localScouting: { name: string; id: string; affinity: number; tags: string[] }[] = [];
    try {
      const near = await get<{ results?: { entities?: { name: string; entity_id: string; query?: { affinity?: number }; tags?: { name: string }[] }[] } }>(
        "/v2/insights",
        { "filter.type": "urn:entity:place", "signal.interests.entities": signal, "filter.location": VENUE_POINT, "filter.location.radius": "3000", take: "10" },
        "local places near the arena for tonight's crowd",
      );
      localScouting = (near.results?.entities ?? []).map((x) => ({ name: x.name, id: x.entity_id, affinity: x.query?.affinity ?? 0, tags: (x.tags ?? []).slice(0, 3).map((t) => t.name) }));
    } catch { /* scouting is optional; the call is still in the ledger */ }

    if (!Object.keys(affinity).length) return { status: "pending", reason: "ERROR", detail: "MALFORMED: no concept tag came back with an affinity", calls };
    return { status: "live", anchors, affinity, tagIds, unresolved, localScouting, calls };
  } catch (err) {
    return { status: "pending", reason: "ERROR", detail: (err as Error).message, calls };
  }
}
