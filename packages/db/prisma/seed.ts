import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

type MockKbItem = {
  id: string;
  title: string;
  domain: string;
  category?: string;
  source_type: string;
  source_path: string;
  chunk_index: number;
  content: string;
  keywords?: string[];
  updated_at?: string;
  compliance_level?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const prisma = new PrismaClient();
  const repoRoot = path.resolve(__dirname, "../../..");
  const mockKbPath = path.resolve(repoRoot, "examples/mock-kb.json");

  await prisma.workspace.upsert({
    where: { id: "default" },
    update: {
      name: "Default Shared LINE OA",
      mode: "shared",
      isDefault: true
    },
    create: {
      id: "default",
      name: "Default Shared LINE OA",
      mode: "shared",
      isDefault: true
    }
  });

  await prisma.botSettings.upsert({
    where: { workspaceId: "default" },
    update: {},
    create: {
      workspaceId: "default",
      tone: "professional",
      topK: 5,
      safetyLevel: "standard",
      autoReplyEnabled: true
    }
  });

  const raw = await fs.readFile(mockKbPath, "utf8");
  const items = JSON.parse(raw) as MockKbItem[];

  for (const item of items) {
    await prisma.knowledgeDocument.upsert({
      where: { id: item.id },
      update: {
        title: item.title,
        domain: item.domain,
        category: item.category ?? null,
        sourceType: item.source_type,
        sourcePath: item.source_path,
        updatedAt: item.updated_at ? new Date(item.updated_at) : null,
        complianceLevel: item.compliance_level ?? null
      },
      create: {
        id: item.id,
        title: item.title,
        domain: item.domain,
        category: item.category ?? null,
        sourceType: item.source_type,
        sourcePath: item.source_path,
        updatedAt: item.updated_at ? new Date(item.updated_at) : null,
        complianceLevel: item.compliance_level ?? null
      }
    });

    await prisma.knowledgeChunk.upsert({
      where: {
        documentId_chunkIndex: {
          documentId: item.id,
          chunkIndex: item.chunk_index
        }
      },
      update: {
        content: item.content,
        keywords: item.keywords ? JSON.stringify(item.keywords) : null
      },
      create: {
        documentId: item.id,
        chunkIndex: item.chunk_index,
        content: item.content,
        keywords: item.keywords ? JSON.stringify(item.keywords) : null
      }
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
