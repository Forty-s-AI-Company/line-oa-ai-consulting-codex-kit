export function assertUnreachable(x: never): never {
  throw new Error(`Unreachable: ${String(x)}`);
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function safeJsonParse<T>(input: string): { ok: true; value: T } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(input) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error("JSON parse failed") };
  }
}

