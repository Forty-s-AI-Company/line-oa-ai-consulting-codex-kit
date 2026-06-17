import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  API_BASE_URL: z.string().optional(),
  ADMIN_BASE_URL: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(),
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  ENABLE_MOCK_MODE: z.string().optional(),
  ENABLE_HUMAN_HANDOFF: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  MOCK_KB_PATH: z.string().optional(),
  AKB_BASE_URL: z.string().optional(),
  AKB_API_TOKEN: z.string().optional(),
  AKB_TIMEOUT_MS: z.string().optional(),
  DEFAULT_WORKSPACE_ID: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.string().optional(),
  PLATFORM_GEMINI_API_KEY: z.string().optional(),
  PLATFORM_GEMINI_MODEL: z.string().optional(),
  LIFF_ID: z.string().optional(),
  LIFF_CHANNEL_ID: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;

export function readEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(raw);
}

export function envBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null) return fallback;
  const n = v.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(n)) return true;
  if (["0", "false", "no", "n", "off"].includes(n)) return false;
  return fallback;
}
