import { test } from "node:test";
import assert from "node:assert/strict";
import { erlangA, sqrtStaffing } from "./erlangA.ts";
import { erlangC, meanWait } from "../deep/queue.ts";
import { offeredLoad, scheduleShifts } from "./staffing.ts";
import { forecast } from "./forecast.ts";
import { multiNewsvendor, sizeCurve } from "./inventory.ts";

test("Erlang A tends to Erlang C as patience grows", () => {
  const r = erlangA(10 / 3, 3, 14, 1e7); // 10 Erlangs, 14 servers
  assert.ok(Math.abs(r.pWait - erlangC(10, 14)) < 1e-3, `${r.pWait}`);
  assert.ok(Math.abs(r.meanWaitMin - meanWait(10, 14, 3)) < 1e-2);
});

test("Erlang A stays finite when overloaded and loses about the excess", () => {
  const r = erlangA(10, 1, 5, 5); // offered 10, capacity 5
  assert.ok(Number.isFinite(r.meanWaitMin));
  assert.ok(Math.abs(r.pAbandon - 0.5) < 0.05, `${r.pAbandon}`);
});

test("Erlang A single server matches M/M/1+M by direct sum", () => {
  // Direct computation for c = 1, λ = 1, μ = 1.25, θ = 0.5.
  const lam = 1, mu = 1.25, th = 0.5;
  const p = [1]; for (let n = 1; n < 400; n++) p.push(p[n - 1] * lam / (mu + (n - 1) * th));
  const Z = p.reduce((a, b) => a + b, 0);
  const q = p.reduce((a, x, n) => a + Math.max(0, n - 1) * x, 0) / Z;
  const r = erlangA(lam, 1 / mu, 1, 1 / th);
  assert.ok(Math.abs(r.pAbandon - th * q / lam) < 1e-9);
});

test("square-root staffing", () => assert.equal(sqrtStaffing(100, 1), 110));

test("offered load lags a burst and decays", () => {
  const m = offeredLoad([150, 0, 0], 1);
  assert.ok(m[0] > 9 && m[0] <= 10, `${m[0]}`);
  assert.ok(m[1] < m[0] && m[2] < 0.01 + m[1]);
});

test("shift covering program meets every interval at least cost", async () => {
  const needs = [1, 2, 3, 3, 2, 1, 0, 0, 2, 2];
  const r = await scheduleShifts(needs, { lengths: [1, 2], setupMin: 0, closeMin: 0, hourlyCost: 10, minPaidHours: 0 });
  assert.equal(r.status, "Optimal");
  needs.forEach((n, t) => assert.ok(r.onFloor[t] >= n));
});

test("forecast equals prior without history and moves toward data with it", () => {
  const f0 = forecast("a", { date: "2026-10-20", kind: "game", genre: "hockey", start: "19:00", attendance: 10000 }, 500, []);
  assert.ok(Math.abs(f0.mean - 500) < 1e-6 && f0.dataWeight === 0);
  const hist = Array.from({ length: 10 }, (_, i) => ({ key: "a", date: `2026-0${(i % 9) + 1}-10`, kind: "game", genre: "hockey", start: "19:00", attendance: 10000, units: 800 }));
  const f1 = forecast("a", { date: "2026-10-20", kind: "game", genre: "hockey", start: "19:00", attendance: 10000 }, 500, hist);
  assert.ok(f1.mean > 700 && f1.mean < 800, `${f1.mean}`);
});

test("multi-item newsvendor respects capacity and equals single-item when slack", () => {
  const skus = [{ id: "a", mean: 100, sd: 20, price: 10, unitCost: 4, salvage: 0, weight: 1 }, { id: "b", mean: 50, sd: 15, price: 40, unitCost: 12, salvage: 10, weight: 2 }];
  const free = multiNewsvendor(skus);
  assert.equal(free.binding, false);
  assert.equal(free.plans[0].quantity, 105); // round(100 + 0.2533*20)
  const tight = multiNewsvendor(skus, 150);
  assert.ok(tight.used <= 150 + 2 && tight.binding);
});

test("size curve shares sum to 1 and learn from sales", () => {
  const c = sizeCurve({ S: 0.2, M: 0.4, L: 0.4 }, 20, { S: 80 });
  const t = Object.values(c.shares).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(t - 1) < 1e-12 && c.shares.S > 0.6);
});

import { transient } from "./erlangA.ts";
test("transient Erlang A reproduces the intermission burst (400 tx in 15 min, 18 registers: ~11% walk away)", () => {
  const r = transient((t) => (t < 15 ? 400 / 15 : 0), 18, 52.3 / 60, 10, 30);
  const share = r.abandons / 400;
  assert.ok(Math.abs(share - 0.11) < 0.01, `${share}`);
  const r23 = transient((t) => (t < 15 ? 400 / 15 : 0), 23, 52.3 / 60, 10, 30);
  assert.ok(Math.abs(r23.abandons / 400 - 0.025) < 0.006, `${r23.abandons / 400}`);
});

test("transient converges to stationary Erlang A", () => {
  const lam = 5, s = 1, c = 6, pat = 8;
  const r = transient(() => lam, c, s, pat, 400);
  const st = erlangA(lam, s, c, pat);
  const tail = transient(() => lam, c, s, pat, 100, r.end);
  assert.ok(Math.abs(tail.abandons / tail.arrivals - st.pAbandon) < 0.003, `${tail.abandons / tail.arrivals} vs ${st.pAbandon}`);
});

import { lockCost } from "./seattle.ts";
test("14-day lock: the optimal posting never costs more than posting the forecast", () => {
  const r = lockCost(1000, { hourlyWage: 21.3, loadFactor: 1.25, cv14: 0.3, cvDay: 0.12, shiftLengths: [4, 5, 6], addFillRate: 0.7 }, 90);
  assert.ok(r.optimal.expected <= r.postAtForecast.expected + 1e-6);
  assert.ok(r.sharperForecast.saving >= 0);
});

import { opsPlan } from "./night.ts";
import { EVENTS } from "../deep/venue.ts";
test("night plan: every stand meets the walk-away target unless it hits the register cap; shifts cover needs", async () => {
  const o = await opsPlan(EVENTS.find((e) => e.kind === "game")!);
  for (const s of o.stands) if (!s.registers.some((c) => c >= o.params.maxRegistersStand)) assert.ok(s.abandonShare <= o.params.maxAbandon + 0.01, `${s.name} ${s.abandonShare}`);
  assert.ok(o.totals.paidHours >= o.totals.registerHoursBurstAware);
  assert.ok(o.shifts.length > 0 && o.solver.programs > 0);
});
