// Small numeric helpers for the event-night model. No dependencies, so the
// maths can be checked by hand and in tests.

/** Standard normal density. */
export function phi(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF (Zelen & Severo 26.2.17, |error| < 7.5e-8). */
export function Phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - phi(z) * poly;
  return z >= 0 ? p : 1 - p;
}

/** Inverse standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9). */
export function PhiInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425, hi = 1 - lo;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > hi) return -PhiInv(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Standard normal loss function L(z) = E[(Z - z)+]. */
export function normalLoss(z: number): number {
  return phi(z) - z * (1 - Phi(z));
}

/**
 * Negative-binomial demand summarised by mean and variance. `dispersion` k:
 * var = mean + mean^2 / k. k = Infinity is Poisson.
 */
export function nbVariance(mean: number, dispersion: number): number {
  return mean + (Number.isFinite(dispersion) ? (mean * mean) / dispersion : 0);
}

/** Central interval of a demand count under a normal approximation, floored at 0. */
export function interval(mean: number, variance: number, level = 0.8): [number, number] {
  const z = PhiInv(0.5 + level / 2);
  const sd = Math.sqrt(variance);
  return [Math.max(0, mean - z * sd), mean + z * sd];
}
