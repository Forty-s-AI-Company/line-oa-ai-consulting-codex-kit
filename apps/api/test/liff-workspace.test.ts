import { beforeAll, describe, expect, test } from "vitest";
import { getPrisma } from "@repo/db";
import { createApp } from "../src/server.js";

describe("LIFF workspace binding", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_MOCK_MODE = "true";
    process.env.ADMIN_API_KEY = "dev-admin-key";
    process.env.MOCK_KB_PATH = "./examples/mock-kb.json";
    process.env.LIFF_ID = "test-liff-id";
    process.env.LIFF_CHANNEL_ID = "test-channel-id";
  });

  test("lets a LIFF user claim a dedicated workspace and blocks other users", async () => {
    const app = await createApp();
    const lineUserId = `U-liff-owner-${Date.now()}`;
    const otherLineUserId = `U-liff-other-${Date.now()}`;

    const unauthorized = await app.fastify.inject({
      method: "GET",
      url: "/liff/me"
    });
    expect(unauthorized.statusCode).toBe(401);

    const claim = await app.fastify.inject({
      method: "POST",
      url: "/liff/workspaces/claim",
      headers: { "content-type": "application/json", "x-test-line-user-id": lineUserId },
      payload: JSON.stringify({ name: "我的測試 AI 顧問" })
    });
    expect(claim.statusCode).toBe(200);
    const claimedBody = claim.json();
    expect(claimedBody.ok).toBe(true);
    expect(claimedBody.workspace.ownerLineUserId).toBe(lineUserId);
    expect(claimedBody.workspace.mode).toBe("dedicated");

    const me = await app.fastify.inject({
      method: "GET",
      url: "/liff/me",
      headers: { "x-test-line-user-id": lineUserId }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().workspaces.some((w: { id: string }) => w.id === claimedBody.workspace.id)).toBe(true);

    const ownerAi = await app.fastify.inject({
      method: "PUT",
      url: `/liff/workspaces/${claimedBody.workspace.id}/ai`,
      headers: { "content-type": "application/json", "x-test-line-user-id": lineUserId },
      payload: JSON.stringify({ provider: "gemini", model: "gemini-2.5-flash", apiKey: "fake-test-key" })
    });
    expect(ownerAi.statusCode).toBe(200);
    expect(JSON.stringify(ownerAi.json())).not.toContain("fake-test-key");

    const otherSettings = await app.fastify.inject({
      method: "PUT",
      url: `/liff/workspaces/${claimedBody.workspace.id}/settings`,
      headers: { "content-type": "application/json", "x-test-line-user-id": otherLineUserId },
      payload: JSON.stringify({ tone: "should not update" })
    });
    expect(otherSettings.statusCode).toBe(403);

    await app.fastify.close();
  });

  test("routes shared LINE OA users with claimed workspace to their own workspace", async () => {
    const app = await createApp();
    const prisma = getPrisma();
    const lineUserId = `U-liff-webhook-${Date.now()}`;

    const claim = await app.fastify.inject({
      method: "POST",
      url: "/liff/workspaces/claim",
      headers: { "content-type": "application/json", "x-test-line-user-id": lineUserId },
      payload: JSON.stringify({ name: "Webhook 專用 Workspace" })
    });
    const workspaceId = claim.json().workspace.id as string;

    const webhook = await app.fastify.inject({
      method: "POST",
      url: "/webhooks/line",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        destination: "U-shared-destination",
        events: [
          {
            type: "message",
            replyToken: "reply-token",
            timestamp: Date.now(),
            source: { type: "user", userId: lineUserId },
            message: { id: "m1", type: "text", text: "外食族怎麼補充營養？" }
          }
        ]
      })
    });
    expect(webhook.statusCode).toBe(200);

    const user = await prisma.user.findUnique({
      where: { workspaceId_lineUserId: { workspaceId, lineUserId } }
    });
    expect(user?.workspaceId).toBe(workspaceId);

    await app.fastify.close();
  });
});
