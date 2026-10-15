// Planner properties on the real venue data. Run: npx tsx --test lib/deep/*.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { planFlex, evaluate, standardise } from "./planner";
import { EVENTS, FLEX_SLOTS, CONCEPTS, canRun } from "./venue";
import { defaults } from "./economics";

const e = EVENTS[0];

test("every location is filled with a concept it can physically run, none twice", async () => {
  for (const ev of EVENTS.slice(0, 6)) {
    const p = await planFlex(ev);
    assert.equal(p.solver.status, "Optimal");
    assert.equal(p.decisions.length, FLEX_SLOTS.length);
    assert.equal(new Set(p.decisions.map((d) => d.concept.id)).size, p.decisions.length);
    for (const d of p.decisions) assert.ok(canRun(d.slot, d.concept));
  }
});

test("no taste signal and taste effect zero give the same plan (the ablation)", async () => {
  const a = await planFlex(e, defaults(), null);
  const fake = Object.fromEntries(CONCEPTS.map((c, i) => [c.id, (i % 5) / 5]));
  const b = await planFlex(e, { ...defaults(), tasteBeta: 0 }, fake);
  assert.ok(Math.abs(a.total - b.total) < 1e-6);
});

test("the solver's plan scores at least as well as any baseline under the same model", async () => {
  const fake = Object.fromEntries(CONCEPTS.map((c, i) => [c.id, ((i * 7) % 11) / 11]));
  const p = await planFlex(e, defaults(), fake);
  const sq = Object.fromEntries(FLEX_SLOTS.map((s, i) => [s.id, CONCEPTS.filter((c) => canRun(s, c))[i % 2]?.id ?? ""]));
  const ev = evaluate(e, sq, defaults(), fake);
  if (ev.feasible) assert.ok(p.total >= ev.total - 1e-6);
  assert.ok(Math.abs(evaluate(e, Object.fromEntries(p.decisions.map((d) => [d.slot.id, d.concept.id])), defaults(), fake).total - p.total) < 1e-6);
});

test("raising one concept's affinity never pushes it out of the plan", async () => {
  const base = Object.fromEntries(CONCEPTS.map((c) => [c.id, 0.5]));
  const p0 = await planFlex(e, defaults(), { ...base, poke: 0.9 });
  const p1 = await planFlex(e, defaults(), { ...base, poke: 0.99 });
  const has = (p: typeof p0) => p.decisions.some((d) => d.concept.id === "poke");
  if (has(p0)) assert.ok(has(p1));
});

test("an operator pin is honoured and the rest is re-planned", async () => {
  const p = await planFlex(e, defaults(), null, { "cart-04": "piroshky" });
  assert.equal(p.decisions.find((d) => d.slot.id === "cart-04")?.concept.id, "piroshky");
});

test("affinities are standardised within one call only", () => {
  const z = standardise({ a: 0.2, b: 0.4, c: 0.6 });
  assert.ok(Math.abs(z.a + z.c) < 1e-12 && Math.abs(z.b) < 1e-12);
  assert.deepEqual(standardise(null), {});
});
