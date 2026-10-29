// Crowd profile per event: the genre priors operators plan from, with sources.
// Genre is our classification of each act from public information (inference);
// when Qloo is live, its audience demographics replace the gender/age guesses.
import type { VenueEvent } from "../deep/venue";

export type Genre = "kpop" | "country" | "latin" | "rock" | "indie" | "rnb-hiphop" | "holiday-family" | "hockey";

export const GENRE_LABEL: Record<Genre, string> = {
  kpop: "K-pop / girl group",
  country: "Country",
  latin: "Latin rock",
  rock: "Rock / alternative",
  indie: "Indie / singer-songwriter",
  "rnb-hiphop": "R&B / hip-hop / soul",
  "holiday-family": "Holiday rock (family)",
  hockey: "NHL hockey",
};

/** Our reading of each act's genre, from public descriptions. Labelled inference on screen. */
const ACT_GENRE: [RegExp, Genre][] = [
  [/kraken/i, "hockey"],
  [/katseye|taemin|twice|stray kids|txt|bts|blackpink|seventeen/i, "kpop"],
  [/garth brooks|kacey musgraves|morgan wallen|zach bryan/i, "country"],
  [/man[áa]/i, "latin"],
  [/smashing pumpkins|gorillaz/i, "rock"],
  [/phoebe bridgers|beabadoobee/i, "indie"],
  [/bryson tiller|teddy swims|lauryn hill|wyclef/i, "rnb-hiphop"],
  [/trans-siberian/i, "holiday-family"],
];

export function genreOf(e: Pick<VenueEvent, "title" | "headliner" | "kind">): Genre {
  if (e.kind === "game") return "hockey";
  for (const [re, g] of ACT_GENRE) if (re.test(e.headliner) || re.test(e.title)) return g;
  return "indie";
}

export type Src = { value: number; status: "sourced" | "derived" | "assumption"; source: string };
const S = (value: number, status: Src["status"], source: string): Src => ({ value, status, source });

const ATVENU_YIR = "atVenu Year in Review 2025–26 (atvenu.com/year-in-review)";
const ATVENU_FAN = "atVenu fan spending report 2025 (genre $/head and % buying)";
const ATVENU_KPOP = "atVenu, K-pop merchandise sales, 2024-01-03";

/** Merch: share of fans who buy and $ per head, by genre. */
export const MERCH_PRIORS: Record<Genre, { buyRate: Src; perHead: Src }> = {
  kpop: { buyRate: S(0.37, "sourced", ATVENU_FAN), perHead: S(48.32, "sourced", ATVENU_FAN) },
  country: { buyRate: S(0.16, "sourced", `${ATVENU_FAN} (larger tours)`), perHead: S(13.5, "assumption", "All-genre $10.33 (atVenu 2026) lifted for country's +31% in 2025; no absolute published") },
  latin: { buyRate: S(0.15, "assumption", "No buy rate published; set below the 21% all-genre rate given Latin $/head"), perHead: S(7.46, "sourced", ATVENU_FAN) },
  rock: { buyRate: S(0.21, "sourced", ATVENU_FAN), perHead: S(9.5, "assumption", "All-genre $10.33 less hard rock's 2025 decline; no absolute published") },
  indie: { buyRate: S(0.22, "assumption", "atVenu arena/stadium 2025: 23% of fans bought"), perHead: S(10.33, "sourced", `${ATVENU_YIR}, all-genre 2026`) },
  "rnb-hiphop": { buyRate: S(0.2, "assumption", "No genre figure; near the 20–21% all-genre rate"), perHead: S(10.33, "assumption", "All-genre 2026 figure; no genre-specific number") },
  "holiday-family": { buyRate: S(0.2, "assumption", "No genre figure"), perHead: S(10.33, "assumption", "All-genre 2026 figure") },
  hockey: { buyRate: S(0.08, "assumption", "Regular-season team merch; LA Kings $3–5/head benchmark"), perHead: S(5, "assumption", "LA Kings regular-season $3–5/head; Kraken not published") },
};

/**
 * Food vs drink and the drink mix. Public genre splits do not exist at arena scale
 * (research-v2/06), so these are assumptions anchored on: games ~55–60% food,
 * concerts ~70% drink (SBJ "Menu mix", 2019); country leans to beer and dark
 * liquor; pop to vodka; Gen Z drinking less alcohol (Pollstar VenuesNow panel 2025).
 */
export const MIX_PRIORS: Record<Genre, { foodShare: Src; alcoholShareOfDrink: Src; note: string }> = {
  hockey: { foodShare: S(0.55, "sourced", "SBJ 'Menu mix' 2019: ballgames 55–60% food"), alcoholShareOfDrink: S(0.75, "assumption", "Adult crowd, beer-led"), note: "Food-led; intermission surges" },
  country: { foodShare: S(0.28, "assumption", "Concerts ~70% drink (SBJ 2019); country at the drink-heavy end (Wallen: 135,931 drinks over 2 shows)"), alcoholShareOfDrink: S(0.85, "assumption", "Beer and dark liquor lead"), note: "Beer volume, more bar points" },
  latin: { foodShare: S(0.3, "sourced", "SBJ 2019: concerts ~70% drink"), alcoholShareOfDrink: S(0.8, "assumption", "Beer-led (import draft)"), note: "Import beer (Modelo) forward" },
  rock: { foodShare: S(0.3, "sourced", "SBJ 2019: concerts ~70% drink"), alcoholShareOfDrink: S(0.8, "assumption", "Older crowd, beer-led"), note: "Beer and spirits" },
  indie: { foodShare: S(0.35, "assumption", "Younger crowd drinks less alcohol (Pollstar 2025)"), alcoholShareOfDrink: S(0.6, "assumption", "More NA, seltzer and coffee"), note: "NA and mocktails up" },
  "rnb-hiphop": { foodShare: S(0.32, "assumption", "Concert default"), alcoholShareOfDrink: S(0.75, "assumption", "Spirits and cocktails lead"), note: "Cocktails forward" },
  kpop: { foodShare: S(0.45, "assumption", "Young, mostly non-drinking crowd; water banned on the floor at TWICE (CPA FAQ)"), alcoholShareOfDrink: S(0.3, "assumption", "Many under 21"), note: "Water, NA, sweets; early arrivals" },
  "holiday-family": { foodShare: S(0.5, "assumption", "Family matinees skew to food"), alcoholShareOfDrink: S(0.5, "assumption", "Families"), note: "Family value items" },
};

/** Share of the crowd shopping women's or smaller cuts. Replaced by Qloo audience gender when live. */
export const FEMALE_SHARE: Record<Genre, Src> = {
  kpop: S(0.75, "assumption", "Inference; replaced by Qloo audience demographics when live"),
  indie: S(0.65, "assumption", "Inference; replaced by Qloo audience demographics when live"),
  country: S(0.55, "assumption", "Inference; replaced by Qloo audience demographics when live"),
  latin: S(0.5, "assumption", "Inference"),
  rock: S(0.4, "assumption", "Inference"),
  "rnb-hiphop": S(0.55, "assumption", "Inference"),
  "holiday-family": S(0.5, "assumption", "Inference"),
  hockey: S(0.4, "assumption", "Inference"),
};
