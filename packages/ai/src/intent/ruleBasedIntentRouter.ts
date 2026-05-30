import type { IntentRouter } from "../interfaces.js";
import type { Domain, IntentResult, PrimaryIntent } from "@repo/shared";
import { clamp01 } from "@repo/shared";

const DOMAIN_KEYWORDS: Array<{ domain: Domain; intent: PrimaryIntent; keywords: string[] }> = [
  { domain: "nutrition", intent: "nutrition_consulting", keywords: ["營養", "保健", "體力", "睡眠", "腸胃", "免疫"] },
  { domain: "beauty", intent: "beauty_consulting", keywords: ["保養", "肌膚", "痘痘", "敏感", "美白", "抗老"] },
  { domain: "cleaning", intent: "cleaning_consulting", keywords: ["清潔", "洗衣", "去汙", "除臭", "廚房", "浴室"] },
  { domain: "water", intent: "water_consulting", keywords: ["水", "濾水", "淨水", "水質", "喝水"] },
  { domain: "air", intent: "air_consulting", keywords: ["空氣", "空清", "過敏", "粉塵", "PM2.5"] },
  { domain: "business", intent: "business_consulting", keywords: ["創業", "兼職", "收入", "賺錢", "事業", "機會"] }
];

function pickBestIntent(text: string): { intent: PrimaryIntent; domain: Domain; score: number } | null {
  const t = text.toLowerCase();
  let best: { intent: PrimaryIntent; domain: Domain; score: number } | null = null;
  for (const row of DOMAIN_KEYWORDS) {
    let score = 0;
    for (const kw of row.keywords) {
      if (t.includes(kw.toLowerCase())) score += 1;
    }
    if (score <= 0) continue;
    if (!best || score > best.score) best = { intent: row.intent, domain: row.domain, score };
  }
  return best;
}

function detectRiskHints(text: string): string[] {
  const hints: string[] = [];
  const t = text.toLowerCase();
  if (/(治癒|根治|包治|療效|醫生)/.test(t)) hints.push("health_claim");
  if (/(保證|一定|百分之百|必然)/.test(t)) hints.push("guarantee_language");
  if (/(賺錢|月入|被動收入|保證收入)/.test(t)) hints.push("income_claim");
  return hints;
}

export class RuleBasedIntentRouter implements IntentRouter {
  classify(input: { message: string; recentMessages: Array<{ role: string; content: string }> }): IntentResult {
    const msg = input.message.trim();
    const best = pickBestIntent(msg);
    const riskHints = detectRiskHints(msg);
    const confidence = clamp01(best ? Math.min(0.9, 0.35 + best.score * 0.15) : 0.25);

    const primaryIntent: PrimaryIntent = best?.intent ?? "unknown";
    const domain: Domain = best?.domain ?? "unknown";
    const retrievalNeeded = primaryIntent !== "small_talk" && primaryIntent !== "onboarding";
    const escalationNeeded = confidence < 0.35 || riskHints.includes("health_claim");

    return {
      primaryIntent,
      secondaryIntents: [],
      domain,
      confidence,
      retrievalNeeded,
      escalationNeeded,
      riskHints,
      missingFields: []
    };
  }
}

