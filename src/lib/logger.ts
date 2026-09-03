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

/**
 * Fastify logger seçenekleri. Secret alanlar redact edilir; development'ta
 * okunaklı çıktı için pino-pretty kullanılır.
 */
export function loggerOptions(env: Env): FastifyServerOptions["logger"] {
  const base = {
    level: env.LOG_LEVEL,
    redact: { paths: redactPaths, censor: "[REDACTED]" },
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
