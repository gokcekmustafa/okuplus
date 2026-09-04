import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { withTenantContext } from "../src/modules/tenant/index.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from "../src/modules/auth/cookies.js";
import { createCsrfToken, verifyCsrfToken } from "../src/modules/auth/csrf.js";

/**
 * Auth modülü — JWT tabanlı kimlik doğrulama testleri.
 *
 * Not: test DB'sinde prisma singleton postgres süper kullanıcısıyla bağlanır
 * (süper kullanıcı BYPASSRLS'a sahiptir, RLS'i atlar). Bu yüzden veri
 * kurulumu doğrudan yapılabilir; RLS davranışı ayrıca rls-security.test.ts'te
 * oku_app rolüyle test edilir. Burada auth akışı (credential, token, session,
 * tenant context çözümleme) doğrulanır.
 */

const hasher = new ScryptPasswordHasher();

const TENANT_A = "dddddddd-0000-7000-8000-00000000000a";
const TENANT_B = "eeeeeeee-0000-7000-8000-00000000000b";

const USER_ID = "aaaaaaaa-0000-7000-8000-000000000001";
const SUSPENDED_USER_ID = "aaaaaaaa-0000-7000-8000-000000000002";
const PLATFORM_USER_ID = "aaaaaaaa-0000-7000-8000-000000000003";

const PASSWORD = "test-pass-123!";

function setCookieHeaders(response: {
  headers: Record<string, string | string[] | undefined>;
}): string[] {
  const header = response.headers["set-cookie"];
  return Array.isArray(header) ? header : header ? [header] : [];
}

function cookieValue(headers: string[], name: string): string {
  const header = headers.find((value) => value.startsWith(`${name}=`));
  if (!header) throw new Error(`${name} cookie bulunamadı`);
  return header.slice(name.length + 1).split(";", 1)[0] ?? "";
}

function cookieHeader(values: Array<[string, string]>): string {
  return values.map(([name, value]) => `${name}=${value}`).join("; ");
}

