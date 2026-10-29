// Erlang A (M/M/c+M): c servers, Poisson arrivals, exponential service and
// exponential patience. Solved exactly as a birth-death chain (Palm 1943;
// Garnett, Mandelbaum & Reiman 2002), truncated where the tail is negligible.
// Unlike Erlang C it stays finite when the stand is overloaded, which is the
// normal state of a concession stand at intermission.

export type ErlangAResult = {
  /** Probability an arriving fan has to wait at all. */
  pWait: number;
  /** Share of arrivals who give up before reaching a register. */
  pAbandon: number;
  /** Mean wait over all arrivals (served and abandoning), minutes. */
  meanWaitMin: number;
  /** Mean queue length. */
  meanQueue: number;
  /** Share of arrivals served within t minutes (served fans only count). */
  serviceLevel: (tMin: number) => number;
  utilisation: number;
};

export function erlangA(lambdaPerMin: number, serviceMin: number, servers: number, patienceMin: number): ErlangAResult {
  const mu = 1 / serviceMin, theta = 1 / patienceMin, c = Math.max(0, Math.floor(servers));
  // Unnormalised stationary probabilities p_n, computed in log space to avoid overflow.
  const logp: number[] = [0];
  let n = 0, peak = 0;
  // Above c the death rate grows by θ per fan, so the chain's mass sits below c + λ/θ + a few SDs.
  const maxN = Math.ceil(c + 4 * lambdaPerMin / theta + 200);
  while (n < maxN) {
    const death = Math.min(n + 1, c) * mu + Math.max(0, n + 1 - c) * theta;
    logp.push(logp[n] + Math.log(lambdaPerMin) - Math.log(death));
    n++;
    if (n > c + 5 && logp[n] < peak - 40) break;
    if (logp[n] > peak) peak = logp[n];
  }
  const mx = Math.max(...logp);
  const p = logp.map((l) => Math.exp(l - mx));
  const Z = p.reduce((a, b) => a + b, 0);
  for (let i = 0; i < p.length; i++) p[i] /= Z;
  let pWait = 0, meanQueue = 0, busy = 0;
  for (let i = 0; i < p.length; i++) {
    if (i >= c) pWait += p[i];
    meanQueue += Math.max(0, i - c) * p[i];
    busy += Math.min(i, c) * p[i];
  }
  // Abandonment rate = θ·E[Q]; per arrival divide by λ. Little: E[W] = E[Q]/λ.
  const pAbandon = lambdaPerMin > 0 ? (theta * meanQueue) / lambdaPerMin : 0;
  const meanWaitMin = lambdaPerMin > 0 ? meanQueue / lambdaPerMin : 0;
  // Service level (PASTA): a fan arriving to n >= c waits for n-c+1 departures; approximated as
  // Erlang(n-c+1) at the arrival state's drain rate cμ+(n-c)θ. Exact for n = c; an approximation above.
  const serviceLevel = (t: number) => {
    let ok = 0;
    for (let i = 0; i < p.length; i++) {
      if (i < c) { ok += p[i]; continue; }
      const k = i - c + 1;
      const rate = c * mu + (i - c) * theta;
      // Erlang-k tail with rate `rate`: P(T <= t)
      let term = 1, cdfTail = 1, x = rate * t;
      for (let j = 1; j < k; j++) { term *= x / j; cdfTail += term; }
      ok += p[i] * (1 - Math.exp(-x) * cdfTail);
    }
    return Math.min(1, ok);
  };
  return { pWait, pAbandon, meanWaitMin, meanQueue, serviceLevel, utilisation: c ? busy / c : 1 };
}

/**
 * Square-root staffing (Halfin & Whitt 1981): c = R + β√R with offered load R = λ/μ.
 * β ≈ 0.5–1 for "quality and efficiency driven" operation. Shown beside the exact answer.
 */
export function sqrtStaffing(offeredLoad: number, beta: number): number {
  return Math.max(1, Math.ceil(offeredLoad + beta * Math.sqrt(offeredLoad)));
}

/** Fewest servers that meet both targets under Erlang A. */
export function minServers(lambdaPerMin: number, serviceMin: number, patienceMin: number, target: { maxAbandon: number; maxMeanWaitMin: number }, cap = 40) {
  for (let c = 1; c <= cap; c++) {
    const r = erlangA(lambdaPerMin, serviceMin, c, patienceMin);
    if (r.pAbandon <= target.maxAbandon && r.meanWaitMin <= target.maxMeanWaitMin) return { servers: c, result: r };
  }
  return { servers: cap, result: erlangA(lambdaPerMin, serviceMin, cap, patienceMin) };
}

/**
 * Time-varying Erlang A, solved exactly: the Kolmogorov forward equations of the
 * birth-death chain with arrival rate λ(t) and c(t) registers, integrated by
 * explicit Euler with a stable step (Green, Kolesar & Whitt 2007 recommend a
 * numerical solution when the system is overloaded for a stretch, as at
 * intermission). Starts from `start` (a distribution over fans at the stand),
 * so consecutive intervals chain. λ and c are per minute.
 */
export type Transient = { arrivals: number; abandons: number; served: number; fanMinutesWaiting: number; peakQueue: number; end: Float64Array };

export function emptyStand(N = 600): Float64Array { const p = new Float64Array(N + 1); p[0] = 1; return p; }

export function transient(lambdaPerMin: (tMin: number) => number, servers: number, serviceMin: number, patienceMin: number, minutes: number, start: Float64Array = emptyStand()): Transient {
  const mu = 1 / serviceMin, th = 1 / patienceMin, c = servers;
  const N = start.length - 1;
  let p = Float64Array.from(start), q = new Float64Array(N + 1);
  let lamMax = 0;
  for (let t = 0; t < minutes; t += 0.5) lamMax = Math.max(lamMax, lambdaPerMin(t));
  const dt = Math.min(0.05, 0.9 / (lamMax + c * mu + N * th));
  const death = new Float64Array(N + 2);
  for (let n = 0; n <= N + 1; n++) death[n] = Math.min(n, c) * mu + Math.max(0, n - c) * th;
  let arrivals = 0, abandons = 0, served = 0, waitInt = 0, peakQueue = 0;
  for (let t = 0; t < minutes - 1e-9; t += dt) {
    const lam = lambdaPerMin(t);
    let EQ = 0, busy = 0, blocked = 0;
    for (let n = 0; n <= N; n++) {
      const inflow = (n > 0 ? lam * p[n - 1] : 0) + (n < N ? death[n + 1] * p[n + 1] : 0);
      const out = (n < N ? lam : 0) + death[n];
      q[n] = p[n] + dt * (inflow - out * p[n]);
      if (n > c) EQ += (n - c) * p[n];
      busy += Math.min(n, c) * p[n];
    }
    blocked = p[N];
    [p, q] = [q, p];
    arrivals += lam * dt * (1 - blocked);
    abandons += th * EQ * dt;
    served += mu * busy * dt;
    waitInt += EQ * dt;
    if (EQ > peakQueue) peakQueue = EQ;
  }
  return { arrivals, abandons, served, fanMinutesWaiting: waitInt, peakQueue, end: p };
}

/** Allen–Cunneen: scale Erlang waits by (Ca² + Cs²)/2 for non-exponential service (Ca² = 1 for Poisson). */
export const allenCunneen = (serviceCv2: number) => (1 + serviceCv2) / 2;
