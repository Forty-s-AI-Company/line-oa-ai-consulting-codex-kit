import { describe, expect, test } from "vitest";
import http from "node:http";
import { AmwayKnowledgeBaseRetrievalProvider } from "../src/retrieval/amwayKnowledgeBaseRetrievalProvider.js";

function createTestServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  const server = http.createServer(handler);
  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("bad address"));
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe("AmwayKnowledgeBaseRetrievalProvider", () => {
  test("successfully converts /search/semantic results to RetrievalChunk[]", async () => {
    const s = await createTestServer((req, res) => {
      if (!req.url?.startsWith("/search/semantic")) return res.writeHead(404).end();
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          q: "查詢文字",
          source_kind: "all",
          results: [
            {
              source_rel_path: "docs/a.md",
              chunk_id: "2",
              title: "標題",
              snippet: "片段內容",
              score: 0.87,
              categories: ["c1"],
              tags: ["t1"],
              source_kind: "youtube",
            },
          ],
        }),
      );
    });

    try {
      const p = new AmwayKnowledgeBaseRetrievalProvider({ baseUrl: s.baseUrl, timeoutMs: 15000 });
      const out = await p.search({ query: "查詢文字", domain: "unknown", topK: 5 });
      expect(out).toHaveLength(1);
      expect(out[0]!.id).toBe("docs/a.md:2");
      expect(out[0]!.title).toBe("標題");
      expect(out[0]!.content).toBe("片段內容");
      expect(out[0]!.score).toBe(0.87);
      expect(out[0]!.source.sourceType).toBe("youtube");
      expect(out[0]!.source.sourcePath).toBe("docs/a.md");
      expect(out[0]!.source.chunkIndex).toBe(2);
    } finally {
      await s.close();
    }
  });

  test("returns [] when API returns 500", async () => {
    const s = await createTestServer((req, res) => {
      if (!req.url?.startsWith("/search/semantic")) return res.writeHead(404).end();
      res.writeHead(500).end("boom");
    });

    try {
      const p = new AmwayKnowledgeBaseRetrievalProvider({ baseUrl: s.baseUrl, timeoutMs: 15000 });
      const out = await p.search({ query: "q", domain: "unknown", topK: 5 });
      expect(out).toEqual([]);
    } finally {
      await s.close();
    }
  });

  test("returns [] when results missing or invalid", async () => {
    const s = await createTestServer((req, res) => {
      if (!req.url?.startsWith("/search/semantic")) return res.writeHead(404).end();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ q: "x", source_kind: "all" }));
    });

    try {
      const p = new AmwayKnowledgeBaseRetrievalProvider({ baseUrl: s.baseUrl, timeoutMs: 15000 });
      const out = await p.search({ query: "q", domain: "unknown", topK: 5 });
      expect(out).toEqual([]);
    } finally {
      await s.close();
    }
  });

  test("sends Authorization header when apiToken is present", async () => {
    let authHeader: string | undefined;

    const s = await createTestServer((req, res) => {
      authHeader = req.headers.authorization;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ results: [] }));
    });

    try {
      const p = new AmwayKnowledgeBaseRetrievalProvider({
        baseUrl: s.baseUrl,
        apiToken: "secret-token",
        timeoutMs: 15000,
      });
      await p.search({ query: "q", domain: "unknown", topK: 5 });
      expect(authHeader).toBe("Bearer secret-token");
    } finally {
      await s.close();
    }
  });
});

