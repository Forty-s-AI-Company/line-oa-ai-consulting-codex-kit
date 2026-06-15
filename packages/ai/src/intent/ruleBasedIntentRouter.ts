import type { IntentRouter } from "../interfaces.js";
import type { Domain, IntentResult, PrimaryIntent } from "@repo/shared";
import { clamp01 } from "@repo/shared";

const DOMAIN_KEYWORDS: Array<{ domain: Domain; intent: PrimaryIntent; keywords: string[] }> = [
  {
    domain: "nutrition",
    intent: "nutrition_consulting",
    keywords: ["營養", "外食", "補充", "蛋白質", "蔬菜", "維他命", "礦物質", "保健", "體力", "疲勞"]
  },
  {
    domain: "beauty",
    intent: "beauty_consulting",
    keywords: ["保養", "皮膚", "膚況", "美白", "痘痘", "乾燥", "抗老", "膠原"]
  },
  {
    domain: "cleaning",
    intent: "cleaning_consulting",
    keywords: ["清潔", "洗衣", "廚房", "浴室", "去污", "除臭", "家用"]
  },
  {
    domain: "water",
    intent: "water_consulting",
    keywords: ["水", "淨水", "濾水", "喝水", "水質", "濾芯"]
  },
  {
    domain: "air",
    intent: "air_consulting",
    keywords: ["空氣", "空氣清淨", "PM2.5", "過敏", "灰塵", "異味"]
  },
  {
    domain: "business",
    intent: "business_consulting",
    keywords: ["創業", "副業", "收入", "獎金", "直銷", "團隊", "邀約", "成交"]
  }
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
  if (/(治療|治癒|診斷|用藥|懷孕|癌|腎|糖尿病|高血壓)/.test(t)) hints.push("health_claim");
  if (/(保證|一定有效|百分百|根治)/.test(t)) hints.push("guarantee_language");
  if (/(保證收入|穩賺|月入|被動收入)/.test(t)) hints.push("income_claim");
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
