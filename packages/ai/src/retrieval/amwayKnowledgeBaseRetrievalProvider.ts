import type { RetrievalProvider } from "../interfaces.js";
import type { Domain, RetrievalChunk } from "@repo/shared";

type AkbSemanticSearchResult = {
  source_rel_path?: unknown;
  chunk_id?: unknown;
  title?: unknown;
  snippet?: unknown;
  score?: unknown;
  categories?: unknown;
  tags?: unknown;
  source_kind?: unknown;
};

type AkbSemanticSearchResponse = {
  q?: unknown;
  source_kind?: unknown;
  results?: unknown;
};

function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function asNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toChunkIndex(chunkId: unknown): number {
  const n = asNumber(chunkId);
  if (n == null) return 0;
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function coerceDomain(raw: string): Domain {
  switch (raw) {
    case "nutrition":
    case "beauty":
    case "cleaning":
    case "water":
    case "air":
    case "business":
    case "unknown":
      return raw;
    default:
      return "unknown";
  }
}

export class AmwayKnowledgeBaseRetrievalProvider implements RetrievalProvider {
  constructor(
    private opts: {
      baseUrl: string;
      apiToken?: string;
      timeoutMs?: number;
    },
  ) {}

  async search(input: { query: string; domain: string; topK: number }): Promise<RetrievalChunk[]> {
    const topK = Math.max(1, Math.min(50, Math.trunc(input.topK || 5))); // hard cap to avoid abuse
    const q = input.query?.trim();
    if (!q) return [];

    const baseUrl = this.opts.baseUrl.replace(/\/+$/, "");
    const url = new URL(`${baseUrl}/search/semantic`);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(topK));

    const controller = new AbortController();
    const timeoutMs = this.opts.timeoutMs ?? 15000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (this.opts.apiToken) {
        headers.Authorization = `Bearer ${this.opts.apiToken}`;
      }

      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn(`[AKB] semantic search failed: status=${res.status}`);
        return [];
      }

      let data: AkbSemanticSearchResponse;
      try {
        data = (await res.json()) as AkbSemanticSearchResponse;
      } catch {
        console.warn("[AKB] semantic search failed: invalid json");
        return [];
      }

      const rawResults = (data as AkbSemanticSearchResponse).results;
      if (!Array.isArray(rawResults)) return [];

      const chunks: RetrievalChunk[] = [];
      const domain = coerceDomain(input.domain);

      for (const r of rawResults as AkbSemanticSearchResult[]) {
        const sourceRelPath = asString(r.source_rel_path) ?? "";
        const chunkIdStr = asString(r.chunk_id) ?? "0";
        const title = (asString(r.title) ?? "").trim() || sourceRelPath || "(unknown)";
        const snippet = asString(r.snippet) ?? "";
        const score = asNumber(r.score) ?? 0;
        const sourceKind = asString(r.source_kind) ?? "unknown";

        // Minimal shape guard; if there is no snippet, it's not useful for answering.
        if (!snippet) continue;

        chunks.push({
          id: `${sourceRelPath}:${chunkIdStr}`,
          title,
          domain,
          content: snippet,
          score,
          source: {
            sourceType: sourceKind,
            sourcePath: sourceRelPath,
            chunkIndex: toChunkIndex(r.chunk_id),
          },
        });
      }

      return chunks;
    } catch (e) {
      // Do not log token or full URL with sensitive params; keep it minimal.
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[AKB] semantic search error: ${msg}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}
