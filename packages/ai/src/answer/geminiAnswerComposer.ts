import type { AnswerComposer } from "../interfaces.js";
import { SimpleAnswerComposer } from "./answerComposer.js";
import type { ComposedAnswer, IntentResult, RetrievalChunk, SafetyDecision } from "@repo/shared";

export type GeminiAnswerComposerOptions = {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  tone?: string;
  systemPrompt?: string;
  fallback?: AnswerComposer;
};

function buildPrompt(input: {
  userMessage: string;
  intent: IntentResult;
  retrieved: RetrievalChunk[];
  safety: SafetyDecision;
  tone?: string;
  systemPrompt?: string;
}): string {
  const knowledge = input.retrieved
    .slice(0, 5)
    .map((chunk, index) => {
      return [
        `資料 ${index + 1}`,
        `標題：${chunk.title}`,
        `來源：${chunk.source.sourcePath}`,
        `內容：${chunk.content}`
      ].join("\n");
    })
    .join("\n\n");

  return [
    input.systemPrompt?.trim() ||
      "你是 LINE 官方帳號的 AI 健康顧問。請用繁體中文回答，語氣溫和、清楚、可執行。你可以根據知識庫資料整理一般健康與營養建議，但不能宣稱療效、不能診斷疾病，也不能保證結果。",
    "",
    `回答語氣：${input.tone || "professional"}`,
    `使用者問題：${input.userMessage}`,
    `判斷意圖：${input.intent.primaryIntent} / ${input.intent.domain}`,
    `安全判斷：${input.safety.action} / ${input.safety.riskLevel}`,
    "",
    "可參考的知識庫資料：",
    knowledge || "目前沒有找到足夠相關的知識庫資料，請改用一般性健康原則回答，並提醒使用者可補充更多背景。",
    "",
    "回答規則：",
    "1. 先直接回答問題，不要說自己只是整理資料。",
    "2. 回覆控制在 2 到 5 個重點，適合 LINE 手機閱讀。",
    "3. 優先給具體做法，例如選餐、份量、替代方案或下一步。",
    "4. 如果資料不足，要明確說明是假設，並提出 1 個追問。",
    "5. 不要輸出原始 snippet、不要堆砌引用、不要使用 Markdown 表格。",
    "6. 若涉及疾病、孕期、藥物或高風險情境，提醒尋求專業醫療人員。"
  ].join("\n");
}

export class GeminiAnswerComposer implements AnswerComposer {
  private fallback: AnswerComposer;

  constructor(private opts: GeminiAnswerComposerOptions) {
    this.fallback = opts.fallback ?? new SimpleAnswerComposer();
  }

  async compose(input: {
    userMessage: string;
    intent: IntentResult;
    retrieved: RetrievalChunk[];
    safety: SafetyDecision;
  }): Promise<ComposedAnswer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 20000);

    try {
      const promptInput: Parameters<typeof buildPrompt>[0] = { ...input };
      if (this.opts.tone) promptInput.tone = this.opts.tone;
      if (this.opts.systemPrompt) promptInput.systemPrompt = this.opts.systemPrompt;
      const prompt = buildPrompt(promptInput);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.opts.model
      )}:generateContent?key=${encodeURIComponent(this.opts.apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 900
          }
        })
      });

      if (!res.ok) {
        console.warn(`[AI] Gemini generation failed: status=${res.status}`);
        return await this.fallback.compose(input);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      if (!text) return await this.fallback.compose(input);

      return {
        text,
        citations: input.retrieved.slice(0, 5).map((chunk) => ({
          chunkId: chunk.id,
          title: chunk.title,
          sourcePath: chunk.source.sourcePath
        }))
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AI] Gemini generation error: ${message}`);
      return await this.fallback.compose(input);
    } finally {
      clearTimeout(timeout);
    }
  }
}
