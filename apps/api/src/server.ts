import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  GeminiAnswerComposer,
  OpenAICompatibleAnswerComposer,
  RuleBasedIntentRouter,
  RuleBasedSafetyGuard,
  SimpleAnswerComposer,
  createRetrievalProviderFromEnv,
} from "@repo/ai";
import { MessagePipeline, verifyLineSignature } from "@repo/core";
import { ensurePrismaSqliteSchema, getPrisma } from "@repo/db";
import { envBool, readEnv, LineTextMessageEventSchema, LineWebhookBodySchema } from "@repo/shared";
import { renderAdminHtmlPage } from "./adminHtml.js";
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
  platformGeminiApiKey: z.string().optional(),
  platformGeminiModel: z.string(),
  b2cRequireUserAi: z.boolean(),
  modelCatalogUpdating: z.boolean(),
  cronSecret: z.string().optional(),
  liffId: z.string().optional(),
  liffChannelId: z.string().optional(),
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
    platformGeminiApiKey: env.PLATFORM_GEMINI_API_KEY,
    platformGeminiModel: env.PLATFORM_GEMINI_MODEL ?? "gemini-3.5-flash",
    b2cRequireUserAi: envBool(env.B2C_REQUIRE_USER_AI, false),
    modelCatalogUpdating: envBool(env.MODEL_CATALOG_UPDATING, false),
    cronSecret: env.CRON_SECRET,
    liffId: env.LIFF_ID,
    liffChannelId: env.LIFF_CHANNEL_ID,
  });
}

const AI_SETUP_REPLY =
  "請到設定設置AI。\n\n請點選下方圖文選單的「AI 設定」，登入後選擇 ChatGPT、Gemini 或 DeepSeek，並填入你自己的 API Key。設定完成後，再回來問我健康或營養問題。";

const MODEL_UPDATE_REPLY = "系統模型清單更新中，請稍後再試。";

const MODEL_CATALOG = [
  {
    provider: "gemini",
    label: "Gemini",
    docUrl: "https://ai.google.dev/gemini-api/docs/models?hl=zh-tw",
    recommendedModel: "gemini-3.5-flash",
    models: ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"],
    modelOptions: [
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", status: "stable", note: "最新穩定，優先建議一般問答使用" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", status: "stable", note: "低延遲、低成本" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", status: "stable", note: "相容既有設定" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", status: "stable", note: "較適合複雜推理" }
    ]
  },
  {
    provider: "openai",
    label: "ChatGPT / OpenAI",
    docUrl: "https://developers.openai.com/api/docs/models/all",
    recommendedModel: "gpt-5.4-mini",
    models: ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.5", "gpt-4.1", "gpt-4o-mini"],
    modelOptions: [
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", status: "stable", note: "成本與能力平衡，優先建議" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 nano", status: "stable", note: "最低成本、簡單問答" },
      { id: "gpt-5.5", label: "GPT-5.5", status: "stable", note: "高能力模型，成本較高" },
      { id: "gpt-4.1", label: "GPT-4.1", status: "stable", note: "非 reasoning 舊穩定模型" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", status: "legacy", note: "舊版低成本模型，保留相容性" }
    ]
  },
  {
    provider: "deepseek",
    label: "DeepSeek",
    docUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    recommendedModel: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    modelOptions: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", status: "stable", note: "官方新模型，優先建議" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", status: "stable", note: "較高能力，成本較高" }
    ]
  }
] as const;

