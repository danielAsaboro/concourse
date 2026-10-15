// Par levels: how much to prep or stock for one item for one event.
// Classic newsvendor with normally approximated demand.
import { PhiInv, normalLoss } from "./stats";

export type NewsvendorInput = {
  meanDemand: number;
  sdDemand: number;
  price: number;
  unitCost: number;
  /** Value recovered per leftover unit (0 for perishables that are thrown away). */
  salvage: number;
};

export type NewsvendorResult = {
  criticalRatio: number;
  /** Units to prep, rounded up. */
  quantity: number;
  expectedSales: number;
  expectedLeftover: number;
  expectedShort: number;
  expectedProfit: number;
};

export function newsvendor(n: NewsvendorInput): NewsvendorResult {
  const under = n.price - n.unitCost; // margin lost per unit short
  const over = n.unitCost - n.salvage; // cost per unit left over
  const cr = under / (under + over);
  const z = n.sdDemand > 0 ? PhiInv(cr) : 0;
  const q = Math.max(0, Math.ceil(n.meanDemand + z * n.sdDemand));
  const zq = n.sdDemand > 0 ? (q - n.meanDemand) / n.sdDemand : 0;
  const short = n.sdDemand > 0 ? n.sdDemand * normalLoss(zq) : Math.max(0, n.meanDemand - q);
  const sales = n.meanDemand - short;
  const leftover = q - sales;
  return {
    criticalRatio: cr,
    quantity: q,
    expectedSales: sales,
    expectedLeftover: leftover,
    expectedShort: short,
    expectedProfit: sales * n.price + leftover * n.salvage - q * n.unitCost,
  };
}
