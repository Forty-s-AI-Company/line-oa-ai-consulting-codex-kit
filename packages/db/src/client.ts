import { PrismaClient } from "@prisma/client";

let prismaSingleton: PrismaClient | undefined;
let schemaReady: Promise<void> | undefined;

export function getPrisma(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient();
  }
  return prismaSingleton;
}

async function createSqliteSchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    "PRAGMA foreign_keys = ON",
    `CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "lineUserId" TEXT,
      "displayName" TEXT,
      "status" TEXT NOT NULL DEFAULT 'active',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_lineUserId_key" ON "User"("lineUserId")`,
    `CREATE TABLE IF NOT EXISTS "Conversation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "handoffFlag" BOOLEAN NOT NULL DEFAULT false,
      "summary" TEXT,
      CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "Conversation_userId_idx" ON "Conversation"("userId")`,
    `CREATE TABLE IF NOT EXISTS "Message" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "intent" TEXT,
      "domain" TEXT,
      "riskLevel" TEXT,
      "replyType" TEXT,
      "rawEventJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt")`,
    `CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "domain" TEXT NOT NULL,
      "category" TEXT,
      "sourceType" TEXT NOT NULL,
      "sourcePath" TEXT NOT NULL,
      "updatedAt" DATETIME,
      "complianceLevel" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "documentId" TEXT NOT NULL,
      "chunkIndex" INTEGER NOT NULL,
      "content" TEXT NOT NULL,
      "keywords" TEXT,
      CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_chunkIndex_idx" ON "KnowledgeChunk"("documentId", "chunkIndex")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_chunkIndex_key" ON "KnowledgeChunk"("documentId", "chunkIndex")`,
    `CREATE TABLE IF NOT EXISTS "RetrievalLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "messageId" TEXT NOT NULL,
      "chunkId" TEXT,
      "sourceId" TEXT,
      "sourceTitle" TEXT,
      "chunkText" TEXT NOT NULL,
      "score" REAL NOT NULL,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RetrievalLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "RetrievalLog_messageId_createdAt_idx" ON "RetrievalLog"("messageId", "createdAt")`,
    `CREATE TABLE IF NOT EXISTS "AnswerLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "messageId" TEXT NOT NULL,
      "draftText" TEXT,
      "finalText" TEXT NOT NULL,
      "riskLevel" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "reasons" TEXT,
      "citations" TEXT,
      "latencyMs" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AnswerLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "AnswerLog_messageId_createdAt_idx" ON "AnswerLog"("messageId", "createdAt")`,
    `CREATE TABLE IF NOT EXISTS "EscalationTask" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "conversationId" TEXT,
      "messageId" TEXT,
      "reason" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'open',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "EscalationTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "EscalationTask_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "EscalationTask_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "EscalationTask_status_createdAt_idx" ON "EscalationTask"("status", "createdAt")`,
    `CREATE TABLE IF NOT EXISTS "UserTag" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "tag" TEXT NOT NULL,
      "score" REAL NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "UserTag_userId_tag_idx" ON "UserTag"("userId", "tag")`,
    `CREATE TABLE IF NOT EXISTS "PromptVersion" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PromptVersion_name_version_key" ON "PromptVersion"("name", "version")`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

export async function ensurePrismaSqliteSchema(prisma: PrismaClient = getPrisma()): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.startsWith("file:")) return;

  schemaReady ??= createSqliteSchema(prisma);
  await schemaReady;
}
