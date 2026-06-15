import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import type { FastifyRequest } from "fastify";
import {
  RuleBasedIntentRouter,
  RuleBasedSafetyGuard,
  SimpleAnswerComposer,
  createRetrievalProviderFromEnv,
} from "@repo/ai";
import { MessagePipeline, verifyLineSignature } from "@repo/core";
import { ensurePrismaSqliteSchema, getPrisma } from "@repo/db";
import { envBool, readEnv, LineTextMessageEventSchema, LineWebhookBodySchema } from "@repo/shared";

const ConfigSchema = z.object({
  port: z.number().int().positive(),
  adminApiKey: z.string(),
  enableMockMode: z.boolean(),
  enableHumanHandoff: z.boolean(),
  lineChannelSecret: z.string().optional(),
  lineChannelAccessToken: z.string().optional(),
  mockKbPath: z.string(),
});

type ApiConfig = z.infer<typeof ConfigSchema>;

function loadConfig(): ApiConfig {
  // Vercel Serverless can only write safely under /tmp. Use it as a short-term
  // fallback until a persistent production database is attached.
  process.env.DATABASE_URL ??= process.env.VERCEL ? "file:/tmp/line-oa-ai-consulting.db" : "file:../../dev.db";

  const env = readEnv(process.env);
  return ConfigSchema.parse({
    port: Number(process.env.APP_PORT ?? process.env.PORT ?? "3000"),
    adminApiKey: env.ADMIN_API_KEY ?? "dev-admin-key",
    enableMockMode: envBool(env.ENABLE_MOCK_MODE, true),
    enableHumanHandoff: envBool(env.ENABLE_HUMAN_HANDOFF, true),
    lineChannelSecret: env.LINE_CHANNEL_SECRET,
    lineChannelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    mockKbPath: env.MOCK_KB_PATH ?? "./examples/mock-kb.json",
  });
}

function adminAuth(config: ApiConfig, request: FastifyRequest): boolean {
  const key = request.headers["x-admin-key"];
  return typeof key === "string" && key === config.adminApiKey;
}

async function replyToLine(config: ApiConfig, input: { replyToken: string; text: string }) {
  if (config.enableMockMode) return;
  if (!config.lineChannelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required when mock mode is off");
  }

  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.lineChannelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken: input.replyToken,
      messages: [{ type: "text", text: input.text }],
    }),
  });

  if (!res.ok) {
    throw new Error(`LINE reply failed: status=${res.status}`);
  }
}

function parseJsonBody(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return JSON.parse(raw) as unknown;
}

export async function createApp() {
  const config = loadConfig();
  const fastify = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  await fastify.register(cors, {
    origin: true,
    allowedHeaders: ["content-type", "x-line-signature", "x-admin-key"],
  });

  // Keep raw JSON text so LINE signature verification uses the exact body.
  fastify.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  const prisma = getPrisma();
  await ensurePrismaSqliteSchema(prisma);

  const pipeline = new MessagePipeline({
    prisma,
    intentRouter: new RuleBasedIntentRouter(),
    retrieval: createRetrievalProviderFromEnv({ mockKbPath: config.mockKbPath }),
    safety: new RuleBasedSafetyGuard(),
    composer: new SimpleAnswerComposer(),
    enableHumanHandoff: config.enableHumanHandoff,
  });

  fastify.get("/healthz", async () => ({
    ok: true,
    retrieval: process.env.AKB_BASE_URL ? "amway-knowledge-base" : "mock",
  }));

  fastify.post("/webhooks/line", async (request, reply) => {
    const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});

    if (!config.enableMockMode) {
      if (!config.lineChannelSecret) {
        return reply.code(500).send({ ok: false, error: "LINE_CHANNEL_SECRET missing" });
      }
      const signature = request.headers["x-line-signature"];
      const signatureHeader = typeof signature === "string" ? signature : undefined;
      const ok = verifyLineSignature({
        body: rawBody,
        channelSecret: config.lineChannelSecret,
        signatureHeader,
      });
      if (!ok) return reply.code(401).send({ ok: false, error: "invalid signature" });
    }

    let body: unknown;
    try {
      body = parseJsonBody(request.body);
    } catch {
      return reply.code(400).send({ ok: false, error: "invalid json" });
    }

    const parsed = LineWebhookBodySchema.safeParse(body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });

    const results: Array<{ ok: true; messageId: string; conversationId: string; replyText: string }> = [];

    for (const rawEvent of parsed.data.events) {
      const maybeText = LineTextMessageEventSchema.safeParse(rawEvent);
      if (!maybeText.success) continue;

      const event = maybeText.data;
      const lineUserId = event.source.userId;
      if (!lineUserId) continue;

      const result = await pipeline.handleLineText({
        lineUserId,
        replyToken: event.replyToken,
        text: event.message.text,
        rawEventJson: JSON.stringify(event),
      });

      await replyToLine(config, { replyToken: event.replyToken, text: result.replyText });
      results.push({
        ok: true,
        messageId: result.messageId,
        conversationId: result.conversationId,
        replyText: result.replyText,
      });
    }

    return reply.send({ ok: true, results });
  });

  fastify.post<{ Body: unknown }>("/admin/playground", async (request, reply) => {
    if (!adminAuth(config, request)) return reply.code(401).send({ ok: false, error: "unauthorized" });

    const BodySchema = z.object({ message: z.string().min(1) });
    let body: unknown;
    try {
      body = parseJsonBody(request.body);
    } catch {
      return reply.code(400).send({ ok: false, error: "invalid json" });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });

    const result = await pipeline.handleLineText({
      lineUserId: "admin-playground",
      replyToken: "mock-reply-token",
      text: parsed.data.message,
      rawEventJson: JSON.stringify({ type: "admin-playground" }),
    });

    return reply.send({
      ok: true,
      replyText: result.replyText,
      intent: result.intent,
      retrieved: result.retrieved,
      answer: result.answer,
    });
  });

  return { fastify, config };
}
