// Inventory maths shared by food, bar and merch planning.
import { PhiInv, normalLoss } from "../deep/stats";

export type Sku = { id: string; mean: number; sd: number; price: number; unitCost: number; salvage: number; /** space or budget used per unit */ weight: number };
export type SkuPlan = { id: string; quantity: number; criticalRatio: number; expectedSales: number; expectedShort: number; expectedLeftover: number; fillRate: number; expectedProfit: number };

function atRatio(s: Sku, cr: number): SkuPlan {
  const z = s.sd > 0 ? PhiInv(Math.min(0.9999, Math.max(1e-4, cr))) : 0;
  const q = Math.max(0, Math.round(s.mean + z * s.sd));
  const short = s.sd > 0 ? s.sd * normalLoss((q - s.mean) / s.sd) : Math.max(0, s.mean - q);
  const sales = s.mean - short;
  const left = q - sales;
  return { id: s.id, quantity: q, criticalRatio: cr, expectedSales: sales, expectedShort: short, expectedLeftover: left, fillRate: s.mean > 0 ? sales / s.mean : 1, expectedProfit: sales * s.price + left * s.salvage - q * s.unitCost };
}

/** Unconstrained critical ratio (p − c)/(p − s). */
export const criticalRatio = (s: Sku) => (s.price - s.unitCost) / Math.max(s.price - s.salvage, 1e-9);

/**
 * Multi-item newsvendor with one shared capacity (truck space, cash budget, hot-holding
 * cabinet space). Lagrangian relaxation: each item is stocked at the critical ratio
 * (p − c − γw)/(p − s), with γ ≥ 0 found by bisection so the capacity binds
 * (Hadley & Whitin 1963; Nahmias, Production and Operations Analysis, §5).
 */
export function multiNewsvendor(skus: Sku[], capacity = Infinity): { plans: SkuPlan[]; shadowPrice: number; used: number; binding: boolean } {
  const solveAt = (g: number) => skus.map((s) => atRatio(s, Math.max(0, (s.price - s.unitCost - g * s.weight) / Math.max(s.price - s.salvage, 1e-9))));
  const use = (ps: SkuPlan[]) => ps.reduce((t, p, i) => t + p.quantity * skus[i].weight, 0);
  let plans = solveAt(0);
  if (use(plans) <= capacity) return { plans, shadowPrice: 0, used: use(plans), binding: false };
  let lo = 0, hi = Math.max(...skus.map((s) => (s.price - s.unitCost) / Math.max(s.weight, 1e-9)));
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (use(solveAt(m)) > capacity) lo = m; else hi = m; }
  plans = solveAt(hi);
  return { plans, shadowPrice: hi, used: use(plans), binding: true };
}

/**
 * Size curve as a Dirichlet posterior: prior shares × prior strength (pseudo-units)
 * plus units sold by size. Returns shares and the demand mean/sd for each size
 * given total garment demand (multinomial split of a negative binomial total).
 */
export function sizeCurve(prior: Record<string, number>, strength: number, sold: Record<string, number> = {}) {
  const sizes = Object.keys(prior);
  const alpha = sizes.map((k) => prior[k] * strength + (sold[k] ?? 0));
  const A = alpha.reduce((a, b) => a + b, 0);
  const shares = Object.fromEntries(sizes.map((k, i) => [k, alpha[i] / A]));
  return {
    shares,
    split(totalMean: number, totalVar: number) {
      return sizes.map((k, i) => {
        const p = alpha[i] / A;
        // Var(N_k) = E[N]p(1−p)·(Dirichlet inflation) + p²Var(N); inflation (A + E[N])/(A + 1) for share uncertainty.
        const infl = (A + totalMean) / (A + 1);
        const v = totalMean * p * (1 - p) * infl + p * p * totalVar;
        return { size: k, share: p, mean: totalMean * p, sd: Math.sqrt(Math.max(v, 0)) };
      });
    },
  };
}

/**
 * Reorder point for an in-event "call-down" from the commissary: stock left at
 * the stand that triggers a runner. ROP = demand during lead time + z·σ_LT.
 */
export function reorderPoint(ratePerMin: number, leadMin: number, cvPerMin: number, serviceLevel = 0.95) {
  const mean = ratePerMin * leadMin;
  const sd = Math.sqrt(mean + (cvPerMin * mean) ** 2);
  return { mean, sd, rop: Math.ceil(mean + PhiInv(serviceLevel) * sd) };
}
