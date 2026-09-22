import { describe, expect, it } from "vitest";

import {
  DEFAULT_GUEST_RATE_LIMIT_NAMESPACE,
  GUEST_RATE_LIMIT_POLICIES,
  GuestRateLimitConfigurationError,
  GuestRateLimitUnavailableError,
  createGuestRateLimiter,
  guestRateLimitIdentifier,
} from "../src/modules/guest-diagnostic/rate-limit.js";

const env = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "ci-only-token",
  GUEST_RATE_LIMIT_NAMESPACE: "ci:guest",
};

describe("guest diagnostic distributed rate-limit abstraction", () => {
  it("requires both HTTPS Upstash configuration values", () => {
    expect(() => createGuestRateLimiter({})).toThrow(GuestRateLimitConfigurationError);
    expect(() =>
      createGuestRateLimiter({
        UPSTASH_REDIS_REST_URL: "http://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "token",
      }),
    ).toThrow("HTTPS");
  });

  it("centralizes endpoint policies and uses a non-sensitive identifier", async () => {
    const seen: string[] = [];
    const limiter = createGuestRateLimiter(env, {
      createLimiter: () => ({
        limit: async (identifier) => {
          seen.push(identifier);
          return { success: true, limit: 5, remaining: 4, reset: 1234 };
        },
      }),
    });

    const identifier = guestRateLimitIdentifier(
      "a sufficiently strong test secret",
      "ip",
      "session",
    );
    const result = await limiter.limit("sessionCreation", identifier);

    expect(Object.keys(GUEST_RATE_LIMIT_POLICIES)).toEqual([
      "sessionCreation",
      "questionRetrieval",
      "answerSubmission",
      "completion",
      "resultRetrieval",
    ]);
    expect(result).toEqual({ allowed: true, limit: 5, remaining: 4, resetAt: 1234 });
    expect(seen).toEqual([identifier]);
    expect(identifier).not.toContain("session");
  });

  it("uses the configured namespace for every policy prefix", () => {
    const prefixes: string[] = [];
    createGuestRateLimiter(env, {
      createLimiter: (options) => {
        prefixes.push(String(options.prefix));
        return {
          limit: async () => ({ success: true, limit: 1, remaining: 0, reset: 1 }),
        };
      },
    });

    expect(prefixes).toEqual(
      Object.keys(GUEST_RATE_LIMIT_POLICIES).map((policy) => `ci:guest:${policy}`),
    );
  });

  it("keeps CI and Preview prefixes disjoint on the shared Redis database", () => {
    const prefixes: string[] = [];
    const createLimiter = (options: { prefix?: string }) => {
      prefixes.push(String(options.prefix));
      return {
        limit: async () => ({ success: true, limit: 1, remaining: 0, reset: 1 }),
      };
    };

    createGuestRateLimiter({ ...env, GUEST_RATE_LIMIT_NAMESPACE: "ci:guest" }, { createLimiter });
    createGuestRateLimiter(
      { ...env, GUEST_RATE_LIMIT_NAMESPACE: "preview:guest" },
      { createLimiter },
    );

    expect(new Set(prefixes.slice(0, 5))).toEqual(
      new Set(Object.keys(GUEST_RATE_LIMIT_POLICIES).map((policy) => `ci:guest:${policy}`)),
    );
    expect(new Set(prefixes.slice(5))).toEqual(
      new Set(Object.keys(GUEST_RATE_LIMIT_POLICIES).map((policy) => `preview:guest:${policy}`)),
    );
  });

  it("uses a stable default namespace and rejects malformed overrides", () => {
    const defaults: string[] = [];
    createGuestRateLimiter(
      {
        UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
      },
      {
        createLimiter: (options) => {
          defaults.push(String(options.prefix));
          return { limit: async () => ({ success: true, limit: 1, remaining: 0, reset: 1 }) };
        },
      },
    );
    expect(defaults[0]).toBe(`${DEFAULT_GUEST_RATE_LIMIT_NAMESPACE}:sessionCreation`);

    expect(() =>
      createGuestRateLimiter({ ...env, GUEST_RATE_LIMIT_NAMESPACE: "preview namespace" }),
    ).toThrow(GuestRateLimitConfigurationError);
  });

  it("rejects malformed identifiers instead of sending them to Redis", async () => {
    const limiter = createGuestRateLimiter(env, {
      createLimiter: () => ({
        limit: async () => ({ success: true, limit: 1, remaining: 0, reset: 1 }),
      }),
    });

    await expect(limiter.limit("answerSubmission", "")).rejects.toThrow(
      GuestRateLimitConfigurationError,
    );
  });

  it("fails closed when the distributed provider is unavailable", async () => {
    const limiter = createGuestRateLimiter(env, {
      createLimiter: () => ({
        limit: async () => {
          throw new Error("redis unavailable");
        },
      }),
    });

    await expect(limiter.limit("completion", "opaque-id")).rejects.toThrow(
      GuestRateLimitUnavailableError,
    );
  });
});
