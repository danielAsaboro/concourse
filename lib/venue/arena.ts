export type Zone = "lower" | "upper" | "club" | "plaza";
export type Category = "food" | "drink" | "merch" | "sponsor";

export type Stand = {
  id: string;
  label: string;
  zone: Zone;
  category: Category;
  /** Angle around the bowl in radians. */
  angle: number;
  /** Distance from centre, in scene units. */
  radius: number;
  /** Height of the stand's floor. */
  y: number;
  /** Operator-set priority: 1 fills first. The club fills first so premium partners land there. */
  priority: number;
  /** Rough share of the night's foot traffic, for the impact estimate. */
  traffic: number;
};

const TAU = Math.PI * 2;

function ring(
  prefix: string,
  label: string,
  n: number,
  zone: Zone,
  categories: Category[],
  radius: number,
  y: number,
  startPriority: number,
  traffic: number,
  offset = 0,
): Stand[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    label: `${label} ${i + 1}`,
    zone,
    category: categories[i % categories.length],
    angle: offset + (i / n) * TAU,
    radius,
    y,
    priority: startPriority + i,
    traffic,
  }));
}

/**
 * A synthetic 20-stand arena. Qloo knows nothing about stadium sections;
 * this layout is the venue's own data and would come from the operator.
 */
export const STANDS: Stand[] = [
  // Lower concourse: 8 stands, alternating food and drink.
  ...ring("L", "Lower", 8, "lower", ["food", "drink"], 9.2, 0.6, 3, 0.08, TAU / 16),
  // Upper concourse: 6 stands.
  ...ring("U", "Upper", 6, "upper", ["food", "drink", "food"], 12.4, 4.4, 11, 0.04, TAU / 12),
  // Premium club: 2 stands (one food, one drink) behind the stage end.
  { id: "C1", label: "Club East", zone: "club", category: "food", angle: Math.PI * 0.5 - 0.25, radius: 7.4, y: 2.2, priority: 1, traffic: 0.03 },
  { id: "C2", label: "Club West", zone: "club", category: "drink", angle: Math.PI * 0.5 + 0.25, radius: 7.4, y: 2.2, priority: 2, traffic: 0.03 },
  // Merch: two main stores at the entrances.
  { id: "M1", label: "Merch North", zone: "lower", category: "merch", angle: Math.PI * 1.5, radius: 9.6, y: 0.6, priority: 17, traffic: 0.1 },
  { id: "M2", label: "Merch South", zone: "lower", category: "merch", angle: Math.PI * 0.5, radius: 9.6, y: 0.6, priority: 18, traffic: 0.06 },
  // Sponsor activations on the outer plaza.
  { id: "P1", label: "Plaza A", zone: "plaza", category: "sponsor", angle: Math.PI * 1.25, radius: 15.5, y: 0, priority: 19, traffic: 0.05 },
  { id: "P2", label: "Plaza B", zone: "plaza", category: "sponsor", angle: Math.PI * 1.75, radius: 15.5, y: 0, priority: 20, traffic: 0.05 },
];

export const ZONE_LABEL: Record<Zone, string> = {
  lower: "Lower concourse",
  upper: "Upper concourse",
  club: "Premium club",
  plaza: "Outer plaza",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  food: "Food partner",
  drink: "Drink partner",
  merch: "Merch",
  sponsor: "Sponsor activation",
};
