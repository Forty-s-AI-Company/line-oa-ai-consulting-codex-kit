import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/server.js";

describe("LIFF model catalog", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_MOCK_MODE = "true";
    process.env.ADMIN_API_KEY = "dev-admin-key";
    process.env.MOCK_KB_PATH = "./examples/mock-kb.json";
    process.env.LIFF_ID = "test-liff-id";
    process.env.LIFF_CHANNEL_ID = "test-channel-id";
  });

  test("returns current provider models and keeps legacy models marked", async () => {
    const app = await createApp();
    const res = await app.fastify.inject({ method: "GET", url: "/liff/model-catalog" });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    const gemini = body.providers.find((provider: { provider: string }) => provider.provider === "gemini");
    const openai = body.providers.find((provider: { provider: string }) => provider.provider === "openai");
    const deepseek = body.providers.find((provider: { provider: string }) => provider.provider === "deepseek");

    expect(gemini.recommendedModel).toBe("gemini-3.5-flash");
    expect(gemini.models).toContain("gemini-3.5-flash");
    expect(openai.models).toContain("gpt-5.4-mini");
    expect(openai.modelOptions.some((model: { id: string }) => model.id === "gpt-4.1")).toBe(true);
    expect(deepseek.recommendedModel).toBe("deepseek-v4-flash");
    expect(deepseek.models.slice(0, 2)).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    expect(deepseek.modelOptions.find((model: { id: string }) => model.id === "deepseek-chat")?.status).toBe("legacy");

    await app.fastify.close();
  });

  test("returns API base URL for LIFF webview API calls", async () => {
    process.env.API_BASE_URL = "https://example.test";
    const app = await createApp();
    const res = await app.fastify.inject({ method: "GET", url: "/liff/config" });

    expect(res.statusCode).toBe(200);
    expect(res.json().apiBaseUrl).toBe("https://example.test");

    await app.fastify.close();
    delete process.env.API_BASE_URL;
  });
});
