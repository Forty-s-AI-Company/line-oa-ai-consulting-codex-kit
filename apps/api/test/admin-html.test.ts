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

  test("serves the LIFF B2C setup page with save feedback states", async () => {
    const app = await createApp();
    const res = await app.fastify.inject({ method: "GET", url: "/liff/admin" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("PureFit AI 健康顧問設定");
    expect(res.body).toContain("static.line-scdn.net/liff");
    expect(res.body).toContain("ChatGPT");
    expect(res.body).toContain("DeepSeek");
    expect(res.body).toContain("escapeHtml");
    expect(res.body).toContain('id="saveAiButton"');
    expect(res.body).toContain('id="saveAiFeedback"');
    expect(res.body).not.toContain("apiBaseUrl");
    expect(res.body).toContain("儲存中...");
    expect(res.body).toContain("AI 設定已儲存成功");
    expect(res.body).toContain("儲存失敗：");
    expect(res.body).toContain("儲存 AI Key / 模型");
    expect(res.body).toContain("儲存回答設定");

    await app.fastify.close();
  });
});
