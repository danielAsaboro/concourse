// Checks the event-night maths against independent references:
// a published Erlang C worked example, hand-calculated newsvendor quantities,
// and exhaustive search for the solver. Run: npx tsx --test lib/deep/*.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { erlangC, meanWait, serviceLevel, simulateStand } from "./queue";
import { newsvendor } from "./newsvendor";
import { Phi, PhiInv } from "./stats";
import { solve, bruteForce, key } from "./solver";

test("normal CDF and inverse agree with printed tables", () => {
  assert.ok(Math.abs(Phi(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(PhiInv(0.6) - 0.253347) < 1e-5);
  assert.ok(Math.abs(PhiInv(0.95) - 1.644854) < 1e-5);
});

test("Erlang C: one server reduces to M/M/1 (P(wait) = utilisation)", () => {
  assert.ok(Math.abs(erlangC(0.7, 1) - 0.7) < 1e-12);
  // M/M/1 mean wait = ρ/(μ-λ): λ=0.7, μ=1 → 2.333…
  assert.ok(Math.abs(meanWait(0.7, 1, 1) - 0.7 / 0.3) < 1e-9);
});

test("Erlang C: two servers match the closed form", () => {
  // c=2: C = a^2 / (a^2 + (2 - a)(1 + a)) … derived from the textbook formula.
  const a = 1.2;
  const closed = (a * a) / (a * a + (2 - a) * (1 + a));
  assert.ok(Math.abs(erlangC(a, 2) - closed) < 1e-12);
});

test("Erlang C matches the Call Centre Helper worked example (10 Erlangs, AHT 180 s, 20 s target)", () => {
  // https://www.callcentrehelper.com/erlang-c-formula-example-121281.htm
  const published = [
    { c: 11, pWait: 0.6821, sl: 0.39 },
    { c: 12, pWait: 0.4494, sl: 0.64 },
    { c: 13, pWait: 0.2853, sl: 0.796 },
    { c: 14, pWait: 0.1741, sl: 0.888 },
  ];
  for (const row of published) {
    assert.ok(Math.abs(erlangC(10, row.c) - row.pWait) < 5e-4, `P(wait) at ${row.c}`);
    assert.ok(Math.abs(serviceLevel(10, row.c, 180, 20) - row.sl) < 1.5e-3, `service level at ${row.c}`);
  }
  // ASA at 14 agents: 0.1741 × 180 / 4 = 7.8 s
  assert.ok(Math.abs(meanWait(10, 14, 180) - 7.84) < 0.01);
});

test("overloaded stand serves at capacity and loses the rest", () => {
  const r = simulateStand({ demand: 600, windowMin: 15, servers: 4, serviceMin: 1, patienceMin: 6 });
  assert.equal(r.stable, false);
  assert.equal(r.served, 60);
  assert.equal(r.lost, 540);
});

test("adding a register never increases lost sales", () => {
  let prev = Infinity;
  for (let c = 3; c <= 12; c++) {
    const r = simulateStand({ demand: 400, windowMin: 15, servers: c, serviceMin: 1.2, patienceMin: 6 });
    assert.ok(r.lost <= prev + 1e-9);
    prev = r.lost;
  }
});

test("newsvendor matches a hand calculation", () => {
  // mean 100, sd 20, price 10, cost 4, salvage 0 → CR = 6/10, z = 0.2533, Q = 105.07 → 106
  const r = newsvendor({ meanDemand: 100, sdDemand: 20, price: 10, unitCost: 4, salvage: 0 });
  assert.ok(Math.abs(r.criticalRatio - 0.6) < 1e-12);
  assert.equal(r.quantity, 106);
  // Nearly shelf-stable (salvage close to cost): CR = 6/6.1 ≈ 0.98, so stock deeper.
  const shelf = newsvendor({ meanDemand: 100, sdDemand: 20, price: 10, unitCost: 4, salvage: 3.9 });
  assert.ok(shelf.quantity > r.quantity);
});

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

test("solver equals exhaustive search on 40 random instances, and respects every constraint", async () => {
  for (let t = 1; t <= 40; t++) {
    const r = rng(t * 7919);
    const slots = Array.from({ length: 3 + (t % 3) }, (_, i) => ({ id: `s${i}`, mustFill: r() > 0.4 }));
    const cats = ["food", "drink", "merch"];
    const concepts = Array.from({ length: 4 + (t % 4) }, (_, i) => ({ id: `c${i}`, category: cats[i % 3] }));
    const value = new Map<string, number>();
    for (const s of slots) for (const c of concepts) if (r() > 0.25) value.set(key(s.id, c.id), Math.round(r() * 1000) - 100);
    const inp = { slots, concepts, value, categoryMin: t % 2 ? { drink: 1 } : undefined, categoryMax: { merch: 1 }, required: t % 5 === 0 ? [{ conceptId: "c0" }] : undefined };
    const bf = bruteForce(inp);
    const hs = await solve(inp);
    if (!Number.isFinite(bf.objective)) { assert.notEqual(hs.status, "Optimal"); continue; }
    assert.equal(hs.status, "Optimal", `instance ${t}`);
    assert.ok(Math.abs(hs.objective - bf.objective) < 1e-6, `instance ${t}: ${hs.objective} vs ${bf.objective}`);
    const placed = Object.values(hs.assignment);
    assert.equal(new Set(placed).size, placed.length, "a concept is on two slots");
    for (const [s, c] of Object.entries(hs.assignment)) assert.ok(value.has(key(s, c)), "placed where not allowed");
    for (const s of slots) if (s.mustFill) assert.ok(hs.assignment[s.id], "must-fill slot left empty");
  }
});
