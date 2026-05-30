import { describe, expect, test } from "vitest";
import { SimpleAnswerComposer } from "../src/answer/answerComposer.js";
import type { IntentResult } from "@repo/shared";

const intent: IntentResult = {
  primaryIntent: "unknown",
  secondaryIntents: [],
  domain: "unknown",
  confidence: 0.25,
  retrievalNeeded: true,
  escalationNeeded: false,
  riskHints: [],
  missingFields: []
};

describe("SimpleAnswerComposer", () => {
  test("returns fallback when no retrieval", () => {
    const c = new SimpleAnswerComposer();
    const ans = c.compose({
      userMessage: "你好",
      intent,
      retrieved: [],
      safety: { action: "allow", riskLevel: "low", reasons: [], hints: [] }
    });
    expect(ans.text.length).toBeGreaterThan(0);
    expect(ans.citations.length).toBe(0);
  });
});
