import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

/**
 * Şube yönetimi (admin) testleri.
 *
 * Güvenlik: yalnızca SUPER_ADMIN erişir; normal tenant kullanıcıları 403,
 * kimliksiz istekler 401 alır. Tüm şube uçları requireAuth +
 * requirePlatformRole(["SUPER_ADMIN"]) guard'ıyla korunur.
 *
 * ŞUBE OLUŞTURMA KURALLARI:
 *  - Yalnızca ORGANIZATION tipteki ACTIVE tenant'larda şube oluşturulabilir
 *    (INDIVIDUAL → 400, SUSPENDED/CLOSED → 400, silinmiş tenant → 404).
 *  - Şube kodu `@@unique([tenantId, code])` ile kurum içinde tektir.
 *  - Şube adı `uq_branch_active_name` partial unique index'i ile kurum içinde
 *    silinmemiş kayıtlar için tektir; soft-delete sonrası ad yeniden
 *    kullanılabilir (P2002 → 409).
 *  - Müdür opsiyoneldir; atanacak kullanıcı silinmemiş + ACTIVE olmalı ve
 *    ilgili tenant'ta ACTIVE Membership + BRANCH_MANAGER rolüne sahip
 *    olmalıdır (cross-tenant atama engellenir).
 *
 * Şube silme SOFT-DELETE'tir (Branch.deletedAt); fiziksel silme yoktur.
 * CLOSED durumu silme değildir. Sınıf/öğretmen üyelik tarihçesi korunur.
 *
 * NOT: rls-security.test.ts afterAll'da TRUNCATE "Content", "Tenant" CASCADE
 * yapar; bu testler kendi verilerini beforeAll/afterAll ile kurar ve temizler.
 */

const hasher = new ScryptPasswordHasher();
const PASSWORD = "test-pass-123!";

// Kullanıcılar
const PLATFORM_USER_ID = "99999994-0000-7000-8000-000000000001";
const NORMAL_USER_ID = "99999994-0000-7000-8000-000000000002";
const MANAGER_USER_ID = "99999994-0000-7000-8000-000000000003";
const STUDENT_USER_ID = "99999994-0000-7000-8000-000000000004";
const TEACHER_USER_ID = "99999994-0000-7000-8000-000000000005";
const INACTIVE_MANAGER_USER_ID = "99999994-0000-7000-8000-000000000006";
const DELETED_MANAGER_USER_ID = "99999994-0000-7000-8000-000000000007";
const OTHER_TENANT_MANAGER_ID = "99999994-0000-7000-8000-000000000008";

// Tenant'lar
const ORG_TENANT = "99999994-0000-7000-8000-0000000000b1";
const INDIVIDUAL_TENANT = "99999994-0000-7000-8000-0000000000b2";
const SUSPENDED_TENANT = "99999994-0000-7000-8000-0000000000b3";
const CLOSED_TENANT = "99999994-0000-7000-8000-0000000000b4";
const DELETED_TENANT = "99999994-0000-7000-8000-0000000000b5";
const OTHER_ORG_TENANT = "99999994-0000-7000-8000-0000000000b6";

// Kurum yapısı (sayaç testleri için)
const AY_1 = "99999994-0000-7000-8000-0000000000e1";
const CLASS_1 = "99999994-0000-7000-8000-0000000000f1";
const TBM_1 = "99999994-0000-7000-8000-0000000000c1";

const SUPER_ADMIN_EMAIL = "branch-super-admin@example.com";
const NORMAL_EMAIL = "branch-tenant-user@example.com";
const MANAGER_EMAIL = "branch-manager@example.com";
const STUDENT_EMAIL = "branch-student@example.com";
const TEACHER_EMAIL = "branch-teacher@example.com";
const INACTIVE_MANAGER_EMAIL = "branch-inactive-manager@example.com";
const DELETED_MANAGER_EMAIL = "branch-deleted-manager@example.com";
const OTHER_TENANT_MANAGER_EMAIL = "branch-other-manager@example.com";

const USER_IDS = [
  PLATFORM_USER_ID,
  NORMAL_USER_ID,
  MANAGER_USER_ID,
  STUDENT_USER_ID,
  TEACHER_USER_ID,
  INACTIVE_MANAGER_USER_ID,
  DELETED_MANAGER_USER_ID,
  OTHER_TENANT_MANAGER_ID,
];
const TENANT_IDS = [
  ORG_TENANT,
  INDIVIDUAL_TENANT,
  SUSPENDED_TENANT,
  CLOSED_TENANT,
  DELETED_TENANT,
  OTHER_ORG_TENANT,
];
const EMAILS = [
  SUPER_ADMIN_EMAIL,
  NORMAL_EMAIL,
  MANAGER_EMAIL,
  STUDENT_EMAIL,
  TEACHER_EMAIL,
  INACTIVE_MANAGER_EMAIL,
  DELETED_MANAGER_EMAIL,
  OTHER_TENANT_MANAGER_EMAIL,
];

