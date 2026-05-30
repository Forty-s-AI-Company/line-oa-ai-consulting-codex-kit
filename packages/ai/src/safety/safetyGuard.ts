import type { SafetyGuard } from "../interfaces.js";
import type { IntentResult, SafetyDecision } from "@repo/shared";

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

const HEALTH_BLOCK = [/處方藥/, /停藥/, /替代醫生/, /診斷/];
const HEALTH_HIGH = [/治癒/, /根治/, /包治/, /療效保證/];
const BEAUTY_GUARANTEE = [/一定改善/, /保證變白/, /百分之百/];
const BUSINESS_GUARANTEE = [/保證收入/, /月入\d+/, /躺著賺/, /被動收入保證/];

export class RuleBasedSafetyGuard implements SafetyGuard {
  inspect(input: { userMessage: string; intent: IntentResult; draftAnswer: string }): SafetyDecision {
    const text = `${input.userMessage}\n${input.draftAnswer}`.toLowerCase();
    const reasons: string[] = [];
    const hints: string[] = [];

    if (hasAny(text, HEALTH_BLOCK)) {
      reasons.push("涉及醫療診斷或停藥等高風險建議");
      hints.push("建議尋求醫師/藥師");
      return { action: "block", riskLevel: "block", reasons, hints };
    }

    if (hasAny(text, HEALTH_HIGH)) {
      reasons.push("出現治癒/根治/保證療效等不安全確定性");
      hints.push("改用保守描述，避免承諾療效");
      return { action: "downgrade", riskLevel: "high", reasons, hints };
    }

    if (hasAny(text, BUSINESS_GUARANTEE)) {
      reasons.push("涉及保證收入或誇大商機");
      hints.push("改為分享一般經驗與條件，避免保證");
      return { action: "downgrade", riskLevel: "high", reasons, hints };
    }

    if (hasAny(text, BEAUTY_GUARANTEE)) {
      reasons.push("涉及保養效果保證或過度確定");
      hints.push("加入因人而異、先做局部測試等提醒");
      return { action: "downgrade", riskLevel: "medium", reasons, hints };
    }

    // Escalate when router already hints high risk.
    if (input.intent.riskHints.includes("health_claim")) {
      reasons.push("使用者可能在尋求健康相關確定性建議");
      hints.push("建議改為一般性資訊與就醫提醒");
      return { action: "escalate", riskLevel: "high", reasons, hints };
    }

    return { action: "allow", riskLevel: "low", reasons: [], hints: [] };
  }
}
