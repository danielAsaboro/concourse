// Live client for https://hackathon.api.qloo.com. Server-side only: the key
// never leaves this module. GET only, parameters in the query string.
import "server-only";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";
const CACHE_DIR = path.join(process.cwd(), ".cache");
const ID_CACHE = path.join(CACHE_DIR, "entities.json");

let idCache: Record<string, string> | null = null;
function loadIds() {
  if (idCache) return idCache;
  try { idCache = JSON.parse(fs.readFileSync(ID_CACHE, "utf8")); } catch { idCache = {}; }
  return idCache!;
}
function saveIds() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(ID_CACHE, JSON.stringify(idCache ?? {}, null, 2)); } catch { /* read-only FS on some hosts; fine */ }
}

const memo = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 1000 * 60 * 60 * 12;

/** Every live failure resolves to one named state; none of them is treated as an empty result. */
export class QlooError extends Error {
  constructor(public state: "NO_KEY" | "TIMEOUT" | "HTTP_ERROR" | "NETWORK" | "MALFORMED", message: string) {
    super(`${state}: ${message}`);
  }
}

const TIMEOUT_MS = 10_000;

export async function qlooGet<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new QlooError("NO_KEY", "QLOO_API_KEY is not set");
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${endpoint}?${qs}`;
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-Api-Key": key, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const name = (e as Error).name;
    if (name === "TimeoutError" || name === "AbortError") throw new QlooError("TIMEOUT", `${endpoint} took longer than ${TIMEOUT_MS / 1000}s`);
    throw new QlooError("NETWORK", `${endpoint}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new QlooError("HTTP_ERROR", `${endpoint} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  let json: T;
  try { json = (await res.json()) as T; } catch { throw new QlooError("MALFORMED", `${endpoint} returned non-JSON`); }
  memo.set(url, { at: Date.now(), value: json });
  return json;
}

/** Resolve a human name to a Qloo entity id via /search, cached on disk. */
export async function resolveEntityId(name: string, type: string): Promise<string | null> {
  const ids = loadIds();
  const k = `${type}:${name}`;
  if (ids[k]) return ids[k];
  const r = await qlooGet<{ results: { name: string; entity_id: string; types?: string[] }[] }>("/search", {
    query: name,
    types: type,
    take: "3",
  });
  const best = r.results?.[0];
  if (!best) return null;
  ids[k] = best.entity_id;
  saveIds();
  return best.entity_id;
}
