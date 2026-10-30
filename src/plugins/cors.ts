import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { getAllowedOrigins } from "../config/allowed-origins.js";

/**
 * Browser CORS origins come from the explicit config allowlist. Native
 * WebViews are limited to the exact Capacitor Android and iOS origins.
 */
export async function corsPlugin(app: FastifyInstance, env: Env): Promise<void> {
  const origin = getAllowedOrigins(env.CORS_ORIGIN);

  await app.register(cors, {
    origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "content-type",
      "authorization",
      "x-tenant-id",
      "x-auth-transport",
      "x-auth-response",
      "x-csrf-token",
      "x-okupratik-guest-transport",
      "x-okupratik-guest-token",
    ],
    credentials: true,
  });
}
