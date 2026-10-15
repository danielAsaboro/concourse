// Textbook checks anyone can re-run against the deployed planner (also exposed over MCP).
import { erlangC, meanWait, serviceLevel } from "./queue";
import { newsvendor } from "./newsvendor";
import { solve, bruteForce, key } from "./solver";

export type Check = { name: string; source: string; expected: number; actual: number; tolerance: number; pass: boolean };

const check = (name: string, source: string, expected: number, actual: number, tolerance: number): Check => ({ name, source, expected, actual: +actual.toFixed(6), tolerance, pass: Math.abs(expected - actual) <= tolerance });

const CCH = "https://www.callcentrehelper.com/erlang-c-formula-example-121281.htm";

export async function textbookChecks(): Promise<{ pass: boolean; checks: Check[] }> {
  const checks: Check[] = [
    check("Erlang C P(wait), 10 Erlangs, 11 servers", CCH, 0.6821, erlangC(10, 11), 5e-4),
    check("Erlang C P(wait), 10 Erlangs, 12 servers", CCH, 0.4494, erlangC(10, 12), 5e-4),
    check("Erlang C P(wait), 10 Erlangs, 13 servers", CCH, 0.2853, erlangC(10, 13), 5e-4),
    check("Erlang C P(wait), 10 Erlangs, 14 servers", CCH, 0.1741, erlangC(10, 14), 5e-4),
    check("Service level within 20 s, 14 servers, AHT 180 s", CCH, 0.888, serviceLevel(10, 14, 180, 20), 1.5e-3),
    check("Average speed of answer, 14 servers, AHT 180 s (s)", CCH, 7.84, meanWait(10, 14, 180), 0.01),
    check("M/M/1 P(wait) equals utilisation 0.7", "Textbook identity", 0.7, erlangC(0.7, 1), 1e-12),
  ];
  const nv = newsvendor({ meanDemand: 100, sdDemand: 20, price: 10, unitCost: 4, salvage: 0 });
  checks.push(check("Newsvendor critical ratio (p−c)/(p−s), p=10 c=4 s=0", "Hand calculation", 0.6, nv.criticalRatio, 1e-12));
  checks.push(check("Newsvendor quantity, mean 100, sd 20 (ceil of 105.07)", "Hand calculation: z(0.6)=0.2533", 106, nv.quantity, 0));
  // Solver vs exhaustive search on random instances.
  let worst = 0;
  for (let t = 1; t <= 20; t++) {
    let seed = t * 7919;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const slots = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, mustFill: true }));
    const concepts = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, category: i % 2 ? "food" : "drink" }));
    const value = new Map<string, number>();
    for (const s of slots) for (const c of concepts) if (r() > 0.2) value.set(key(s.id, c.id), Math.round(r() * 1000));
    const bf = bruteForce({ slots, concepts, value });
    if (!Number.isFinite(bf.objective)) continue;
    const hs = await solve({ slots, concepts, value });
    worst = Math.max(worst, Math.abs(hs.objective - bf.objective));
  }
  checks.push(check("HiGHS optimum minus exhaustive-search optimum, worst of 20 random instances", "Brute force, independent of HiGHS", 0, worst, 1e-6));
  return { pass: checks.every((c) => c.pass), checks };
}
