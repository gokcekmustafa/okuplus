import type { FastifyServerOptions } from "fastify";
import type { Env } from "../config/env.js";

const redactPaths = [
  "DATABASE_URL",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.refreshToken",
  "*.accessToken",
  "*.idToken",
  "*.secret",
  "*.secretKey",
  "*.apiKey",
  "*.merchantKey",
  "req.headers.authorization",
  "req.headers.cookie",
];

type RequestLogInput = {
  id?: unknown;
  method?: unknown;
  url?: unknown;
  ip?: unknown;
};

function safeRequestSerializer(request: RequestLogInput) {
  const url = typeof request.url === "string" ? request.url.split(/[?#]/u, 1)[0] || "/" : undefined;
  return {
    ...(typeof request.id === "string" || typeof request.id === "number" ? { id: request.id } : {}),
    ...(typeof request.method === "string" ? { method: request.method } : {}),
    ...(url ? { url } : {}),
    ...(typeof request.ip === "string" ? { remoteAddress: request.ip } : {}),
  };
}

/**
 * Fastify logger seçenekleri. Secret alanlar redact edilir; development'ta
 * okunaklı çıktı için pino-pretty kullanılır.
 */
export function loggerOptions(env: Env): FastifyServerOptions["logger"] {
  const base = {
    level: env.LOG_LEVEL,
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    serializers: { req: safeRequestSerializer },
  };

  if (env.NODE_ENV === "development") {
    return {
      ...base,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
      },
    };
  }

  return base;
}