describe("branch admin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();

    // Tekrar çalıştırmalarda kalıcı olabilecek veriyi hedefli temizle.
    await prisma.teacherClassAssignment.deleteMany({
      where: { tenantId: { in: TENANT_IDS } },
    });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.teacherBranchMembership.deleteMany({
      where: { tenantId: { in: TENANT_IDS } },
    });
    await prisma.class.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.academicYear.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.branch.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.membership.deleteMany({
      where: { OR: [{ userId: { in: USER_IDS } }, { tenantId: { in: TENANT_IDS } }] },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ id: { in: USER_IDS } }, { email: { in: EMAILS } }] },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });

    const passwordHash = await hasher.hash(PASSWORD);

    await prisma.user.createMany({
      data: [
        {
          id: PLATFORM_USER_ID,
          email: SUPER_ADMIN_EMAIL,
          displayName: "Şube Super Admin",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
        {
          id: NORMAL_USER_ID,
          email: NORMAL_EMAIL,
          displayName: "Şube Tenant Kullanıcı",
          passwordHash,
        },
        {
          id: MANAGER_USER_ID,
          email: MANAGER_EMAIL,
          displayName: "Şube Müdürü",
          passwordHash,
        },
        {
          id: STUDENT_USER_ID,
          email: STUDENT_EMAIL,
          displayName: "Şube Öğrencisi",
          passwordHash,
        },
        {
          id: TEACHER_USER_ID,
          email: TEACHER_EMAIL,
          displayName: "Şube Öğretmeni",
          passwordHash,
        },
        {
          id: INACTIVE_MANAGER_USER_ID,
          email: INACTIVE_MANAGER_EMAIL,
          displayName: "Pasif Müdür",
          passwordHash,
        },
        {
          id: DELETED_MANAGER_USER_ID,
          email: DELETED_MANAGER_EMAIL,
          displayName: "Silinen Müdür",
          passwordHash,
          deletedAt: new Date(),
        },
        {
          id: OTHER_TENANT_MANAGER_ID,
          email: OTHER_TENANT_MANAGER_EMAIL,
          displayName: "Diğer Okul Müdürü",
          passwordHash,
        },
      ],
    });

    await prisma.tenant.createMany({
      data: [
        { id: ORG_TENANT, type: "ORGANIZATION", name: "Şube Test Okulu" },
        { id: INDIVIDUAL_TENANT, type: "INDIVIDUAL", name: "Şube Bireysel" },
        { id: SUSPENDED_TENANT, type: "ORGANIZATION", name: "Şube Askıda", status: "SUSPENDED" },
        { id: CLOSED_TENANT, type: "ORGANIZATION", name: "Şube Kapalı", status: "CLOSED" },
        {
          id: DELETED_TENANT,
          type: "ORGANIZATION",
          name: "Şube Silinen",
          deletedAt: new Date(),
        },
        { id: OTHER_ORG_TENANT, type: "ORGANIZATION", name: "Şube Diğer Okul" },
      ],
    });

    // Üyelikler
    await prisma.membership.createMany({
      data: [
        { tenantId: ORG_TENANT, userId: NORMAL_USER_ID, role: "STUDENT", status: "ACTIVE" },
        { tenantId: ORG_TENANT, userId: MANAGER_USER_ID, role: "BRANCH_MANAGER", status: "ACTIVE" },
        { tenantId: ORG_TENANT, userId: STUDENT_USER_ID, role: "STUDENT", status: "ACTIVE" },
        { tenantId: ORG_TENANT, userId: TEACHER_USER_ID, role: "TEACHER", status: "ACTIVE" },
        {
          tenantId: ORG_TENANT,
          userId: INACTIVE_MANAGER_USER_ID,
          role: "BRANCH_MANAGER",
          status: "INACTIVE",
        },
        {
          tenantId: ORG_TENANT,
          userId: DELETED_MANAGER_USER_ID,
          role: "BRANCH_MANAGER",
          status: "ACTIVE",
        },
        {
          tenantId: OTHER_ORG_TENANT,
          userId: OTHER_TENANT_MANAGER_ID,
          role: "BRANCH_MANAGER",
          status: "ACTIVE",
        },
      ],
    });

    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.studentBadge.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.pointEvent.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.studentStreak.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.teacherClassAssignment.deleteMany({
      where: { tenantId: { in: TENANT_IDS } },
    });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.teacherBranchMembership.deleteMany({
      where: { tenantId: { in: TENANT_IDS } },
    });
    await prisma.class.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.academicYear.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.branch.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.membership.deleteMany({
      where: { OR: [{ userId: { in: USER_IDS } }, { tenantId: { in: TENANT_IDS } }] },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ id: { in: USER_IDS } }, { email: { in: EMAILS } }] },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
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
    authorization: `Bearer ${await login(SUPER_ADMIN_EMAIL)}`,
  });
  const tenantUserHeaders = async () => ({
    authorization: `Bearer ${await login(NORMAL_EMAIL)}`,
  });

  // ---------- Güvenlik ----------

  it("Kimliksiz istek: 401 döner", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/branches" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("Normal tenant kullanıcısı: 403 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/branches",
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("Normal tenant kullanıcısı: oluşturma uçlarına da erişemez (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await tenantUserHeaders(),
      payload: { tenantId: ORG_TENANT, name: "X", code: "X" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("Müdür lookup ucu da platform yetkisi ister (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/branch-options/managers?tenantId=${ORG_TENANT}`,
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("Geçersiz status query: 400 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/branches?status=GECE",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Super Admin: şubeleri listeler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  // ---------- Müdür adayları lookup ----------

  it("Müdür lookup: yalnızca ilgili tenant'ta aktif BRANCH_MANAGER döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/branch-options/managers?tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const managers = res.json().data;
    const emails = managers.map((m: { email: string }) => m.email);
    expect(emails).toContain(MANAGER_EMAIL);
    // STUDENT/TEACHER/pasif üyelik/silinmiş kullanıcı/başka tenant müdürü dahil edilmez.
    expect(emails).not.toContain(STUDENT_EMAIL);
    expect(emails).not.toContain(TEACHER_EMAIL);
    expect(emails).not.toContain(INACTIVE_MANAGER_EMAIL);
    expect(emails).not.toContain(DELETED_MANAGER_EMAIL);
    expect(emails).not.toContain(OTHER_TENANT_MANAGER_EMAIL);
  });

  it("Müdür lookup: bireysel kurumda boş liste döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/branch-options/managers?tenantId=${INDIVIDUAL_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it("Müdür lookup: olmayan kurum 404 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/branch-options/managers?tenantId=00000000-0000-0000-0000-000000000000",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------- Şube oluşturma ----------

  let branchId1 = "";
  let branchId2 = "";
  let branchId3 = "";
  let branchId4 = "";

  it("ORGANIZATION şube oluşturulur (müdürsüz)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        name: "Test Şubesi 1",
        code: "TST-1",
        address: "Cadde 1, No: 1",
        phone: "+905551110001",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    branchId1 = body.id;
    expect(body.name).toBe("Test Şubesi 1");
    expect(body.code).toBe("TST-1");
    expect(body.address).toBe("Cadde 1, No: 1");
    expect(body.status).toBe("ACTIVE");
    expect(body.tenantId).toBe(ORG_TENANT);
    expect(body.managerUserId).toBeNull();
    expect(body.managerName).toBeNull();
  });

  it("Aynı kurumda aynı kod: 409 (tenant+code unique)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, name: "Farklı Ad", code: "TST-1" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Aynı kurumda aynı aktif ad: 409 (uq_branch_active_name)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, name: "Test Şubesi 1", code: "TST-4" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Farklı kurumda aynı kod kullanılabilir", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: OTHER_ORG_TENANT, name: "Diğer Şube", code: "TST-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.code).toBe("TST-1");
  });

  it("INDIVIDUAL kurumda şube oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: INDIVIDUAL_TENANT, name: "Bireysel Şube", code: "B1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Bireysel kurumda şube");
  });

  it("SUSPENDED kurumda şube oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: SUSPENDED_TENANT, name: "Askıda Şube", code: "AS1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Kurum aktif değil");
  });

  it("CLOSED kurumda şube oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: CLOSED_TENANT, name: "Kapalı Şube", code: "KP1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Kurum aktif değil");
  });

  it("Silinmiş kurumda şube oluşturulamaz (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: DELETED_TENANT, name: "Silinen Şube", code: "SL1" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Olmayan kurumda şube oluşturulamaz (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: "00000000-0000-0000-0000-000000000000",
        name: "Yok Şube",
        code: "YK1",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Eksik ad ile oluşturma: 400 (VALIDATION_ERROR)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, code: "TST-X" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // ---------- Müdür atama (oluşturma sırasında) ----------

  it("Geçerli BRANCH_MANAGER müdür atanabilir", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        name: "Müdürlü Şube",
        code: "TST-MGR",
        managerUserId: MANAGER_USER_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.managerUserId).toBe(MANAGER_USER_ID);
    expect(body.managerName).toBe("Şube Müdürü");
    expect(body.manager.email).toBe(MANAGER_EMAIL);
  });

  it("STUDENT kullanıcı müdür atanamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        name: "Öğrenci Müdür Şube",
        code: "TST-STM",
        managerUserId: STUDENT_USER_ID,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("TEACHER kullanıcı müdür atanamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        name: "Öğretmen Müdür Şube",
        code: "TST-TCM",
        managerUserId: TEACHER_USER_ID,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("Başka kurumdaki müdür atanamaz (cross-tenant; 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        name: "Yanlış Müdür Şube",
        code: "TST-XM",
        managerUserId: OTHER_TENANT_MANAGER_ID,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("Pasif üyeliğe sahip kullanıcı müdür atanamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        name: "Pasif Müdür Şube",
        code: "TST-PM",
        managerUserId: INACTIVE_MANAGER_USER_ID,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("Silinmiş kullanıcı müdür atanamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        name: "Silinen Müdür Şube",
        code: "TST-DM",
        managerUserId: DELETED_MANAGER_USER_ID,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // ---------- Ek şubeler + listeleme ----------

  it("İkinci ve üçüncü şube oluşturulur (listeleme testleri için)", async () => {
    const res2 = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, name: "Test Şubesi 2", code: "TST-2" },
    });
    expect(res2.statusCode).toBe(200);
    branchId2 = res2.json().data.id;

    const res3 = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, name: "Test Şubesi 3", code: "TST-3" },
    });
    expect(res3.statusCode).toBe(200);
    branchId3 = res3.json().data.id;

    const res4 = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, name: "Müdür Test Şubesi", code: "TST-MGR2" },
    });
    expect(res4.statusCode).toBe(200);
    branchId4 = res4.json().data.id;
  });

  it("Arama: isim ile şube bulunur", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/branches?search=Test%20%C5%9Eubesi&tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every((b: { tenantId: string }) => b.tenantId === ORG_TENANT)).toBe(true);
  });

  it("Tenant izolasyonu: başka kurumun şubeleri ORG_TENANT listesinde görünmez", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/branches?tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.every((b: { tenantId: string }) => b.tenantId === ORG_TENANT)).toBe(true);
    expect(
      items.some((b: { code: string }) => b.code === "TST-1" && b.tenantId === ORG_TENANT),
    ).toBe(true);
  });

  it("Sayfalama: pageSize=1 ile tek kayıt döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/branches?search=TST&pageSize=1&page=1",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(3);
  });

  // ---------- Durum değiştirme ----------

  it("Şube durumu INACTIVE yapılır", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId2}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "INACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("INACTIVE");
  });

  it("Durum filtresi: INACTIVE şubeler listelenir", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/branches?status=INACTIVE&tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((b: { status: string }) => b.status === "INACTIVE")).toBe(true);
  });

  it("Şube durumu CLOSED yapılır (CLOSED ≠ silme)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId2}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "CLOSED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("CLOSED");
    expect(res.json().data.deletedAt).toBeUndefined();
  });

  it("Geçersiz durum değeri: 400 (VALIDATION_ERROR)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId2}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "GECE" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // ---------- Güncelleme ----------

  it("Şube güncellenir (ad + kod + adres + telefon)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId1}`,
      headers: await superAdminHeaders(),
      payload: {
        name: "Yenilenmiş Şube",
        code: "TST-UPD",
        address: "Cadde 2, No: 2",
        phone: "+905551110002",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.name).toBe("Yenilenmiş Şube");
    expect(body.code).toBe("TST-UPD");
    expect(body.address).toBe("Cadde 2, No: 2");
    expect(body.phone).toBe("+905551110002");
  });

  it("Adres ve telefon null ile temizlenebilir", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId1}`,
      headers: await superAdminHeaders(),
      payload: { address: null, phone: null },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.address).toBeNull();
    expect(body.phone).toBeNull();
  });

  it("Güncellemede kod çakışması: 409", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId1}`,
      headers: await superAdminHeaders(),
      payload: { code: "TST-2" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  // ---------- Müdür atama/kaldırma (PATCH) ----------

  it("Müdür PATCH ile atanır", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId4}/manager`,
      headers: await superAdminHeaders(),
      payload: { managerUserId: MANAGER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.managerUserId).toBe(MANAGER_USER_ID);
    expect(body.managerName).toBe("Şube Müdürü");
  });

  it("Müdür null ile kaldırılır", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId4}/manager`,
      headers: await superAdminHeaders(),
      payload: { managerUserId: null },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.managerUserId).toBeNull();
    expect(body.manager).toBeNull();
  });

  it("Müdür atamada geçersiz kullanıcı: 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId4}/manager`,
      headers: await superAdminHeaders(),
      payload: { managerUserId: STUDENT_USER_ID },
    });
    expect(res.statusCode).toBe(400);
  });

  it("Olmayan şubeye müdür atanamaz (404)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/admin/branches/00000000-0000-0000-0000-000000000000/manager",
      headers: await superAdminHeaders(),
      payload: { managerUserId: MANAGER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------- Sayaçlar ----------

  it("Şube detayı sınıf ve öğretmen sayılarını içerir", async () => {
    // API ile şube oluştur, ardından sınıf + öğretmen üyeliği bağla.
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, name: "Sayaçlı Şube", code: "TST-CNT" },
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json().data;
    expect(created.classCount).toBe(0);
    expect(created.teacherCount).toBe(0);

    await prisma.academicYear.create({
      data: {
        id: AY_1,
        tenantId: ORG_TENANT,
        name: "2025-2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-06-15"),
        status: "ACTIVE",
      },
    });
    await prisma.class.create({
      data: {
        id: CLASS_1,
        tenantId: ORG_TENANT,
        branchId: created.id,
        academicYearId: AY_1,
        name: "5-A",
        gradeLevel: 5,
      },
    });
    await prisma.teacherBranchMembership.create({
      data: {
        id: TBM_1,
        tenantId: ORG_TENANT,
        branchId: created.id,
        teacherId: TEACHER_USER_ID,
        status: "ACTIVE",
      },
    });

    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/branches/${created.id}`,
      headers: await superAdminHeaders(),
    });
    expect(detailRes.statusCode).toBe(200);
    const body = detailRes.json().data;
    expect(body.classCount).toBe(1);
    expect(body.teacherCount).toBe(1);

    // Listede de aynı sayaçlar görünür.
    const listRes = await app.inject({
      method: "GET",
      url: `/admin/branches?search=TST-CNT`,
      headers: await superAdminHeaders(),
    });
    expect(listRes.statusCode).toBe(200);
    const listed = listRes.json().data.items[0];
    expect(listed.classCount).toBe(1);
    expect(listed.teacherCount).toBe(1);
  });

  // ---------- Soft delete ----------

  it("Şube soft-delete edilir; liste ve detayda kaybolur, fiziksel kayıt kalır", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/admin/branches/${branchId3}`,
      headers: await superAdminHeaders(),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.deletedAt).toBeTruthy();

    // Detay 404 verir.
    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/branches/${branchId3}`,
      headers: await superAdminHeaders(),
    });
    expect(detailRes.statusCode).toBe(404);

    // Listede görünmez.
    const listRes = await app.inject({
      method: "GET",
      url: `/admin/branches?search=TST-3`,
      headers: await superAdminHeaders(),
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.items.every((b: { id: string }) => b.id !== branchId3)).toBe(true);

    // Fiziksel kayıt duruyor (tarihçe korunur).
    const physical = await prisma.branch.findUnique({ where: { id: branchId3 } });
    expect(physical).not.toBeNull();
    expect(physical?.deletedAt).not.toBeNull();
  });

  it("Silinmiş şube güncellenemez (404)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId3}`,
      headers: await superAdminHeaders(),
      payload: { name: "Güncellenemez" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Silinmiş şubenin durumu değiştirilemez (404)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId3}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Silinmiş şubeye müdür atanamaz (404)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/branches/${branchId3}/manager`,
      headers: await superAdminHeaders(),
      payload: { managerUserId: MANAGER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Silinmiş şube adı yeniden kullanılabilir (partial unique; uq_branch_active_name)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, name: "Test Şubesi 3", code: "TST-5" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe("Test Şubesi 3");
  });
});
