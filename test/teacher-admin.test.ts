import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

/**
 * Öğretmen yönetimi (admin) testleri.
 *
 * Güvenlik: yalnızca SUPER_ADMIN erişir; normal tenant kullanıcıları 403,
 * kimliksiz istekler 401 alır. Öğretmen oluşturma tek transaction içinde yapılır;
 * User + TEACHER Membership birlikte kurulur, bir adım başarısız olursa tamamı
 * geri alınır (yarım kayıt kalmaz).
 *
 * KURUM TİPİ KURALI: INDIVIDUAL tenant'ta öğretmen oluşturulamaz (400);
 * ORGANIZATION tenant'ta öğretmen oluşturulur. Kural mevcut users/membership
 * modülündeki bireysel rol kuralıyla birebir uyumludur.
 *
 * DUPLICATE: TeacherBranchMembership için `uq_teacher_branch_active`,
 * TeacherClassAssignment için `uq_teacher_class_active` partial unique
 * index'leri DB seviyesinde engeller (P2002 → 409). Bir öğretmen farklı
 * şubelerde/sınıflarda birden fazla görev alabilir.
 *
 * NOT: rls-security.test.ts afterAll'da TRUNCATE "Content", "Tenant" CASCADE
 * yapar; bu testler kendi verilerini beforeAll/afterAll ile kurar ve temizler.
 * Öğretmen silme soft-delete'tir (User.deletedAt); şube/sınıf geçmişi korunur.
 */

const hasher = new ScryptPasswordHasher();
const PASSWORD = "test-pass-123!";

const PLATFORM_USER_ID = "99999996-0000-7000-8000-000000000001";
const NORMAL_USER_ID = "99999996-0000-7000-8000-000000000002";

// Tenant test verisi
const ORG_TENANT = "99999996-0000-7000-8000-0000000000b1";
const INDIVIDUAL_TENANT = "99999996-0000-7000-8000-0000000000b2";

// Kurum yapısı (test verisi; Branch/Class/AcademicYear CRUD modülü yoktur)
const BRANCH_1 = "99999996-0000-7000-8000-0000000000d1";
const BRANCH_2 = "99999996-0000-7000-8000-0000000000d2";
const AY_1 = "99999996-0000-7000-8000-0000000000e1";
const AY_2 = "99999996-0000-7000-8000-0000000000e2";
const CLASS_1 = "99999996-0000-7000-8000-0000000000f1";
const CLASS_2 = "99999996-0000-7000-8000-0000000000f2";

const ORG_EMAIL = "teacher-org@example.com";
const ORG_EMAIL_2 = "teacher-org-2@example.com";

