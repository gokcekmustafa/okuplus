import { createHmac } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const GUEST_RATE_LIMIT_POLICIES = {
  sessionCreation: { maxRequests: 5, windowSeconds: 60 },
  questionRetrieval: { maxRequests: 60, windowSeconds: 60 },
  answerSubmission: { maxRequests: 30, windowSeconds: 60 },
  completion: { maxRequests: 10, windowSeconds: 60 },
  resultRetrieval: { maxRequests: 30, windowSeconds: 60 },
} as const;

export type GuestRateLimitPolicy = keyof typeof GUEST_RATE_LIMIT_POLICIES;

export type GuestRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type UpstashLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

type UpstashLimiter = {
  limit(identifier: string): Promise<UpstashLimitResult>;
};

type RateLimitEnvironment = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

type RateLimitDependencies = {
  createLimiter?: (options: ConstructorParameters<typeof Ratelimit>[0]) => UpstashLimiter;
};

export class GuestRateLimitConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestRateLimitConfigurationError";
  }
}

export class GuestRateLimitUnavailableError extends Error {
  constructor() {
    super("Guest rate-limit service is unavailable");
    this.name = "GuestRateLimitUnavailableError";
  }
}

function requireRedisEnvironment(env: RateLimitEnvironment): { url: string; token: string } {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

  if (!url || !token) {
    throw new GuestRateLimitConfigurationError(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GuestRateLimitConfigurationError("UPSTASH_REDIS_REST_URL must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new GuestRateLimitConfigurationError("UPSTASH_REDIS_REST_URL must use HTTPS");
  }

  return { url, token };
}

function validateIdentifier(identifier: string): string {
  const normalized = identifier.trim();
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (!normalized || normalized.length > 256 || hasControlCharacter) {
    throw new GuestRateLimitConfigurationError("Guest rate-limit identifier is malformed");
  }
  return normalized;
}

/** Keep raw IP/session/token values out of Redis keys and operational tooling. */
export function guestRateLimitIdentifier(secret: string, ...parts: string[]): string {
  const normalizedSecret = secret.trim();
  if (normalizedSecret.length < 16) {
    throw new GuestRateLimitConfigurationError("Guest rate-limit key secret is not configured");
  }
  const normalizedParts = parts.map(validateIdentifier);
  return createHmac("sha256", normalizedSecret)
    .update(normalizedParts.join("\u0000"), "utf8")
    .digest("hex");
}

/**
 * Distributed Upstash-backed limiter for serverless runtimes. Missing
 * configuration, malformed identifiers, and provider failures all reject the
 * request path instead of silently disabling abuse protection.
 */
export function createGuestRateLimiter(
  env: RateLimitEnvironment = process.env,
  dependencies: RateLimitDependencies = {},
): {
  limit(policy: GuestRateLimitPolicy, identifier: string): Promise<GuestRateLimitResult>;
} {
  const { url, token } = requireRedisEnvironment(env);
  const redis = new Redis({ url, token });
  const createLimiter =
    dependencies.createLimiter ??
    ((options: ConstructorParameters<typeof Ratelimit>[0]) => new Ratelimit(options));
  const limiters = new Map<GuestRateLimitPolicy, UpstashLimiter>();

  for (const [policyName, policy] of Object.entries(GUEST_RATE_LIMIT_POLICIES) as Array<
    [GuestRateLimitPolicy, (typeof GUEST_RATE_LIMIT_POLICIES)[GuestRateLimitPolicy]]
  >) {
    limiters.set(
      policyName,
      createLimiter({
        redis,
        limiter: Ratelimit.slidingWindow(policy.maxRequests, `${policy.windowSeconds} s`),
        prefix: `okuplus:guest:${policyName}`,
      }),
    );
  }

  return {
    async limit(policy, identifier) {
      const limiter = limiters.get(policy);
      if (!limiter) {
        throw new GuestRateLimitConfigurationError("Unknown guest rate-limit policy");
      }

      const normalizedIdentifier = validateIdentifier(identifier);
      try {
        const result = await limiter.limit(normalizedIdentifier);
        return {
          allowed: result.success,
          limit: result.limit,
          remaining: Math.max(0, result.remaining),
          resetAt: result.reset,
        };
      } catch {
        throw new GuestRateLimitUnavailableError();
      }
    },
  };
}
