import { describe, expect, it } from "vitest";

import {
  GUEST_RATE_LIMIT_POLICIES,
  GuestRateLimitConfigurationError,
  GuestRateLimitUnavailableError,
  createGuestRateLimiter,
  guestRateLimitIdentifier,
} from "../src/modules/guest-diagnostic/rate-limit.js";

const env = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "ci-only-token",
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
