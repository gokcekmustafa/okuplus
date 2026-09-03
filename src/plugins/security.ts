import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import { fail } from "../lib/response.js";

type RateLimitGroup = "auth" | "billing" | "webhook" | "pilot" | "default";

interface RateLimitBucket {
  startedAt: number;
  count: number;
}

function requestPath(request: FastifyRequest): string {
  return request.url.split("?", 1)[0] ?? request.url;
}

function rateLimitGroup(path: string): RateLimitGroup {
  if (path === "/billing/iyzico/webhook" || path.includes("/webhooks/")) return "webhook";
  if (path.startsWith("/auth/")) return "auth";
  if (path.startsWith("/billing/")) return "billing";
  if (path.startsWith("/student/pilot/")) return "pilot";
  return "default";
}

function groupLimit(env: Env, group: RateLimitGroup): number {
  switch (group) {
    case "auth":
      return env.RATE_LIMIT_AUTH_MAX;
    case "billing":
      return env.RATE_LIMIT_BILLING_MAX;
    case "webhook":
      return env.RATE_LIMIT_WEBHOOK_MAX;
    case "pilot":
      return env.RATE_LIMIT_PILOT_MAX;
    default:
      return env.RATE_LIMIT_MAX;
  }
}

function setRateLimitHeaders(
  reply: FastifyReply,
  limit: number,
  remaining: number,
  resetAt: number,
): void {
  reply
    .header("X-RateLimit-Limit", String(limit))
    .header("X-RateLimit-Remaining", String(Math.max(0, remaining)))
    .header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

/**
 * Process-local abuse protection. This is deliberately conservative: the
 * production deployment must add an edge/Redis-backed limiter for multi-
 * instance consistency, but a single instance is still protected by default.
 */
export async function securityPlugin(app: FastifyInstance, env: Env): Promise<void> {
  const buckets = new Map<string, RateLimitBucket>();
  const windowMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;

  app.addHook("onRequest", async (request, reply) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;

    const path = requestPath(request);
    const group = rateLimitGroup(path);
    const limit = groupLimit(env, group);
    const now = Date.now();
    const key = `${group}:${request.ip}`;
    const existing = buckets.get(key);
    const bucket =
      !existing || now - existing.startedAt >= windowMs ? { startedAt: now, count: 0 } : existing;

    bucket.count += 1;
    buckets.set(key, bucket);

    // Expired entries are removed opportunistically so this in-memory map
    // cannot grow forever on a long-lived process.
    for (const [entryKey, entry] of buckets) {
      if (now - entry.startedAt >= windowMs) buckets.delete(entryKey);
    }

    const resetAt = bucket.startedAt + windowMs;
    setRateLimitHeaders(reply, limit, limit - bucket.count, resetAt);

    if (bucket.count > limit) {
      reply.header("Retry-After", String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
      return reply.code(429).send(fail("RATE_LIMITED", "Çok fazla istek"));
    }
  });

  app.addHook("onSend", async (request, reply) => {
    reply
      .header("X-Request-ID", request.id)
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "strict-origin-when-cross-origin")
      .header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
      // The SPA still contains legacy inline styles/event handlers. unsafe-eval
      // and source wildcards are intentionally absent; migrate inline handlers
      // to external listeners before removing unsafe-inline.
      .header(
        "Content-Security-Policy",
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self' https:",
      );

    if (env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
  });
}
