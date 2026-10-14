// Unified Qloo access. Picks live or recorded fixtures, normalises responses
// into app-level results, and records each call in an evidence ledger.
import "server-only";
import type { Anchor } from "@/lib/venue/events";
import type { Vendor } from "@/lib/venue/catalogue";
import { vendorById } from "@/lib/venue/catalogue";
import { mockCompare, mockDemographics, mockEntityId, mockRank } from "./mock";
import type { CompareResponse, DemographicsResponse, InsightsEntitiesResponse, LedgerEntry, QlooMode } from "./types";

export function qlooMode(): QlooMode {
  if (process.env.QLOO_MODE === "mock") return "mock";
  return process.env.QLOO_API_KEY ? "live" : "mock";
}

export type Ranked = {
  vendorId: string;
  name: string;
  affinity: number;
  popularity?: number;
  /** anchor name -> share of the score it drove (from feature.explainability) */
  drivers: Record<string, number>;
  tags: string[];
};

export type Demographics = { age: Record<string, number>; gender: Record<string, number>; anchor: string }[];
export type CompareDiff = { name: string; a: number; b: number; delta: number }[];

export class Ledger {
  entries: LedgerEntry[] = [];
  private n = 0;
  add(e: Omit<LedgerEntry, "id">) {
    this.entries.push({ id: `q${++this.n}`, ...e });
  }
}

async function live() {
  return import("./live");
}

async function anchorIds(anchors: Anchor[], mode: QlooMode): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (mode === "mock") {
    anchors.forEach((a) => out.set(a.id, mockEntityId(a.id)));
    return out;
  }
  const { resolveEntityId } = await live();
  await Promise.all(
    anchors.map(async (a) => {
      const id = await resolveEntityId(a.name, a.qlooType);
      if (id) out.set(a.id, id);
    }),
  );
  return out;
}

async function vendorIds(vendors: Vendor[], mode: QlooMode): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (mode === "mock") {
    vendors.forEach((v) => out.set(v.id, mockEntityId(v.id)));
    return out;
  }
  const { resolveEntityId } = await live();
  await Promise.all(
    vendors.map(async (v) => {
      const id = await resolveEntityId(v.name, v.qlooType);
      if (id) out.set(v.id, id);
    }),
  );
  return out;
}

/**
 * qloo_rank: rank the venue's own shortlist for tonight's crowd.
 * Live call: /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=…&filter.results.entities=…&feature.explainability=true
 */
export async function rankShortlist(anchors: Anchor[], vendors: Vendor[], ledger: Ledger): Promise<Ranked[]> {
  const mode = qlooMode();
  const t0 = Date.now();
  const aIds = await anchorIds(anchors, mode);
  const vIds = await vendorIds(vendors, mode);
  const idToVendor = new Map([...vIds].map(([slug, id]) => [id, slug]));
  const idToAnchor = new Map([...aIds].map(([slug, id]) => [id, anchors.find((a) => a.id === slug)!.name]));

  // Brands and places are different filter.types; one call per type.
  const byType = new Map<string, Vendor[]>();
  for (const v of vendors) byType.set(v.qlooType, [...(byType.get(v.qlooType) ?? []), v]);

  const ranked: Ranked[] = [];
  for (const [type, vs] of byType) {
    const params = {
      "filter.type": type,
      "signal.interests.entities": [...aIds.values()].join(","),
      "filter.results.entities": vs.map((v) => vIds.get(v.id)).filter(Boolean).join(","),
      "feature.explainability": "true",
      take: "50",
    };
    let res: InsightsEntitiesResponse;
    if (mode === "mock") {
      res = mockRank(anchors.map((a) => a.id), vs.map((v) => v.id));
    } else {
      const { qlooGet } = await live();
      res = await qlooGet<InsightsEntitiesResponse>("/v2/insights", params);
    }
    for (const e of res.results.entities) {
      const slug = idToVendor.get(e.entity_id);
      if (!slug) continue;
      const expl = e.query?.explainability?.["signal.interests.entities"] ?? {};
      const drivers: Record<string, number> = {};
      for (const [id, score] of Object.entries(expl)) drivers[idToAnchor.get(id) ?? id] = score;
      ranked.push({
        vendorId: slug,
        name: vendorById.get(slug)?.name ?? e.name,
        affinity: e.query?.affinity ?? 0,
        popularity: e.popularity,
        drivers,
        tags: (e.tags ?? []).slice(0, 4).map((t) => t.name),
      });
    }
    ledger.add({
      mode,
      endpoint: "/v2/insights",
      params,
      summary: `Ranked ${res.results.entities.length} ${type.replace("urn:entity:", "")} candidates for ${anchors.map((a) => a.name).join(" + ")} with explainability`,
      ms: Date.now() - t0,
    });
  }
  return ranked.sort((a, b) => b.affinity - a.affinity);
}

/** urn:demographics for the night's anchors. Offsets, not shares. */
export async function demographics(anchors: Anchor[], ledger: Ledger): Promise<Demographics> {
  const mode = qlooMode();
  const t0 = Date.now();
  const aIds = await anchorIds(anchors, mode);
  const params = { "filter.type": "urn:demographics", "signal.interests.entities": [...aIds.values()].join(",") };
  let res: DemographicsResponse;
  if (mode === "mock") res = mockDemographics(anchors.map((a) => a.id));
  else res = await (await live()).qlooGet<DemographicsResponse>("/v2/insights", params);
  const idToAnchor = new Map([...aIds].map(([slug, id]) => [id, anchors.find((a) => a.id === slug)!.name]));
  ledger.add({ mode, endpoint: "/v2/insights", params, summary: `Age and gender skew for ${anchors.map((a) => a.name).join(" + ")}`, ms: Date.now() - t0 });
  return res.results.demographics.map((d) => ({ anchor: idToAnchor.get(d.entity_id) ?? d.entity_id, age: d.query.age, gender: d.query.gender }));
}

/** /v2/analysis/compare: tonight's crowd (a) vs last night's (b). */
export async function compareCrowds(a: Anchor[], b: Anchor[], ledger: Ledger): Promise<CompareDiff> {
  const mode = qlooMode();
  const t0 = Date.now();
  const [aIds, bIds] = await Promise.all([anchorIds(a, mode), anchorIds(b, mode)]);
  const params = {
    "a.signal.interests.entities": [...aIds.values()].join(","),
    "b.signal.interests.entities": [...bIds.values()].join(","),
    "filter.type": "urn:tag",
    take: "20",
  };
  let res: CompareResponse;
  if (mode === "mock") res = mockCompare(a.map((x) => x.id), b.map((x) => x.id));
  else res = await (await live()).qlooGet<CompareResponse>("/v2/analysis/compare", params);
  ledger.add({ mode, endpoint: "/v2/analysis/compare", params, summary: `Taste overlap and differences: ${a[0].name} crowd vs ${b[0].name} crowd`, ms: Date.now() - t0 });
  const tags = res.results.tags ?? [];
  return tags
    .map((t) => {
      // Live responses may not include a precomputed delta; derive it.
      const av = t.query?.a?.affinity ?? 0;
      const bv = t.query?.b?.affinity ?? 0;
      return { name: t.name, a: av, b: bv, delta: t.query?.delta ?? +(av - bv).toFixed(3) };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 8);
}
