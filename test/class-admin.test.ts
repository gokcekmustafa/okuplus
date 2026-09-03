import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

/**
 * Sınıf yönetimi (admin) testleri.
 *
 * Güvenlik: yalnızca SUPER_ADMIN erişir; normal tenant kullanıcıları 403,
 * kimliksiz istekler 401 alır. Tüm sınıf uçları requireAuth +
 * requirePlatformRole(["SUPER_ADMIN"]) guard'ıyla korunur.
 *
 * SINIF OLUŞTURMA KURALLARI:
 *  - Yalnızca ORGANIZATION tipteki ACTIVE tenant'larda sınıf oluşturulabilir
 *    (INDIVIDUAL → 400, SUSPENDED/CLOSED → 400, silinmiş tenant → 404).
 *  - Şube silinmemiş + aynı tenant'a ait + ACTIVE olmalıdır
 *    (silinmiş şube → 404, cross-tenant şube → 400, INACTIVE/CLOSED → 400).
 *  - Akademik yıl var olmalı ve aynı tenant'a ait olmalıdır (→ 400).
 *  - Sınıf adı `@@unique([branchId, academicYearId, name])` ile aynı şube +
 *    akademik yıl içinde tektir (soft-delete dahil tüm kayıtlar; P2002 → 409).
 *
 * ÖĞRETMEN ATAMASI (class-scoped): atanacak öğretmen silinmemiş + ACTIVE
 * kullanıcı, ilgili kurumda ACTIVE TEACHER üyeliği ve sınıfın şubesinde
 * ACTIVE TeacherBranchMembership'e sahip olmalıdır. Duplicate aktif atama
 * 409 döner (uyq_teacher_class_active). Atama durumu/kaldırma için mevcut
 * öğretmen uçları kullanılır (PATCH/DELETE /admin/teacher-class-assignments/:id).
 *
 * ENROLLMENT: duplicate uç oluşturulmaz; öğrenci kayıtları mevcut öğrenci
 * akışı üzerinden test edilir (POST /admin/students/:id/enrollments).
 *
 * Sınıf silme SOFT-DELETE'tir (Class.deletedAt); fiziksel silme yoktur.
 * ARCHIVED durumu silme değildir. Öğrenci/öğretmen tarihçesi korunur.
 *
 * NOT: rls-security.test.ts afterAll'da TRUNCATE "Content", "Tenant" CASCADE
 * yapar; bu testler kendi verilerini beforeAll/afterAll ile kurar ve temizler.
 */

const hasher = new ScryptPasswordHasher();
const PASSWORD = "test-pass-123!";

// Kullanıcılar
const PLATFORM_USER_ID = "99999993-0000-7000-8000-000000000001";
const NORMAL_USER_ID = "99999993-0000-7000-8000-000000000002";
const TEACHER_USER_ID = "99999993-0000-7000-8000-000000000003";
const TEACHER_NO_BRANCH_ID = "99999993-0000-7000-8000-000000000004";
const TEACHER_INACTIVE_BRANCH_ID = "99999993-0000-7000-8000-000000000005";
const OTHER_TENANT_TEACHER_ID = "99999993-0000-7000-8000-000000000006";

// Tenant'lar
const ORG_TENANT = "99999993-0000-7000-8000-0000000000b1";
const INDIVIDUAL_TENANT = "99999993-0000-7000-8000-0000000000b2";
const SUSPENDED_TENANT = "99999993-0000-7000-8000-0000000000b3";
const CLOSED_TENANT = "99999993-0000-7000-8000-0000000000b4";
const DELETED_TENANT = "99999993-0000-7000-8000-0000000000b5";
const OTHER_ORG_TENANT = "99999993-0000-7000-8000-0000000000b6";

// Kurum yapısı
const BRANCH_1 = "99999993-0000-7000-8000-0000000000d1";
const BRANCH_2 = "99999993-0000-7000-8000-0000000000d2";
const BRANCH_3 = "99999993-0000-7000-8000-0000000000d3";
const BRANCH_4 = "99999993-0000-7000-8000-0000000000d4";
const BRANCH_5 = "99999993-0000-7000-8000-0000000000d5";
const BRANCH_OTHER = "99999993-0000-7000-8000-0000000000d6";

