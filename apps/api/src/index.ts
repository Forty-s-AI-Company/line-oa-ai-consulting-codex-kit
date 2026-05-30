import dotenv from "dotenv";
import path from "node:path";
import { createApp } from "./server.js";

const repoRoot = path.resolve(process.cwd(), "../..");
dotenv.config({ path: path.resolve(repoRoot, ".env") });

async function main() {
  const app = await createApp();
  await app.fastify.listen({ host: "0.0.0.0", port: app.config.port });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
