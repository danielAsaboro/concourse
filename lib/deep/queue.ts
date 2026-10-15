// Queueing at a stand during a purchase burst (doors, intermission, halftime).
// M/M/c (Erlang C), with a first-order allowance for fans who give up.

export type QueueInput = {
  /** Fans who want to buy at this stand during the window. */
  demand: number;
  /** Length of the burst window, minutes. */
  windowMin: number;
  /** Open points of sale (registers, kiosks, bartenders). */
  servers: number;
  /** Mean minutes to serve one transaction at one server. */
  serviceMin: number;
  /** Mean minutes a fan will wait before giving up (exponential patience). */
  patienceMin: number;
};

export type QueueResult = {
  arrivalPerMin: number;
  utilisation: number;
  /** Erlang C probability that an arriving fan has to wait. NaN-free: 1 when overloaded. */
  pWait: number;
  /** Mean wait across all fans, minutes (infinite capacity queue). */
  meanWaitMin: number;
  /** Share of fans who give up before being served. */
  abandonShare: number;
  served: number;
  lost: number;
  stable: boolean;
};

/**
 * Erlang C: probability of waiting in an M/M/c queue with offered load a = λ/μ
 * (in Erlangs) and c servers. Computed with the Erlang B recursion, which is
 * numerically stable for large c.
 */
export function erlangC(a: number, c: number): number {
  if (c <= 0) return 1;
  if (a >= c) return 1;
  let b = 1; // Erlang B with 0 servers
  for (let k = 1; k <= c; k++) b = (a * b) / (k + a * b);
  return b / (1 - (a / c) * (1 - b));
}

/** Average speed of answer (mean wait over all arrivals), same time unit as 1/μ. */
export function meanWait(a: number, c: number, serviceTime: number): number {
  if (a >= c) return Infinity;
  return (erlangC(a, c) * serviceTime) / (c - a);
}

/** Share of arrivals answered within t: 1 - C · exp(-(c - a) t / serviceTime). */
export function serviceLevel(a: number, c: number, serviceTime: number, t: number): number {
  if (a >= c) return 0;
  return 1 - erlangC(a, c) * Math.exp((-(c - a) * t) / serviceTime);
}

export function simulateStand(q: QueueInput): QueueResult {
  const lambda = q.demand / q.windowMin;
  const mu = 1 / q.serviceMin;
  const a = lambda / mu;
  const c = q.servers;
  const capacity = c * mu * q.windowMin;
  if (a >= c) {
    // Overloaded: the stand serves at full speed for the whole window and the rest are lost.
    const served = Math.min(q.demand, capacity);
    return { arrivalPerMin: lambda, utilisation: 1, pWait: 1, meanWaitMin: Infinity, abandonShare: 1 - served / Math.max(q.demand, 1e-9), served, lost: q.demand - served, stable: false };
  }
  const pWait = erlangC(a, c);
  // Given a wait, the wait is exponential with rate (cμ - λ). With exponential patience
  // at rate θ = 1/patience, P(give up | wait) = θ / (cμ - λ + θ). First-order: it ignores
  // the shorter queue that abandonment itself causes, so it slightly overstates losses.
  const theta = 1 / q.patienceMin;
  const abandonShare = pWait * (theta / (c * mu - lambda + theta));
  const served = Math.min(q.demand * (1 - abandonShare), capacity);
  return {
    arrivalPerMin: lambda,
    utilisation: a / c,
    pWait,
    meanWaitMin: meanWait(a, c, q.serviceMin),
    abandonShare,
    served,
    lost: q.demand - served,
    stable: true,
  };
}