const AY_1 = "99999993-0000-7000-8000-0000000000e1";
const AY_2 = "99999993-0000-7000-8000-0000000000e2";
const AY_OTHER = "99999993-0000-7000-8000-0000000000e3";

const SUPER_ADMIN_EMAIL = "class-super-admin@example.com";
const NORMAL_EMAIL = "class-tenant-user@example.com";
const TEACHER_EMAIL = "class-teacher@example.com";
const TEACHER_NO_BRANCH_EMAIL = "class-teacher-nobranch@example.com";
const TEACHER_INACTIVE_EMAIL = "class-teacher-inactive@example.com";
const OTHER_TEACHER_EMAIL = "class-teacher-other@example.com";
const STUDENT_EMAIL = "class-student@example.com";

const USER_IDS = [
  PLATFORM_USER_ID,
  NORMAL_USER_ID,
  TEACHER_USER_ID,
  TEACHER_NO_BRANCH_ID,
  TEACHER_INACTIVE_BRANCH_ID,
  OTHER_TENANT_TEACHER_ID,
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
  TEACHER_EMAIL,
  TEACHER_NO_BRANCH_EMAIL,
  TEACHER_INACTIVE_EMAIL,
  OTHER_TEACHER_EMAIL,
  STUDENT_EMAIL,
];

