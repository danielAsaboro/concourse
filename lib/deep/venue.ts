// Climate Pledge Arena (Seattle), from the arena's own dining guide, maps and
// event feed, retrieved 2026-10-15. Every stand, item and event in
// data/climate-pledge-arena.json carries its source URL. What is NOT published
// (prices, equipment, register counts) is marked as an assumption here.
import data from "./data/climate-pledge-arena.json";

export type Level = "main" | "upper" | "club" | "both";
export type Category = "food" | "drink" | "merch";

export type Stand = (typeof data.stands)[number] & { level: Level; category: Category };
export type VenueEvent = (typeof data.events)[number];

export const VENUE = data.venue;
export const RETRIEVED = data.retrieved;
export const STANDS = data.stands as Stand[];
export const EVENTS = (data.events as VenueEvent[]).filter((e) => !e.cancelled);
export const CANCELLED = (data.events as VenueEvent[]).filter((e) => e.cancelled);
export const MERCH_POINTS = data.merch;

export const standById = new Map(STANDS.map((s) => [s.id, s]));
export const eventById = new Map(EVENTS.map((e) => [e.id, e]));

/** What a location can physically run. Inferred from published menus; no source lists equipment. */
export type Capability = "griddle" | "fryer" | "oven" | "steam" | "warmer" | "cold" | "roller" | "coffee" | "softserve" | "bar";

/**
 * Locations whose concept can change from one event to the next.
 * - Chef's Table: the arena says it rotates (six menus a season per the 2025-26 release).
 * - The Pepsi Marketplace: "Rotating Chef Favorites" on the arena guide.
 * - Portable points: drinks-only entries in the arena's own stand data with no public card,
 *   plus the Starbucks cart and the Bavarian Meats cart. Treating them as positions that can
 *   take a food cart is an ASSUMPTION.
 */
export type FlexSlot = {
  id: string;
  label: string;
  level: Level;
  sections: string[];
  kind: "rotating-stand" | "cart";
  capabilities: Capability[];
  /** Points of sale. ASSUMPTION: 4 at a stand, 2 at a cart. */
  servers: number;
  /** Concept running there by default, if published. */
  statusQuo: string | null;
  source: string;
  assumptions: string[];
  /** The entry in the arena's own stand data this location corresponds to (for the 3D view). */
  venueId: string;
};

export const FLEX_SLOTS: FlexSlot[] = [
  { id: "chefs-table", label: "Chef's Table (club, sec 01 & 14)", level: "club", sections: ["01", "14"], kind: "rotating-stand", capabilities: ["griddle", "steam", "warmer", "cold", "oven"], servers: 4, statusQuo: null, source: "https://www.climatepledgearena.com/food-beverage", assumptions: ["kitchen capabilities assumed from 'rotating seasonal menus'", "4 points of sale"], venueId: "cpa-1056" },
  { id: "pepsi-marketplace", label: "The Pepsi Marketplace feature (sec 124)", level: "upper", sections: ["124"], kind: "rotating-stand", capabilities: ["griddle", "steam", "warmer", "cold"], servers: 4, statusQuo: "mollyd", source: "https://www.climatepledgearena.com/food-beverage", assumptions: ["capabilities inferred from the MollyD burger it lists", "4 points of sale"], venueId: "cpa-24709" },
  { id: "cart-04", label: "Portable, main concourse sec 04", level: "main", sections: ["04"], kind: "cart", capabilities: ["coffee", "warmer", "cold"], servers: 2, statusQuo: "starbucks-cart", source: "https://www.nhl.com/kraken/arena/food-and-beverage", assumptions: ["2 points of sale"], venueId: "cpa-cart-starbucks" },
  { id: "cart-12", label: "Portable, main concourse sec 12", level: "main", sections: ["12", "17"], kind: "cart", capabilities: ["warmer", "cold", "roller"], servers: 2, statusQuo: null, source: "https://www.climatepledgearena.com/wp-json/wp/v2/dining_stands?per_page=100", assumptions: ["drinks point (Mt Baker Beverage) assumed able to host a food cart", "2 points of sale"], venueId: "cpa-11891" },
  { id: "cart-16", label: "Portable, main concourse sec 16/25", level: "main", sections: ["16", "25"], kind: "cart", capabilities: ["warmer", "cold", "roller"], servers: 2, statusQuo: null, source: "https://www.climatepledgearena.com/wp-json/wp/v2/dining_stands?per_page=100", assumptions: ["drinks point (PNW Crafts Beers) assumed able to host a food cart", "2 points of sale"], venueId: "cpa-11889" },
  { id: "cart-114", label: "Portable, upper concourse sec 114", level: "upper", sections: ["114"], kind: "cart", capabilities: ["warmer", "cold", "roller"], servers: 2, statusQuo: null, source: "https://www.climatepledgearena.com/wp-json/wp/v2/dining_stands?per_page=100", assumptions: ["drinks point (Kraken Rum Bar) assumed able to host a food cart", "2 points of sale"], venueId: "cpa-29362" },
];

