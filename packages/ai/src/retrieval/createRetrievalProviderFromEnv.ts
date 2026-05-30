import path from "node:path";
import { AmwayKnowledgeBaseRetrievalProvider } from "./amwayKnowledgeBaseRetrievalProvider.js";
import { MockJsonRetrievalProvider } from "./mockJsonRetrievalProvider.js";
import type { RetrievalProvider } from "../interfaces.js";

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/**
 * AKB 有設定就走真實語意搜尋，否則 fallback 到 mock KB。
 * 這樣 webhook/app 端只要呼叫一次 factory，不用自己判斷 env。
 */
export function createRetrievalProviderFromEnv(input: {
  mockKbPath: string;
}): RetrievalProvider {
  const baseUrl = process.env.AKB_BASE_URL?.trim();
  if (baseUrl) {
    const opts: { baseUrl: string; apiToken?: string; timeoutMs?: number } = {
      baseUrl,
      timeoutMs: parseTimeoutMs(process.env.AKB_TIMEOUT_MS, 15000),
    };
    const apiToken = process.env.AKB_API_TOKEN?.trim();
    if (apiToken) opts.apiToken = apiToken;
    return new AmwayKnowledgeBaseRetrievalProvider(opts);
  }

  // Mock KB path: allow relative paths in dev
  const mockKbPath = path.resolve(process.cwd(), input.mockKbPath);
  return new MockJsonRetrievalProvider({ mockKbPath });
}