describe("class admin", () => {
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
    await prisma.studentProfile.deleteMany({
      where: { OR: [{ studentId: { in: USER_IDS } }, { tenantId: { in: TENANT_IDS } }] },
    });
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
          displayName: "Sınıf Super Admin",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
        {
          id: NORMAL_USER_ID,
          email: NORMAL_EMAIL,
          displayName: "Sınıf Tenant Kullanıcı",
          passwordHash,
        },
        {
          id: TEACHER_USER_ID,
          email: TEACHER_EMAIL,
          displayName: "Sınıf Öğretmeni",
          passwordHash,
        },
        {
          id: TEACHER_NO_BRANCH_ID,
          email: TEACHER_NO_BRANCH_EMAIL,
          displayName: "Şubesiz Öğretmen",
          passwordHash,
        },
        {
          id: TEACHER_INACTIVE_BRANCH_ID,
          email: TEACHER_INACTIVE_EMAIL,
          displayName: "Pasif Şube Öğretmeni",
          passwordHash,
        },
        {
          id: OTHER_TENANT_TEACHER_ID,
          email: OTHER_TEACHER_EMAIL,
          displayName: "Diğer Okul Öğretmeni",
          passwordHash,
        },
      ],
    });

    await prisma.tenant.createMany({
      data: [
        { id: ORG_TENANT, type: "ORGANIZATION", name: "Sınıf Test Okulu" },
        { id: INDIVIDUAL_TENANT, type: "INDIVIDUAL", name: "Sınıf Bireysel" },
        { id: SUSPENDED_TENANT, type: "ORGANIZATION", name: "Sınıf Askıda", status: "SUSPENDED" },
        { id: CLOSED_TENANT, type: "ORGANIZATION", name: "Sınıf Kapalı", status: "CLOSED" },
        {
          id: DELETED_TENANT,
          type: "ORGANIZATION",
          name: "Sınıf Silinen",
          deletedAt: new Date(),
        },
        { id: OTHER_ORG_TENANT, type: "ORGANIZATION", name: "Sınıf Diğer Okul" },
      ],
    });

    await prisma.branch.createMany({
      data: [
        { id: BRANCH_1, tenantId: ORG_TENANT, name: "Merkez Şube", code: "MZ" },
        { id: BRANCH_2, tenantId: ORG_TENANT, name: "Pasif Şube", code: "PS", status: "INACTIVE" },
        { id: BRANCH_3, tenantId: ORG_TENANT, name: "Kapalı Şube", code: "KP", status: "CLOSED" },
        {
          id: BRANCH_4,
          tenantId: ORG_TENANT,
          name: "Silinen Şube",
          code: "SL",
          deletedAt: new Date(),
        },
        { id: BRANCH_5, tenantId: ORG_TENANT, name: "İkinci Aktif Şube", code: "IA" },
        { id: BRANCH_OTHER, tenantId: OTHER_ORG_TENANT, name: "Diğer Şube", code: "DG" },
      ],
    });

    await prisma.academicYear.createMany({
      data: [
        {
          id: AY_1,
          tenantId: ORG_TENANT,
          name: "2025-2026",
          startDate: new Date("2025-09-01"),
          endDate: new Date("2026-06-15"),
          status: "ACTIVE",
        },
        {
          id: AY_2,
          tenantId: ORG_TENANT,
          name: "2026-2027",
          startDate: new Date("2026-09-01"),
          endDate: new Date("2027-06-15"),
          status: "UPCOMING",
        },
        {
          id: AY_OTHER,
          tenantId: OTHER_ORG_TENANT,
          name: "2025-2026",
          startDate: new Date("2025-09-01"),
          endDate: new Date("2026-06-15"),
          status: "ACTIVE",
        },
      ],
    });

    // Üyelikler + şube üyelikleri.
    await prisma.membership.createMany({
      data: [
        { tenantId: ORG_TENANT, userId: NORMAL_USER_ID, role: "STUDENT", status: "ACTIVE" },
        { tenantId: ORG_TENANT, userId: TEACHER_USER_ID, role: "TEACHER", status: "ACTIVE" },
        { tenantId: ORG_TENANT, userId: TEACHER_NO_BRANCH_ID, role: "TEACHER", status: "ACTIVE" },
        {
          tenantId: ORG_TENANT,
          userId: TEACHER_INACTIVE_BRANCH_ID,
          role: "TEACHER",
          status: "ACTIVE",
        },
        {
          tenantId: OTHER_ORG_TENANT,
          userId: OTHER_TENANT_TEACHER_ID,
          role: "TEACHER",
          status: "ACTIVE",
        },
      ],
    });
    await prisma.teacherBranchMembership.createMany({
      data: [
        { tenantId: ORG_TENANT, branchId: BRANCH_1, teacherId: TEACHER_USER_ID, status: "ACTIVE" },
        {
          tenantId: ORG_TENANT,
          branchId: BRANCH_1,
          teacherId: TEACHER_INACTIVE_BRANCH_ID,
          status: "INACTIVE",
        },
        {
          tenantId: ORG_TENANT,
          branchId: BRANCH_5,
          teacherId: TEACHER_USER_ID,
          status: "ACTIVE",
        },
        {
          tenantId: OTHER_ORG_TENANT,
          branchId: BRANCH_OTHER,
          teacherId: OTHER_TENANT_TEACHER_ID,
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
    await prisma.studentProfile.deleteMany({
      where: { OR: [{ studentId: { in: USER_IDS } }, { tenantId: { in: TENANT_IDS } }] },
    });
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
    const res = await app.inject({ method: "GET", url: "/admin/classes" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("Normal tenant kullanıcısı: 403 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/classes",
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("Normal tenant kullanıcısı: oluşturma uçlarına da erişemez (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await tenantUserHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "X",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("Sınıf kapsamlı uçlar da platform yetkisi ister (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/classes/${BRANCH_1}/students`,
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
    const res2 = await app.inject({
      method: "POST",
      url: `/admin/classes/${BRANCH_1}/teachers`,
      headers: await tenantUserHeaders(),
      payload: { teacherId: TEACHER_USER_ID },
    });
    expect(res2.statusCode).toBe(403);
  });

  it("Geçersiz status query: 400 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/classes?status=GECE",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Super Admin: sınıfları listeler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  // ---------- Sınıf oluşturma ----------

  let classAId = "";
  let classUId = "";
  let classEId = "";

  it("ORGANIZATION sınıfı oluşturulur (varsayılan durum ACTIVE)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "5-A",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    classAId = body.id;
    expect(body.name).toBe("5-A");
    expect(body.gradeLevel).toBe(5);
    expect(body.status).toBe("ACTIVE");
    expect(body.tenantId).toBe(ORG_TENANT);
    expect(body.tenantName).toBe("Sınıf Test Okulu");
    expect(body.branchName).toBe("Merkez Şube");
    expect(body.academicYearName).toBe("2025-2026");
    expect(body.studentCount).toBe(0);
    expect(body.teacherCount).toBe(0);
  });

  it("Aynı şube + akademik yıl + ad: 409 (unique)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "5-A",
        gradeLevel: 6,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Aynı ad farklı şubede oluşturulabilir (şube farklı)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_5,
        academicYearId: AY_1,
        name: "5-A",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.branchName).toBe("İkinci Aktif Şube");
  });

  it("Aynı ad aynı şubede farklı yılda oluşturulabilir (yıl farklı)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_2,
        name: "5-A",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.academicYearName).toBe("2026-2027");
  });

  it("INDIVIDUAL kurumda sınıf oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: INDIVIDUAL_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "B1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Bireysel kurumda sınıf");
  });

  it("SUSPENDED kurumda sınıf oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: SUSPENDED_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "AS1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Kurum aktif değil");
  });

  it("CLOSED kurumda sınıf oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: CLOSED_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "KP1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Kurum aktif değil");
  });

  it("Silinmiş kurumda sınıf oluşturulamaz (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: DELETED_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "SL1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Olmayan kurumda sınıf oluşturulamaz (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: "00000000-0000-0000-0000-000000000000",
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "YK1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Silinmiş şubede sınıf oluşturulamaz (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_4,
        academicYearId: AY_1,
        name: "SLŞ",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Olmayan şubede sınıf oluşturulamaz (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: "00000000-0000-0000-0000-000000000000",
        academicYearId: AY_1,
        name: "YKŞ",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Başka kurumun şubesiyle sınıf oluşturulamaz (cross-tenant; 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_OTHER,
        academicYearId: AY_1,
        name: "XT1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Seçilen şube bu kuruma ait değil");
  });

  it("INACTIVE şubede sınıf oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_2,
        academicYearId: AY_1,
        name: "PS1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Şube aktif değil");
  });

  it("CLOSED şubede sınıf oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_3,
        academicYearId: AY_1,
        name: "KPŞ",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Şube aktif değil");
  });

  it("Olmayan akademik yılda sınıf oluşturulamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: "00000000-0000-0000-0000-000000000000",
        name: "YA1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Akademik yıl bulunamadı");
  });

  it("Başka kurumun akademik yılıyla sınıf oluşturulamaz (cross-tenant; 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_OTHER,
        name: "XY1",
        gradeLevel: 5,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Seçilen akademik yıl bu kuruma ait değil");
  });

  it("Eksik ad ile oluşturma: 400 (VALIDATION_ERROR)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: { tenantId: ORG_TENANT, branchId: BRANCH_1, academicYearId: AY_1, gradeLevel: 5 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Geçersiz sınıf düzeyi ile oluşturma: 400 (VALIDATION_ERROR)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "0-A",
        gradeLevel: 0,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Düzenleme testleri için ek sınıflar oluşturulur", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "6-A",
        gradeLevel: 6,
      },
    });
    expect(res.statusCode).toBe(200);
    classUId = res.json().data.id;

    const res2 = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_5,
        academicYearId: AY_1,
        name: "8-A",
        gradeLevel: 8,
      },
    });
    expect(res2.statusCode).toBe(200);
    classEId = res2.json().data.id;
  });

  // ---------- Listeleme / filtreler ----------

  it("Arama: ad ile sınıf bulunur", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/classes?search=5-A&tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every((c: { tenantId: string }) => c.tenantId === ORG_TENANT)).toBe(true);
  });

  it("Şube filtresi: yalnızca seçilen şubenin sınıfları döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/classes?branchId=${BRANCH_5}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((c: { branchId: string }) => c.branchId === BRANCH_5)).toBe(true);
  });

  it("Akademik yıl filtresi: yalnızca seçilen yılın sınıfları döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/classes?academicYearId=${AY_2}&tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.every((c: { academicYearId: string }) => c.academicYearId === AY_2)).toBe(true);
    expect(items.some((c: { name: string }) => c.name === "5-A")).toBe(true);
  });

  it("Sayfalama: pageSize=1 ile tek kayıt döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/classes?search=5-A&pageSize=1&page=1",
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

  it("Sınıf durumu ARCHIVED yapılır (ARCHIVED ≠ silme)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/classes/${classAId}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "ARCHIVED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ARCHIVED");
    expect(res.json().data.deletedAt).toBeUndefined();
  });

  it("Durum filtresi: ARCHIVED sınıflar listelenir", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/classes?status=ARCHIVED&tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((c: { status: string }) => c.status === "ARCHIVED")).toBe(true);
  });

  it("Sınıf durumu ACTIVE'e geri alınır", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/classes/${classAId}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ACTIVE");
  });

  it("Geçersiz durum değeri: 400 (VALIDATION_ERROR)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/classes/${classAId}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "GECE" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // ---------- Güncelleme ----------

  it("Sınıf güncellenir (ad + düzey)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/classes/${classUId}`,
      headers: await superAdminHeaders(),
      payload: { name: "6-B", gradeLevel: 7 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.name).toBe("6-B");
    expect(body.gradeLevel).toBe(7);
  });

  it("Güncellemede ad çakışması: 409", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/classes/${classUId}`,
      headers: await superAdminHeaders(),
      payload: { name: "5-A" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Olmayan sınıf güncellenemez (404)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/admin/classes/00000000-0000-0000-0000-000000000000",
      headers: await superAdminHeaders(),
      payload: { name: "X" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Güncellemede geçersiz düzey: 400 (VALIDATION_ERROR)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/classes/${classUId}`,
      headers: await superAdminHeaders(),
      payload: { gradeLevel: 13 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // ---------- Öğrenciler (mevcut öğrenci akışı üzerinden) ----------

  let studentProfileId = "";

  it("Öğrenci sınıfa kaydedilir; sınıfın öğrenci listesine yansır", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Sınıf Öğrencisi",
        email: STUDENT_EMAIL,
        password: "student-pass-123!",
        tenantId: ORG_TENANT,
        classId: classAId,
      },
    });
    expect(create.statusCode).toBe(200);
    studentProfileId = create.json().data.id;

    const list = await app.inject({
      method: "GET",
      url: `/admin/classes/${classAId}/students`,
      headers: await superAdminHeaders(),
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().data;
    expect(items).toHaveLength(1);
    expect(items[0].studentId).toBe(create.json().data.user.id);
    expect(items[0].displayName).toBe("Sınıf Öğrencisi");
    expect(items[0].enrollmentStatus).toBe("ACTIVE");

    // Sınıf detayında sayaç 1 görünür.
    const detail = await app.inject({
      method: "GET",
      url: `/admin/classes/${classAId}`,
      headers: await superAdminHeaders(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.studentCount).toBe(1);
  });

  it("Aynı akademik yılda ikinci aktif kayıt: 409 (uyq_enrollment_student_year_active)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/students/${studentProfileId}/enrollments`,
      headers: await superAdminHeaders(),
      payload: { classId: classEId },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Olmayan sınıfın öğrenci listesi: 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/classes/00000000-0000-0000-0000-000000000000/students",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------- Öğretmen ataması (class-scoped) ----------

  let assignmentId = "";

  it("Geçerli öğretmen atanır (kurum + şube üyeliği doğrulanır)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/classes/${classAId}/teachers`,
      headers: await superAdminHeaders(),
      payload: { teacherId: TEACHER_USER_ID, subject: "Matematik" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    assignmentId = body.id;
    expect(body.teacherId).toBe(TEACHER_USER_ID);
    expect(body.displayName).toBe("Sınıf Öğretmeni");
    expect(body.subject).toBe("Matematik");
    expect(body.status).toBe("ACTIVE");

    // Sınıf detayında öğretmen sayacı 1 görünür.
    const detail = await app.inject({
      method: "GET",
      url: `/admin/classes/${classAId}`,
      headers: await superAdminHeaders(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.teacherCount).toBe(1);
  });

  it("Aynı sınıfa tekrar aktif atama: 409 (uyq_teacher_class_active)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/classes/${classAId}/teachers`,
      headers: await superAdminHeaders(),
      payload: { teacherId: TEACHER_USER_ID },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Başka kurumun öğretmeni atanamaz (cross-tenant; 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/classes/${classAId}/teachers`,
      headers: await superAdminHeaders(),
      payload: { teacherId: OTHER_TENANT_TEACHER_ID },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("aktif öğretmen üyesi değil");
  });

  it("Şube üyeliği olmayan öğretmen atanamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/classes/${classAId}/teachers`,
      headers: await superAdminHeaders(),
      payload: { teacherId: TEACHER_NO_BRANCH_ID },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("aktif üye değil");
  });

  it("INACTIVE şube üyeliğine sahip öğretmen atanamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/classes/${classAId}/teachers`,
      headers: await superAdminHeaders(),
      payload: { teacherId: TEACHER_INACTIVE_BRANCH_ID },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("aktif üye değil");
  });

  it("Olmayan öğretmen atanamaz (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/classes/${classAId}/teachers`,
      headers: await superAdminHeaders(),
      payload: { teacherId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("bulunamadı");
  });

  it("Olmayan sınıfa öğretmen atanamaz (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/classes/00000000-0000-0000-0000-000000000000/teachers",
      headers: await superAdminHeaders(),
      payload: { teacherId: TEACHER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Sınıfın öğretmen listesi atanan öğretmeni içerir", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/classes/${classAId}/teachers`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].teacherId).toBe(TEACHER_USER_ID);
    expect(items[0].status).toBe("ACTIVE");
  });

  it("Atama durumu mevcut öğretmen ucuyla değiştirilir (INACTIVE)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/teacher-class-assignments/${assignmentId}`,
      headers: await superAdminHeaders(),
      payload: { status: "INACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("INACTIVE");

    // INACTIVE atama sınıfın öğretmen sayacına dahil edilmez.
    const detail = await app.inject({
      method: "GET",
      url: `/admin/classes/${classAId}`,
      headers: await superAdminHeaders(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.teacherCount).toBe(0);
  });

  it("Atama kaldırılır (mevcut öğretmen ucu; soft delete)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/teacher-class-assignments/${assignmentId}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.removed).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: `/admin/classes/${classAId}/teachers`,
      headers: await superAdminHeaders(),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.every((t: { id: string }) => t.id !== assignmentId)).toBe(true);
  });

  // ---------- Soft delete ----------

  let classDId = "";

  it("Sınıf soft-delete edilir; liste ve detayda kaybolur, fiziksel kayıt kalır", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/admin/classes",
      headers: await superAdminHeaders(),
      payload: {
        tenantId: ORG_TENANT,
        branchId: BRANCH_1,
        academicYearId: AY_1,
        name: "9-A",
        gradeLevel: 9,
      },
    });
    expect(create.statusCode).toBe(200);
    classDId = create.json().data.id;

    const del = await app.inject({
      method: "DELETE",
      url: `/admin/classes/${classDId}`,
      headers: await superAdminHeaders(),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.deletedAt).toBeTruthy();

    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/classes/${classDId}`,
      headers: await superAdminHeaders(),
    });
    expect(detailRes.statusCode).toBe(404);

    const listRes = await app.inject({
      method: "GET",
      url: `/admin/classes?search=9-A`,
      headers: await superAdminHeaders(),
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.items.every((c: { id: string }) => c.id !== classDId)).toBe(true);

    const physical = await prisma.class.findUnique({ where: { id: classDId } });
    expect(physical).not.toBeNull();
    expect(physical?.deletedAt).not.toBeNull();
  });

  it("Silinmiş sınıf güncellenemez (404)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/classes/${classDId}`,
      headers: await superAdminHeaders(),
      payload: { name: "Güncellenemez" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Silinmiş sınıfın durumu değiştirilemez (404)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/classes/${classDId}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Silinmiş sınıfa öğretmen atanamaz (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/classes/${classDId}/teachers`,
      headers: await superAdminHeaders(),
      payload: { teacherId: TEACHER_USER_ID },
    });
    expect(res.statusCode).toBe(404);
  });
});
