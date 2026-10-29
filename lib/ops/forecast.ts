// Demand forecasting that starts from the model and learns from the operator's
// own sales. This is the standard cold-start pattern: a prior from what the crowd
// should buy (attendance × spend × taste), updated by sales at similar past
// events (analog forecasting), with conjugate Gamma–Poisson shrinkage so a single
// noisy night cannot swing the plan.
//
// Rate per attendee λ ~ Gamma(α0, β0); prior mean r0 = α0/β0, prior strength n0
// "equivalent events" sets β0 = n0 · A_ref. Each past event i with attendance A_i,
// units x_i and similarity weight w_i gives the posterior
//   α = α0 + Σ w_i x_i,  β = β0 + Σ w_i A_i.
// Tonight's units are negative binomial with mean A·α/β and
// variance mean + mean²/α. With no sales loaded the posterior is the prior.

export type Features = { date: string; kind: string; genre: string; start: string; attendance: number };
export type SaleObs = Features & { key: string; units: number; label?: string };

export type Similarity = {
  /** Weight of a past event of the other kind (concert vs game). */
  otherKind: number;
  /** Weight of a past concert of another genre. */
  otherGenre: number;
  /** Weekend vs weekday mismatch. */
  otherDayType: number;
  /** Half-life of an observation's weight, days. */
  halfLifeDays: number;
};

export const DEFAULT_SIMILARITY: Similarity = { otherKind: 0.15, otherGenre: 0.4, otherDayType: 0.8, halfLifeDays: 365 };

const weekend = (d: string) => { const g = new Date(`${d}T12:00:00`).getDay(); return g === 0 || g === 5 || g === 6; };

export function similarity(target: Features, obs: Features, s: Similarity = DEFAULT_SIMILARITY): number {
  let w = 1;
  if (target.kind !== obs.kind) w *= s.otherKind;
  else if (target.kind === "concert" && target.genre !== obs.genre) w *= s.otherGenre;
  if (weekend(target.date) !== weekend(obs.date)) w *= s.otherDayType;
  const days = Math.abs((+new Date(target.date) - +new Date(obs.date)) / 864e5);
  w *= Math.pow(0.5, days / s.halfLifeDays);
  return w;
}

export type Forecast = {
  key: string;
  priorMean: number;
  mean: number;
  sd: number;
  interval80: [number, number];
  /** How much of the forecast comes from sales history (0 = prior only, → 1 as history grows). */
  dataWeight: number;
  /** Effective number of similar past events behind the estimate. */
  effectiveEvents: number;
  analogs: { label: string; weight: number; unitsPer1000: number }[];
};

export function forecast(key: string, target: Features, priorUnits: number, history: SaleObs[], priorEvents = 3, s: Similarity = DEFAULT_SIMILARITY): Forecast {
  const A = target.attendance;
  const r0 = priorUnits / Math.max(A, 1);
  const beta0 = priorEvents * A;
  const alpha0 = Math.max(r0 * beta0, 1e-6);
  let a = alpha0, b = beta0, wsum = 0, w2 = 0;
  const analogs: Forecast["analogs"] = [];
  for (const o of history) {
    if (o.key !== key || !(o.attendance > 0)) continue;
    const w = similarity(target, o, s);
    a += w * o.units; b += w * o.attendance; wsum += w; w2 += w * w;
    analogs.push({ label: o.label ?? o.date, weight: w, unitsPer1000: (1000 * o.units) / o.attendance });
  }
  const mean = (A * a) / b;
  const variance = mean + (mean * mean) / a;
  const sd = Math.sqrt(variance);
  const z = 1.2816;
  return {
    key,
    priorMean: priorUnits,
    mean,
    sd,
    interval80: [Math.max(0, mean - z * sd), mean + z * sd],
    dataWeight: (b - beta0) / b,
    effectiveEvents: w2 > 0 ? (wsum * wsum) / w2 : 0,
    analogs: analogs.sort((x, y) => y.weight - x.weight).slice(0, 5),
  };
}

/**
 * Parse sales history pasted by the operator. Columns (header row required):
 * date,kind,genre,start,attendance,key,units[,label]. `key` is stand id or stand id:item.
 */
export function parseSalesCsv(text: string): { rows: SaleObs[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors };
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const need = ["date", "kind", "genre", "start", "attendance", "key", "units"];
  const missing = need.filter((n) => !head.includes(n));
  if (missing.length) return { rows: [], errors: [`Missing columns: ${missing.join(", ")}`] };
  const ix = (n: string) => head.indexOf(n);
  const rows: SaleObs[] = [];
  lines.slice(1).forEach((l, i) => {
    const c = l.split(",").map((x) => x.trim());
    const r: SaleObs = { date: c[ix("date")], kind: c[ix("kind")], genre: c[ix("genre")], start: c[ix("start")], attendance: +c[ix("attendance")], key: c[ix("key")], units: +c[ix("units")], label: ix("label") >= 0 ? c[ix("label")] : undefined };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !(r.attendance > 0) || !(r.units >= 0) || !r.key) errors.push(`Row ${i + 2} skipped: ${l.slice(0, 60)}`);
    else rows.push(r);
  });
  return { rows, errors };
}

/**
 * Forecast accuracy the way operators score it: WAPE (weighted absolute % error)
 * and bias, for a backtest of forecasts against what sold.
 */
export function accuracy(pairs: { forecast: number; actual: number }[]) {
  const abs = pairs.reduce((t, p) => t + Math.abs(p.forecast - p.actual), 0);
  const act = pairs.reduce((t, p) => t + p.actual, 0);
  const bias = pairs.reduce((t, p) => t + (p.forecast - p.actual), 0);
  return { wape: act ? abs / act : NaN, bias: act ? bias / act : NaN, n: pairs.length };
}

/**
 * In-event update for call-downs. With rate ~ Gamma(k, k/m) per attendee (mean m)
 * and n sales by the time a share F of tonight's demand curve has passed, the rate
 * posterior is Gamma(k + n, k/m + A·F) (conjugate). Remaining demand mean is
 * A·(1−F)·(k+n)/(k/m + A·F). A runner is sent when stock on hand falls under the
 * remaining-demand quantile over the runner lead time.
 */
export function inEventUpdate(A: number, priorRatePerAttendee: number, k: number, salesSoFar: number, shareElapsed: number) {
  const a = k + salesSoFar, b = k / priorRatePerAttendee + A * shareElapsed;
  const rate = a / b;
  const remaining = A * (1 - shareElapsed) * rate;
  return { rate, remainingMean: remaining, remainingSd: Math.sqrt(remaining + (remaining * remaining) / a), revisedTotal: salesSoFar + remaining, priorTotal: A * priorRatePerAttendee };
}

/**
 * Effective dispersion when the prior itself is uncertain (strength a events):
 * 1/k_eff = 1/k + 1/a + 1/(a·k), so first-time acts get wider intervals.
 */
export const effectiveDispersion = (k: number, a: number) => 1 / (1 / k + 1 / a + 1 / (a * k));
