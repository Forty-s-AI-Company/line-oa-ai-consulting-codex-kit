export type Domain = "nutrition" | "beauty" | "cleaning" | "water" | "air" | "business" | "unknown";

export type RiskLevel = "low" | "medium" | "high" | "block";

export type PrimaryIntent =
  | "nutrition_consulting"
  | "beauty_consulting"
  | "cleaning_consulting"
  | "water_consulting"
  | "air_consulting"
  | "business_consulting"
  | "customer_service"
  | "onboarding"
  | "small_talk"
  | "unknown";

export type IntentResult = {
  primaryIntent: PrimaryIntent;
  secondaryIntents: PrimaryIntent[];
  domain: Domain;
  confidence: number; // 0..1
  retrievalNeeded: boolean;
  escalationNeeded: boolean;
  riskHints: string[];
  missingFields: string[];
};

export type RetrievalChunk = {
  id: string;
  title: string;
  domain: Domain;
  content: string;
  score: number; // higher is better
  source: {
    sourceType: string;
    sourcePath: string;
    chunkIndex: number;
  };
  complianceLevel?: "normal" | "cautious" | "strict";
};

export type SafetyDecision =
  | { action: "allow"; riskLevel: Exclude<RiskLevel, "block">; reasons: string[]; hints: string[] }
  | { action: "downgrade"; riskLevel: Exclude<RiskLevel, "block">; reasons: string[]; hints: string[] }
  | { action: "escalate"; riskLevel: Exclude<RiskLevel, "block">; reasons: string[]; hints: string[] }
  | { action: "block"; riskLevel: "block"; reasons: string[]; hints: string[] };

export type ComposedAnswer = {
  text: string;
  citations: Array<{ chunkId: string; title: string; sourcePath: string }>;
};

