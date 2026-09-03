import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

/**
 * User + Membership yönetimi (admin) testleri.
 *
 * Güvenlik: yalnızca SUPER_ADMIN erişir; normal tenant kullanıcıları 403,
 * kimliksiz istekler 401 alır. Bireysel kullanıcı kuralı (tek INDIVIDUAL
 * üyelik) app katmanında, ACTIVE/PENDING duplicate'i ise DB'deki
 * `uq_membership_active` partial unique index'i ile engellenir (P2002 → 409).
 *
 * NOT: rls-security.test.ts afterAll'da TRUNCATE "Content", "Tenant" CASCADE
 * yapar; bu testler kendi verilerini beforeAll/afterAll ile kurar ve temizler.
 */

const hasher = new ScryptPasswordHasher();
const PASSWORD = "test-pass-123!";

const PLATFORM_USER_ID = "99999998-0000-7000-8000-000000000001";
const NORMAL_USER_ID = "99999998-0000-7000-8000-000000000002";

// Kullanıcı test verisi
const USER_A_ID = "99999998-0000-7000-8000-0000000000a1";
const USER_A_EMAIL = "user-a@example.com";
const USER_A_PASSWORD = "user-a-pass-123!";

// Tenant test verisi
const ORG_TENANT = "99999998-0000-7000-8000-0000000000b1";
const ORG_TENANT_2 = "99999998-0000-7000-8000-0000000000b2";
const INDIVIDUAL_TENANT = "99999998-0000-7000-8000-0000000000b3";
const INDIVIDUAL_TENANT_2 = "99999998-0000-7000-8000-0000000000b4";

