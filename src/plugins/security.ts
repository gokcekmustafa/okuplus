import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import { fail } from "../lib/response.js";

type RateLimitGroup = "auth" | "billing" | "webhook" | "pilot" | "default";

interface RateLimitBucket {
  startedAt: number;
  count: number;
}

export interface RateLimitDecision {
  count: number;
  limited: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Bounded fixed-window store used by the in-process baseline limiter.
 *
 * The size bound is intentional: an attacker must not be able to turn a
 * process-local limiter into an unbounded memory sink by sending many source
 * addresses or identifiers. A shared edge/Redis limiter is still required
 * for multi-instance production deployments.
 */
export class ProcessLocalRateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly windowMs: number,
    private readonly maxKeys: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string, limit: number): RateLimitDecision {
    const now = this.now();
    this.prune(now);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      this.evictUntilCapacity();
      bucket = { startedAt: now, count: 0 };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;
    const resetAt = bucket.startedAt + this.windowMs;
    return {
      count: bucket.count,
      limited: bucket.count > limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt,
    };
  }

  get size(): number {
    return this.buckets.size;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(key);
    }
  }

  private evictUntilCapacity(): void {
    while (this.buckets.size >= this.maxKeys) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey === undefined) return;
      this.buckets.delete(oldestKey);
    }
  }
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

/**
 * Fastify's request.ip is the socket peer unless trustProxy is explicitly
 * configured. This helper deliberately does not inspect X-Forwarded-For,
 * Forwarded, or X-Real-IP, so an untrusted client cannot choose its bucket.
 */
export function trustedClientIp(request: FastifyRequest): string {
  const ip = request.ip.trim();
  return ip || "unknown";
}

function requestEmail(request: FastifyRequest): string | undefined {
  const body = request.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;

  const email = (body as Record<string, unknown>).email;
  if (typeof email !== "string") return undefined;
  const normalized = email.trim().toLowerCase();
  return normalized || undefined;
}

function digest(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function ipBucketKey(env: Env, group: RateLimitGroup, ip: string): string {
  return `${group}:ip:${digest(env.JWT_SECRET, `ip:${ip}`)}`;
}

function identityBucketKey(env: Env, ip: string, email: string): string {
  // The HMAC digest keeps the normalized identifier out of memory keys and
  // makes the digest resistant to trivial offline dictionary inspection.
  return `auth:identity:${digest(env.JWT_SECRET, `email:${ip}\u0000${email}`)}`;
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

function consumeAndRespond(
  store: ProcessLocalRateLimitStore,
  specs: Array<{ key: string; limit: number }>,
  reply: FastifyReply,
  options: { exposeHeaders?: boolean } = {},
): FastifyReply | undefined {
  const decisions = specs.map(({ key, limit }) => ({
    limit,
    decision: store.consume(key, limit),
  }));
  const effectiveLimit = Math.min(...decisions.map(({ limit }) => limit));
  const remaining = Math.min(...decisions.map(({ decision }) => decision.remaining));
  const resetAt = Math.max(...decisions.map(({ decision }) => decision.resetAt));
  if (options.exposeHeaders !== false) {
    setRateLimitHeaders(reply, effectiveLimit, remaining, resetAt);
  }

  if (!decisions.some(({ decision }) => decision.limited)) return undefined;

  reply
    .header("Retry-After", String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))))
    .header("Cache-Control", "no-store");
  return reply.code(429).send(fail("RATE_LIMITED", "Çok fazla istek"));
}

function authIdentifierPath(path: string): boolean {
  return path === "/auth/login" || path === "/auth/signup";
}

/**
 * Process-local baseline abuse protection. This is intentionally not claimed
 * as distributed protection: Vercel/serverless horizontal scaling requires an
 * edge/WAF or shared Redis-compatible limiter before production launch.
 */
export async function securityPlugin(app: FastifyInstance, env: Env): Promise<void> {
  const ipStore = new ProcessLocalRateLimitStore(
    env.RATE_LIMIT_WINDOW_SECONDS * 1000,
    env.RATE_LIMIT_MAX_KEYS,
  );
  const identityStore = new ProcessLocalRateLimitStore(
    env.RATE_LIMIT_WINDOW_SECONDS * 1000,
    env.RATE_LIMIT_MAX_KEYS,
  );

  app.addHook("onRequest", async (request, reply) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;

    const path = requestPath(request);
    const group = rateLimitGroup(path);
    const limit = groupLimit(env, group);
    const ip = trustedClientIp(request);
    return consumeAndRespond(ipStore, [{ key: ipBucketKey(env, group, ip), limit }], reply, {
      exposeHeaders: !authIdentifierPath(path),
    });
  });

  // onRequest runs before body parsing. This later hook adds the optional
  // login/signup identifier dimension without ever storing the email itself.
  app.addHook("preValidation", async (request, reply) => {
    if (request.method !== "POST") return;

    const path = requestPath(request);
    if (!authIdentifierPath(path)) return;

    const email = requestEmail(request);
    if (!email) return;

    return consumeAndRespond(
      identityStore,
      [
        {
          key: identityBucketKey(env, trustedClientIp(request), email),
          limit: env.RATE_LIMIT_AUTH_IDENTIFIER_MAX,
        },
      ],
      reply,
    );
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

    if (env.APP_ENV === "staging" || env.APP_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
  });
}
