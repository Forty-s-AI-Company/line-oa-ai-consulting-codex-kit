import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server.js";

describe("Mode B platform AI", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_MOCK_MODE = "true";
    process.env.ADMIN_API_KEY = "dev-admin-key";
    process.env.MOCK_KB_PATH = "./examples/mock-kb.json";
    process.env.DEFAULT_WORKSPACE_ID = "default";
    process.env.PLATFORM_GEMINI_API_KEY = "test-platform-key";
    process.env.PLATFORM_GEMINI_MODEL = "gemini-2.5-flash";
    delete process.env.AKB_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PLATFORM_GEMINI_API_KEY;
    delete process.env.PLATFORM_GEMINI_MODEL;
  });

  test("uses the platform Gemini key for the shared default workspace", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "這是平台 AI 依照知識庫整理後的回覆。" }]
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const app = await createApp();
    const res = await app.fastify.inject({
      method: "POST",
      url: "/admin/playground",
      headers: { "content-type": "application/json", "x-admin-key": "dev-admin-key" },
      payload: JSON.stringify({ workspaceId: "default", message: "外食族怎麼補充營養？" })
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().replyText).toContain("平台 AI");
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toContain("generativelanguage.googleapis.com");

    await app.fastify.close();
  });
});
