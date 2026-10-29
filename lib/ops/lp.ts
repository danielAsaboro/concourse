// Small integer-programming helper over HiGHS (the same solver lib/deep uses).
// Variables are named in the model; the caller gets primal values back by name.

export type Term = { v: string; c: number };
export type Row = { name: string; terms: Term[]; op: "<=" | ">=" | "="; rhs: number };
export type Model = {
  sense: "min" | "max";
  objective: Term[];
  rows: Row[];
  /** Variables that must take integer values (others are continuous, >= 0). */
  integers?: string[];
  binaries?: string[];
  /** Upper bounds, by variable. */
  upper?: Record<string, number>;
};
export type ModelResult = { status: string; objective: number; values: Record<string, number>; ms: number; variables: number; constraints: number };

type HighsLike = { solve(lp: string, opts?: Record<string, unknown>): { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }> } };
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

const num = (x: number) => (Math.abs(x) < 1e-12 ? 0 : +x.toFixed(6));
const expr = (ts: Term[]) => (ts.length ? ts.map((t, i) => `${num(t.c) < 0 ? "-" : i ? "+" : ""} ${Math.abs(num(t.c))} ${t.v}`).join(" ") : "0 zero__");

export function toLp(m: Model): string {
  const vars = new Set<string>();
  m.objective.forEach((t) => vars.add(t.v));
  m.rows.forEach((r) => r.terms.forEach((t) => vars.add(t.v)));
  const bounds = [" zero__ = 0", ...Object.entries(m.upper ?? {}).map(([v, u]) => ` 0 <= ${v} <= ${u}`)];
  return [
    m.sense === "min" ? "Minimize" : "Maximize",
    ` obj: ${expr(m.objective)}`,
    "Subject To",
    ...m.rows.map((r) => ` ${r.name}: ${expr(r.terms)} ${r.op} ${num(r.rhs)}`),
    " fixzero__: zero__ = 0",
    "Bounds",
    ...bounds,
    ...(m.integers?.length ? ["General", ...m.integers.map((v) => ` ${v}`)] : []),
    ...(m.binaries?.length ? ["Binary", ...m.binaries.map((v) => ` ${v}`)] : []),
    "End",
  ].join("\n");
}

export async function solveModel(m: Model): Promise<ModelResult> {
  const h = await highs();
  const lp = toLp(m);
  const t0 = performance.now();
  const r = h.solve(lp, { mip_rel_gap: 1e-6, output_flag: false, time_limit: 10 } as Record<string, unknown>);
  const values: Record<string, number> = {};
  for (const [k, c] of Object.entries(r.Columns ?? {})) if (k !== "zero__") values[k] = c.Primal;
  const vars = new Set<string>();
  m.objective.forEach((t) => vars.add(t.v));
  m.rows.forEach((r) => r.terms.forEach((t) => vars.add(t.v)));
  return { status: r.Status, objective: r.ObjectiveValue, values, ms: performance.now() - t0, variables: vars.size, constraints: m.rows.length };
}
