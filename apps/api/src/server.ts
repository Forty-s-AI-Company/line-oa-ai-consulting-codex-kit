import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import type { FastifyRequest } from "fastify";
import {
  GeminiAnswerComposer,
  RuleBasedIntentRouter,
  RuleBasedSafetyGuard,
  SimpleAnswerComposer,
  createRetrievalProviderFromEnv,
} from "@repo/ai";
import { MessagePipeline, verifyLineSignature } from "@repo/core";
import { ensurePrismaSqliteSchema, getPrisma } from "@repo/db";
import { envBool, readEnv, LineTextMessageEventSchema, LineWebhookBodySchema } from "@repo/shared";
import { decryptSecret, encryptSecret } from "./crypto.js";

const ConfigSchema = z.object({
  port: z.number().int().positive(),
  adminApiKey: z.string(),
  enableMockMode: z.boolean(),
  enableHumanHandoff: z.boolean(),
  lineChannelSecret: z.string().optional(),
  lineChannelAccessToken: z.string().optional(),
  mockKbPath: z.string(),
  defaultWorkspaceId: z.string(),
  encryptionKey: z.string(),
  aiTimeoutMs: z.number().int().positive(),
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
    defaultWorkspaceId: env.DEFAULT_WORKSPACE_ID ?? "default",
    encryptionKey: env.ENCRYPTION_KEY ?? env.ADMIN_API_KEY ?? "dev-admin-key",
    aiTimeoutMs: Number(env.AI_TIMEOUT_MS ?? "20000"),
  });
}

function adminAuth(config: ApiConfig, request: FastifyRequest): boolean {
  const key = request.headers["x-admin-key"];
  return typeof key === "string" && key === config.adminApiKey;
}

function workspacePublicShape(w: {
  id: string;
  name: string;
  mode: string;
  ownerLineUserId: string | null;
  isDefault: boolean;
  aiCredential?: { provider: string; model: string; enabled: boolean } | null;
  botSettings?: { tone: string; topK: number; safetyLevel: string; autoReplyEnabled: boolean } | null;
  lineChannels?: Array<{ id: string; channelId: string | null; destination: string | null; basicId: string | null; enabled: boolean }>;
}) {
  return {
    id: w.id,
    name: w.name,
    mode: w.mode,
    ownerLineUserId: w.ownerLineUserId,
    isDefault: w.isDefault,
    ai: w.aiCredential
      ? { provider: w.aiCredential.provider, model: w.aiCredential.model, enabled: w.aiCredential.enabled, apiKeyConfigured: true }
      : { apiKeyConfigured: false },
    settings: w.botSettings,
    lineChannels: w.lineChannels ?? []
  };
}

