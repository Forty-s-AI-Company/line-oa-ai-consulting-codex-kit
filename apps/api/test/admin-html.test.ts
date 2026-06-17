import { beforeAll, describe, expect, test } from "vitest";
import { createApp } from "../src/server.js";

describe("admin html", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_MOCK_MODE = "true";
    process.env.ADMIN_API_KEY = "dev-admin-key";
    process.env.MOCK_KB_PATH = "./examples/mock-kb.json";
    process.env.LIFF_ID = "test-liff-id";
    process.env.LIFF_CHANNEL_ID = "test-channel-id";
  });

  test("serves the LIFF B2C setup page without admin-only tools", async () => {
    const app = await createApp();
    const res = await app.fastify.inject({ method: "GET", url: "/liff/admin" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("PureFit AI 健康顧問設定");
    expect(res.body).toContain("static.line-scdn.net/liff");
    expect(res.body).toContain("正在載入你的 AI 設定");
    expect(res.body).toContain("AI 管理");
    expect(res.body).toContain("maskedApiKey");
    expect(res.body).toContain('id="saveAiButton"');
    expect(res.body).toContain('id="saveAiFeedback"');
    expect(res.body).not.toContain('id="adminTools"');
    expect(res.body).not.toContain("送出測試");
    expect(res.body).not.toContain("apiBaseUrl");

    await app.fastify.close();
  });

  test("keeps admin-only tools on the admin page", async () => {
    const app = await createApp();
    const res = await app.fastify.inject({ method: "GET", url: "/admin" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('id="adminTools"');
    expect(res.body).toContain("讀取 Workspaces");

    await app.fastify.close();
  });
});