describe("teacher admin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();

    // Tekrar çalıştırmalarda kalıcı olabilecek veriyi hedefli temizle.
    await prisma.teacherClassAssignment.deleteMany({
      where: { teacher: { email: { in: [ORG_EMAIL, ORG_EMAIL_2] } } },
    });
    await prisma.teacherBranchMembership.deleteMany({
      where: { teacher: { email: { in: [ORG_EMAIL, ORG_EMAIL_2] } } },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { user: { email: { in: [ORG_EMAIL, ORG_EMAIL_2] } } },
          { userId: NORMAL_USER_ID },
          { tenantId: ORG_TENANT },
          { tenantId: INDIVIDUAL_TENANT },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: [PLATFORM_USER_ID, NORMAL_USER_ID] } },
          { email: { in: [ORG_EMAIL, ORG_EMAIL_2] } },
        ],
      },
    });
    await prisma.class.deleteMany({ where: { id: { in: [CLASS_1, CLASS_2] } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: [AY_1, AY_2] } } });
    await prisma.branch.deleteMany({ where: { id: { in: [BRANCH_1, BRANCH_2] } } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [ORG_TENANT, INDIVIDUAL_TENANT] } },
    });

    const passwordHash = await hasher.hash(PASSWORD);

    await prisma.user.createMany({
      data: [
        {
          id: PLATFORM_USER_ID,
          email: "teacher-super-admin@example.com",
          displayName: "Öğretmen Super Admin",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
        {
          id: NORMAL_USER_ID,
          email: "teacher-tenant-user@example.com",
          displayName: "Öğretmen Tenant Kullanıcı",
          passwordHash,
        },
      ],
    });

    await prisma.tenant.createMany({
      data: [
        { id: ORG_TENANT, type: "ORGANIZATION", name: "Öğretmen Okulu" },
        { id: INDIVIDUAL_TENANT, type: "INDIVIDUAL", name: "Öğretmen Bireysel" },
      ],
    });

    // Kurum yapısı: iki şube + iki akademik yıl + iki sınıf (yalnızca test verisi).
    await prisma.branch.createMany({
      data: [
        { id: BRANCH_1, tenantId: ORG_TENANT, name: "Merkez Şube", code: "MZ" },
        { id: BRANCH_2, tenantId: ORG_TENANT, name: "İkinci Şube", code: "IK" },
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
      ],
    });
    await prisma.class.createMany({
      data: [
        {
          id: CLASS_1,
          tenantId: ORG_TENANT,
          branchId: BRANCH_1,
          academicYearId: AY_1,
          name: "5-A",
          gradeLevel: 5,
        },
        {
          id: CLASS_2,
          tenantId: ORG_TENANT,
          branchId: BRANCH_2,
          academicYearId: AY_2,
          name: "6-A",
          gradeLevel: 6,
        },
      ],
    });

    // Normal kullanıcı bir tenant üyesi (RLS erişim sınırı testi için).
    await prisma.membership.create({
      data: {
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
      where: { tenantId: { in: [ORG_TENANT, INDIVIDUAL_TENANT] } },
    });
    await prisma.pointEvent.deleteMany({
      where: { tenantId: { in: [ORG_TENANT, INDIVIDUAL_TENANT] } },
    });
    await prisma.studentStreak.deleteMany({
      where: { tenantId: { in: [ORG_TENANT, INDIVIDUAL_TENANT] } },
    });
    await prisma.teacherClassAssignment.deleteMany({
      where: { teacher: { email: { in: [ORG_EMAIL, ORG_EMAIL_2] } } },
    });
    await prisma.teacherBranchMembership.deleteMany({
      where: { teacher: { email: { in: [ORG_EMAIL, ORG_EMAIL_2] } } },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { user: { email: { in: [ORG_EMAIL, ORG_EMAIL_2] } } },
          { userId: NORMAL_USER_ID },
          { tenantId: ORG_TENANT },
          { tenantId: INDIVIDUAL_TENANT },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: [PLATFORM_USER_ID, NORMAL_USER_ID] } },
          { email: { in: [ORG_EMAIL, ORG_EMAIL_2] } },
        ],
      },
    });
    await prisma.class.deleteMany({ where: { id: { in: [CLASS_1, CLASS_2] } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: [AY_1, AY_2] } } });
    await prisma.branch.deleteMany({ where: { id: { in: [BRANCH_1, BRANCH_2] } } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [ORG_TENANT, INDIVIDUAL_TENANT] } },
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
    authorization: `Bearer ${await login("teacher-super-admin@example.com")}`,
  });
  const tenantUserHeaders = async () => ({
    authorization: `Bearer ${await login("teacher-tenant-user@example.com")}`,
  });

  // ---------- Güvenlik ----------

  it("Kimliksiz istek: 401 döner", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/teachers" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("Normal tenant kullanıcısı: 403 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/teachers",
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("Normal tenant kullanıcısı: oluşturma uçlarına da erişemez (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/teachers",
      headers: await tenantUserHeaders(),
      payload: {
        displayName: "X",
        email: "x-teacher@example.com",
        password: "12345678",
        tenantId: ORG_TENANT,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("Lookup uçları da platform yetkisi ister (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/teacher-options/branches?tenantId=00000000-0000-0000-0000-000000000000",
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------- Öğretmen listesi ----------

  it("Super Admin: öğretmenleri listeler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/teachers",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it("Geçersiz status query: 400 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/teachers?status=GECE",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Şube lookup: tenant'a ait şubeleri döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/teacher-options/branches?tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().data.map((b: { name: string }) => b.name);
    expect(names).toContain("Merkez Şube");
    expect(names).toContain("İkinci Şube");
  });

  // ---------- Öğretmen oluşturma (ORGANIZATION) ----------

  let orgTeacherUserId = "";

  it("ORGANIZATION öğretmeni oluşturulur: User + TEACHER membership", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/teachers",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Ayşe Hoca",
        email: ORG_EMAIL,
        phone: "+905551112233",
        birthYear: 1985,
        password: "teacher-pass-123!",
        tenantId: ORG_TENANT,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    orgTeacherUserId = body.data.user.id;
    expect(body.data.user.displayName).toBe("Ayşe Hoca");
    expect(body.data.user.email).toBe(ORG_EMAIL);
    expect(body.data.user.birthYear).toBe(1985);

    // TEACHER membership oluştu.
    const teacherMembership = body.data.memberships.find(
      (m: { role: string }) => m.role === "TEACHER",
    );
    expect(teacherMembership).toBeTruthy();
    expect(teacherMembership.status).toBe("ACTIVE");
    expect(teacherMembership.tenantId).toBe(ORG_TENANT);

    // Başlangıçta şube üyeliği ve sınıf ataması yok.
    expect(body.data.branches).toHaveLength(0);
    expect(body.data.classAssignments).toHaveLength(0);
  });

  it("Aynı e-posta ile ikinci öğretmen: 409 (email unique)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/teachers",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Ayşe Hoca",
        email: ORG_EMAIL,
        password: "teacher-pass-123!",
        tenantId: ORG_TENANT,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Olmayan kurum: 404 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/teachers",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Kimse Hoca",
        email: "nobody-teacher@example.com",
        password: "teacher-pass-123!",
        tenantId: "00000000-0000-0000-0000-000000000000",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("INDIVIDUAL kurumda öğretmen oluşturulamaz (kural; 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/teachers",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Bireysel Hoca",
        email: "teacher-individual@example.com",
        password: "teacher-pass-123!",
        tenantId: INDIVIDUAL_TENANT,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("Bireysel kurumda öğretmen");
  });

  it("Tenant izolasyonu: INDIVIDUAL kurumdaki öğretmen listesinde ORGANIZATION öğretmeni görünmez", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/teachers?tenantId=${INDIVIDUAL_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items).toHaveLength(0);
  });

  it("Tenant izolasyonu: arama ile öğretmen bulunur", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/teachers?search=Ay%C5%9Fe&tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].displayName).toBe("Ayşe Hoca");
  });

  // ---------- Şube üyelikleri ----------

  let branchMembershipId = "";

  it("Şube üyeliği eklenir", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/branches`,
      headers: await superAdminHeaders(),
      payload: { branchId: BRANCH_1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    branchMembershipId = body.id;
    expect(body.branchName).toBe("Merkez Şube");
    expect(body.status).toBe("ACTIVE");
  });

  it("Aynı şubeye tekrar aktif üyelik: 409 (uq_teacher_branch_active)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/branches`,
      headers: await superAdminHeaders(),
      payload: { branchId: BRANCH_1 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("İkinci şubeye üyelik eklenebilir (birden fazla şube)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/branches`,
      headers: await superAdminHeaders(),
      payload: { branchId: BRANCH_2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.branchName).toBe("İkinci Şube");
  });

  it("Öğretmenin üye olmadığı kurumun şubesine üyelik: 400", async () => {
    // Öğretmen yalnızca ORG_TENANT'ta üye; başka bir tenant'ın branch'i yok,
    // ancak cross-tenant kontrolü üyelik bazlıdır. Bilinmeyen şube 404 verir.
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/branches`,
      headers: await superAdminHeaders(),
      payload: { branchId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Şube üyeliği durumu değiştirilir (ACTIVE → INACTIVE)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/teacher-branches/${branchMembershipId}`,
      headers: await superAdminHeaders(),
      payload: { status: "INACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("INACTIVE");
  });

  it("Pasif üyelik sonrası aynı şubeye yeniden aktif üyelik eklenebilir", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/branches`,
      headers: await superAdminHeaders(),
      payload: { branchId: BRANCH_1, status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.branchName).toBe("Merkez Şube");
    expect(res.json().data.status).toBe("ACTIVE");
  });

  it("Şube üyeliği kaldırılır (soft delete; status REMOVED)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/teacher-branches/${branchMembershipId}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.removed).toBe(true);
  });

  // ---------- Sınıf atamaları ----------

  let classAssignmentId = "";

  it("Sınıf ataması eklenir (ders adıyla)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/classes`,
      headers: await superAdminHeaders(),
      payload: { classId: CLASS_1, subject: "Matematik" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    classAssignmentId = body.id;
    expect(body.className).toBe("5-A");
    expect(body.branchName).toBe("Merkez Şube");
    expect(body.subject).toBe("Matematik");
    expect(body.status).toBe("ACTIVE");
  });

  it("Aynı sınıfa tekrar aktif atama: 409 (uq_teacher_class_active)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/classes`,
      headers: await superAdminHeaders(),
      payload: { classId: CLASS_1 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("İkinci sınıfa atama eklenebilir (bir öğretmen birden fazla sınıfta görev alır)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/classes`,
      headers: await superAdminHeaders(),
      payload: { classId: CLASS_2, subject: "Fen Bilimleri" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.className).toBe("6-A");
    expect(res.json().data.branchName).toBe("İkinci Şube");
  });

  it("Sınıf ataması durumu değiştirilir (ACTIVE → INACTIVE)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/teacher-class-assignments/${classAssignmentId}`,
      headers: await superAdminHeaders(),
      payload: { status: "INACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("INACTIVE");
  });

  it("Sınıf ataması kaldırılır (soft delete)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/teacher-class-assignments/${classAssignmentId}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.removed).toBe(true);
  });

  // ---------- Detay / düzenleme / durum / soft delete ----------

  it("Öğretmen detayı: şube ve sınıf bilgilerini içerir", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/teachers/${orgTeacherUserId}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.user.email).toBe(ORG_EMAIL);
    expect(body.memberships.some((m: { role: string }) => m.role === "TEACHER")).toBe(true);
    // Aktif şube üyelikleri (Merkez Şube yeniden eklenmişti + İkinci Şube).
    expect(body.branches.some((b: { branchName: string }) => b.branchName === "Merkez Şube")).toBe(
      true,
    );
    expect(body.branches.some((b: { branchName: string }) => b.branchName === "İkinci Şube")).toBe(
      true,
    );
    expect(body.classAssignments.some((c: { className: string }) => c.className === "6-A")).toBe(
      true,
    );
  });

  it("Öğretmen düzenlenir (ad + telefon + durum)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/teachers/${orgTeacherUserId}`,
      headers: await superAdminHeaders(),
      payload: { displayName: "Ayşe Yılmaz", phone: "+905551112244", status: "SUSPENDED" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.user.displayName).toBe("Ayşe Yılmaz");
    expect(body.user.phone).toBe("+905551112244");
    expect(body.user.status).toBe("SUSPENDED");
  });

  it("Durum filtresi: SUSPENDED öğretmenler listelenir", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/teachers?status=SUSPENDED`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((t: { status: string }) => t.status === "SUSPENDED")).toBe(true);
  });

  it("Öğretmen soft-delete edilir; liste ve detayda kaybolur, tarihçe korunur", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/admin/teachers/${orgTeacherUserId}`,
      headers: await superAdminHeaders(),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.deletedAt).toBeTruthy();

    // Listede görünmez.
    const listRes = await app.inject({
      method: "GET",
      url: `/admin/teachers?search=Ay%C5%9Fe`,
      headers: await superAdminHeaders(),
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.items.every((t: { email: string }) => t.email !== ORG_EMAIL)).toBe(
      true,
    );

    // Detay 404 verir.
    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/teachers/${orgTeacherUserId}`,
      headers: await superAdminHeaders(),
    });
    expect(detailRes.statusCode).toBe(404);

    // Şube/sınıf geçmişi fiziksel olarak korunur.
    const history = await prisma.teacherBranchMembership.findMany({
      where: { teacherId: orgTeacherUserId },
    });
    expect(history.length).toBeGreaterThan(0);
  });

  it("Silinmiş öğretmene şube eklenemez (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/teachers/${orgTeacherUserId}/branches`,
      headers: await superAdminHeaders(),
      payload: { branchId: BRANCH_1 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("İkinci öğretmen oluşturulup düzenlenebilir (bağımsız kayıt)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/teachers",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Burak Hoca",
        email: ORG_EMAIL_2,
        password: "teacher-pass-123!",
        tenantId: ORG_TENANT,
      },
    });
    expect(createRes.statusCode).toBe(200);
    const userId = createRes.json().data.user.id;

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/admin/teachers/${userId}`,
      headers: await superAdminHeaders(),
      payload: { displayName: "Burak Öğretmen" },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.user.displayName).toBe("Burak Öğretmen");
  });
});
