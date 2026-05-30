import { spawn } from "node:child_process";
// Small helper so repo runs in mock mode even when the user hasn't created a .env yet.
// We only set non-secret defaults.
if (!process.env.DATABASE_URL) {
  // Prisma resolves SQLite relative paths from packages/db/prisma/schema.prisma.
  process.env.DATABASE_URL = "file:../../dev.db";
}
if (!process.env.ADMIN_API_KEY) process.env.ADMIN_API_KEY = "dev-admin-key";
if (!process.env.ENABLE_MOCK_MODE) process.env.ENABLE_MOCK_MODE = "true";
if (!process.env.MOCK_KB_PATH) process.env.MOCK_KB_PATH = "./examples/mock-kb.json";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/with-default-env.mjs <command...>");
  process.exit(2);
}

const child = spawn(args[0], args.slice(1), { stdio: "inherit", shell: true, env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
