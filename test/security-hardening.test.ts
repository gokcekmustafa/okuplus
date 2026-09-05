import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";
import { loggerOptions } from "../src/lib/logger.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe("8I-2 security hardening", () => {
  it("structured logger redaction listesi secret ve token alanlarını kapsar", () => {
    const logger = loggerOptions(parseEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl })) as {
      redact?: { paths?: string[] };
    };
    expect(logger.redact?.paths).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("security headers and production HSTS are emitted", async () => {
    const app = await buildApp(
      parseEnv({
        APP_ENV: "production",
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        CORS_ORIGIN: "https://app.example.test",
        AUTH_COOKIE_TRANSPORT: "on",
        AUTH_ORIGIN_ENFORCEMENT: "on",
        JWT_SECRET: "Q7!mZ2_rT8xL4pN6vC9kH3aW5eJ1sB0dF4yK8uP",
      }),
    );

    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-request-id"]).toMatch(/^req-/u);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(response.headers["permissions-policy"]).toContain("camera=()");
      expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
      expect(response.headers["content-security-policy"]).not.toContain("unsafe-eval");
      expect(response.headers["content-security-policy"]).not.toContain("*");
      expect(response.headers["strict-transport-security"]).toContain("max-age=31536000");
    } finally {
      await app.close();
    }
  });

  it("auth endpoints return 429 after the configured threshold", async () => {
    const app = await buildApp(
      parseEnv({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        RATE_LIMIT_AUTH_MAX: "5",
      }),
    );

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: "not-a-jwt" },
        });
        expect(response.statusCode).not.toBe(429);
      }

      const limited = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: { refreshToken: "not-a-jwt" },
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        success: false,
        error: { code: "RATE_LIMITED", message: "Çok fazla istek" },
      });
      expect(limited.headers["retry-after"]).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it("body limit oversized payload için güvenli 413 döner", async () => {
    const app = await buildApp(
      parseEnv({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        BODY_LIMIT_BYTES: "16384",
      }),
    );

    try {
      const response = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: { refreshToken: "x".repeat(20_000) },
      });
      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({
        success: false,
        error: { code: "PAYLOAD_TOO_LARGE", message: "İstek gövdesi çok büyük" },
      });
    } finally {
      await app.close();
    }
  });

  it("CORS yalnızca explicit allowlist origin döndürür", async () => {
    const app = await buildApp(
      parseEnv({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        CORS_ORIGIN: "https://app.example.test",
      }),
    );

    try {
      const allowed = await app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://app.example.test" },
      });
      expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.test");

      const denied = await app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://evil.example.test" },
      });
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
