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
const ORG_ENTITLEMENT_ID = "99999998-0000-7000-8000-0000000000c2";
const PERSONAL_ENTITLEMENT_ID = "99999998-0000-7000-8000-0000000000c3";
const BILLING_CUSTOMER_ID = "99999998-0000-7000-8000-0000000000d1";
const BILLING_SUBSCRIPTION_ID = "99999998-0000-7000-8000-0000000000d2";
const BILLING_PAYMENT_ID = "99999998-0000-7000-8000-0000000000d3";
const CREATED_ORG_USER_EMAIL = "admin-created-org-user@example.com";
const CREATED_INDIVIDUAL_USER_EMAIL = "admin-created-individual-user@example.com";
const SOFT_DELETED_CONTEXT_USER_ID = "99999998-0000-7000-8000-0000000000a5";
const SOFT_DELETED_CONTEXT_TENANT_ID = "99999998-0000-7000-8000-0000000000b5";

async function cleanupCreatedUser(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: { tenantId: true },
  });
  const tenantIds = memberships.map((membership) => membership.tenantId);
  await prisma.studentProfile.deleteMany({ where: { studentId: user.id } });
  await prisma.membership.deleteMany({ where: { userId: user.id } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds }, type: "INDIVIDUAL" } });
  await prisma.user.delete({ where: { id: user.id } });
}

