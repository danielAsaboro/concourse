// Flexible-location plan as an integer program, solved exactly with HiGHS.
// Decision: which concept (local partner, cart, bar, featured module) goes into
// each flexible location tonight. Fixed restaurants are not decision variables.

export type SolveSlot = { id: string; mustFill: boolean };
/** `group`: options sharing a group are the same concept (e.g. at different staffing), so at most one is placed. Defaults to id. */
export type SolveConcept = { id: string; category: string; group?: string };

export type SolveInput = {
  slots: SolveSlot[];
  concepts: SolveConcept[];
  /** Expected contribution of placing concept c in slot s; absent = not allowed (equipment, club rules, exclusivity). */
  value: Map<string, number>;
  /** Category caps and floors across all flexible locations, e.g. at least one drink, at most two merch. */
  categoryMin?: Record<string, number>;
  categoryMax?: Record<string, number>;
  /** Concepts that must be placed (sponsor exposure owed by contract), optionally only in listed slots. */
  required?: { conceptId: string; slotIds?: string[] }[];
  /** Pin a slot to a concept (operator override). */
  pinned?: Record<string, string>;
};

export type SolveResult = {
  status: string;
  objective: number;
  assignment: Record<string, string>; // slotId -> conceptId
  /** Relative MIP gap reported by the solver; 0 means proven optimal. */
  gap: number;
  solver: "highs";
  /** Wall time of the HiGHS call, ms, and model size, for the evidence drawer. */
  ms: number;
  variables: number;
  constraints: number;
};

export const key = (s: string, c: string) => `${s}|${c}`;

const v = (si: number, ci: number) => `x_${si}_${ci}`;

/** Build a CPLEX LP model. Exported for tests and for the evidence page. */
export function toLp(inp: SolveInput): string {
  const { slots, concepts, value } = inp;
  const vars: { name: string; s: number; c: number; val: number }[] = [];
  slots.forEach((s, si) => concepts.forEach((c, ci) => {
    const val = value.get(key(s.id, c.id));
    if (val !== undefined && Number.isFinite(val)) vars.push({ name: v(si, ci), s: si, c: ci, val });
  }));
  const fmt = (x: number) => (x >= 0 ? `+ ${x.toFixed(6)}` : `- ${(-x).toFixed(6)}`);
  const sum = (vs: typeof vars) => (vs.length ? vs.map((x) => `+ ${x.name}`).join(" ") : "0 dummy");
  const rows: string[] = [];
  slots.forEach((s, si) => {
    const vs = vars.filter((x) => x.s === si);
    if (!vs.length) return;
    rows.push(` slot_${si}: ${sum(vs)} ${s.mustFill ? "=" : "<="} 1`);
  });
  const groups = new Map<string, number[]>();
  concepts.forEach((c, ci) => groups.set(c.group ?? c.id, [...(groups.get(c.group ?? c.id) ?? []), ci]));
  [...groups.values()].forEach((cis, gi) => {
    const vs = vars.filter((x) => cis.includes(x.c));
    if (vs.length) rows.push(` concept_${gi}: ${sum(vs)} <= 1`);
  });
  const cats = new Set(concepts.map((c) => c.category));
  for (const cat of cats) {
    const vs = vars.filter((x) => concepts[x.c].category === cat);
    if (!vs.length) continue;
    const lo = inp.categoryMin?.[cat];
    const hi = inp.categoryMax?.[cat];
    if (lo !== undefined) rows.push(` catmin_${cat}: ${sum(vs)} >= ${lo}`);
    if (hi !== undefined) rows.push(` catmax_${cat}: ${sum(vs)} <= ${hi}`);
  }
  (inp.required ?? []).forEach((r, i) => {
    const vs = vars.filter((x) => (concepts[x.c].group ?? concepts[x.c].id) === r.conceptId && (!r.slotIds || r.slotIds.includes(slots[x.s].id)));
    rows.push(` req_${i}: ${sum(vs)} >= 1`);
  });
  Object.entries(inp.pinned ?? {}).forEach(([sid, cid], i) => {
    const si = slots.findIndex((s) => s.id === sid);
    const xs = vars.filter((y) => y.s === si && (concepts[y.c].group ?? concepts[y.c].id) === cid);
    rows.push(` pin_${i}: ${xs.length ? sum(xs) : "0 dummy"} = 1`);
  });
  const obj = vars.length ? vars.map((x) => `${fmt(x.val)} ${x.name}`).join(" ") : "0 dummy";
  return [
    "Maximize",
    ` obj: ${obj}`,
    "Subject To",
    ...rows,
    " fix_dummy: dummy = 0",
    "Bounds",
    " 0 <= dummy <= 0",
    "Binary",
    ...vars.map((x) => ` ${x.name}`),
    "End",
  ].join("\n");
}

