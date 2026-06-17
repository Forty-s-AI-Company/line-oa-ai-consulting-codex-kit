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

  test("serves the LIFF B2C setup page with LIFF SDK and model choices", async () => {
    const app = await createApp();
    const res = await app.fastify.inject({ method: "GET", url: "/liff/admin" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("PureFit AI 健康顧問設定");
    expect(res.body).toContain("static.line-scdn.net/liff");
    expect(res.body).toContain("ChatGPT");
    expect(res.body).toContain("DeepSeek");
    expect(res.body).toContain("escapeHtml");

    await app.fastify.close();
  });
});