/**
 * Concepts that can run in a flexible location. All already operate in the
 * building (so contracts, permits and suppliers exist). Live Qloo adds local
 * places near the venue to this pool; they are never invented here.
 */
export type Concept = {
  id: string;
  name: string;
  category: Category;
  needs: Capability[];
  /** Where it normally runs in the arena (stand id), for provenance. */
  from: string | null;
  /** The item a cart or rotating stand would sell, from the arena's published menu. */
  hero: string;
  /**
   * How Qloo sees it: a named entity to resolve (place near the venue, or brand) and a
   * cuisine/product tag to fall back on when the name does not resolve. Resolution is
   * checked on the first live call; nothing here is assumed to exist in Qloo.
   */
  qloo: { name?: string; type?: "urn:entity:place" | "urn:entity:brand"; tag: string };
  premium?: boolean;
  perishable: boolean;
};

export const CONCEPTS: Concept[] = [
  { id: "piroshky", name: "Piroshky Piroshky", category: "food", needs: ["warmer"], from: "cpa-17951", hero: "Beef & Potato Piroshky", qloo: { name: "Piroshky Piroshky", type: "urn:entity:place", tag: "Russian" }, perishable: true },
  { id: "fisher-scones", name: "Fisher Scones", category: "food", needs: ["warmer"], from: "cpa-24711", hero: "Classic Fisher scone", qloo: { name: "Fisher Scones", type: "urn:entity:brand", tag: "Bakery" }, perishable: true },
  { id: "beechers", name: "Mercer St Mac + BBQ (Beecher's)", category: "food", needs: ["steam"], from: "cpa-10512", hero: "Beechers Mac + Cheese", qloo: { name: "Beecher's Handmade Cheese", type: "urn:entity:place", tag: "Comfort food" }, perishable: true },
  { id: "bristol-bay", name: "Bristol Bay (salmon dip)", category: "food", needs: ["cold"], from: "cpa-10502", hero: "Salmon Dip with Kettle Chips", qloo: { tag: "Seafood" }, perishable: true },
  { id: "bavarian-meats", name: "Bavarian Meats", category: "food", needs: ["roller"], from: null, hero: "The Arena Dog", qloo: { name: "Bavarian Meats", type: "urn:entity:place", tag: "German" }, perishable: true },
  { id: "starbucks-cart", name: "Starbucks cart", category: "drink", needs: ["coffee"], from: "cpa-cart-starbucks", hero: "Hot Drip Coffee", qloo: { name: "Starbucks", type: "urn:entity:brand", tag: "Coffee" }, perishable: false },
  { id: "local-lolli", name: "Local Lolli sweets", category: "food", needs: ["cold"], from: "cpa-10507", hero: "Cookies", qloo: { tag: "Dessert" }, perishable: false },
  { id: "poke", name: "Poké", category: "food", needs: ["cold"], from: "cpa-10505", hero: "Spam Musubi", qloo: { tag: "Hawaiian" }, perishable: true },
  { id: "dumpling-house", name: "Dumpling House", category: "food", needs: ["steam"], from: "cpa-17954", hero: "Chicken Soup Dumplings", qloo: { tag: "Chinese" }, perishable: true },
  { id: "no-guey", name: "¡No Güey! birria", category: "food", needs: ["griddle", "steam"], from: "cpa-17942", hero: "Birria Tacos", qloo: { tag: "Mexican" }, perishable: true },
  { id: "mollyd", name: "MollyD Burgers", category: "food", needs: ["griddle"], from: "cpa-1053", hero: "MollyD Single Burger", qloo: { tag: "Burgers" }, perishable: true },
  { id: "impossible", name: "IMPOSSIBLE Test Kitchen", category: "food", needs: ["griddle", "steam"], from: "cpa-1048", hero: "Korean BBQ IMPOSSIBLE Beef Bowl", qloo: { name: "Impossible Foods", type: "urn:entity:brand", tag: "Vegetarian" }, perishable: true },
  { id: "sea-and-sound", name: "Sea & Sound crab roll", category: "food", needs: ["cold", "griddle"], from: "cpa-10736", hero: "Crab Roll", qloo: { tag: "Seafood" }, premium: true, perishable: true },
];

export function canRun(slot: FlexSlot, c: Concept): boolean {
  return c.needs.every((n) => slot.capabilities.includes(n));
}

/** Capacity for tonight's event type, from the arena FAQ. */
export function capacityFor(e: VenueEvent): number {
  return e.kind === "game" ? VENUE.capacity.hockey : VENUE.capacity.concert;
}