describe("auth", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.studentBadge.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.pointEvent.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.studentStreak.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.membership.deleteMany({
      where: { userId: { in: [USER_ID, SUSPENDED_USER_ID, PLATFORM_USER_ID] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [USER_ID, SUSPENDED_USER_ID, PLATFORM_USER_ID] } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });

    await prisma.tenant.create({
      data: { id: TENANT_A, type: "ORGANIZATION", name: "Tenant A" },
    });
    await prisma.tenant.create({
      data: { id: TENANT_B, type: "ORGANIZATION", name: "Tenant B" },
    });

    const passwordHash = await hasher.hash(PASSWORD);

    await prisma.user.create({
      data: {
        id: USER_ID,
        email: "student@example.com",
        displayName: "Normal Student",
        passwordHash,
      },
    });
    await prisma.user.create({
      data: {
        id: SUSPENDED_USER_ID,
        email: "suspended@example.com",
        displayName: "Suspended User",
        passwordHash,
        status: "SUSPENDED",
      },
    });
    await prisma.user.create({
      data: {
        id: PLATFORM_USER_ID,
        email: "platform@example.com",
        displayName: "Platform Admin",
        passwordHash,
        platformRole: "SUPER_ADMIN",
      },
    });

    await prisma.membership.create({
      data: {
        id: "ffffffff-0000-7000-8000-00000000000a",
        tenantId: TENANT_A,
        userId: USER_ID,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    await prisma.studentBadge.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.pointEvent.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.studentStreak.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.membership.deleteMany({
      where: { userId: { in: [USER_ID, SUSPENDED_USER_ID, PLATFORM_USER_ID] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [USER_ID, SUSPENDED_USER_ID, PLATFORM_USER_ID] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.$disconnect();
  });

  const env = loadEnv();
  const cookieEnv = {
    ...env,
    AUTH_COOKIE_TRANSPORT: "on" as const,
    CORS_ORIGIN: "https://app.example.test",
  };

  it("login: başarılı giriş token çifti + tenant context üretir", async () => {
    const app = await buildApp(env);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(USER_ID);
    expect(body.data.user.email).toBe("student@example.com");
    expect(body.data.tokens.accessToken).toBeTruthy();
    expect(body.data.tokens.refreshToken).toBeTruthy();
    expect(body.data.tenantContext.userId).toBe(USER_ID);
    expect(body.data.tenantContext.tenantId).toBe(TENANT_A);
    expect(body.data.tenantContext.platformRole).toBeNull();

    await app.close();
  });

  it("login: yanlış parola 401 döner", async () => {
    const app = await buildApp(env);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: "wrong-password" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");

    await app.close();
  });

  it("login: olmayan kullanıcı 401 döner (bilgi sızdırmaz)", async () => {
    const app = await buildApp(env);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: PASSWORD },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("E-posta veya parola hatalı");

    await app.close();
  });

  it("login: suspended kullanıcı 401 döner", async () => {
    const app = await buildApp(env);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "suspended@example.com", password: PASSWORD },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");

    await app.close();
  });

  it("GET /auth/me: geçerli access token kullanıcı + tenant context döner", async () => {
    const app = await buildApp(env);
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const { accessToken } = login.json().data.tokens;

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.id).toBe(USER_ID);
    expect(body.data.tenantContext.tenantId).toBe(TENANT_A);

    await app.close();
  });

  it("GET /auth/me: access token olmadan 401 döner", async () => {
    const app = await buildApp(env);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");

    await app.close();
  });

  it("cookie transport: login cookie flags, no-store ve /auth/me desteği sağlar", async () => {
    const app = await buildApp(cookieEnv);
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-auth-transport": "cookie" },
      payload: { email: "student@example.com", password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["cache-control"]).toBe("no-store");

    const cookies = setCookieHeaders(login);
    expect(cookies).toHaveLength(3);
    const accessCookie = cookies.find((value) => value.startsWith(`${ACCESS_COOKIE_NAME}=`));
    const refreshCookie = cookies.find((value) => value.startsWith(`${REFRESH_COOKIE_NAME}=`));
    const csrfCookie = cookies.find((value) => value.startsWith(`${CSRF_COOKIE_NAME}=`));
    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("Secure");
    expect(accessCookie).toContain("SameSite=Lax");
    expect(accessCookie).toContain("Path=/");
    expect(accessCookie).not.toContain("Domain=");
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("Secure");
    expect(refreshCookie).toContain("SameSite=Lax");
    expect(refreshCookie).toContain("Path=/auth");
    expect(refreshCookie).not.toContain("Domain=");
    expect(csrfCookie).not.toContain("HttpOnly");
    expect(csrfCookie).toContain("Secure");
    expect(csrfCookie).toContain("SameSite=Lax");
    expect(csrfCookie).toContain("Path=/");
    expect(csrfCookie).not.toContain("Domain=");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: cookieHeader([[ACCESS_COOKIE_NAME, cookieValue(cookies, ACCESS_COOKIE_NAME)]]),
      },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.user.id).toBe(USER_ID);

    await app.close();
  });

  it("refresh: cookie-only rotation ve legacy body contract birlikte çalışır", async () => {
    const app = await buildApp(cookieEnv);
    await app.ready();

    const cookieLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-auth-transport": "cookie" },
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const cookieLoginHeaders = setCookieHeaders(cookieLogin);
    const refreshValue = cookieValue(cookieLoginHeaders, REFRESH_COOKIE_NAME);
    const csrfValue = cookieValue(cookieLoginHeaders, CSRF_COOKIE_NAME);
    const cookieRefresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: {
        cookie: cookieHeader([
          [REFRESH_COOKIE_NAME, refreshValue],
          [CSRF_COOKIE_NAME, csrfValue],
        ]),
        "x-auth-transport": "cookie",
        "x-csrf-token": csrfValue,
        origin: "https://app.example.test",
      },
    });
    expect(cookieRefresh.statusCode).toBe(200);
    expect(cookieRefresh.headers["cache-control"]).toBe("no-store");
    expect(setCookieHeaders(cookieRefresh)).toHaveLength(3);

    const legacyLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const legacyRefresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: legacyLogin.json().data.tokens.refreshToken },
    });
    expect(legacyRefresh.statusCode).toBe(200);
    expect(legacyRefresh.headers["cache-control"]).toBe("no-store");
    expect(legacyRefresh.headers["set-cookie"]).toBeUndefined();

    await app.close();
  });

  it("transport precedence: Bearer wins; mismatched refresh transports block", async () => {
    const app = await buildApp(cookieEnv);
    await app.ready();

    const cookieLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-auth-transport": "cookie" },
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const cookieCookies = setCookieHeaders(cookieLogin);
    const cookieAccess = cookieValue(cookieCookies, ACCESS_COOKIE_NAME);
    const cookieRefresh = cookieValue(cookieCookies, REFRESH_COOKIE_NAME);
    const cookieCsrf = cookieValue(cookieCookies, CSRF_COOKIE_NAME);
    const platformLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "platform@example.com", password: PASSWORD },
    });
    const platformTokens = platformLogin.json().data.tokens;

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: cookieHeader([[ACCESS_COOKIE_NAME, cookieAccess]]),
        authorization: `Bearer ${platformTokens.accessToken}`,
      },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.user.id).toBe(PLATFORM_USER_ID);

    const mismatched = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: {
        cookie: cookieHeader([
          [REFRESH_COOKIE_NAME, cookieRefresh],
          [CSRF_COOKIE_NAME, cookieCsrf],
        ]),
        "x-csrf-token": cookieCsrf,
        origin: "https://app.example.test",
      },
      payload: { refreshToken: platformTokens.refreshToken },
    });
    expect(mismatched.statusCode).toBe(400);
    expect(mismatched.json().error.code).toBe("VALIDATION_ERROR");

    await app.close();
  });

  it("logout: cookie ve legacy body ile revoke eder, cookie'leri her durumda temizler", async () => {
    const app = await buildApp(cookieEnv);
    await app.ready();

    const cookieLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-auth-transport": "cookie" },
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const cookieCookies = setCookieHeaders(cookieLogin);
    const cookieRefresh = cookieValue(cookieCookies, REFRESH_COOKIE_NAME);
    const cookieCsrf = cookieValue(cookieCookies, CSRF_COOKIE_NAME);
    const cookieLogout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: cookieHeader([
          [REFRESH_COOKIE_NAME, cookieRefresh],
          [CSRF_COOKIE_NAME, cookieCsrf],
        ]),
        "x-csrf-token": cookieCsrf,
        origin: "https://app.example.test",
      },
    });
    expect(cookieLogout.statusCode).toBe(200);
    const cleared = setCookieHeaders(cookieLogout);
    expect(cleared).toHaveLength(3);
    expect(cleared.every((value) => value.includes("Max-Age=0"))).toBe(true);
    expect(cookieLogout.headers["cache-control"]).toBe("no-store");

    const legacyLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const legacyLogout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: legacyLogin.json().data.tokens.refreshToken },
    });
    expect(legacyLogout.statusCode).toBe(200);
    expect(setCookieHeaders(legacyLogout)).toHaveLength(3);

    await app.close();
  });

  it("CSRF foundation: signed token doğrulama ve Origin kontrolü hazırdır", () => {
    const token = createCsrfToken("test-csrf-secret");
    expect(verifyCsrfToken(token, "test-csrf-secret")).toBe(true);
    expect(verifyCsrfToken(token, "wrong-secret")).toBe(false);
  });

  it("cookie transport kapalıyken cookie issuance ve cookie-auth bloklanır", async () => {
    const app = await buildApp(env);
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-auth-transport": "cookie" },
      payload: { email: "student@example.com", password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeUndefined();

    const cookieOnlyGet = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: `${ACCESS_COOKIE_NAME}=synthetic-cookie-token` },
    });
    expect(cookieOnlyGet.statusCode).toBe(403);

    await app.close();
  });

  it("cookie-auth unsafe request CSRF olmadan ve cross-site bloklanır", async () => {
    const app = await buildApp(cookieEnv);
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-auth-transport": "cookie" },
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const cookies = setCookieHeaders(login);
    const refreshValue = cookieValue(cookies, REFRESH_COOKIE_NAME);
    const csrfValue = cookieValue(cookies, CSRF_COOKIE_NAME);
    const cookieHeaderValue = cookieHeader([
      [ACCESS_COOKIE_NAME, cookieValue(cookies, ACCESS_COOKIE_NAME)],
      [REFRESH_COOKIE_NAME, refreshValue],
      [CSRF_COOKIE_NAME, csrfValue],
    ]);

    for (const request of [
      { method: "POST", url: "/auth/logout" },
      { method: "PUT", url: "/admin/assessments/not-a-real-id" },
      { method: "PATCH", url: "/student/profile" },
      { method: "DELETE", url: "/admin/users/not-a-real-id" },
    ] as const) {
      const blocked = await app.inject({
        method: request.method,
        url: request.url,
        headers: { cookie: cookieHeaderValue },
      });
      expect(blocked.statusCode).toBe(403);
    }

    const crossSite = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: cookieHeaderValue,
        "x-csrf-token": csrfValue,
        origin: "https://evil.example.test",
      },
    });
    expect(crossSite.statusCode).toBe(403);

    const unrelatedBearer = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: cookieHeaderValue,
        authorization: "Bearer unrelated-access-token",
      },
    });
    expect(unrelatedBearer.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: cookieHeaderValue,
        "x-csrf-token": csrfValue,
        origin: "https://app.example.test",
      },
    });
    expect(allowed.statusCode).toBe(200);

    await app.close();
  });

  it("logout: refresh token iptal edilir, yenisi kullanılamaz", async () => {
    const app = await buildApp(env);
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const { refreshToken } = login.json().data.tokens;

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken },
    });
    expect(logout.statusCode).toBe(200);

    const refresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    expect(refresh.statusCode).toBe(401);

    await app.close();
  });

  it("GET /auth/me: üye olunmayan tenant X-Tenant-Id ile reddedilir (403)", async () => {
    const app = await buildApp(env);
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const { accessToken } = login.json().data.tokens;

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-tenant-id": TENANT_B,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");

    await app.close();
  });

  it("platform kullanıcı: platformRole User'dan gelir, tenant yoktur", async () => {
    const app = await buildApp(env);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "platform@example.com", password: PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.platformRole).toBe("SUPER_ADMIN");
    expect(body.data.tenantContext.platformRole).toBe("SUPER_ADMIN");
    expect(body.data.tenantContext.tenantId).toBeNull();

    await app.close();
  });

  it("platform kullanıcı: /auth/me üzerinden platform rolü doğrulanır", async () => {
    const app = await buildApp(env);
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "platform@example.com", password: PASSWORD },
    });
    const { accessToken } = login.json().data.tokens;

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.platformRole).toBe("SUPER_ADMIN");
    expect(body.data.tenantContext.tenantId).toBeNull();

    await app.close();
  });

  it("auth session'ı ile üretilen tenantContext RLS işlemlerinde kullanılabilir", async () => {
    const app = await buildApp(env);
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: PASSWORD },
    });
    const { tenantContext } = login.json().data;

    const values = await withTenantContext(tenantContext, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ tenant_id: string | null }>>`
        SELECT current_setting('app.tenant_id', true) AS tenant_id
      `;
      return rows[0];
    });

    expect(values?.tenant_id).toBe(TENANT_A);

    await app.close();
  });
});
