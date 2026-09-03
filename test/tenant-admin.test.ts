import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

/**
 * Tenant / Kurum yönetimi (admin) testleri.
 *
 * Güvenlik: tenant yönetimi yalnızca platform yetkilileri içindir; normal
 * tenant kullanıcıları 403 alır. Tenant tablosunda RLS yoktur; erişim app
 * katmanındaki requirePlatformRole guard'ıyla sınırlanır. Prisma singleton
 * süper kullanıcı olduğundan veri kurulumu doğrudan yapılır (test DB izole).
 */

const hasher = new ScryptPasswordHasher();
const PASSWORD = "test-pass-123!";

const PLATFORM_USER_ID = "99999999-0000-7000-8000-000000000001";
const NORMAL_USER_ID = "99999999-0000-7000-8000-000000000002";
const TENANT_A = "99999999-0000-7000-8000-00000000000a";
const TENANT_B = "99999999-0000-7000-8000-00000000000b";

// POST /admin/tenants ile oluşturulan kurum; afterAll'da temizlenir.
let createdTenantId: string | null = null;

describe("tenant admin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.studentBadge.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.pointEvent.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.studentStreak.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.membership.deleteMany({ where: { userId: NORMAL_USER_ID } });
    await prisma.tenant.deleteMany({ where: { slug: "test-kurumu" } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [PLATFORM_USER_ID, NORMAL_USER_ID] } },
    });

    const passwordHash = await hasher.hash(PASSWORD);

    await prisma.user.create({
      data: {
        id: PLATFORM_USER_ID,
        email: "super-admin@example.com",
        displayName: "Super Admin",
        passwordHash,
        platformRole: "SUPER_ADMIN",
      },
    });
    await prisma.user.create({
      data: {
        id: NORMAL_USER_ID,
        email: "tenant-user@example.com",
        displayName: "Tenant User",
        passwordHash,
      },
    });
    await prisma.tenant.create({
      data: { id: TENANT_A, type: "ORGANIZATION", name: "Tenant A" },
    });
    await prisma.tenant.create({
      data: { id: TENANT_B, type: "ORGANIZATION", name: "Tenant B" },
    });
    await prisma.membership.create({
      data: {
        id: "99999999-0000-7000-8000-0000000000aa",
        tenantId: TENANT_A,
        userId: NORMAL_USER_ID,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.studentBadge.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.pointEvent.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.studentStreak.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.membership.deleteMany({
      where: { userId: NORMAL_USER_ID },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B] } },
    });
    // API üzerinden oluşturulan "Test Kurumu" da temizlenir.
    if (createdTenantId) {
      await prisma.tenant.deleteMany({ where: { id: createdTenantId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [PLATFORM_USER_ID, NORMAL_USER_ID] } },
    });
    await prisma.$disconnect();
  });

  async function login(email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.tokens.accessToken as string;
  }

  const superAdminHeaders = async () => ({
    authorization: `Bearer ${await login("super-admin@example.com")}`,
  });
  const tenantUserHeaders = async () => ({
    authorization: `Bearer ${await login("tenant-user@example.com")}`,
  });

  it("Super Admin: kurumları listeler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants",
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    const found = body.data.items.find((t: { id: string }) => t.id === TENANT_A);
    expect(found).toBeTruthy();
    expect(found.name).toBe("Tenant A");
    expect(typeof found.membershipCount).toBe("number");
  });

  it("Normal tenant kullanıcısı: tenant yönetimine erişemez (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants",
      headers: await tenantUserHeaders(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("Kimliksiz istek: 401 döner", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/tenants" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("Super Admin: kurum oluşturur", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: await superAdminHeaders(),
      payload: {
        type: "ORGANIZATION",
        name: "Test Kurumu",
        slug: "test-kurumu",
        logoUrl: "https://example.com/logo.png",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Test Kurumu");
    expect(body.data.slug).toBe("test-kurumu");
    expect(body.data.type).toBe("ORGANIZATION");
    expect(body.data.counts.memberships).toBe(0);
    createdTenantId = body.data.id;
  });

  it("Duplike slug: 409 conflict döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: await superAdminHeaders(),
      payload: { type: "ORGANIZATION", name: "Çakışan Kurum", slug: "test-kurumu" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Validation hatası: geçersiz slug 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: await superAdminHeaders(),
      payload: { type: "ORGANIZATION", name: "X", slug: "Geçersiz Slug!" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Validation hatası: isim boş olamaz 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: await superAdminHeaders(),
      payload: { type: "ORGANIZATION", name: "  " },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Super Admin: kurum detayını görüntüler", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/tenants/${TENANT_A}`,
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe(TENANT_A);
    expect(body.data.name).toBe("Tenant A");
    expect(body.data.counts.memberships).toBe(1);
  });

  it("Olmayan kurum detayı: 404 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants/ffffffff-0000-7000-8000-000000000099",
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("Super Admin: kurum bilgilerini düzenler", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${TENANT_A}`,
      headers: await superAdminHeaders(),
      payload: { name: "Tenant A Güncel", slug: "tenant-a-guncel" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.name).toBe("Tenant A Güncel");
    expect(body.data.slug).toBe("tenant-a-guncel");
  });

  it("Başka kurumun slug'ını alma: 409 döner", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${TENANT_A}`,
      headers: await superAdminHeaders(),
      payload: { slug: "test-kurumu" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Super Admin: kurum durumunu değiştirir", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${TENANT_A}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "SUSPENDED" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("SUSPENDED");

    const back = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${TENANT_A}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "ACTIVE" },
    });
    expect(back.statusCode).toBe(200);
    expect(back.json().data.status).toBe("ACTIVE");
  });

  it("Durum filtreleme: yalnızca istenen durumdakiler döner", async () => {
    // TENANT_B'yi SUSPENDED yap
    await prisma.tenant.update({
      where: { id: TENANT_B },
      data: { status: "SUSPENDED" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants?status=SUSPENDED",
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.every((t: { status: string }) => t.status === "SUSPENDED")).toBe(true);
  });

  it("Arama: isim veya slug ile filtreler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants?search=test-kurumu",
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(
      body.data.items.every(
        (t: { name: string; slug: string | null }) =>
          t.name.toLowerCase().includes("test-kurumu") ||
          (t.slug ?? "").toLowerCase().includes("test-kurumu"),
      ),
    ).toBe(true);
  });

  it("Sayfalama: page ve pageSize uygulanır", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants?page=1&pageSize=2",
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.length).toBeLessThanOrEqual(2);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(2);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
  });

  it("Super Admin: kurumu soft-delete eder", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/tenants/${TENANT_A}`,
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.deletedAt).toBeTruthy();

    // Silinen kurum listede görünmez.
    const list = await app.inject({
      method: "GET",
      url: "/admin/tenants",
      headers: await superAdminHeaders(),
    });
    const ids = list.json().data.items.map((t: { id: string }) => t.id);
    expect(ids).not.toContain(TENANT_A);

    // Silinen kurum detayına erişilemez.
    const detail = await app.inject({
      method: "GET",
      url: `/admin/tenants/${TENANT_A}`,
      headers: await superAdminHeaders(),
    });
    expect(detail.statusCode).toBe(404);
  });

  it("Soft-delete sonrası düzenleme: 404 döner", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${TENANT_A}`,
      headers: await superAdminHeaders(),
      payload: { name: "Yeni İsim" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("Geçersiz query parametresi (status): 400 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants?status=GECE",
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});
