import type { Category } from "./arena";

/**
 * Taste axes used ONLY by the recorded-fixture layer to generate plausible
 * affinities while no live key is available. In live mode Qloo supplies the
 * affinities and this profile is ignored.
 */
export type Axis =
  | "latin" | "hiphop" | "rock" | "pop" | "country" | "kpop"
  | "sports" | "comedy" | "premium" | "family" | "youth" | "health";

export type Vendor = {
  id: string; // stable slug used as the mock entity id
  name: string;
  category: Category;
  /** Qloo entity type to resolve against in live mode. */
  qlooType: "urn:entity:brand" | "urn:entity:place";
  premium?: boolean;
  profile: Partial<Record<Axis, number>>;
};

export const VENDORS: Vendor[] = [
  // Food
  { id: "shake-shack", name: "Shake Shack", category: "food", qlooType: "urn:entity:brand", profile: { pop: 0.6, youth: 0.5, hiphop: 0.4, premium: 0.3 } },
  { id: "chipotle", name: "Chipotle", category: "food", qlooType: "urn:entity:brand", profile: { youth: 0.6, health: 0.4, pop: 0.4, latin: 0.3 } },
  { id: "taco-bell", name: "Taco Bell", category: "food", qlooType: "urn:entity:brand", profile: { youth: 0.7, hiphop: 0.5, latin: 0.4, comedy: 0.3 } },
  { id: "nathans", name: "Nathan's Famous", category: "food", qlooType: "urn:entity:brand", profile: { sports: 0.8, family: 0.5, rock: 0.3 } },
  { id: "panda-express", name: "Panda Express", category: "food", qlooType: "urn:entity:brand", profile: { family: 0.6, kpop: 0.5, youth: 0.4 } },
  { id: "chick-fil-a", name: "Chick-fil-A", category: "food", qlooType: "urn:entity:brand", profile: { country: 0.7, family: 0.7, sports: 0.4 } },
  { id: "wingstop", name: "Wingstop", category: "food", qlooType: "urn:entity:brand", profile: { hiphop: 0.9, sports: 0.6, youth: 0.5 } },
  { id: "halal-guys", name: "The Halal Guys", category: "food", qlooType: "urn:entity:brand", profile: { hiphop: 0.5, youth: 0.5, latin: 0.3, comedy: 0.3 } },
  { id: "sweetgreen", name: "Sweetgreen", category: "food", qlooType: "urn:entity:brand", premium: true, profile: { health: 0.9, premium: 0.6, pop: 0.4 } },
  { id: "ben-jerrys", name: "Ben & Jerry's", category: "food", qlooType: "urn:entity:brand", profile: { family: 0.6, pop: 0.5, rock: 0.4, comedy: 0.4 } },
  { id: "dippin-dots", name: "Dippin' Dots", category: "food", qlooType: "urn:entity:brand", profile: { family: 0.8, kpop: 0.4, youth: 0.4 } },
  { id: "nobu", name: "Nobu", category: "food", qlooType: "urn:entity:place", premium: true, profile: { premium: 1.0, hiphop: 0.4, pop: 0.4, sports: 0.3 } },
  { id: "garrett-popcorn", name: "Garrett Popcorn", category: "food", qlooType: "urn:entity:brand", profile: { family: 0.6, comedy: 0.5, country: 0.3 } },
  // Drink
  { id: "modelo", name: "Modelo", category: "drink", qlooType: "urn:entity:brand", profile: { latin: 1.0, sports: 0.5, hiphop: 0.3 } },
  { id: "bud-light", name: "Bud Light", category: "drink", qlooType: "urn:entity:brand", profile: { country: 0.8, sports: 0.8, rock: 0.5 } },
  { id: "red-bull", name: "Red Bull", category: "drink", qlooType: "urn:entity:brand", profile: { youth: 0.8, rock: 0.5, hiphop: 0.5, kpop: 0.3 } },
  { id: "liquid-death", name: "Liquid Death", category: "drink", qlooType: "urn:entity:brand", profile: { rock: 0.9, youth: 0.6, comedy: 0.4 } },
  { id: "casamigos", name: "Casamigos", category: "drink", qlooType: "urn:entity:brand", premium: true, profile: { premium: 0.9, latin: 0.5, pop: 0.5, hiphop: 0.4 } },
  { id: "jack-daniels", name: "Jack Daniel's", category: "drink", qlooType: "urn:entity:brand", profile: { rock: 0.8, country: 0.8, sports: 0.3 } },
  { id: "coca-cola", name: "Coca-Cola", category: "drink", qlooType: "urn:entity:brand", profile: { family: 0.8, pop: 0.6, sports: 0.5, kpop: 0.4 } },
  { id: "celsius", name: "Celsius", category: "drink", qlooType: "urn:entity:brand", profile: { health: 0.8, youth: 0.6, pop: 0.4 } },
  { id: "white-claw", name: "White Claw", category: "drink", qlooType: "urn:entity:brand", profile: { pop: 0.8, youth: 0.6, country: 0.3, comedy: 0.3 } },
  { id: "stella-artois", name: "Stella Artois", category: "drink", qlooType: "urn:entity:brand", premium: true, profile: { premium: 0.7, rock: 0.3, sports: 0.4 } },
  { id: "hennessy", name: "Hennessy", category: "drink", qlooType: "urn:entity:brand", premium: true, profile: { hiphop: 1.0, premium: 0.6, sports: 0.3 } },
  // Merch
  { id: "nike", name: "Nike", category: "merch", qlooType: "urn:entity:brand", profile: { sports: 0.9, hiphop: 0.7, youth: 0.5 } },
  { id: "new-era", name: "New Era", category: "merch", qlooType: "urn:entity:brand", profile: { sports: 0.8, hiphop: 0.7, latin: 0.4 } },
  { id: "hot-topic", name: "Hot Topic", category: "merch", qlooType: "urn:entity:brand", profile: { rock: 0.9, youth: 0.6, kpop: 0.5 } },
  { id: "fanatics", name: "Fanatics", category: "merch", qlooType: "urn:entity:brand", profile: { sports: 1.0, family: 0.4 } },
  { id: "crocs", name: "Crocs", category: "merch", qlooType: "urn:entity:brand", profile: { youth: 0.6, pop: 0.6, comedy: 0.4, family: 0.3 } },
  { id: "vans", name: "Vans", category: "merch", qlooType: "urn:entity:brand", profile: { rock: 0.7, youth: 0.6, hiphop: 0.3 } },
  { id: "boot-barn", name: "Boot Barn", category: "merch", qlooType: "urn:entity:brand", profile: { country: 1.0, rock: 0.3 } },
  { id: "line-friends", name: "Line Friends", category: "merch", qlooType: "urn:entity:brand", profile: { kpop: 1.0, youth: 0.6, family: 0.3 } },
  // Sponsors
  { id: "state-farm", name: "State Farm", category: "sponsor", qlooType: "urn:entity:brand", profile: { sports: 0.8, family: 0.6, country: 0.4 } },
  { id: "t-mobile", name: "T-Mobile", category: "sponsor", qlooType: "urn:entity:brand", profile: { pop: 0.6, youth: 0.5, latin: 0.4, hiphop: 0.3 } },
  { id: "amex", name: "American Express", category: "sponsor", qlooType: "urn:entity:brand", premium: true, profile: { premium: 0.9, pop: 0.5, sports: 0.3 } },
  { id: "spotify", name: "Spotify", category: "sponsor", qlooType: "urn:entity:brand", profile: { pop: 0.7, hiphop: 0.6, latin: 0.5, kpop: 0.5, youth: 0.5 } },
  { id: "netflix", name: "Netflix", category: "sponsor", qlooType: "urn:entity:brand", profile: { comedy: 0.9, pop: 0.4, kpop: 0.4, family: 0.3 } },
  { id: "draftkings", name: "DraftKings", category: "sponsor", qlooType: "urn:entity:brand", profile: { sports: 1.0, hiphop: 0.3 } },
  { id: "toyota", name: "Toyota", category: "sponsor", qlooType: "urn:entity:brand", profile: { family: 0.7, country: 0.5, sports: 0.4, latin: 0.3 } },
  { id: "lululemon", name: "Lululemon", category: "sponsor", qlooType: "urn:entity:brand", premium: true, profile: { health: 0.9, premium: 0.6, pop: 0.5 } },
  { id: "samsung", name: "Samsung", category: "sponsor", qlooType: "urn:entity:brand", profile: { kpop: 0.9, youth: 0.5, sports: 0.3 } },
  { id: "corona", name: "Corona", category: "sponsor", qlooType: "urn:entity:brand", profile: { latin: 0.8, pop: 0.4, sports: 0.3 } },
];

export const vendorById = new Map(VENDORS.map((v) => [v.id, v]));