function renderAdminHtml(): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LINE AI 顧問設定</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,"Noto Sans TC",sans-serif;margin:0;background:#f6f3ec;color:#25231f}
    main{max-width:960px;margin:auto;padding:28px}
    section{background:#fff;border:1px solid #e5ddcf;border-radius:18px;padding:20px;margin:16px 0;box-shadow:0 10px 24px #0000000d}
    label{display:block;font-weight:700;margin-top:12px}
    input,select,textarea{box-sizing:border-box;width:100%;padding:11px;border:1px solid #cfc6b8;border-radius:10px;margin-top:6px;font:inherit}
    textarea{min-height:92px}
    button{background:#143d2b;color:white;border:0;border-radius:999px;padding:10px 16px;font-weight:700;margin-top:14px;cursor:pointer}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .muted{color:#706a60;font-size:14px}
    pre{white-space:pre-wrap;background:#25231f;color:#f8f2e8;padding:14px;border-radius:12px;overflow:auto}
  </style>
</head>
<body>
  <main>
    <h1>LINE AI 顧問設定</h1>
    <p class="muted">支援模式 B 共用官方帳號，也支援模式 A 每個 workspace 綁自己的 LINE Channel 與 AI Key。</p>
    <section>
      <label>Admin API Key</label>
      <input id="adminKey" type="password" placeholder="x-admin-key" />
      <button onclick="loadWorkspaces()">讀取 Workspaces</button>
      <pre id="workspaces"></pre>
    </section>
    <section>
      <h2>建立 Workspace</h2>
      <div class="row">
        <div><label>名稱</label><input id="wsName" placeholder="客戶 A" /></div>
        <div><label>模式</label><select id="wsMode"><option value="shared">模式 B：共用 LINE OA</option><option value="dedicated">模式 A：自有 LINE OA</option></select></div>
      </div>
      <label>Owner LINE User ID（可空）</label><input id="ownerLineUserId" />
      <button onclick="createWorkspace()">建立</button>
    </section>
    <section>
      <h2>AI Key / Prompt 設定</h2>
      <label>Workspace ID</label><input id="aiWs" value="default" />
      <div class="row">
        <div><label>Provider</label><select id="provider"><option value="gemini">Gemini</option></select></div>
        <div><label>Model</label><input id="model" value="gemini-2.5-flash" /></div>
      </div>
      <label>API Key（只送到後端加密保存，不會回顯）</label><input id="apiKey" type="password" />
      <label>語氣</label><input id="tone" value="溫和、專業、像真人顧問" />
      <label>System Prompt</label><textarea id="systemPrompt">你是繁體中文 LINE AI 健康顧問，請用自然、溫和、專業的語氣回答。</textarea>
      <button onclick="saveAi()">儲存 AI 設定</button>
    </section>
    <section>
      <h2>模式 A：綁定自己的 LINE Channel</h2>
      <label>Workspace ID</label><input id="lineWs" />
      <div class="row"><div><label>Channel ID</label><input id="channelId" /></div><div><label>Destination / Bot user ID</label><input id="destination" /></div></div>
      <label>Basic ID</label><input id="basicId" placeholder="@xxxx" />
      <label>Channel Secret</label><input id="channelSecret" type="password" />
      <label>Channel Access Token</label><input id="channelAccessToken" type="password" />
      <button onclick="saveLine()">儲存 LINE Channel</button>
    </section>
    <section>
      <h2>Playground</h2>
      <label>Workspace ID</label><input id="playWs" value="default" />
      <label>問題</label><input id="message" value="外食族怎麼補充營養？" />
      <button onclick="playground()">測試回答</button>
      <pre id="result"></pre>
    </section>
  </main>
  <script>
    const api = async (path, body, method='POST') => {
      const res = await fetch(path, { method, headers: {'content-type':'application/json','x-admin-key':adminKey.value}, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return data;
    };
    async function loadWorkspaces(){ workspaces.textContent = JSON.stringify(await api('/admin/workspaces', null, 'GET'), null, 2); }
    async function createWorkspace(){ result.textContent = JSON.stringify(await api('/admin/workspaces', { name: wsName.value, mode: wsMode.value, ownerLineUserId: ownerLineUserId.value || undefined }), null, 2); await loadWorkspaces(); }
    async function saveAi(){
      await api('/admin/workspaces/'+encodeURIComponent(aiWs.value)+'/ai', { provider: provider.value, model: model.value, apiKey: apiKey.value || undefined, enabled: true });
      await api('/admin/workspaces/'+encodeURIComponent(aiWs.value)+'/settings', { tone: tone.value, systemPrompt: systemPrompt.value, autoReplyEnabled: true });
      result.textContent = 'AI 設定已儲存';
    }
    async function saveLine(){ result.textContent = JSON.stringify(await api('/admin/workspaces/'+encodeURIComponent(lineWs.value)+'/line-channel', { channelId: channelId.value, destination: destination.value, basicId: basicId.value, channelSecret: channelSecret.value, channelAccessToken: channelAccessToken.value, enabled: true }), null, 2); }
    async function playground(){ result.textContent = JSON.stringify(await api('/admin/playground', { workspaceId: playWs.value, message: message.value }), null, 2); }
  </script>
</body>
</html>`;
}

async function replyToLine(config: ApiConfig, input: { replyToken: string; text: string; accessToken?: string }) {
  if (config.enableMockMode) return;
  const accessToken = input.accessToken ?? config.lineChannelAccessToken;
  if (!accessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required when mock mode is off");
  }

  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

function extractDestination(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const destination = (body as { destination?: unknown }).destination;
  return typeof destination === "string" && destination.trim() ? destination.trim() : undefined;
}

async function ensureDefaultWorkspace(config: ApiConfig, prisma: ReturnType<typeof getPrisma>) {
  await prisma.workspace.upsert({
    where: { id: config.defaultWorkspaceId },
    update: { updatedAt: new Date() },
    create: {
      id: config.defaultWorkspaceId,
      name: "Default Shared LINE OA",
      mode: "shared",
      isDefault: true
    }
  });
  await prisma.botSettings.upsert({
    where: { workspaceId: config.defaultWorkspaceId },
    update: {},
    create: { workspaceId: config.defaultWorkspaceId }
  });
}

async function resolveWorkspaceForWebhook(input: {
  config: ApiConfig;
  prisma: ReturnType<typeof getPrisma>;
  body: unknown;
}): Promise<{ workspaceId: string; channelSecret?: string; channelAccessToken?: string }> {
  const destination = extractDestination(input.body);
  if (destination) {
    const channel = await input.prisma.lineChannelCredential.findUnique({
      where: { destination },
      include: { workspace: true }
    });
    if (channel?.enabled) {
      return {
        workspaceId: channel.workspaceId,
        channelSecret: decryptSecret(channel.encryptedChannelSecret, input.config.encryptionKey),
        channelAccessToken: decryptSecret(channel.encryptedChannelAccessToken, input.config.encryptionKey)
      };
    }
  }

  const fallback: { workspaceId: string; channelSecret?: string; channelAccessToken?: string } = {
    workspaceId: input.config.defaultWorkspaceId,
  };
  if (input.config.lineChannelSecret) fallback.channelSecret = input.config.lineChannelSecret;
  if (input.config.lineChannelAccessToken) fallback.channelAccessToken = input.config.lineChannelAccessToken;
  return fallback;
}

async function createComposerForWorkspace(input: {
  config: ApiConfig;
  prisma: ReturnType<typeof getPrisma>;
  workspaceId: string;
}) {
  const fallback = new SimpleAnswerComposer();
  const [credential, settings] = await Promise.all([
    input.prisma.aiProviderCredential.findUnique({ where: { workspaceId: input.workspaceId } }),
    input.prisma.botSettings.findUnique({ where: { workspaceId: input.workspaceId } })
  ]);

  if (!credential?.enabled) return fallback;
  if (credential.provider !== "gemini") return fallback;

  const geminiOpts: ConstructorParameters<typeof GeminiAnswerComposer>[0] = {
    apiKey: decryptSecret(credential.encryptedApiKey, input.config.encryptionKey),
    model: credential.model,
    timeoutMs: input.config.aiTimeoutMs,
    fallback
  };
  if (settings?.tone) geminiOpts.tone = settings.tone;
  if (settings?.systemPrompt) geminiOpts.systemPrompt = settings.systemPrompt;
  return new GeminiAnswerComposer(geminiOpts);
}

function rawBodyToString(raw: unknown): string {
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (typeof raw === "string") return raw;
  return JSON.stringify(raw ?? {});
}

function parseJsonBody(raw: unknown): unknown {
  if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString("utf8")) as unknown;
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

  // Keep raw bytes so LINE signature verification and UTF-8 JSON parsing stay consistent on serverless runtimes.
  fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  const prisma = getPrisma();
  await ensurePrismaSqliteSchema(prisma);
  await ensureDefaultWorkspace(config, prisma);
  const retrieval = createRetrievalProviderFromEnv({ mockKbPath: config.mockKbPath });

  fastify.get("/healthz", async () => ({
    ok: true,
    retrieval: process.env.AKB_BASE_URL ? "amway-knowledge-base" : "mock",
    build: "multi-tenant-byok-v1",
  }));

  fastify.get("/admin", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderAdminHtml());
  });

  fastify.get("/liff/admin", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderAdminHtml());
  });

  fastify.get("/admin/workspaces", async (request, reply) => {
    if (!adminAuth(config, request)) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const workspaces = await prisma.workspace.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: {
        aiCredential: { select: { provider: true, model: true, enabled: true } },
        botSettings: { select: { tone: true, topK: true, safetyLevel: true, autoReplyEnabled: true } },
        lineChannels: { select: { id: true, channelId: true, destination: true, basicId: true, enabled: true } }
      }
    });
    return reply.send({ ok: true, workspaces: workspaces.map(workspacePublicShape) });
  });

  fastify.post<{ Body: unknown }>("/admin/workspaces", async (request, reply) => {
    if (!adminAuth(config, request)) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const BodySchema = z.object({
      name: z.string().min(1),
      mode: z.enum(["shared", "dedicated"]).default("shared"),
      ownerLineUserId: z.string().optional()
    });
    const parsed = BodySchema.safeParse(parseJsonBody(request.body));
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });
    const workspaceData: { name: string; mode: "shared" | "dedicated"; ownerLineUserId?: string } = {
      name: parsed.data.name,
      mode: parsed.data.mode
    };
    if (parsed.data.ownerLineUserId) workspaceData.ownerLineUserId = parsed.data.ownerLineUserId;
    const workspace = await prisma.workspace.create({
      data: workspaceData
    });
    await prisma.botSettings.create({ data: { workspaceId: workspace.id } });
    return reply.send({ ok: true, workspace: workspacePublicShape({ ...workspace, botSettings: { tone: "professional", topK: 5, safetyLevel: "standard", autoReplyEnabled: true } }) });
  });

  fastify.get<{ Params: { id: string } }>("/admin/workspaces/:id", async (request, reply) => {
    if (!adminAuth(config, request)) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const workspace = await prisma.workspace.findUnique({
      where: { id: request.params.id },
      include: {
        aiCredential: { select: { provider: true, model: true, enabled: true } },
        botSettings: { select: { tone: true, topK: true, safetyLevel: true, autoReplyEnabled: true } },
        lineChannels: { select: { id: true, channelId: true, destination: true, basicId: true, enabled: true } }
      }
    });
    if (!workspace) return reply.code(404).send({ ok: false, error: "workspace not found" });
    return reply.send({ ok: true, workspace: workspacePublicShape(workspace) });
  });

  fastify.put<{ Params: { id: string }; Body: unknown }>("/admin/workspaces/:id/settings", async (request, reply) => {
    if (!adminAuth(config, request)) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const BodySchema = z.object({
      tone: z.string().optional(),
      systemPrompt: z.string().optional(),
      topK: z.number().int().min(1).max(20).optional(),
      safetyLevel: z.string().optional(),
      autoReplyEnabled: z.boolean().optional()
    });
    const parsed = BodySchema.safeParse(parseJsonBody(request.body));
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });
    const settingsData: {
      tone?: string;
      systemPrompt?: string | null;
      topK?: number;
      safetyLevel?: string;
      autoReplyEnabled?: boolean;
    } = {};
    if (parsed.data.tone !== undefined) settingsData.tone = parsed.data.tone;
    if (parsed.data.systemPrompt !== undefined) settingsData.systemPrompt = parsed.data.systemPrompt || null;
    if (parsed.data.topK !== undefined) settingsData.topK = parsed.data.topK;
    if (parsed.data.safetyLevel !== undefined) settingsData.safetyLevel = parsed.data.safetyLevel;
    if (parsed.data.autoReplyEnabled !== undefined) settingsData.autoReplyEnabled = parsed.data.autoReplyEnabled;
    const settings = await prisma.botSettings.upsert({
      where: { workspaceId: request.params.id },
      update: { ...settingsData, updatedAt: new Date() },
      create: { workspaceId: request.params.id, ...settingsData }
    });
    return reply.send({ ok: true, settings });
  });

  fastify.put<{ Params: { id: string }; Body: unknown }>("/admin/workspaces/:id/ai", async (request, reply) => {
    if (!adminAuth(config, request)) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const BodySchema = z.object({
      provider: z.enum(["gemini"]).default("gemini"),
      model: z.string().min(1).default("gemini-2.5-flash"),
      apiKey: z.string().min(1).optional(),
      enabled: z.boolean().default(true),
      monthlyBudgetLimit: z.number().positive().optional()
    });
    const parsed = BodySchema.safeParse(parseJsonBody(request.body));
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });
    const existing = await prisma.aiProviderCredential.findUnique({ where: { workspaceId: request.params.id } });
    if (!existing && !parsed.data.apiKey) return reply.code(400).send({ ok: false, error: "apiKey required for first setup" });
    const aiUpdateData: {
      provider: "gemini";
      model: string;
      enabled: boolean;
      monthlyBudgetLimit?: number | null;
      encryptedApiKey?: string;
      updatedAt: Date;
    } = {
      provider: parsed.data.provider,
      model: parsed.data.model,
      enabled: parsed.data.enabled,
      updatedAt: new Date()
    };
    if (parsed.data.monthlyBudgetLimit !== undefined) aiUpdateData.monthlyBudgetLimit = parsed.data.monthlyBudgetLimit;
    if (parsed.data.apiKey) aiUpdateData.encryptedApiKey = encryptSecret(parsed.data.apiKey, config.encryptionKey);
    const aiCreateData: {
      workspaceId: string;
      provider: "gemini";
      model: string;
      enabled: boolean;
      monthlyBudgetLimit?: number | null;
      encryptedApiKey: string;
    } = {
      workspaceId: request.params.id,
      provider: parsed.data.provider,
      model: parsed.data.model,
      enabled: parsed.data.enabled,
      encryptedApiKey: encryptSecret(parsed.data.apiKey!, config.encryptionKey)
    };
    if (parsed.data.monthlyBudgetLimit !== undefined) aiCreateData.monthlyBudgetLimit = parsed.data.monthlyBudgetLimit;
    const credential = await prisma.aiProviderCredential.upsert({
      where: { workspaceId: request.params.id },
      update: aiUpdateData,
      create: aiCreateData,
      select: { provider: true, model: true, enabled: true, monthlyBudgetLimit: true }
    });
    return reply.send({ ok: true, ai: { ...credential, apiKeyConfigured: true } });
  });

  fastify.put<{ Params: { id: string }; Body: unknown }>("/admin/workspaces/:id/line-channel", async (request, reply) => {
    if (!adminAuth(config, request)) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const BodySchema = z.object({
      channelId: z.string().optional(),
      destination: z.string().min(1),
      basicId: z.string().optional(),
      channelSecret: z.string().min(1),
      channelAccessToken: z.string().min(1),
      enabled: z.boolean().default(true)
    });
    const parsed = BodySchema.safeParse(parseJsonBody(request.body));
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });
    const existing = await prisma.lineChannelCredential.findUnique({ where: { destination: parsed.data.destination } });
    const data: {
      workspaceId: string;
      channelId?: string | null;
      destination: string;
      basicId?: string | null;
      encryptedChannelSecret: string;
      encryptedChannelAccessToken: string;
      enabled: boolean;
      updatedAt: Date;
    } = {
      workspaceId: request.params.id,
      destination: parsed.data.destination,
      encryptedChannelSecret: encryptSecret(parsed.data.channelSecret, config.encryptionKey),
      encryptedChannelAccessToken: encryptSecret(parsed.data.channelAccessToken, config.encryptionKey),
      enabled: parsed.data.enabled,
      updatedAt: new Date()
    };
    if (parsed.data.channelId !== undefined) data.channelId = parsed.data.channelId || null;
    if (parsed.data.basicId !== undefined) data.basicId = parsed.data.basicId || null;
    const channel = existing
      ? await prisma.lineChannelCredential.update({ where: { id: existing.id }, data })
      : await prisma.lineChannelCredential.create({ data });
    return reply.send({
      ok: true,
      lineChannel: {
        id: channel.id,
        workspaceId: channel.workspaceId,
        channelId: channel.channelId,
        destination: channel.destination,
        basicId: channel.basicId,
        enabled: channel.enabled
      }
    });
  });

  fastify.post("/webhooks/line", async (request, reply) => {
    const rawBody = rawBodyToString(request.body);

    let body: unknown;
    try {
      body = parseJsonBody(request.body);
    } catch {
      return reply.code(400).send({ ok: false, error: "invalid json" });
    }

    const active = await resolveWorkspaceForWebhook({ config, prisma, body });

    if (!config.enableMockMode) {
      if (!active.channelSecret) {
        return reply.code(500).send({ ok: false, error: "LINE_CHANNEL_SECRET missing" });
      }
      const signature = request.headers["x-line-signature"];
      const signatureHeader = typeof signature === "string" ? signature : undefined;
      const ok = verifyLineSignature({
        body: rawBody,
        channelSecret: active.channelSecret,
        signatureHeader,
      });
      if (!ok) return reply.code(401).send({ ok: false, error: "invalid signature" });
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
      const composer = await createComposerForWorkspace({ config, prisma, workspaceId: active.workspaceId });
      const pipeline = new MessagePipeline({
        prisma,
        intentRouter: new RuleBasedIntentRouter(),
        retrieval,
        safety: new RuleBasedSafetyGuard(),
        composer,
        enableHumanHandoff: config.enableHumanHandoff,
      });

      const result = await pipeline.handleLineText({
        workspaceId: active.workspaceId,
        lineUserId,
        replyToken: event.replyToken,
        text: event.message.text,
        rawEventJson: JSON.stringify(event),
      });

      const replyInput: { replyToken: string; text: string; accessToken?: string } = {
        replyToken: event.replyToken,
        text: result.replyText,
      };
      if (active.channelAccessToken) replyInput.accessToken = active.channelAccessToken;
      await replyToLine(config, replyInput);
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

    const BodySchema = z.object({ message: z.string().min(1), workspaceId: z.string().optional() });
    let body: unknown;
    try {
      body = parseJsonBody(request.body);
    } catch {
      return reply.code(400).send({ ok: false, error: "invalid json" });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });

    const workspaceId = parsed.data.workspaceId ?? config.defaultWorkspaceId;
    const composer = await createComposerForWorkspace({ config, prisma, workspaceId });
    const pipeline = new MessagePipeline({
      prisma,
      intentRouter: new RuleBasedIntentRouter(),
      retrieval,
      safety: new RuleBasedSafetyGuard(),
      composer,
      enableHumanHandoff: config.enableHumanHandoff,
    });

    const result = await pipeline.handleLineText({
      workspaceId,
      lineUserId: "admin-playground",
      replyToken: "mock-reply-token",
      text: parsed.data.message,
      rawEventJson: JSON.stringify({ type: "admin-playground" }),
    });

    return reply.send({
      ok: true,
      inputMessage: parsed.data.message,
      workspaceId,
      replyText: result.replyText,
      intent: result.intent,
      retrieved: result.retrieved,
      answer: result.answer,
    });
  });

  return { fastify, config };
}
