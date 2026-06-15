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
    .map((c, i) => `來源 ${i + 1}｜${c.title}\n${c.content}`)
    .join("\n\n");

  return [
    input.systemPrompt?.trim() ||
      "你是 LINE 官方帳號裡的繁體中文 AI 健康顧問。請用自然、溫和、專業的語氣回答，不要誇大療效，不要做醫療診斷。",
    "",
    `回覆語氣：${input.tone || "professional"}`,
    `使用者問題：${input.userMessage}`,
    `意圖：${input.intent.primaryIntent} / ${input.intent.domain}`,
    "",
    "知識庫資料：",
    knowledge || "沒有可用資料。",
    "",
    "請產生一則適合 LINE 的短中篇回答：",
    "1. 先直接回答問題。",
    "2. 用 2-4 個重點條列。",
    "3. 如果知識庫不足，請明確說是一般建議。",
    "4. 不要直接貼原始 snippet，不要輸出 markdown 表格。",
    "5. 避免承諾治療、保證效果或替代醫師建議。"
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
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      if (!text) return await this.fallback.compose(input);

      return {
        text,
        citations: input.retrieved.slice(0, 5).map((c) => ({
          chunkId: c.id,
          title: c.title,
          sourcePath: c.source.sourcePath
        }))
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[AI] Gemini generation error: ${msg}`);
      return await this.fallback.compose(input);
    } finally {
      clearTimeout(timeout);
    }
  }
}