type LiffUser = {
  lineUserId: string;
  displayName?: string;
};

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
  aiCredential?: { provider: string; model: string; enabled: boolean; encryptedApiKey?: string } | null;
  botSettings?: { tone: string; topK: number; safetyLevel: string; autoReplyEnabled: boolean } | null;
  lineChannels?: Array<{ id: string; channelId: string | null; destination: string | null; basicId: string | null; enabled: boolean }>;
  encryptionKey?: string;
}) {
  const maskedApiKey = w.aiCredential?.encryptedApiKey && w.encryptionKey
    ? maskSecret(decryptSecret(w.aiCredential.encryptedApiKey, w.encryptionKey))
    : undefined;
  return {
    id: w.id,
    name: w.name,
    mode: w.mode,
    ownerLineUserId: w.ownerLineUserId,
    isDefault: w.isDefault,
    ai: w.aiCredential
      ? { provider: w.aiCredential.provider, model: w.aiCredential.model, enabled: w.aiCredential.enabled, apiKeyConfigured: true, maskedApiKey }
      : { apiKeyConfigured: false },
    settings: w.botSettings,
    lineChannels: w.lineChannels ?? []
  };
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}${"*".repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.min(24, Math.max(8, trimmed.length - 8)))}${trimmed.slice(-4)}`;
}

function getBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string") return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

async function verifyLiffUser(config: ApiConfig, request: FastifyRequest): Promise<LiffUser | undefined> {
  const testLineUserId = request.headers["x-test-line-user-id"];
  if (process.env.NODE_ENV === "test" && typeof testLineUserId === "string" && testLineUserId.trim()) {
    return { lineUserId: testLineUserId.trim(), displayName: "Test User" };
  }

  const token = getBearerToken(request);
  if (!token || !config.liffChannelId) return undefined;

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: token,
      client_id: config.liffChannelId
    })
  });
  if (!res.ok) return undefined;

  const BodySchema = z.object({
    sub: z.string().min(1),
    name: z.string().optional()
  });
  const parsed = BodySchema.safeParse(await res.json());
  if (!parsed.success) return undefined;
  const user: LiffUser = { lineUserId: parsed.data.sub };
  if (parsed.data.name) user.displayName = parsed.data.name;
  return user;
}

async function requireLiffUser(config: ApiConfig, request: FastifyRequest, reply: FastifyReply) {
  const user = await verifyLiffUser(config, request);
  if (!user) {
    reply.code(401).send({ ok: false, error: "liff authentication required" });
    return undefined;
  }
  return user;
}

export function renderLegacyAdminHtml(): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LINE AI 顧問設定</title>
  <style>
    :root{--ink:#24211c;--muted:#776f63;--paper:#fffaf1;--card:#ffffff;--line:#e8ddcb;--brand:#143d2b;--accent:#d9853b;--soft:#f3eadb}
    *{box-sizing:border-box}
    body{font-family:ui-sans-serif,system-ui,"Noto Sans TC",sans-serif;margin:0;background:radial-gradient(circle at top left,#fff7dc 0,#f8efe3 35%,#efe7da 100%);color:var(--ink)}
    main{max-width:920px;margin:auto;padding:18px}
    header{padding:18px 4px 8px}
    h1{font-size:28px;line-height:1.15;margin:0 0 8px}
    h2{font-size:18px;margin:0 0 12px}
    section{background:rgba(255,255,255,.92);border:1px solid var(--line);border-radius:22px;padding:18px;margin:14px 0;box-shadow:0 14px 34px #4b35200f}
    label{display:block;font-weight:750;margin-top:12px}
    input,select,textarea{width:100%;padding:12px;border:1px solid #d2c5b3;border-radius:14px;margin-top:7px;font:inherit;background:#fffdf9}
    textarea{min-height:96px;resize:vertical}
    button{background:var(--brand);color:white;border:0;border-radius:999px;padding:12px 16px;font-weight:800;margin-top:14px;cursor:pointer;width:100%}
    button.secondary{background:#fff;color:var(--brand);border:1px solid var(--brand)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .muted{color:var(--muted);font-size:14px;line-height:1.55}
    .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:var(--soft);padding:7px 10px;font-size:13px;font-weight:750;margin:4px 6px 4px 0}
    .status{border-left:5px solid var(--accent);background:#fff8eb}
    pre{white-space:pre-wrap;background:#25231f;color:#f8f2e8;padding:14px;border-radius:14px;overflow:auto;font-size:13px}
    .hidden{display:none}
    @media (max-width:720px){main{padding:14px}section{padding:16px;border-radius:18px}.grid{grid-template-columns:1fr}h1{font-size:24px}}
  </style>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <main>
    <header>
      <h1>PureFit LINE AI 顧問設定</h1>
      <p class="muted">一般使用者預設使用模式 B；想用自己的 Gemini API Key，可以升級成模式 A。這頁會盡量把事情變簡單，不然設定頁太像水電行估價單，人會想逃。</p>
      <span class="pill">模式 B：共用平台 AI</span>
      <span class="pill">模式 A：自帶 AI Key</span>
      <span class="pill">RAG：已接知識庫</span>
    </header>

    <section class="status">
      <h2>登入狀態</h2>
      <p id="loginStatus" class="muted">正在檢查 LIFF 登入狀態...</p>
      <button id="loginButton" class="secondary hidden" onclick="loginWithLine()">使用 LINE 登入</button>
      <button id="logoutButton" class="secondary hidden" onclick="logoutLine()">登出</button>
    </section>

    <section>
      <h2>我的使用模式</h2>
      <div id="modeSummary" class="muted">登入後會顯示你目前使用模式。</div>
      <label>模式 A workspace 名稱</label>
      <input id="claimName" placeholder="例如：我的 PureFit AI 顧問" />
      <button onclick="claimWorkspace()">建立 / 綁定我的模式 A</button>
      <p class="muted">如果你沒有建立模式 A，傳訊息給官方帳號時會繼續使用模式 B。建立後，系統會用你的 LINE User ID 自動切到你的 workspace。</p>
    </section>

    <section>
      <h2>我的 AI Key</h2>
      <label>我的 Workspace</label>
      <select id="myWorkspace"></select>
      <div class="grid">
        <div><label>Provider</label><select id="myProvider"><option value="gemini">Gemini</option></select></div>
        <div><label>Model</label><input id="myModel" value="gemini-2.5-flash" /></div>
      </div>
      <label>Gemini API Key</label>
      <input id="myApiKey" type="password" placeholder="只會送到後端加密保存，不會顯示回來" />
      <label>回覆語氣</label>
      <input id="myTone" value="自然、溫和、專業" />
      <label>System Prompt</label>
      <textarea id="mySystemPrompt">你是繁體中文 LINE AI 健康顧問，請用自然、溫和、專業的語氣回答。若缺乏足夠資訊，請先提出澄清問題。</textarea>
      <button onclick="saveMyAi()">儲存我的 AI 設定</button>
    </section>

    <section>
      <h2>測試問答</h2>
      <label>測試 Workspace</label>
      <select id="playWorkspace"></select>
      <label>問題</label>
      <input id="message" value="外食族怎麼補充營養？" />
      <button onclick="playground()">測試回覆</button>
      <pre id="result"></pre>
    </section>

    <section>
      <h2>管理員模式</h2>
      <p class="muted">保留給系統管理員使用。一般 LIFF 使用者不需要填這段。</p>
      <label>Admin API Key</label>
      <input id="adminKey" type="password" placeholder="x-admin-key" />
      <button class="secondary" onclick="loadWorkspaces()">讀取全部 Workspaces</button>
      <pre id="workspaces"></pre>

      <h2>管理員建立 Workspace</h2>
      <div class="grid">
        <div><label>名稱</label><input id="wsName" placeholder="客戶 A" /></div>
        <div><label>模式</label><select id="wsMode"><option value="shared">模式 B：共用 LINE OA</option><option value="dedicated">模式 A：專屬設定</option></select></div>
      </div>
      <label>Owner LINE User ID</label><input id="ownerLineUserId" />
      <button class="secondary" onclick="createWorkspace()">管理員建立 Workspace</button>

      <h2>管理員 AI Key / Prompt</h2>
      <label>Workspace ID</label><input id="aiWs" value="default" />
      <div class="grid">
        <div><label>Provider</label><select id="provider"><option value="gemini">Gemini</option></select></div>
        <div><label>Model</label><input id="model" value="gemini-2.5-flash" /></div>
      </div>
      <label>API Key</label><input id="apiKey" type="password" />
      <label>語氣</label><input id="tone" value="自然、溫和、專業" />
      <label>System Prompt</label><textarea id="systemPrompt">你是繁體中文 LINE AI 健康顧問，請用自然、溫和、專業的語氣回答。</textarea>
      <button class="secondary" onclick="saveAi()">管理員儲存 AI 設定</button>

      <h2>管理員 LINE Channel</h2>
      <label>Workspace ID</label><input id="lineWs" />
      <div class="grid"><div><label>Channel ID</label><input id="channelId" /></div><div><label>Destination / Bot user ID</label><input id="destination" /></div></div>
      <label>Basic ID</label><input id="basicId" placeholder="@xxxx" />
      <label>Channel Secret</label><input id="channelSecret" type="password" />
      <label>Channel Access Token</label><input id="channelAccessToken" type="password" />
      <button class="secondary" onclick="saveLine()">管理員儲存 LINE Channel</button>
    </section>
  </main>
  <script>
    let liffToken = '';
    let liffReady = false;
    let myWorkspaces = [];

    const show = (el, visible) => el.classList.toggle('hidden', !visible);
    const api = async (path, body, method='POST') => {
      const res = await fetch(path, { method, headers: {'content-type':'application/json','x-admin-key':adminKey.value}, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return data;
    };
    const liffApi = async (path, body, method='POST') => {
      const res = await fetch(path, { method, headers: {'content-type':'application/json','authorization':'Bearer '+liffToken}, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return data;
    };
    function renderWorkspaceOptions(){
      const owned = myWorkspaces.filter(w => !w.isDefault);
      const all = myWorkspaces;
      myWorkspace.innerHTML = owned.map(w => '<option value="'+w.id+'">'+w.name+'（模式 A）</option>').join('');
      playWorkspace.innerHTML = all.map(w => '<option value="'+w.id+'">'+w.name+(w.isDefault?'（模式 B）':'（模式 A）')+'</option>').join('');
      modeSummary.innerHTML = all.map(w => '<div class="pill">'+w.name+' / '+(w.isDefault?'模式 B':'模式 A')+' / AI Key：'+(w.ai.apiKeyConfigured?'已設定':'未設定')+'</div>').join('') || '目前沒有可用 workspace。';
    }
    async function refreshMe(){
      const me = await liffApi('/liff/me', null, 'GET');
      myWorkspaces = me.workspaces || [];
      loginStatus.textContent = '已登入：' + (me.user.displayName || me.user.lineUserId);
      renderWorkspaceOptions();
      show(logoutButton, true);
    }
    async function initLiff(){
      const cfg = await fetch('/liff/config').then(r => r.json());
      if (!cfg.liffId || !window.liff) {
        loginStatus.textContent = 'LIFF 尚未設定完成，仍可使用下方管理員模式。';
        show(loginButton, false);
        return;
      }
      await liff.init({ liffId: cfg.liffId });
      liffReady = true;
      if (!liff.isLoggedIn()) {
        loginStatus.textContent = '尚未登入 LINE。';
        show(loginButton, true);
        return;
      }
      liffToken = liff.getIDToken() || '';
      if (!liffToken) {
        loginStatus.textContent = '無法取得 LIFF ID token，請重新登入。';
        show(loginButton, true);
        return;
      }
      await refreshMe();
    }
    function loginWithLine(){ if (liffReady) liff.login(); }
    function logoutLine(){ if (liffReady) { liff.logout(); location.reload(); } }
    async function claimWorkspace(){
      result.textContent = JSON.stringify(await liffApi('/liff/workspaces/claim', { name: claimName.value || '我的 PureFit AI 顧問' }), null, 2);
      await refreshMe();
    }
    async function saveMyAi(){
      if (!myWorkspace.value) throw new Error('請先建立模式 A workspace');
      await liffApi('/liff/workspaces/'+encodeURIComponent(myWorkspace.value)+'/ai', { provider: myProvider.value, model: myModel.value, apiKey: myApiKey.value || undefined, enabled: true });
      await liffApi('/liff/workspaces/'+encodeURIComponent(myWorkspace.value)+'/settings', { tone: myTone.value, systemPrompt: mySystemPrompt.value, autoReplyEnabled: true });
      result.textContent = '我的 AI 設定已儲存';
      myApiKey.value = '';
      await refreshMe();
    }
    async function loadWorkspaces(){ workspaces.textContent = JSON.stringify(await api('/admin/workspaces', null, 'GET'), null, 2); }
    async function createWorkspace(){ result.textContent = JSON.stringify(await api('/admin/workspaces', { name: wsName.value, mode: wsMode.value, ownerLineUserId: ownerLineUserId.value || undefined }), null, 2); await loadWorkspaces(); }
    async function saveAi(){
      await api('/admin/workspaces/'+encodeURIComponent(aiWs.value)+'/ai', { provider: provider.value, model: model.value, apiKey: apiKey.value || undefined, enabled: true });
      await api('/admin/workspaces/'+encodeURIComponent(aiWs.value)+'/settings', { tone: tone.value, systemPrompt: systemPrompt.value, autoReplyEnabled: true });
      result.textContent = 'AI 設定已儲存';
    }
    async function saveLine(){ result.textContent = JSON.stringify(await api('/admin/workspaces/'+encodeURIComponent(lineWs.value)+'/line-channel', { channelId: channelId.value, destination: destination.value, basicId: basicId.value, channelSecret: channelSecret.value, channelAccessToken: channelAccessToken.value, enabled: true }), null, 2); }
    async function playground(){
      if (liffToken) result.textContent = JSON.stringify(await liffApi('/liff/playground', { workspaceId: playWorkspace.value, message: message.value }), null, 2);
      else result.textContent = JSON.stringify(await api('/admin/playground', { workspaceId: playWorkspace.value || 'default', message: message.value }), null, 2);
    }
    initLiff().catch(err => { loginStatus.textContent = 'LIFF 初始化失敗：' + err.message; show(loginButton, true); });
  </script>
</body>
</html>`;
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

