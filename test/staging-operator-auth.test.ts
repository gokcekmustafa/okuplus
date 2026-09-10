import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../src/config/env.js";
import { ok } from "../src/lib/response.js";
import { requireAuth } from "../src/middleware/authenticate.js";
import { requirePlatformRole } from "../src/middleware/require-platform.js";
import type { AuthProvider, AuthSession } from "../src/modules/auth/index.js";
import { authRoutes } from "../src/modules/auth/routes.js";
import type { SocialAuthService } from "../src/modules/auth/social-service.js";
import {
  STAGING_OPERATOR_SESSION_PATH,
  STAGING_SUPER_ADMIN_ACTOR_ID,
  STAGING_OPERATOR_SECRET_HEADER,
  stagingOperatorRoutes,
} from "../src/modules/auth/staging-operator-routes.js";

const SECRET = "operator-test-" + "x".repeat(32);
const ORIGIN = "https://staging.example.test";

function session(overrides: Partial<AuthSession["user"]> = {}): AuthSession {
  return {
    user: {
      id: STAGING_SUPER_ADMIN_ACTOR_ID,
      email: "staging-super@example.test",
      displayName: "Staging Super Admin",
      platformRole: "SUPER_ADMIN",
      ...overrides,
    },
    tenantContext: {
      userId: STAGING_SUPER_ADMIN_ACTOR_ID,
      tenantId: null,
      platformRole: "SUPER_ADMIN",
    },
    tokens: {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 900_000),
      refreshTokenExpiresAt: new Date(Date.now() + 604_800_000),
    },
  };
}

function provider(result = session()): AuthProvider {
  return {
    startSession: vi.fn(async () => result),
    verifyAccessToken: vi.fn(async () => ({
      user: result.user,
      tenantContext: result.tenantContext,
    })),
  } as unknown as AuthProvider;
}

function cookieHeader(value: string | string[] | undefined): string {
  const cookies = Array.isArray(value) ? value : value ? [value] : [];
  return cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

async function createApp(
  appEnv: string,
  operatorSecret: string,
  authProvider: AuthProvider = provider(),
) {
  const app = Fastify();
  await stagingOperatorRoutes(app, {
    authProvider,
    appEnv,
    operatorSecret,
    csrfSecret: "csrf-secret-for-staging-operator-tests",
    allowedOrigins: [ORIGIN],
  });
  await authRoutes(app, {
    authProvider,
    socialAuthService: {} as SocialAuthService,
    csrfSecret: "csrf-secret-for-staging-operator-tests",
    allowedOrigins: [ORIGIN],
    enforceAuthOrigin: true,
    cookieAuthEnabled: true,
  });
  app.get(
    "/admin-auth-probe",
    { preHandler: [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])] },
    async () => ok({ authorized: true }),
  );
  await app.ready();
  return app;
}

describe("staging operator auth", () => {
  it("production'da route kaydetmez", async () => {
    const authProvider = provider();
    const app = await createApp("production", SECRET, authProvider);
    const response = await app.inject({
      method: "POST",
      url: STAGING_OPERATOR_SESSION_PATH,
      payload: {},
      headers: {
        origin: ORIGIN,
        "x-auth-transport": "cookie",
        [STAGING_OPERATOR_SECRET_HEADER]: SECRET,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(authProvider.startSession).not.toHaveBeenCalled();
    await app.close();
  });

  it("zayıf secret ile route'u kapalı tutar", async () => {
    const app = await createApp("staging", "too-short");
    const response = await app.inject({ method: "POST", url: STAGING_OPERATOR_SESSION_PATH });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("yanlış operator secret ile 401 döner ve session başlatmaz", async () => {
    const authProvider = provider();
    const app = await createApp("staging", SECRET, authProvider);
    const response = await app.inject({
      method: "POST",
      url: STAGING_OPERATOR_SESSION_PATH,
      payload: {},
      headers: {
        origin: ORIGIN,
        "x-auth-transport": "cookie",
        [STAGING_OPERATOR_SECRET_HEADER]: "wrong-secret",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(authProvider.startSession).not.toHaveBeenCalled();
    await app.close();
  });

  it("doğru staging secret ile fixed SUPER_ADMIN için cookie session üretir", async () => {
    const authProvider = provider();
    const app = await createApp("staging", SECRET, authProvider);
    const response = await app.inject({
      method: "POST",
      url: STAGING_OPERATOR_SESSION_PATH,
      payload: {},
      headers: {
        origin: ORIGIN,
        "x-auth-transport": "cookie",
        [STAGING_OPERATOR_SECRET_HEADER]: SECRET,
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(body.data.user.platformRole).toBe("SUPER_ADMIN");
    expect(body.data.tenantContext.tenantId).toBeNull();
    expect(body.data.tokens).toBeUndefined();
    const cookie = cookieHeader(response.headers["set-cookie"]);
    const meResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json().data.user.platformRole).toBe("SUPER_ADMIN");
    expect(meResponse.json().data.tenantContext.tenantId).toBeNull();

    const adminResponse = await app.inject({
      method: "GET",
      url: "/admin-auth-probe",
      headers: { cookie },
    });
    expect(adminResponse.statusCode).toBe(200);
    expect(authProvider.startSession).toHaveBeenCalledWith(STAGING_SUPER_ADMIN_ACTOR_ID, null, {
      deviceName: "staging-operator-e2e",
      platform: "WEB",
    });
    await app.close();
  });

  it("fixed actor SUPER_ADMIN değilse rol yükseltmeye izin vermez", async () => {
    const authProvider = provider(session({ platformRole: "CONTENT_REVIEWER" }));
    const app = await createApp("staging", SECRET, authProvider);
    const response = await app.inject({
      method: "POST",
      url: STAGING_OPERATOR_SESSION_PATH,
      payload: {},
      headers: {
        origin: ORIGIN,
        "x-auth-transport": "cookie",
        [STAGING_OPERATOR_SECRET_HEADER]: SECRET,
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("wrong origin ile session üretmez", async () => {
    const authProvider = provider();
    const app = await createApp("staging", SECRET, authProvider);
    const response = await app.inject({
      method: "POST",
      url: STAGING_OPERATOR_SESSION_PATH,
      payload: {},
      headers: {
        origin: "https://evil.example.test",
        "x-auth-transport": "cookie",
        [STAGING_OPERATOR_SECRET_HEADER]: SECRET,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(authProvider.startSession).not.toHaveBeenCalled();
    await app.close();
  });

  it("production'da operator secret env'i fail-closed reddedilir", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/oku_plus_test",
        APP_ENV: "production",
        NODE_ENV: "production",
        JWT_SECRET: "Prod-Key-2026!with-random-looking-material-7f2c",
        CORS_ORIGIN: "https://app.example.com",
        AUTH_COOKIE_TRANSPORT: "on",
        AUTH_ORIGIN_ENFORCEMENT: "on",
        STAGING_OPERATOR_AUTH_SECRET: SECRET,
      }),
    ).toThrow("STAGING_OPERATOR_AUTH_SECRET");
  });
});
