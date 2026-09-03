import "dotenv/config";
import { loadEnv } from "./config/env.js";
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { registerGracefulShutdown } from "./lib/graceful-shutdown.js";

const env = loadEnv();

export async function start(): Promise<void> {
  const app = await buildApp(env);
  registerGracefulShutdown(app, () => prisma.$disconnect());

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error({ err }, "Sunucu başlatılamadı");
    process.exit(1);
  }
}

void start();
