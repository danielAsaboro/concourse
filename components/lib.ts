// Client-side helpers shared by the landing page, the dashboard and the arena.
import type { Category, Zone } from "@/lib/venue/arena";

/** True in the static hosted preview, where the landing page and the app share one URL. */
export const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW === "1";

export type View = "overview" | "events" | "tonight";
export const VIEWS: View[] = ["overview", "events", "tonight"];

/** Link into the dashboard at a given view. */
export function appHref(view: View = "overview") {
  return PREVIEW ? `#${view}` : `/dashboard#${view}`;
}
export const HOME_HREF = PREVIEW ? "#home" : "/";
/** The real-venue planner (app/night). It needs the server-side solver, so the static preview has no copy of it. */
export const NIGHT_HREF = PREVIEW ? "" : "/night";
/** The walkable model of the real arena (app/venue). The static preview links to its own hosted build. */
export const VENUE3D_HREF = PREVIEW ? "https://claude.ai/artifact/WF8ujxiPSWBUsHENYuZ58n" : "/venue";
export const VENUE3D_LINK = PREVIEW ? { href: VENUE3D_HREF, target: "_blank", rel: "noreferrer" } : { href: VENUE3D_HREF };

/** Set once the repository is public; the licence line links to it. */
export const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL || "";
export const VENUE = { name: "Northside Arena", note: "Synthetic demo venue" };

export type FitLevel = 0 | 1 | 2 | 3 | 4;

/** Crowd fit as a level on the five-step ramp. */
export function fitLevel(fit: number): FitLevel {
  if (fit >= 0.82) return 4;
  if (fit >= 0.7) return 3;
  if (fit >= 0.58) return 2;
  if (fit >= 0.45) return 1;
  return 0;
}
const FIT_WORDS = ["Weak", "Fair", "Fair", "Good", "Strong"] as const;
export function fitWord(fit: number) {
  return FIT_WORDS[fitLevel(fit)];
}
export const fitVar = (fit: number) => `var(--fit-${fitLevel(fit)})`;

/** Words for an anchor's relative share of a score. No percentages, by design. */
export function driverWord(share: number, max: number) {
  const r = max > 0 ? share / max : 0;
  if (r > 0.85) return "Main driver";
  if (r > 0.45) return "Strong";
  return "Supporting";
}

export const fmt = {
  fit: (n: number) => n.toFixed(2),
  int: (n: number) => n.toLocaleString("en-US"),
};

export const ZONE_SHORT: Record<Zone, string> = { lower: "Lower", upper: "Upper", club: "Club", plaza: "Plaza" };
export const ZONE_ORDER: Zone[] = ["club", "lower", "upper", "plaza"];
export const CAT_SHORT: Record<Category, string> = { food: "Food", drink: "Drink", merch: "Merch", sponsor: "Sponsor" };

export const KIND_LABEL: Record<string, string> = { concert: "Concert", game: "Game", comedy: "Comedy" };

/**
 * Sign colours for the kiosks in the 3D scene. Approximations of each brand's
 * primary colour, used only on the fascia sign; no logos are reproduced.
 */
export const BRAND: Record<string, { bg: string; fg: string }> = {
  "shake-shack": { bg: "#1F1F1F", fg: "#7AB648" },
  chipotle: { bg: "#441500", fg: "#F8EFE2" },
  "taco-bell": { bg: "#702082", fg: "#FFFFFF" },
  nathans: { bg: "#0B6B3A", fg: "#FFD200" },
  "panda-express": { bg: "#D02030", fg: "#FFFFFF" },
  "chick-fil-a": { bg: "#DD0031", fg: "#FFFFFF" },
  wingstop: { bg: "#00563F", fg: "#FFFFFF" },
  "halal-guys": { bg: "#FFD100", fg: "#B5121B" },
  sweetgreen: { bg: "#0E4D2F", fg: "#F3F0E6" },
  "ben-jerrys": { bg: "#6CBCE9", fg: "#1D3A6B" },
  "dippin-dots": { bg: "#003B71", fg: "#FFFFFF" },
  nobu: { bg: "#111111", fg: "#E8E1D3" },
  "garrett-popcorn": { bg: "#5C2D0E", fg: "#F2C94C" },
  modelo: { bg: "#0C2340", fg: "#C9A74A" },
  "bud-light": { bg: "#1F4FA3", fg: "#FFFFFF" },
  "red-bull": { bg: "#1A1F4D", fg: "#E21B4D" },
  "liquid-death": { bg: "#111111", fg: "#F2F2F2" },
  casamigos: { bg: "#F1EEE7", fg: "#1E1E1E" },
  "jack-daniels": { bg: "#121212", fg: "#F2F2F2" },
  "coca-cola": { bg: "#E41E2B", fg: "#FFFFFF" },
  celsius: { bg: "#F4F4F4", fg: "#111111" },
  "white-claw": { bg: "#FFFFFF", fg: "#111111" },
  "stella-artois": { bg: "#B8202E", fg: "#F3E3B5" },
  hennessy: { bg: "#1A1A1A", fg: "#C8A15A" },
  nike: { bg: "#111111", fg: "#FFFFFF" },
  "new-era": { bg: "#0A0A0A", fg: "#FFFFFF" },
  "hot-topic": { bg: "#151515", fg: "#E1251B" },
  fanatics: { bg: "#0B2C5F", fg: "#FFFFFF" },
  crocs: { bg: "#7CB342", fg: "#FFFFFF" },
  vans: { bg: "#C8102E", fg: "#FFFFFF" },
  "boot-barn": { bg: "#3B2416", fg: "#E9D6B4" },
  "line-friends": { bg: "#FFE14D", fg: "#1E1E1E" },
  "state-farm": { bg: "#D62311", fg: "#FFFFFF" },
  "t-mobile": { bg: "#E20074", fg: "#FFFFFF" },
  amex: { bg: "#006FCF", fg: "#FFFFFF" },
  spotify: { bg: "#121212", fg: "#1ED760" },
  netflix: { bg: "#141414", fg: "#E50914" },
  draftkings: { bg: "#1B1B1B", fg: "#53D337" },
  toyota: { bg: "#EB0A1E", fg: "#FFFFFF" },
  lululemon: { bg: "#D31F3A", fg: "#FFFFFF" },
  samsung: { bg: "#1428A0", fg: "#FFFFFF" },
  corona: { bg: "#F6E7B0", fg: "#0E2A6B" },
};
export const brandOf = (id: string) => BRAND[id] ?? { bg: "#2A2D33", fg: "#FFFFFF" };