describe("user + membership admin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanupCreatedUser(CREATED_ORG_USER_EMAIL);
    await cleanupCreatedUser(CREATED_INDIVIDUAL_USER_EMAIL);

    // Tekrar çalıştırmalarda kalıcı olabilecek veriyi temizle.
    await prisma.billingPayment.deleteMany({ where: { userId: USER_A_ID } });
    await prisma.billingSubscription.deleteMany({ where: { userId: USER_A_ID } });
    await prisma.billingCustomer.deleteMany({ where: { userId: USER_A_ID } });
    await prisma.entitlement.deleteMany({
      where: {
        OR: [
          { id: { in: [ORG_ENTITLEMENT_ID, PERSONAL_ENTITLEMENT_ID] } },
          { userId: USER_A_ID },
          { tenantId: { in: [ORG_TENANT, ORG_TENANT_2, INDIVIDUAL_TENANT, INDIVIDUAL_TENANT_2] } },
        ],
      },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [{ userId: { in: [NORMAL_USER_ID, USER_A_ID, SOFT_DELETED_CONTEXT_USER_ID] } }],
      },
    });
    await prisma.tenant.deleteMany({
      where: {
        id: {
          in: [
            ORG_TENANT,
            ORG_TENANT_2,
            INDIVIDUAL_TENANT,
            INDIVIDUAL_TENANT_2,
            SOFT_DELETED_CONTEXT_TENANT_ID,
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [PLATFORM_USER_ID, NORMAL_USER_ID, USER_A_ID, SOFT_DELETED_CONTEXT_USER_ID] },
      },
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
    await cleanupCreatedUser(CREATED_ORG_USER_EMAIL);
    await cleanupCreatedUser(CREATED_INDIVIDUAL_USER_EMAIL);
    await prisma.billingPayment.deleteMany({ where: { userId: USER_A_ID } });
    await prisma.billingSubscription.deleteMany({ where: { userId: USER_A_ID } });
    await prisma.billingCustomer.deleteMany({ where: { userId: USER_A_ID } });
    await prisma.entitlement.deleteMany({
      where: {
        OR: [
          { id: { in: [ORG_ENTITLEMENT_ID, PERSONAL_ENTITLEMENT_ID] } },
          { userId: USER_A_ID },
          { tenantId: { in: [ORG_TENANT, ORG_TENANT_2, INDIVIDUAL_TENANT, INDIVIDUAL_TENANT_2] } },
        ],
      },
    });
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
          { userId: SOFT_DELETED_CONTEXT_USER_ID },
          { tenantId: ORG_TENANT },
          { tenantId: ORG_TENANT_2 },
          { tenantId: INDIVIDUAL_TENANT },
          { tenantId: INDIVIDUAL_TENANT_2 },
          { tenantId: SOFT_DELETED_CONTEXT_TENANT_ID },
        ],
      },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [ORG_TENANT, ORG_TENANT_2, INDIVIDUAL_TENANT, INDIVIDUAL_TENANT_2] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [PLATFORM_USER_ID, NORMAL_USER_ID, USER_A_ID, SOFT_DELETED_CONTEXT_USER_ID] },
      },
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
    expect(found.roleConnections).toEqual([]);
    const tenantStudent = body.data.items.find(
      (user: { id: string }) => user.id === NORMAL_USER_ID,
    );
    expect(tenantStudent.roleConnections).toEqual([
      expect.objectContaining({
        role: "STUDENT",
        status: "ACTIVE",
        tenantName: "Org Kurum",
        tenantType: "ORGANIZATION",
      }),
    ]);
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

  it("hesap segmentleri platform ile kişisel/kurum bağlantılarını ayrı filtreler", async () => {
    await prisma.user.upsert({
      where: { id: SOFT_DELETED_CONTEXT_USER_ID },
      create: {
        id: SOFT_DELETED_CONTEXT_USER_ID,
        email: "soft-deleted-context-admin-test@example.com",
        displayName: "Kapalı kişisel alan",
        passwordHash: await hasher.hash(PASSWORD),
      },
      update: {},
    });
    await prisma.tenant.upsert({
      where: { id: SOFT_DELETED_CONTEXT_TENANT_ID },
      create: {
        id: SOFT_DELETED_CONTEXT_TENANT_ID,
        type: "INDIVIDUAL",
        name: "Kişisel",
        deletedAt: new Date(),
      },
      update: { deletedAt: new Date() },
    });
    await prisma.membership.upsert({
      where: { id: "99999998-0000-7000-8000-0000000000c5" },
      create: {
        id: "99999998-0000-7000-8000-0000000000c5",
        tenantId: SOFT_DELETED_CONTEXT_TENANT_ID,
        userId: SOFT_DELETED_CONTEXT_USER_ID,
        role: "STUDENT",
        status: "ACTIVE",
      },
      update: { deletedAt: null, status: "ACTIVE" },
    });

    const platform = await app.inject({
      method: "GET",
      url: "/admin/users?segment=PLATFORM",
      headers: await superAdminHeaders(),
    });
    expect(platform.statusCode).toBe(200);
    expect(platform.json().data.items.length).toBeGreaterThan(0);
    expect(
      platform
        .json()
        .data.items.every((user: { platformRole: string | null }) => user.platformRole !== null),
    ).toBe(true);

    const unlinked = await app.inject({
      method: "GET",
      url: "/admin/users?segment=UNLINKED",
      headers: await superAdminHeaders(),
    });
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json().data.items.some((user: { id: string }) => user.id === USER_A_ID)).toBe(
      true,
    );
    const recoveryCandidate = unlinked
      .json()
      .data.items.find((user: { id: string }) => user.id === SOFT_DELETED_CONTEXT_USER_ID);
    expect(recoveryCandidate.accountContexts[0]).toMatchObject({ tenantDeleted: true });
    expect(recoveryCandidate.accountContexts[0].packageRight).toBeTruthy();
    expect(
      unlinked
        .json()
        .data.items.every((user: { platformRole: string | null }) => user.platformRole === null),
    ).toBe(true);

    const individual = await app.inject({
      method: "GET",
      url: "/admin/users?segment=INDIVIDUAL",
      headers: await superAdminHeaders(),
    });
    expect(individual.statusCode).toBe(200);
    expect(
      individual
        .json()
        .data.items.some((user: { id: string }) => user.id === SOFT_DELETED_CONTEXT_USER_ID),
    ).toBe(true);
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
    await cleanupCreatedUser(CREATED_ORG_USER_EMAIL);
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Yeni Kullanıcı",
        email: CREATED_ORG_USER_EMAIL,
        phone: "+905551112233",
        birthYear: 1995,
        status: "INVITED",
        password: "new-user-pass-123!",
        accountType: "ORGANIZATION",
        tenantId: ORG_TENANT,
        membershipRole: "STUDENT",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.displayName).toBe("Yeni Kullanıcı");
    expect(body.data.email).toBe(CREATED_ORG_USER_EMAIL);
    expect(body.data.phone).toBe("0 (555) 111 22 33");
    expect(body.data.birthYear).toBe(1995);
    expect(body.data.status).toBe("INVITED");
    expect(body.data.memberships).toHaveLength(1);
    expect(body.data.memberships[0]).toMatchObject({
      tenantId: ORG_TENANT,
      role: "STUDENT",
      status: "PENDING",
    });
    expect(body.data.nationalId).toBeNull();

    await cleanupCreatedUser(CREATED_ORG_USER_EMAIL);
  });

  it("bireysel kullanıcıyı kurum seçmeden oluşturur ve kişisel alanı tek işlemde kurar", async () => {
    await cleanupCreatedUser(CREATED_INDIVIDUAL_USER_EMAIL);
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Bireysel Kullanıcı",
        email: CREATED_INDIVIDUAL_USER_EMAIL,
        password: "individual-user-pass-123!",
        accountType: "INDIVIDUAL",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.status).toBe("ACTIVE");
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0]).toMatchObject({
      tenantType: "INDIVIDUAL",
      role: "STUDENT",
      status: "ACTIVE",
    });
    expect(body.accountContexts).toHaveLength(1);
    expect(body.accountContexts[0]).toMatchObject({
      tenantType: "INDIVIDUAL",
      tenantName: "Kişisel",
    });
    expect(
      await prisma.studentProfile.findUnique({
        where: {
          tenantId_studentId: { tenantId: body.memberships[0].tenantId, studentId: body.id },
        },
      }),
    ).toBeTruthy();
    await cleanupCreatedUser(CREATED_INDIVIDUAL_USER_EMAIL);
  });

  it("TCKN içeren eski kullanıcı oluşturma isteğini reddeder ve kullanıcı oluşturmaz", async () => {
    const email = "legacy-national-id-user@example.com";
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Eski TCKN isteği",
        email,
        password: "legacy-user-pass-123!",
        nationalId: "12345678901",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
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
        accountType: "INDIVIDUAL",
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
        accountType: "INDIVIDUAL",
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
        accountType: "INDIVIDUAL",
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
        accountType: "INDIVIDUAL",
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
    const legacyNationalId = "12345678901";
    await prisma.user.update({
      where: { id: USER_A_ID },
      data: { nationalId: legacyNationalId },
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
      payload: { displayName: "Kullanıcı A Güncel", phone: "+905550000000", birthYear: 1992 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.displayName).toBe("Kullanıcı A Güncel");
    expect(body.data.phone).toBe("0 (555) 000 00 00");
    expect(body.data.birthYear).toBe(1992);
    expect(body.data.nationalId).toBe(legacyNationalId);
    expect(
      (await prisma.user.findUnique({ where: { id: USER_A_ID }, select: { nationalId: true } }))
        ?.nationalId,
    ).toBe(legacyNationalId);
  });

  it("TCKN içeren eski kullanıcı güncelleme isteğini reddeder ve mevcut değeri korur", async () => {
    const legacyNationalId = "12345678901";
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
      payload: { nationalId: "10987654321" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(
      (await prisma.user.findUnique({ where: { id: USER_A_ID }, select: { nationalId: true } }))
        ?.nationalId,
    ).toBe(legacyNationalId);
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

  it("Super Admin: paket bağlamlarını ve ödeme aboneliğini ayrı, sağlayıcı sırları olmadan okur", async () => {
    const effectiveAt = new Date("2026-10-01T00:00:00.000Z");
    const periodStart = new Date("2026-10-01T00:00:00.000Z");
    const periodEnd = new Date("2026-11-01T00:00:00.000Z");
    await prisma.entitlement.createMany({
      data: [
        {
          id: ORG_ENTITLEMENT_ID,
          tenantId: ORG_TENANT,
          scope: "ORGANIZATION",
          plan: "PLAN_FREE",
          active: true,
          source: "ADMIN",
          effectiveAt,
        },
        {
          id: PERSONAL_ENTITLEMENT_ID,
          userId: USER_A_ID,
          tenantId: INDIVIDUAL_TENANT,
          scope: "PERSONAL",
          plan: "PLAN_PREMIUM",
          active: true,
          source: "ADMIN",
          effectiveAt,
          expiresAt: periodEnd,
        },
      ],
    });
    await prisma.billingCustomer.create({
      data: {
        id: BILLING_CUSTOMER_ID,
        userId: USER_A_ID,
        tenantId: INDIVIDUAL_TENANT,
        scope: "PERSONAL",
        providerCode: "test-fixture",
      },
    });
    await prisma.billingSubscription.create({
      data: {
        id: BILLING_SUBSCRIPTION_ID,
        customerId: BILLING_CUSTOMER_ID,
        userId: USER_A_ID,
        tenantId: INDIVIDUAL_TENANT,
        providerCode: "test-fixture",
        pricingPlanReference: "test-monthly",
        billingPeriod: "MONTHLY",
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });
    await prisma.billingPayment.create({
      data: {
        id: BILLING_PAYMENT_ID,
        customerId: BILLING_CUSTOMER_ID,
        subscriptionId: BILLING_SUBSCRIPTION_ID,
        userId: USER_A_ID,
        tenantId: INDIVIDUAL_TENANT,
        providerCode: "test-fixture",
        providerOrderReference: "user-admin-read-fixture",
        status: "SUCCEEDED",
        amountMinor: 12900,
        currency: "TRY",
        occurredAt: periodStart,
      },
    });

    const filtered = await app.inject({
      method: "GET",
      url: "/admin/users?tenantType=INDIVIDUAL&membershipStatus=ACTIVE&search=Kullanıcı%20A",
      headers: await superAdminHeaders(),
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().data.items.map((item: { id: string }) => item.id)).toContain(USER_A_ID);

    const individualSegment = await app.inject({
      method: "GET",
      url: "/admin/users?segment=INDIVIDUAL",
      headers: await superAdminHeaders(),
    });
    expect(individualSegment.statusCode).toBe(200);
    expect(individualSegment.json().data.items.map((item: { id: string }) => item.id)).toContain(
      USER_A_ID,
    );
    expect(
      individualSegment
        .json()
        .data.items.every((item: { platformRole: string | null }) => item.platformRole === null),
    ).toBe(true);

    const organizationSegment = await app.inject({
      method: "GET",
      url: "/admin/users?segment=ORGANIZATION",
      headers: await superAdminHeaders(),
    });
    expect(organizationSegment.statusCode).toBe(200);
    expect(organizationSegment.json().data.items.map((item: { id: string }) => item.id)).toContain(
      USER_A_ID,
    );

    const res = await app.inject({
      method: "GET",
      url: `/admin/users/${USER_A_ID}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json().data;
    expect(detail.accountContexts).toHaveLength(3);
    expect(
      detail.accountContexts.find(
        (context: { tenantId: string }) => context.tenantId === ORG_TENANT,
      ).memberships,
    ).toEqual([
      { role: "PARENT", status: "PENDING" },
      { role: "TEACHER", status: "ACTIVE" },
    ]);
    expect(
      detail.accountContexts.find(
        (context: { tenantId: string }) => context.tenantId === ORG_TENANT,
      ).packageRight,
    ).toMatchObject({ plan: "PLAN_FREE", source: "ADMIN", status: "ACTIVE" });
    expect(
      detail.accountContexts.find(
        (context: { tenantId: string }) => context.tenantId === INDIVIDUAL_TENANT,
      ).packageRight,
    ).toMatchObject({ plan: "PLAN_PREMIUM", source: "ADMIN", status: "ACTIVE" });
    expect(detail.billingSubscriptions).toHaveLength(1);
    expect(detail.billingSubscriptions[0]).toMatchObject({
      status: "ACTIVE",
      billingPeriod: "MONTHLY",
      currentPeriodStart: periodStart.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    });
    expect(detail.billingPayments).toHaveLength(1);
    expect(detail.billingPayments[0]).toMatchObject({
      status: "SUCCEEDED",
      amountMinor: 12900,
      currency: "TRY",
    });
    expect(JSON.stringify(detail.billingSubscriptions)).not.toContain("providerSubscriptionId");
    expect(JSON.stringify(detail.billingPayments)).not.toContain("providerPaymentId");
    expect(JSON.stringify(detail.billingPayments)).not.toContain("providerOrderReference");
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
