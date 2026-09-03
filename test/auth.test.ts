import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { withTenantContext } from "../src/modules/tenant/index.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

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
