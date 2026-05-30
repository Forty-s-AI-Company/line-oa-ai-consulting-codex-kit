import { describe, expect, test } from "vitest";
import { RuleBasedIntentRouter } from "../src/intent/ruleBasedIntentRouter.js";

describe("RuleBasedIntentRouter", () => {
  test("classifies nutrition", () => {
    const r = new RuleBasedIntentRouter().classify({ message: "我想問營養跟睡眠", recentMessages: [] });
    expect(r.domain).toBe("nutrition");
    expect(r.primaryIntent).toBe("nutrition_consulting");
    expect(r.retrievalNeeded).toBe(true);
  });
});