function isLineVerifyReplyToken(replyToken: string) {
  // LINE's webhook verification uses dummy reply tokens; do not call the reply API for those events.
  return /^0{32,}$/.test(replyToken) || /^f{32,}$/i.test(replyToken);
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

async function findOwnedWorkspace(prisma: ReturnType<typeof getPrisma>, lineUserId: string) {
  return prisma.workspace.findFirst({
    where: {
      ownerLineUserId: lineUserId,
      mode: "dedicated",
      isDefault: false
    },
    orderBy: { createdAt: "asc" },
    include: {
      aiCredential: { select: { provider: true, model: true, enabled: true, encryptedApiKey: true } },
      botSettings: { select: { tone: true, topK: true, safetyLevel: true, autoReplyEnabled: true } },
      lineChannels: { select: { id: true, channelId: true, destination: true, basicId: true, enabled: true } }
    }
  });
}

async function getLiffVisibleWorkspaces(config: ApiConfig, prisma: ReturnType<typeof getPrisma>, lineUserId: string) {
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { id: config.defaultWorkspaceId },
        { ownerLineUserId: lineUserId }
      ]
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      aiCredential: { select: { provider: true, model: true, enabled: true, encryptedApiKey: true } },
      botSettings: { select: { tone: true, topK: true, safetyLevel: true, autoReplyEnabled: true } },
      lineChannels: { select: { id: true, channelId: true, destination: true, basicId: true, enabled: true } }
    }
  });
  return workspaces.map((workspace) =>
    workspacePublicShape({
      ...workspace,
      aiCredential: workspace.isDefault ? null : workspace.aiCredential,
      encryptionKey: config.encryptionKey
    })
  );
}

