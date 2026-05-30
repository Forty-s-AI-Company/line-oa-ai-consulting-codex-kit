import { describe, expect, test } from "vitest";
import { RuleBasedSafetyGuard } from "../src/safety/safetyGuard.js";
import type { IntentResult } from "@repo/shared";

function makeIntent(riskHints: string[] = []): IntentResult {
  return {
    primaryIntent: "unknown",
    secondaryIntents: [],
    domain: "unknown",
    confidence: 0.25,
    retrievalNeeded: true,
    escalationNeeded: false,
    riskHints,
    missingFields: []
  };
}

describe("RuleBasedSafetyGuard", () => {
  test("downgrades cure claims", () => {
    const g = new RuleBasedSafetyGuard();
    const d = g.inspect({ userMessage: "這個可以根治嗎？", intent: makeIntent(), draftAnswer: "一定可以治癒" });
    expect(d.action).toBe("downgrade");
    expect(d.riskLevel).toBe("high");
  });

  test("blocks stop-medicine guidance", () => {
    const g = new RuleBasedSafetyGuard();
    const d = g.inspect({ userMessage: "我可以停藥嗎？", intent: makeIntent(), draftAnswer: "你可以停藥" });
    expect(d.action).toBe("block");
    expect(d.riskLevel).toBe("block");
  });
});
