import type { ComposedAnswer, IntentResult, RetrievalChunk, SafetyDecision } from "@repo/shared";
import type { AnswerComposer } from "../interfaces.js";
import { SimpleAnswerComposer } from "./answerComposer.js";

export type OpenAICompatibleAnswerComposerOptions = {
  apiKey: string;
  model: string;
  baseUrl: string;
  apiMode?: "chat-completions" | "responses";
  timeoutMs?: number;
  tone?: string;
  systemPrompt?: string;
  fallback?: AnswerComposer;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

function buildMessages(input: {
  userMessage: string;
  intent: IntentResult;
  retrieved: RetrievalChunk[];
  safety: SafetyDecision;
  tone?: string;
  systemPrompt?: string;
}): ChatMessage[] {
  const knowledge = input.retrieved
    .slice(0, 5)
    .map((chunk, index) =>
      [`資料 ${index + 1}`, `標題：${chunk.title}`, `來源：${chunk.source.sourcePath}`, `片段：${chunk.content}`].join("\n")
    )
    .join("\n\n");

  const system =
    input.systemPrompt?.trim() ||
    "你是 LINE 官方帳號中的 AI 健康顧問。請根據使用者問題與知識庫片段，用繁體中文回答。回答要務實、溫和、清楚，不要聲稱能診斷或治療疾病；遇到高風險健康狀況時，請建議諮詢醫師或營養師。";

  const user = [
    `語氣：${input.tone || "專業、自然、好理解"}`,
    `使用者問題：${input.userMessage}`,
    `意圖分類：${input.intent.primaryIntent} / ${input.intent.domain}`,
    `安全判斷：${input.safety.action} / ${input.safety.riskLevel}`,
    "",
    "可參考的知識庫片段：",
    knowledge || "目前沒有找到足夠相關的知識庫片段，請用一般健康常識回答，並提醒使用者可補充更多背景。",
    "",
    "回答要求：",
    "1. 先直接回答，不要繞太久。",
    "2. 用 2 到 5 點整理建議，適合 LINE 閱讀。",
    "3. 若資料不足，明確說明需要補充哪些資訊。",
    "4. 不要貼原始 snippet，也不要使用複雜 Markdown 表格。",
    "5. 不要做醫療診斷；若有疾病、用藥、孕期或特殊狀況，提醒尋求專業協助。"
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function extractText(data: {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  choices?: Array<{ message?: { content?: string } }>;
}): string | undefined {
  return (
    data.output_text?.trim() ||
    data.output?.flatMap((item) => item.content ?? []).map((item) => item.text).find(Boolean)?.trim() ||
    data.choices?.[0]?.message?.content?.trim()
  );
}

function buildResponsesBody(model: string, messages: ChatMessage[]) {
  return {
    model,
    input: messages,
    max_output_tokens: 1200,
    ...(model.startsWith("gpt-5") ? { text: { verbosity: "low" } } : {})
  };
}

export class OpenAICompatibleAnswerComposer implements AnswerComposer {
  private fallback: AnswerComposer;

  constructor(private opts: OpenAICompatibleAnswerComposerOptions) {
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
      const promptInput: Parameters<typeof buildMessages>[0] = { ...input };
      if (this.opts.tone) promptInput.tone = this.opts.tone;
      if (this.opts.systemPrompt) promptInput.systemPrompt = this.opts.systemPrompt;

      const messages = buildMessages(promptInput);
      const useResponsesApi = this.opts.apiMode === "responses";
      const baseUrl = this.opts.baseUrl.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}${useResponsesApi ? "/responses" : "/chat/completions"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify(
          useResponsesApi
            ? buildResponsesBody(this.opts.model, messages)
            : {
                model: this.opts.model,
                messages,
                temperature: 0.4,
                max_tokens: 900
              }
        )
      });

      if (!res.ok) {
        console.warn(`[AI] OpenAI-compatible generation failed: status=${res.status}`);
        return await this.fallback.compose(input);
      }

      const text = extractText(await res.json());
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
      console.warn(`[AI] OpenAI-compatible generation error: ${message}`);
      return await this.fallback.compose(input);
    } finally {
      clearTimeout(timeout);
    }
  }
}
