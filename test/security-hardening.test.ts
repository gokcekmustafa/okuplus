import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";
import { loggerOptions } from "../src/lib/logger.js";
import { ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME } from "../src/modules/auth/cookies.js";
import { createCsrfToken } from "../src/modules/auth/csrf.js";

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
        "req.headers.authorization",
        "req.headers.cookie",
      ]),
    );
  });

  it("security headers and production HSTS are emitted", async () => {
    const app = await buildApp(
      parseEnv({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        JWT_SECRET: "production-test-secret-that-is-at-least-32-characters",
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

  it("cookie auth Origin guard kontrollü feature flag ile web transport'u sınırlar", async () => {
    const app = await buildApp(
      parseEnv({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        CORS_ORIGIN: "https://app.example.test",
        AUTH_COOKIE_TRANSPORT: "on",
        AUTH_ORIGIN_ENFORCEMENT: "on",
      }),
    );

    try {
      const denied = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: {
          origin: "https://evil.example.test",
          "x-auth-transport": "cookie",
        },
        payload: { email: "student@example.com", password: "wrong-password" },
      });
      expect(denied.statusCode).toBe(403);

      const legacy = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin: "https://evil.example.test" },
        payload: { email: "nobody@example.com", password: "wrong-password" },
      });
      expect(legacy.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("auth ve security hataları cache'lenmez; public ve static cevaplar korunur", async () => {
    const jwtSecret = "security-error-cache-test-secret-that-is-at-least-32-characters";
    const app = await buildApp(
      parseEnv({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        JWT_SECRET: jwtSecret,
        CORS_ORIGIN: "https://app.example.test",
        AUTH_COOKIE_TRANSPORT: "on",
        AUTH_ORIGIN_ENFORCEMENT: "on",
      }),
    );

    try {
      const anonymous = await app.inject({ method: "GET", url: "/auth/me" });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.headers["cache-control"]).toBe("no-store");

      const invalidBearer = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: "Bearer invalid-token" },
      });
      expect(invalidBearer.statusCode).toBe(401);
      expect(invalidBearer.headers["cache-control"]).toBe("no-store");

      const missingCsrf = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { cookie: `${ACCESS_COOKIE_NAME}=synthetic-access` },
      });
      expect(missingCsrf.statusCode).toBe(403);
      expect(missingCsrf.headers["cache-control"]).toBe("no-store");

      const invalidCsrf = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: {
          cookie: `${ACCESS_COOKIE_NAME}=synthetic-access; ${CSRF_COOKIE_NAME}=invalid-csrf`,
          "x-csrf-token": "invalid-csrf",
          origin: "https://app.example.test",
        },
      });
      expect(invalidCsrf.statusCode).toBe(403);
      expect(invalidCsrf.headers["cache-control"]).toBe("no-store");

      const csrfToken = createCsrfToken(jwtSecret);
      const wrongOrigin = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: {
          cookie: `${ACCESS_COOKIE_NAME}=synthetic-access; ${CSRF_COOKIE_NAME}=${csrfToken}`,
          "x-csrf-token": csrfToken,
          origin: "https://evil.example.test",
        },
      });
      expect(wrongOrigin.statusCode).toBe(403);
      expect(wrongOrigin.headers["cache-control"]).toBe("no-store");

      const authValidation = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: { unexpected: true },
      });
      expect(authValidation.statusCode).toBe(400);
      expect(authValidation.headers["cache-control"]).toBe("no-store");

      const publicHealth = await app.inject({ method: "GET", url: "/health" });
      expect(publicHealth.statusCode).toBe(200);
      expect(publicHealth.headers["cache-control"]).not.toBe("no-store");

      const staticAsset = await app.inject({ method: "GET", url: "/app.js" });
      expect(staticAsset.statusCode).toBe(200);
      expect(staticAsset.headers["cache-control"]).not.toBe("no-store");
    } finally {
      await app.close();
    }
  });
});
