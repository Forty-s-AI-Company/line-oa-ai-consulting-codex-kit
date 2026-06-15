import type { AnswerComposer } from "../interfaces.js";
import type { ComposedAnswer, IntentResult, RetrievalChunk, SafetyDecision } from "@repo/shared";
import { assertUnreachable } from "@repo/shared";

function pickTopChunks(chunks: RetrievalChunk[], limit: number): RetrievalChunk[] {
  return [...chunks].sort((a, b) => b.score - a.score).slice(0, limit);
}

function normalizeSnippet(text: string): string {
  return text
    .replace(/\[[^\]\s]{1,12}\]/g, (m) => m.slice(1, -1))
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/\\n/g, " ")
    .replace(/…{2,}/g, "…")
    .trim();
}

function isLowValueSnippet(text: string): boolean {
  const normalized = normalizeSnippet(text);
  if (normalized.length < 12) return true;
  const badPatterns = ["孕期", "皮膚癌", "腎結石", "男人的尊嚴"];
  return badPatterns.some((p) => normalized.includes(p));
}

function fallbackByDomain(domain: IntentResult["domain"]): string {
  if (domain === "nutrition") {
    return [
      "外食族補充營養，可以先抓三個方向：",
      "1. 每餐先補足蛋白質，例如豆魚蛋肉、豆腐、無糖豆漿。",
      "2. 蔬菜量常常不足，可以優先選燙青菜、沙拉、菇類、海帶芽。",
      "3. 如果作息忙、餐餐外食，再考慮用綜合營養補充品當輔助，不要取代正餐。",
      "",
      "如果你願意，我可以依照你的外食型態，例如便當、超商、麵食或早餐店，幫你整理一版更精準的吃法。"
    ].join("\n");
  }

  return [
    "我先給你一個簡單方向：",
    "1. 先確認目前最困擾你的狀況。",
    "2. 再從飲食、作息、產品補充三個面向做調整。",
    "3. 如果有特殊疾病、用藥或懷孕狀況，建議先問專業醫師或營養師。",
    "",
    "你可以多告訴我一點目前情況，我再幫你收斂成比較適合的建議。"
  ].join("\n");
}

function buildKnowledgeBasedAnswer(input: {
  userMessage: string;
  intent: IntentResult;
  chunks: RetrievalChunk[];
}): string {
  const useful = input.chunks.filter((c) => !isLowValueSnippet(c.content));
  if (useful.length === 0) return fallbackByDomain(input.intent.domain);

  const lines = useful.slice(0, 2).map((chunk) => {
    const snippet = normalizeSnippet(chunk.content);
    return `- ${snippet.length > 90 ? `${snippet.slice(0, 90)}…` : snippet}`;
  });

  return [
    "我先用知識庫裡比較相關的資料，整理成好執行的版本：",
    "",
    "外食族可以先這樣補：",
    "1. 每餐先顧蛋白質，避免只吃澱粉類主食。",
    "2. 補蔬菜與膳食纖維，外食時可以多加一份青菜、菇類或海帶類。",
    "3. 如果三餐很不穩，綜合營養補充品可以當輔助，但不要取代正常飲食。",
    "",
    "知識庫參考重點：",
    ...lines,
    "",
    "如果你告訴我你平常最常吃哪一類外食，我可以直接幫你排一版更實用的選餐方式。"
  ].join("\n");
}

function applySafety(text: string, safety: SafetyDecision): string {
  switch (safety.action) {
    case "allow":
      return text;
    case "downgrade":
      return [
        text,
        "",
        "提醒：以上是一般健康資訊，不能取代醫師、藥師或營養師的個別建議。"
      ].join("\n");
    case "escalate":
      return [
        text,
        "",
        "如果你有明確症狀、正在用藥、懷孕或有慢性病，建議先讓專業人員協助評估，會比較安全。"
      ].join("\n");
    case "block":
      return [
        "這個問題可能涉及高風險健康判斷，我不能直接給診斷或療程建議。",
        "如果你有不舒服或正在治療中，建議先詢問醫師或營養師。"
      ].join("\n");
    default:
      assertUnreachable(safety);
  }
}

export class SimpleAnswerComposer implements AnswerComposer {
  compose(input: {
    userMessage: string;
    intent: IntentResult;
    retrieved: RetrievalChunk[];
    safety: SafetyDecision;
  }): ComposedAnswer {
    const top = pickTopChunks(input.retrieved, 3);
    const base =
      top.length > 0
        ? buildKnowledgeBasedAnswer({ userMessage: input.userMessage, intent: input.intent, chunks: top })
        : fallbackByDomain(input.intent.domain);

    const citations = top.map((c) => ({
      chunkId: c.id,
      title: c.title,
      sourcePath: c.source.sourcePath
    }));

    return { text: applySafety(base, input.safety), citations };
  }
}
