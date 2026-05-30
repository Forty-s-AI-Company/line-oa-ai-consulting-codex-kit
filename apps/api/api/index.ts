import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/server.js";

type App = Awaited<ReturnType<typeof createApp>>;

let appPromise: Promise<App> | undefined;

async function getApp(): Promise<App> {
  appPromise ??= createApp();
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  await app.fastify.ready();

  // Vercel expects a request handler; Fastify can consume the raw Node request.
  app.fastify.server.emit("request", req, res);
}