type HighsLike = { solve(lp: string, opts?: Record<string, unknown>): { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }>; Info?: Record<string, number> } };

let highsPromise: Promise<HighsLike> | null = null;
async function highs(): Promise<HighsLike> {
  if (!highsPromise) {
    highsPromise = (async () => {
      const mod = (await import("highs")) as unknown as { default: (o?: object) => Promise<HighsLike> };
      const path = await import("node:path");
      const dir = path.join(process.cwd(), "node_modules", "highs", "build");
      return mod.default({ locateFile: (f: string) => path.join(dir, f) });
    })();
  }
  return highsPromise;
}

export async function solve(inp: SolveInput): Promise<SolveResult> {
  const h = await highs();
  const lp = toLp(inp);
  const t0 = performance.now();
  const r = h.solve(lp, { mip_rel_gap: 0, output_flag: false } as Record<string, unknown>);
  const ms = performance.now() - t0;
  const variables = (lp.split("Binary")[1]?.match(/x_\d+_\d+/g) ?? []).length;
  const constraints = (lp.split("Subject To")[1]?.split("Bounds")[0].match(/^ \w+:/gm) ?? []).length - 1;
  const assignment: Record<string, string> = {};
  if (r.Status === "Optimal") {
    for (const [name, col] of Object.entries(r.Columns)) {
      const m = /^x_(\d+)_(\d+)$/.exec(name);
      if (m && col.Primal > 0.5) assignment[inp.slots[+m[1]].id] = inp.concepts[+m[2]].id;
    }
  }
  const gap = r.Info?.mip_gap ?? 0;
  return { status: r.Status, objective: r.Status === "Optimal" ? r.ObjectiveValue : NaN, assignment, gap: Number.isFinite(gap) ? Math.max(0, gap) : 0, solver: "highs", ms, variables, constraints };
}

/**
 * Exhaustive search, used only by tests to confirm the solver's answer on small
 * instances. Independent of HiGHS and of the LP text.
 */
export function bruteForce(inp: SolveInput): { objective: number; assignment: Record<string, string> } {
  let best = { objective: -Infinity, assignment: {} as Record<string, string> };
  const cur: Record<string, string> = {};
  const used = new Set<string>();
  const ok = () => {
    const counts: Record<string, number> = {};
    for (const cid of Object.values(cur)) {
      const c = inp.concepts.find((x) => x.id === cid)!;
      counts[c.category] = (counts[c.category] ?? 0) + 1;
    }
    for (const [cat, lo] of Object.entries(inp.categoryMin ?? {})) if ((counts[cat] ?? 0) < lo) return false;
    for (const [cat, hi] of Object.entries(inp.categoryMax ?? {})) if ((counts[cat] ?? 0) > hi) return false;
    const grp = (cid: string) => { const c = inp.concepts.find((x) => x.id === cid)!; return c.group ?? c.id; };
    for (const r of inp.required ?? []) if (!Object.entries(cur).some(([s, c]) => grp(c) === r.conceptId && (!r.slotIds || r.slotIds.includes(s)))) return false;
    for (const [s, c] of Object.entries(inp.pinned ?? {})) if (!cur[s] || grp(cur[s]) !== c) return false;
    return true;
  };
  const rec = (i: number, total: number) => {
    if (i === inp.slots.length) {
      if (ok() && total > best.objective + 1e-9) best = { objective: total, assignment: { ...cur } };
      return;
    }
    const s = inp.slots[i];
    if (!s.mustFill) rec(i + 1, total);
    for (const c of inp.concepts) {
      const val = inp.value.get(key(s.id, c.id));
      const g = c.group ?? c.id;
      if (val === undefined || used.has(g)) continue;
      used.add(g); cur[s.id] = c.id;
      rec(i + 1, total + val);
      used.delete(g); delete cur[s.id];
    }
  };
  rec(0, 0);
  return best;
}
