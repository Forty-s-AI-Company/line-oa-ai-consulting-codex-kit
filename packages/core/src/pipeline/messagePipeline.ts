import type { PrismaClient } from "@repo/db";
import type { AnswerComposer, IntentRouter, RetrievalProvider, SafetyGuard } from "@repo/ai";
import type { ComposedAnswer, RetrievalChunk } from "@repo/shared";

export type MessagePipelineDeps = {
  prisma: PrismaClient;
  intentRouter: IntentRouter;
  retrieval: RetrievalProvider;
  safety: SafetyGuard;
  composer: AnswerComposer;
  enableHumanHandoff: boolean;
};

export type PipelineResult = {
  replyText: string;
  answer: ComposedAnswer;
  retrieved: RetrievalChunk[];
  intent: ReturnType<IntentRouter["classify"]>;
  safetyAction: string;
  messageId: string;
  conversationId: string;
  userId: string;
};

export class MessagePipeline {
  constructor(private deps: MessagePipelineDeps) {}

  async handleLineText(input: {
    lineUserId: string;
    replyToken: string;
    text: string;
    rawEventJson: string;
    workspaceId?: string;
  }): Promise<PipelineResult> {
    const prisma = this.deps.prisma;
    const now = new Date();

    const user = await prisma.user.upsert({
      where: { workspaceId_lineUserId: { workspaceId: input.workspaceId ?? "default", lineUserId: input.lineUserId } },
      update: { updatedAt: now },
      create: { workspaceId: input.workspaceId ?? "default", lineUserId: input.lineUserId }
    });

    // MVP: single active conversation per user (latest).
    let conversation = await prisma.conversation.findFirst({
      where: { userId: user.id },
      orderBy: { lastMessageAt: "desc" }
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, startedAt: now, lastMessageAt: now }
      });
    } else {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
    }

    const recent = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10
    });
    const recentMessages = recent
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-6);

    const intent = this.deps.intentRouter.classify({ message: input.text, recentMessages });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: input.text,
        intent: intent.primaryIntent,
        domain: intent.domain,
        riskLevel: intent.riskHints.length ? "medium" : "low",
        rawEventJson: input.rawEventJson
      }
    });

    const retrieved = intent.retrievalNeeded
      ? await this.deps.retrieval.search({ query: input.text, domain: intent.domain, topK: 5 })
      : [];

    // For MVP, "draft" is the composed answer pre-safety; the composer will add safety text.
    const draftText = (
      await this.deps.composer.compose({
      userMessage: input.text,
      intent,
      retrieved,
      safety: { action: "allow", riskLevel: "low", reasons: [], hints: [] }
      })
    ).text;

    const safetyDecision = this.deps.safety.inspect({
      userMessage: input.text,
      intent,
      draftAnswer: draftText
    });

    const finalAnswer = await this.deps.composer.compose({
      userMessage: input.text,
      intent,
      retrieved,
      safety: safetyDecision
    });

    // Persist retrieval logs (top chunks only)
    for (const c of retrieved.slice(0, 5)) {
      await prisma.retrievalLog.create({
        data: {
          messageId: message.id,
          chunkId: c.id,
          sourceId: c.id.split(":")[0] ?? null,
          sourceTitle: c.title,
          chunkText: c.content.slice(0, 500),
          score: c.score,
          metadata: JSON.stringify(c.source)
        }
      });
    }

    await prisma.answerLog.create({
      data: {
        messageId: message.id,
        draftText,
        finalText: finalAnswer.text,
        riskLevel: safetyDecision.riskLevel,
        action: safetyDecision.action,
        reasons: JSON.stringify(safetyDecision.reasons),
        citations: JSON.stringify(finalAnswer.citations)
      }
    });

    // Store assistant message as a Message record too (thread view).
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: finalAnswer.text,
        intent: intent.primaryIntent,
        domain: intent.domain,
        riskLevel: safetyDecision.riskLevel,
        replyType: "line_reply"
      }
    });

    const shouldEscalate =
      this.deps.enableHumanHandoff && (intent.escalationNeeded || safetyDecision.action === "escalate");

    if (shouldEscalate) {
      await prisma.escalationTask.create({
        data: {
          userId: user.id,
          conversationId: conversation.id,
          messageId: message.id,
          reason: `intent=${intent.primaryIntent}; action=${safetyDecision.action}`
        }
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { handoffFlag: true } });
    }

    return {
      replyText: finalAnswer.text,
      answer: finalAnswer,
      retrieved,
      intent,
      safetyAction: safetyDecision.action,
      messageId: message.id,
      conversationId: conversation.id,
      userId: user.id
    };
  }
}
