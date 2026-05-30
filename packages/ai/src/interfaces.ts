import type { ComposedAnswer, IntentResult, RetrievalChunk, SafetyDecision } from "@repo/shared";

export type IntentRouter = {
  classify(input: { message: string; recentMessages: Array<{ role: string; content: string }> }): IntentResult;
};

export type RetrievalProvider = {
  search(input: { query: string; domain: string; topK: number }): Promise<RetrievalChunk[]>;
};

export type SafetyGuard = {
  inspect(input: { userMessage: string; intent: IntentResult; draftAnswer: string }): SafetyDecision;
};

export type AnswerComposer = {
  compose(input: {
    userMessage: string;
    intent: IntentResult;
    retrieved: RetrievalChunk[];
    safety: SafetyDecision;
  }): ComposedAnswer;
};

