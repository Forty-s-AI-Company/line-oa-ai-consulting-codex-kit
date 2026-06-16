import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const dbPackageDir = path.join(repoRoot, "packages/db");

const databaseUrl = process.env.DATABASE_URL ?? "";
const schemaArgs = databaseUrl.startsWith("postgres")
  ? ["--schema", "prisma/schema.postgres.prisma"]
  : [];

const result = spawnSync("pnpm", ["-C", dbPackageDir, "prisma", "generate", ...schemaArgs], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
