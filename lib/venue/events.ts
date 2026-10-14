import type { Axis } from "./catalogue";

export type Anchor = {
  id: string; // slug used by the mock layer; resolved to a Qloo id in live mode
  name: string;
  qlooType: "urn:entity:artist" | "urn:entity:person" | "urn:entity:tv_show" | "urn:entity:brand";
  weight: number;
};

export type VenueEvent = {
  id: string;
  title: string;
  kind: "concert" | "game" | "comedy";
  date: string;
  /** Who tonight's crowd came for. These are the Qloo signal entities. */
  anchors: Anchor[];
  /** Mock-only crowd profile across the catalogue's taste axes. */
  profile: Partial<Record<Axis, number>>;
  /** Mock-only demographic offsets, shaped like urn:demographics. */
  demographics: { age: Record<string, number>; gender: Record<string, number> };
  expectedAttendance: number;
};

export const EVENTS: VenueEvent[] = [
  {
    id: "bad-bunny",
    title: "Bad Bunny",
    kind: "concert",
    date: "Fri 16 Oct",
    anchors: [
      { id: "bad-bunny", name: "Bad Bunny", qlooType: "urn:entity:artist", weight: 1 },
      { id: "karol-g", name: "Karol G", qlooType: "urn:entity:artist", weight: 0.4 },
    ],
    profile: { latin: 1, hiphop: 0.5, youth: 0.7, pop: 0.5, premium: 0.3 },
    demographics: {
      age: { "24_and_younger": 0.42, "25_to_29": 0.38, "30_to_34": 0.12, "35_to_44": -0.21, "45_to_54": -0.46, "55_and_older": -0.58 },
      gender: { male: -0.06, female: 0.06 },
    },
    expectedAttendance: 18500,
  },
  {
    id: "lakers-celtics",
    title: "Lakers vs Celtics",
    kind: "game",
    date: "Sat 17 Oct",
    anchors: [
      { id: "lebron-james", name: "LeBron James", qlooType: "urn:entity:person", weight: 1 },
      { id: "jayson-tatum", name: "Jayson Tatum", qlooType: "urn:entity:person", weight: 0.6 },
    ],
    profile: { sports: 1, hiphop: 0.6, premium: 0.5, family: 0.4, youth: 0.3 },
    demographics: {
      age: { "24_and_younger": -0.05, "25_to_29": 0.18, "30_to_34": 0.31, "35_to_44": 0.29, "45_to_54": 0.02, "55_and_older": -0.3 },
      gender: { male: 0.22, female: -0.22 },
    },
    expectedAttendance: 19000,
  },
  {
    id: "metallica",
    title: "Metallica",
    kind: "concert",
    date: "Sun 18 Oct",
    anchors: [
      { id: "metallica", name: "Metallica", qlooType: "urn:entity:artist", weight: 1 },
      { id: "pantera", name: "Pantera", qlooType: "urn:entity:artist", weight: 0.5 },
    ],
    profile: { rock: 1, country: 0.3, sports: 0.3, premium: 0.2 },
    demographics: {
      age: { "24_and_younger": -0.3, "25_to_29": -0.1, "30_to_34": 0.08, "35_to_44": 0.35, "45_to_54": 0.48, "55_and_older": 0.21 },
      gender: { male: 0.3, female: -0.3 },
    },
    expectedAttendance: 17800,
  },
  {
    id: "morgan-wallen",
    title: "Morgan Wallen",
    kind: "concert",
    date: "Thu 22 Oct",
    anchors: [
      { id: "morgan-wallen", name: "Morgan Wallen", qlooType: "urn:entity:artist", weight: 1 },
      { id: "luke-combs", name: "Luke Combs", qlooType: "urn:entity:artist", weight: 0.5 },
    ],
    profile: { country: 1, sports: 0.4, family: 0.3, youth: 0.4, pop: 0.3 },
    demographics: {
      age: { "24_and_younger": 0.21, "25_to_29": 0.33, "30_to_34": 0.2, "35_to_44": 0.05, "45_to_54": -0.25, "55_and_older": -0.4 },
      gender: { male: 0.05, female: -0.05 },
    },
    expectedAttendance: 18200,
  },
  {
    id: "blackpink",
    title: "BLACKPINK",
    kind: "concert",
    date: "Sat 24 Oct",
    anchors: [
      { id: "blackpink", name: "BLACKPINK", qlooType: "urn:entity:artist", weight: 1 },
      { id: "bts", name: "BTS", qlooType: "urn:entity:artist", weight: 0.4 },
    ],
    profile: { kpop: 1, pop: 0.7, youth: 0.9, family: 0.3, health: 0.3 },
    demographics: {
      age: { "24_and_younger": 0.66, "25_to_29": 0.3, "30_to_34": -0.05, "35_to_44": -0.3, "45_to_54": -0.5, "55_and_older": -0.6 },
      gender: { male: -0.28, female: 0.28 },
    },
    expectedAttendance: 18800,
  },
  {
    id: "dave-chappelle",
    title: "Dave Chappelle",
    kind: "comedy",
    date: "Fri 30 Oct",
    anchors: [
      { id: "dave-chappelle", name: "Dave Chappelle", qlooType: "urn:entity:person", weight: 1 },
      { id: "chris-rock", name: "Chris Rock", qlooType: "urn:entity:person", weight: 0.5 },
    ],
    profile: { comedy: 1, hiphop: 0.6, premium: 0.4, pop: 0.3 },
    demographics: {
      age: { "24_and_younger": -0.2, "25_to_29": 0.1, "30_to_34": 0.3, "35_to_44": 0.35, "45_to_54": 0.1, "55_and_older": -0.2 },
      gender: { male: 0.12, female: -0.12 },
    },
    expectedAttendance: 16500,
  },
];

export const eventById = new Map(EVENTS.map((e) => [e.id, e]));
