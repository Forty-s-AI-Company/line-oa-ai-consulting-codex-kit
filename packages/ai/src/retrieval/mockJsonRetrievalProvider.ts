import fs from "node:fs/promises";
import path from "node:path";
import type { RetrievalProvider } from "../interfaces.js";
import type { Domain, RetrievalChunk } from "@repo/shared";

type MockKbItem = {
  id: string;
  title: string;
  domain: Domain;
  category?: string;
  source_type: string;
  source_path: string;
  chunk_index: number;
  content: string;
  keywords?: string[];
  updated_at?: string;
  compliance_level?: "normal" | "cautious" | "strict";
};

function scoreItem(query: string, item: MockKbItem): number {
  const q = query.toLowerCase();
  const text = `${item.title}\n${item.content}`.toLowerCase();
  let score = 0;
  if (text.includes(q)) score += 3;
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (text.includes(t)) score += 1;
  }
  if (item.keywords) {
    for (const kw of item.keywords) {
      if (q.includes(String(kw).toLowerCase())) score += 1;
    }
  }
  return score;
}

export class MockJsonRetrievalProvider implements RetrievalProvider {
  private cache: MockKbItem[] | null = null;
  constructor(private opts: { mockKbPath: string }) {}

  private async load(): Promise<MockKbItem[]> {
    if (this.cache) return this.cache;
    const resolved = path.resolve(process.cwd(), this.opts.mockKbPath);
    const raw = await fs.readFile(resolved, "utf8");
    this.cache = JSON.parse(raw) as MockKbItem[];
    return this.cache;
  }

  async search(input: { query: string; domain: string; topK: number }): Promise<RetrievalChunk[]> {
    const items = await this.load();
    const filtered = items.filter((i) => (input.domain === "unknown" ? true : i.domain === input.domain));
    const scored = filtered
      .map((i) => ({ item: i, score: scoreItem(input.query, i) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, input.topK));

    return scored.map(({ item, score }) => {
      const chunk: RetrievalChunk = {
        id: `${item.id}:${item.chunk_index}`,
        title: item.title,
        domain: item.domain,
        content: item.content,
        score,
        source: { sourceType: item.source_type, sourcePath: item.source_path, chunkIndex: item.chunk_index }
      };
      if (item.compliance_level) chunk.complianceLevel = item.compliance_level;
      return chunk;
    });
  }
}
