import type { AnswerComposer } from "../interfaces.js";
import type { ComposedAnswer, IntentResult, RetrievalChunk, SafetyDecision } from "@repo/shared";
import { assertUnreachable } from "@repo/shared";

function pickTopChunks(chunks: RetrievalChunk[], limit: number): RetrievalChunk[] {
  return [...chunks].sort((a, b) => b.score - a.score).slice(0, limit);
}

function joinBullets(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

function safeFallback(domain: string): string {
  if (domain === "business") {
    return [
      "我可以先幫你釐清你想了解的是「怎麼開始」還是「怎麼評估適不適合」。",
      joinBullets([
        "你目前最在意的是時間投入、成本、或收益期待？",
        "你希望一週能投入大概多少時間？",
        "如果你願意，我也可以整理一份一般性的評估清單給你"
      ])
    ].join("\n");
  }
  return [
    "我先用比較保守的方式回答，避免講得太滿。",
    joinBullets([
      "你方便說一下目前的狀況或目標嗎？（例如想改善什麼）",
      "如果你有特定產品/成分/情境，也可以丟關鍵字我再幫你找",
      "我會用一般性資訊回覆，必要時也會提醒你找專業人士確認"
    ])
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
        "補充一下：每個人狀況不同，我會先用一般性資訊提供方向，不會做保證或取代專業診斷。"
      ].join("\n");
    case "escalate":
      return [
        text,
        "",
        "這題牽涉到比較高風險的判斷，我建議安排專業人士或顧問跟你確認細節，我也可以幫你整理要問的重點。"
      ].join("\n");
    case "block":
      return [
        "這個問題我不方便直接給出具體診斷/停藥/療效保證的建議。",
        "如果你願意，我可以：",
        joinBullets(["幫你整理要問醫師/藥師的問題清單", "提供一般性保養/生活建議（不取代醫療）"])
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
    const top = pickTopChunks(input.retrieved, 2);

    let base: string;
    if (top.length === 0) {
      base = safeFallback(input.intent.domain ?? "unknown");
    } else {
      const first = top[0]!;
      base = [
        `先回答你：我找到一段相關資料可以參考。`,
        joinBullets([
          `重點：${first.content.slice(0, 80)}${first.content.length > 80 ? "..." : ""}`,
          "如果你願意，告訴我你目前的狀況或想達到的目標，我可以再把建議收斂得更精準"
        ])
      ].join("\n");
    }

    const finalText = applySafety(base, input.safety);
    const citations = top.map((c) => ({
      chunkId: c.id,
      title: c.title,
      sourcePath: c.source.sourcePath
    }));

    return { text: finalText, citations };
  }
}
