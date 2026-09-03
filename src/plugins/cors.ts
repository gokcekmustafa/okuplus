import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";

/**
 * CORS yapılandırması config üzerinden yönetilir. Production default'u boş
 * `CORS_ORIGIN` = cross-origin istek kapalıdır (wildcard kullanılmaz).
 */
export async function corsPlugin(app: FastifyInstance, env: Env): Promise<void> {
  const origin = env.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (origin.length === 0) {
    return;
  }

  await app.register(cors, {
    origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });
}