describe("user + membership admin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();

    // Tekrar çalıştırmalarda kalıcı olabilecek veriyi temizle.
    await prisma.membership.deleteMany({
      where: { OR: [{ userId: { in: [NORMAL_USER_ID, USER_A_ID] } }] },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [ORG_TENANT, ORG_TENANT_2, INDIVIDUAL_TENANT, INDIVIDUAL_TENANT_2] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [PLATFORM_USER_ID, NORMAL_USER_ID, USER_A_ID] } },
    });

    const passwordHash = await hasher.hash(PASSWORD);

    await prisma.user.create({
      data: {
        id: PLATFORM_USER_ID,
        email: "user-super-admin@example.com",
        displayName: "User Super Admin",
        passwordHash,
        platformRole: "SUPER_ADMIN",
      },
    });
    await prisma.user.create({
      data: {
        id: NORMAL_USER_ID,
        email: "user-tenant-user@example.com",
        displayName: "User Tenant",
        passwordHash,
      },
    });
    await prisma.user.create({
      data: {
        id: USER_A_ID,
        email: USER_A_EMAIL,
        displayName: "Kullanıcı A",
        passwordHash: await hasher.hash(USER_A_PASSWORD),
      },
    });

    await prisma.tenant.createMany({
      data: [
        { id: ORG_TENANT, type: "ORGANIZATION", name: "Org Kurum" },
        { id: ORG_TENANT_2, type: "ORGANIZATION", name: "Org Kurum 2" },
        { id: INDIVIDUAL_TENANT, type: "INDIVIDUAL", name: "Bireysel Kurum" },
        { id: INDIVIDUAL_TENANT_2, type: "INDIVIDUAL", name: "Bireysel Kurum 2" },
      ],
    });

    // Normal kullanıcı bir tenant üyesi (RLS tarafından erişim sınırı testi için).
    await prisma.membership.create({
      data: {
        id: "99999998-0000-7000-8000-0000000000c1",
        tenantId: ORG_TENANT,
        userId: NORMAL_USER_ID,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.studentBadge.deleteMany({
      where: {
        tenantId: { in: [ORG_TENANT, ORG_TENANT_2, INDIVIDUAL_TENANT, INDIVIDUAL_TENANT_2] },
      },
    });
    await prisma.pointEvent.deleteMany({
      where: {
        tenantId: { in: [ORG_TENANT, ORG_TENANT_2, INDIVIDUAL_TENANT, INDIVIDUAL_TENANT_2] },
      },
    });
    await prisma.studentStreak.deleteMany({
      where: {
        tenantId: { in: [ORG_TENANT, ORG_TENANT_2, INDIVIDUAL_TENANT, INDIVIDUAL_TENANT_2] },
      },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { userId: NORMAL_USER_ID },
          { userId: USER_A_ID },
          { tenantId: ORG_TENANT },
          { tenantId: ORG_TENANT_2 },
          { tenantId: INDIVIDUAL_TENANT },
          { tenantId: INDIVIDUAL_TENANT_2 },
        ],
      },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [ORG_TENANT, ORG_TENANT_2, INDIVIDUAL_TENANT, INDIVIDUAL_TENANT_2] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [PLATFORM_USER_ID, NORMAL_USER_ID, USER_A_ID] } },
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
    authorization: `Bearer ${await login("user-super-admin@example.com")}`,
  });
  const tenantUserHeaders = async () => ({
    authorization: `Bearer ${await login("user-tenant-user@example.com")}`,
  });

  // ---------- Güvenlik ----------

  it("Kimliksiz istek: 401 döner", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/users" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("Normal tenant kullanıcısı: 403 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("Normal tenant kullanıcısı: membership uçlarına da erişemez (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await tenantUserHeaders(),
      payload: { userId: USER_A_ID, tenantId: ORG_TENANT, role: "STUDENT" },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------- Kullanıcı listesi ----------

  it("Super Admin: kullanıcıları listeler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    const found = body.data.items.find((u: { id: string }) => u.id === USER_A_ID);
    expect(found).toBeTruthy();
    expect(found.displayName).toBe("Kullanıcı A");
    expect(found.email).toBe(USER_A_EMAIL);
    expect(typeof found.membershipCount).toBe("number");
  });

  it("Arama: ad veya e-posta ile filtreler", async () => {
    const byName = await app.inject({
      method: "GET",
      url: "/admin/users?search=Kullanıcı%20A",
      headers: await superAdminHeaders(),
    });
    expect(byName.statusCode).toBe(200);
    const byNameBody = byName.json();
    expect(byNameBody.data.items.length).toBeGreaterThanOrEqual(1);
    expect(
      byNameBody.data.items.every(
        (u: { displayName: string; email: string | null }) =>
          u.displayName.toLowerCase().includes("kullanıcı a") ||
          (u.email ?? "").toLowerCase().includes("kullanıcı a"),
      ),
    ).toBe(true);

    const byEmail = await app.inject({
      method: "GET",
      url: `/admin/users?search=${USER_A_EMAIL}`,
      headers: await superAdminHeaders(),
    });
    expect(byEmail.statusCode).toBe(200);
    const byEmailBody = byEmail.json();
    expect(byEmailBody.data.items.some((u: { id: string }) => u.id === USER_A_ID)).toBe(true);
  });

  it("Durum filtreleme: status parametresi uygulanır", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/users?status=ACTIVE",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.every((u: { status: string }) => u.status === "ACTIVE")).toBe(true);
  });

  it("Sayfalama: page ve pageSize uygulanır", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/users?page=1&pageSize=2",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.length).toBeLessThanOrEqual(2);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(2);
  });

  it("Geçersiz status query: 400 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/users?status=GECE",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // ---------- Kullanıcı oluşturma ----------

  it("Super Admin: kullanıcı oluşturur", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Yeni Kullanıcı",
        email: "yeni-kullanici@example.com",
        phone: "+905551112233",
        birthYear: 1995,
        status: "INVITED",
        password: "new-user-pass-123!",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.displayName).toBe("Yeni Kullanıcı");
    expect(body.data.email).toBe("yeni-kullanici@example.com");
    expect(body.data.phone).toBe("+905551112233");
    expect(body.data.birthYear).toBe(1995);
    expect(body.data.status).toBe("INVITED");
    expect(body.data.memberships).toEqual([]);

    await prisma.user.deleteMany({ where: { email: "yeni-kullanici@example.com" } });
  });

  it("Duplike e-posta: 409 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Duplike",
        email: USER_A_EMAIL,
        password: "duplike-pass-123!",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Validation: kısa parola 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Kısa Parola",
        email: "kisa-parola@example.com",
        password: "123",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Validation: boş ad 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "   ",
        email: "bos-ad@example.com",
        password: "bos-ad-pass-123!",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("Validation: geçersiz e-posta 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Kötü E-posta",
        email: "adres-yok",
        password: "eposta-pass-123!",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ---------- Kullanıcı detayı / düzenleme / durum / silme ----------

  it("Super Admin: kullanıcı detayını görüntüler", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe(USER_A_ID);
    expect(body.data.displayName).toBe("Kullanıcı A");
    expect(Array.isArray(body.data.memberships)).toBe(true);
  });

  it("Olmayan kullanıcı detayı: 404 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/users/ffffffff-0000-7000-8000-000000000099",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("Super Admin: kullanıcı bilgilerini düzenler", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
      payload: { displayName: "Kullanıcı A Güncel", phone: "+905550000000", birthYear: 1992 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.displayName).toBe("Kullanıcı A Güncel");
    expect(body.data.phone).toBe("+905550000000");
    expect(body.data.birthYear).toBe(1992);
  });

  it("Düzenlemede başkasının e-postasına geçme: 409 döner", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
      payload: { email: "user-tenant-user@example.com" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Super Admin: kullanıcı durumunu değiştirir", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
      payload: { status: "SUSPENDED" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("SUSPENDED");

    const back = await app.inject({
      method: "PATCH",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
      payload: { status: "ACTIVE" },
    });
    expect(back.statusCode).toBe(200);
    expect(back.json().data.status).toBe("ACTIVE");
  });

  it("Super Admin: kullanıcıyı soft-delete eder", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.deletedAt).toBeTruthy();

    // Silinen kullanıcı listede görünmez.
    const list = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: await superAdminHeaders(),
    });
    const ids = list.json().data.items.map((u: { id: string }) => u.id);
    expect(ids).not.toContain(USER_A_ID);

    // Silinen kullanıcı detayına erişilemez.
    const detail = await app.inject({
      method: "GET",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
    });
    expect(detail.statusCode).toBe(404);
  });

  it("Soft-delete sonrası düzenleme: 404 döner", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
      payload: { displayName: "Yeni İsim" },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------- Membership ----------

  let membershipId = "";
  let org2MembershipId = "";
  let individualMembershipId = "";

  it("Hazırlık: soft-delete edilen kullanıcı yeniden üye olabilir", async () => {
    // Yukarıdaki soft-delete testi USER_A'yı sildi; membership senaryoları için
    // kullanıcıyı geri yükle.
    await prisma.user.update({
      where: { id: USER_A_ID },
      data: { deletedAt: null, status: "ACTIVE" },
    });
  });

  it("Super Admin: kullanıcıya kurum üyeliği ekler (ORGANIZATION)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: { userId: USER_A_ID, tenantId: ORG_TENANT, role: "TEACHER", status: "ACTIVE" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(USER_A_ID);
    expect(body.data.tenantId).toBe(ORG_TENANT);
    expect(body.data.role).toBe("TEACHER");
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.startedAt).toBeTruthy();
    membershipId = body.data.id;
  });

  it("Aynı tenant+user+role ACTIVE duplicate: 409 döner (DB index)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: { userId: USER_A_ID, tenantId: ORG_TENANT, role: "TEACHER", status: "ACTIVE" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Farklı role ile aynı tenant: üyelik eklenebilir", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: { userId: USER_A_ID, tenantId: ORG_TENANT, role: "PARENT", status: "PENDING" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.role).toBe("PARENT");
    expect(res.json().data.status).toBe("PENDING");
  });

  it("İkinci ORGANIZATION tenant: üyelik eklenebilir (birden fazla org)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: { userId: USER_A_ID, tenantId: ORG_TENANT_2, role: "STUDENT", status: "ACTIVE" },
    });

    expect(res.statusCode).toBe(200);
    org2MembershipId = res.json().data.id;
    expect(org2MembershipId).toBeTruthy();
  });

  it("INDIVIDUAL tenant üyeliği: bireysel rol (STUDENT) ile çalışır", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: {
        userId: USER_A_ID,
        tenantId: INDIVIDUAL_TENANT,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.tenantType).toBe("INDIVIDUAL");
    expect(res.json().data.role).toBe("STUDENT");
    individualMembershipId = res.json().data.id;
  });

  it("INDIVIDUAL üyelik rolü kurumsal role değiştirilemez: 400 döner", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/memberships/${individualMembershipId}`,
      headers: await superAdminHeaders(),
      payload: { role: "ORG_ADMIN" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");

    // Üyelik hâlâ eski rolünde.
    const detail = await app.inject({
      method: "GET",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
    });
    const mem = detail
      .json()
      .data.memberships.find((m: { id: string }) => m.id === individualMembershipId);
    expect(mem.role).toBe("STUDENT");
  });

  it("INDIVIDUAL tenant'a kurumsal rol (OWNER): 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: {
        userId: USER_A_ID,
        tenantId: INDIVIDUAL_TENANT_2,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("INDIVIDUAL tenant'a kurumsal rol (TEACHER): 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: {
        userId: USER_A_ID,
        tenantId: INDIVIDUAL_TENANT_2,
        role: "TEACHER",
        status: "PENDING",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("İkinci INDIVIDUAL tenant üyeliği: 409 döner (bireysel kuralı)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: {
        userId: USER_A_ID,
        tenantId: INDIVIDUAL_TENANT_2,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Olmayan kuruma üyelik: 404 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: {
        userId: USER_A_ID,
        tenantId: "ffffffff-0000-7000-8000-000000000099",
        role: "STUDENT",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Validation: role eksik 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/memberships",
      headers: await superAdminHeaders(),
      payload: { userId: USER_A_ID, tenantId: ORG_TENANT },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Super Admin: üyelik role değiştirir", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/memberships/${membershipId}`,
      headers: await superAdminHeaders(),
      payload: { role: "BRANCH_MANAGER" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.role).toBe("BRANCH_MANAGER");
  });

  it("Role değişimi duplicate oluşturuyorsa: 409 döner", async () => {
    // USER_A zaten ORG_TENANT'ta PARENT(PENDING) üyesi. TEACHER->PARENT yapılırsa
    // DB partial unique (tenant,user,PARENT) PENDING ile çakışır.
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/memberships/${membershipId}`,
      headers: await superAdminHeaders(),
      payload: { role: "PARENT" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Super Admin: üyelik status değiştirir", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/memberships/${membershipId}`,
      headers: await superAdminHeaders(),
      payload: { status: "INACTIVE" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("INACTIVE");
    expect(res.json().data.endedAt).toBeTruthy();
  });

  it("INACTIVE'den sonra aynı role tekrar ACTIVE: eklenebilir", async () => {
    // membershipId artık INACTIVE; DB index yalnızca ACTIVE/PENDING'i kapsar.
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/memberships/${membershipId}`,
      headers: await superAdminHeaders(),
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ACTIVE");
  });

  it("Tenant bazlı üyelik listesi: veri karışmaz", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/memberships?tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(body.data.items.every((m: { tenantId: string }) => m.tenantId === ORG_TENANT)).toBe(
      true,
    );
  });

  it("Kullanıcı bazlı üyelik listesi: detay ile uyumlu", async () => {
    const detail = await app.inject({
      method: "GET",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
    });
    expect(detail.statusCode).toBe(200);
    const d = detail.json().data;
    expect(d.memberships.length).toBeGreaterThanOrEqual(3);

    const res = await app.inject({
      method: "GET",
      url: `/admin/memberships?userId=${USER_A_ID}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.every((m: { userId: string }) => m.userId === USER_A_ID)).toBe(true);
  });

  it("Super Admin: üyeliği kaldırır (REMOVED)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/memberships/${org2MembershipId}`,
      headers: await superAdminHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.removed).toBe(true);

    const detail = await app.inject({
      method: "GET",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
    });
    const removed = detail
      .json()
      .data.memberships.find((m: { id: string }) => m.id === org2MembershipId);
    expect(removed.status).toBe("REMOVED");
  });
});
