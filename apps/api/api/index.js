import { createApp } from "../dist/server.js";

let appPromise;

async function getApp() {
  appPromise ??= createApp();
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  await app.fastify.ready();

  // Vercel provides a raw Node request/response pair; Fastify can handle it.
  app.fastify.server.emit("request", req, res);
}