async function ensureWorkspaceOwner(input: {
  prisma: ReturnType<typeof getPrisma>;
  workspaceId: string;
  lineUserId: string;
}) {
  return input.prisma.workspace.findFirst({
    where: {
      id: input.workspaceId,
      ownerLineUserId: input.lineUserId,
      isDefault: false
    }
  });
}

async function resolveWorkspaceForLineUser(input: {
  config: ApiConfig;
  prisma: ReturnType<typeof getPrisma>;
  activeWorkspaceId: string;
  lineUserId: string;
}): Promise<string> {
  if (input.activeWorkspaceId !== input.config.defaultWorkspaceId) return input.activeWorkspaceId;
  const owned = await findOwnedWorkspace(input.prisma, input.lineUserId);
  return owned?.id ?? input.activeWorkspaceId;
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

  // Mode B: the shared default workspace can use the platform AI key.
  // Dedicated workspaces still require BYOK, so one user's usage does not burn the platform budget.
  const platformCredential =
    !input.config.b2cRequireUserAi &&
    !credential &&
    input.workspaceId === input.config.defaultWorkspaceId &&
    input.config.platformGeminiApiKey
      ? {
          provider: "gemini",
          model: input.config.platformGeminiModel,
          apiKey: input.config.platformGeminiApiKey
        }
      : null;

  if (!credential?.enabled && !platformCredential) return fallback;

  const provider = platformCredential?.provider ?? credential!.provider;
  const model = platformCredential?.model ?? credential!.model;
  const apiKey = platformCredential?.apiKey ?? decryptSecret(credential!.encryptedApiKey, input.config.encryptionKey);

  const commonOpts = {
    apiKey,
    model,
    timeoutMs: input.config.aiTimeoutMs,
    fallback,
    ...(settings?.tone ? { tone: settings.tone } : {}),
    ...(settings?.systemPrompt ? { systemPrompt: settings.systemPrompt } : {})
  };

  if (provider === "gemini") return new GeminiAnswerComposer(commonOpts);
  if (provider === "openai") {
    return new OpenAICompatibleAnswerComposer({ ...commonOpts, baseUrl: "https://api.openai.com/v1", apiMode: "responses" });
  }
  if (provider === "deepseek") return new OpenAICompatibleAnswerComposer({ ...commonOpts, baseUrl: "https://api.deepseek.com" });

  return fallback;
}

