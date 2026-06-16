import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const prismaDir = path.resolve(process.cwd(), "packages/db/prisma");

function readSchema(fileName: string): string {
  return fs.readFileSync(path.join(prismaDir, fileName), "utf8");
}

describe("Prisma schema files", () => {
  test("keeps SQLite and Postgres schemas aligned for core models", () => {
    const sqliteSchema = readSchema("schema.prisma");
    const postgresSchema = readSchema("schema.postgres.prisma");

    expect(sqliteSchema).toContain('provider = "sqlite"');
    expect(postgresSchema).toContain('provider = "postgresql"');

    for (const modelName of [
      "User",
      "Workspace",
      "AiProviderCredential",
      "BotSettings",
      "LineChannelCredential",
      "UsageLog",
      "Conversation",
      "Message",
      "RetrievalLog",
      "AnswerLog"
    ]) {
      expect(sqliteSchema).toContain(`model ${modelName}`);
      expect(postgresSchema).toContain(`model ${modelName}`);
    }
  });
});
