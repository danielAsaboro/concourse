// Shapes mirror Qloo's public API responses (docs.qloo.com) so that the
// mock layer and the live client are interchangeable.

export type QlooEntity = {
  name: string;
  entity_id: string;
  type: "urn:entity";
  subtype: string; // e.g. urn:entity:brand
  popularity?: number;
  tags?: { id: string; name: string; type: string }[];
  query?: {
    affinity?: number;
    measurements?: Record<string, number>;
    explainability?: {
      "signal.interests.entities"?: Record<string, number>;
    };
  };
};

export type InsightsEntitiesResponse = {
  success: boolean;
  results: { entities: QlooEntity[] };
  query?: {
    explainability?: Record<string, unknown>;
  };
  duration?: number;
};

export type DemographicsResponse = {
  success: boolean;
  results: {
    demographics: {
      entity_id: string;
      query: {
        age: Record<string, number>;
        gender: Record<string, number>;
      };
    }[];
  };
};

export type CompareTag = {
  tag_id: string;
  name: string;
  subtype: string;
  query: { a: { affinity: number }; b: { affinity: number }; delta: number };
};

export type CompareResponse = {
  success: boolean;
  results: { tags: CompareTag[] };
};

export type SearchResponse = {
  results: { name: string; entity_id: string; types: string[]; popularity?: number }[];
};

export type QlooMode = "live" | "mock";

// One recorded call, shown in the UI's evidence ledger. The request is kept
// redacted (no key); the response is summarised, never dumped in full.
export type LedgerEntry = {
  id: string;
  mode: QlooMode;
  endpoint: string;
  params: Record<string, string>;
  summary: string;
  ms: number;
};