async function workspaceHasEnabledAiCredential(input: {
  prisma: ReturnType<typeof getPrisma>;
  workspaceId: string;
}): Promise<boolean> {
  const credential = await input.prisma.aiProviderCredential.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { enabled: true }
  });
  return Boolean(credential?.enabled);
}

async function b2cGateReply(input: {
  config: ApiConfig;
  prisma: ReturnType<typeof getPrisma>;
  workspaceId: string;
}): Promise<string | undefined> {
  if (input.config.modelCatalogUpdating) return MODEL_UPDATE_REPLY;
  if (!input.config.b2cRequireUserAi) return undefined;
  return (await workspaceHasEnabledAiCredential({ prisma: input.prisma, workspaceId: input.workspaceId }))
    ? undefined
    : AI_SETUP_REPLY;
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
    allowedHeaders: ["authorization", "content-type", "x-line-signature", "x-admin-key", "x-test-line-user-id"],
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
    return reply.type("text/html; charset=utf-8").send(renderAdminHtmlPage({ showAdminTools: true }));
  });

  fastify.get("/liff/admin", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderAdminHtmlPage());
  });

  fastify.get("/liff/config", async () => ({
    ok: true,
    liffId: config.liffId ?? null,
    liffChannelIdConfigured: Boolean(config.liffChannelId),
    b2cRequireUserAi: config.b2cRequireUserAi,
    modelCatalogUpdating: config.modelCatalogUpdating
  }));

  fastify.get("/liff/model-catalog", async () => ({
    ok: true,
    updating: config.modelCatalogUpdating,
    providers: MODEL_CATALOG
  }));

  fastify.get("/cron/update-model-catalog", async (request, reply) => {
    if (config.cronSecret) {
      const header = request.headers.authorization;
      if (header !== `Bearer ${config.cronSecret}`) return reply.code(401).send({ ok: false, error: "unauthorized" });
    }

    return reply.send({
      ok: true,
      updatedAt: new Date().toISOString(),
      providers: MODEL_CATALOG.map((provider) => ({
        provider: provider.provider,
        modelCount: provider.models.length
      }))
    });
  });

  fastify.get("/liff/me", async (request, reply) => {
    const user = await requireLiffUser(config, request, reply);
    if (!user) return reply;

    const workspaces = await getLiffVisibleWorkspaces(config, prisma, user.lineUserId);
    return reply.send({ ok: true, user, workspaces });
  });

  fastify.post<{ Body: unknown }>("/liff/workspaces/claim", async (request, reply) => {
    const user = await requireLiffUser(config, request, reply);
    if (!user) return reply;

    const BodySchema = z.object({
      name: z.string().min(1).max(120).default("我的 PureFit AI 顧問")
    });
    const parsed = BodySchema.safeParse(parseJsonBody(request.body));
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });

    const existing = await findOwnedWorkspace(prisma, user.lineUserId);
    if (existing) return reply.send({ ok: true, workspace: workspacePublicShape(existing), created: false });

    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        mode: "dedicated",
        ownerLineUserId: user.lineUserId
      }
    });
    await prisma.botSettings.create({ data: { workspaceId: workspace.id } });

    return reply.send({
      ok: true,
      workspace: workspacePublicShape({
        ...workspace,
        botSettings: { tone: "professional", topK: 5, safetyLevel: "standard", autoReplyEnabled: true }
      }),
      created: true
    });
  });

  fastify.put<{ Params: { id: string }; Body: unknown }>("/liff/workspaces/:id/settings", async (request, reply) => {
    const user = await requireLiffUser(config, request, reply);
    if (!user) return reply;

    const workspace = await ensureWorkspaceOwner({ prisma, workspaceId: request.params.id, lineUserId: user.lineUserId });
    if (!workspace) return reply.code(403).send({ ok: false, error: "workspace access denied" });

    const BodySchema = z.object({
      tone: z.string().optional(),
      systemPrompt: z.string().optional(),
      topK: z.number().int().min(1).max(20).optional(),
      safetyLevel: z.string().optional(),
      autoReplyEnabled: z.boolean().optional()
    });
    const parsed = BodySchema.safeParse(parseJsonBody(request.body));
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });

    const settings = await prisma.botSettings.upsert({
      where: { workspaceId: request.params.id },
      update: {
        ...(parsed.data.tone !== undefined ? { tone: parsed.data.tone } : {}),
        ...(parsed.data.systemPrompt !== undefined ? { systemPrompt: parsed.data.systemPrompt || null } : {}),
        ...(parsed.data.topK !== undefined ? { topK: parsed.data.topK } : {}),
        ...(parsed.data.safetyLevel !== undefined ? { safetyLevel: parsed.data.safetyLevel } : {}),
        ...(parsed.data.autoReplyEnabled !== undefined ? { autoReplyEnabled: parsed.data.autoReplyEnabled } : {}),
        updatedAt: new Date()
      },
      create: {
        workspaceId: request.params.id,
        ...(parsed.data.tone !== undefined ? { tone: parsed.data.tone } : {}),
        ...(parsed.data.systemPrompt !== undefined ? { systemPrompt: parsed.data.systemPrompt || null } : {}),
        ...(parsed.data.topK !== undefined ? { topK: parsed.data.topK } : {}),
        ...(parsed.data.safetyLevel !== undefined ? { safetyLevel: parsed.data.safetyLevel } : {}),
        ...(parsed.data.autoReplyEnabled !== undefined ? { autoReplyEnabled: parsed.data.autoReplyEnabled } : {})
      }
    });
    return reply.send({
      ok: true,
      settings: {
        tone: settings.tone,
        topK: settings.topK,
        safetyLevel: settings.safetyLevel,
        autoReplyEnabled: settings.autoReplyEnabled
      }
    });
  });

  fastify.put<{ Params: { id: string }; Body: unknown }>("/liff/workspaces/:id/ai", async (request, reply) => {
    const user = await requireLiffUser(config, request, reply);
    if (!user) return reply;

    const workspace = await ensureWorkspaceOwner({ prisma, workspaceId: request.params.id, lineUserId: user.lineUserId });
    if (!workspace) return reply.code(403).send({ ok: false, error: "workspace access denied" });

    const BodySchema = z.object({
      provider: z.enum(["gemini", "openai", "deepseek"]).default("gemini"),
      model: z.string().min(1).default("gemini-3.5-flash"),
      apiKey: z.string().min(1).optional(),
      enabled: z.boolean().default(true),
      monthlyBudgetLimit: z.number().positive().optional()
    });
    const parsed = BodySchema.safeParse(parseJsonBody(request.body));
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });

    const existing = await prisma.aiProviderCredential.findUnique({ where: { workspaceId: request.params.id } });
    if (!existing && !parsed.data.apiKey) return reply.code(400).send({ ok: false, error: "apiKey required for first setup" });

    const updateData: {
      provider: string;
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
    if (parsed.data.monthlyBudgetLimit !== undefined) updateData.monthlyBudgetLimit = parsed.data.monthlyBudgetLimit;
    if (parsed.data.apiKey) updateData.encryptedApiKey = encryptSecret(parsed.data.apiKey, config.encryptionKey);

    const createData: {
      workspaceId: string;
      provider: string;
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
    if (parsed.data.monthlyBudgetLimit !== undefined) createData.monthlyBudgetLimit = parsed.data.monthlyBudgetLimit;

    const credential = await prisma.aiProviderCredential.upsert({
      where: { workspaceId: request.params.id },
      update: updateData,
      create: createData,
      select: { provider: true, model: true, enabled: true, monthlyBudgetLimit: true }
    });

    return reply.send({ ok: true, ai: { ...credential, apiKeyConfigured: true } });
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
      provider: z.enum(["gemini", "openai", "deepseek"]).default("gemini"),
      model: z.string().min(1).default("gemini-3.5-flash"),
      apiKey: z.string().min(1).optional(),
      enabled: z.boolean().default(true),
      monthlyBudgetLimit: z.number().positive().optional()
    });
    const parsed = BodySchema.safeParse(parseJsonBody(request.body));
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid body" });
    const existing = await prisma.aiProviderCredential.findUnique({ where: { workspaceId: request.params.id } });
    if (!existing && !parsed.data.apiKey) return reply.code(400).send({ ok: false, error: "apiKey required for first setup" });
    const aiUpdateData: {
      provider: string;
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
      provider: string;
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
      if (isLineVerifyReplyToken(event.replyToken)) {
        results.push({
          ok: true,
          messageId: "line-verify",
          conversationId: active.workspaceId,
          replyText: ""
        });
        continue;
      }

      const lineUserId = event.source.userId;
      if (!lineUserId) continue;
      const workspaceId = await resolveWorkspaceForLineUser({
        config,
        prisma,
        activeWorkspaceId: active.workspaceId,
        lineUserId
      });
      const gateReply = await b2cGateReply({ config, prisma, workspaceId });
      if (gateReply) {
        const replyInput: { replyToken: string; text: string; accessToken?: string } = {
          replyToken: event.replyToken,
          text: gateReply
        };
        if (active.channelAccessToken) replyInput.accessToken = active.channelAccessToken;
        await replyToLine(config, replyInput);
        results.push({
          ok: true,
          messageId: "b2c-gate",
          conversationId: workspaceId,
          replyText: gateReply
        });
        continue;
      }

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

  fastify.post<{ Body: unknown }>("/liff/playground", async (request, reply) => {
    const user = await requireLiffUser(config, request, reply);
    if (!user) return reply;

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
    if (workspaceId !== config.defaultWorkspaceId) {
      const workspace = await ensureWorkspaceOwner({ prisma, workspaceId, lineUserId: user.lineUserId });
      if (!workspace) return reply.code(403).send({ ok: false, error: "workspace access denied" });
    }

    const gateReply = await b2cGateReply({ config, prisma, workspaceId });
    if (gateReply) {
      return reply.send({
        ok: true,
        inputMessage: parsed.data.message,
        workspaceId,
        replyText: gateReply,
        intent: null,
        retrieved: [],
        answer: { text: gateReply, citations: [] }
      });
    }

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
      lineUserId: user.lineUserId,
      replyToken: "mock-reply-token",
      text: parsed.data.message,
      rawEventJson: JSON.stringify({ type: "liff-playground" }),
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
