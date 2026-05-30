import { beforeAll, describe, expect, test } from "vitest";
import { createApp } from "../src/server.js";

describe("LINE webhook RAG entry", () => {
  beforeAll(() => {
    process.env.ENABLE_MOCK_MODE = "true";
    process.env.ADMIN_API_KEY = "dev-admin-key";
    process.env.MOCK_KB_PATH = "./examples/mock-kb.json";
  });

  test("accepts a LINE text event and returns a mock reply", async () => {
    const app = await createApp();
    const payload = {
      destination: "U-destination",
      events: [
        {
          type: "message",
          replyToken: "reply-token",
          timestamp: Date.now(),
          source: { type: "user", userId: "U-test" },
          message: { id: "m1", type: "text", text: "我想問營養" },
        },
      ],
    };

    const res = await app.fastify.inject({
      method: "POST",
      url: "/webhooks/line",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.results[0].replyText).toEqual(expect.any(String));
    await app.fastify.close();
  });
});
