import { afterEach, describe, expect, test, vi } from "vitest";
import { OpenAICompatibleAnswerComposer } from "../src/answer/openAICompatibleAnswerComposer.js";
import type { IntentResult, RetrievalChunk, SafetyDecision } from "@repo/shared";

const intent: IntentResult = {
  primaryIntent: "nutrition",
  secondaryIntents: [],
  domain: "nutrition",
  confidence: 0.9,
  retrievalNeeded: true,
  escalationNeeded: false,
  riskHints: [],
  missingFields: []
};

const retrieved: RetrievalChunk[] = [
  {
    id: "doc:1",
    title: "外食營養",
    content: "外食族可以優先補充蛋白質、蔬菜與膳食纖維。",
    score: 0.88,
    source: { sourceType: "article", sourcePath: "nutrition.md", chunkIndex: 1 }
  }
];

const safety: SafetyDecision = { action: "allow", riskLevel: "low", reasons: [], hints: [] };

describe("OpenAICompatibleAnswerComposer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uses Responses API when apiMode is responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "外食族可以先顧蛋白質與蔬菜。" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const composer = new OpenAICompatibleAnswerComposer({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      baseUrl: "https://api.openai.com/v1",
      apiMode: "responses"
    });

    const answer = await composer.compose({ userMessage: "外食族怎麼補充營養？", intent, retrieved, safety });

    expect(answer.text).toContain("蛋白質");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { model: string; input: Array<{ content: string }>; max_output_tokens: number };
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.max_output_tokens).toBe(1200);
    expect(body).toMatchObject({ text: { verbosity: "low" } });
    expect(body.input[1]?.content).toContain("外食營養");
  });

  test("does not send GPT-5-only controls to older OpenAI models", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "GPT-4.1 回覆" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const composer = new OpenAICompatibleAnswerComposer({
      apiKey: "test-key",
      model: "gpt-4.1",
      baseUrl: "https://api.openai.com/v1",
      apiMode: "responses"
    });

    await composer.compose({ userMessage: "外食族怎麼補充營養？", intent, retrieved, safety });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { text?: unknown };
    expect(body.text).toBeUndefined();
  });

  test("keeps chat completions mode for OpenAI-compatible providers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "DeepSeek 回覆" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const composer = new OpenAICompatibleAnswerComposer({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      baseUrl: "https://api.deepseek.com"
    });

    const answer = await composer.compose({ userMessage: "外食族怎麼補充營養？", intent, retrieved, safety });

    expect(answer.text).toBe("DeepSeek 回覆");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.deepseek.com/chat/completions");
  });
});
