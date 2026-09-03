import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

/**
 * Öğrenci yönetimi (admin) testleri.
 *
 * Güvenlik: yalnızca SUPER_ADMIN erişir; normal tenant kullanıcıları 403,
 * kimliksiz istekler 401 alır. Öğrenci oluşturma tek transaction içinde yapılır;
 * User + Membership + StudentProfile + (isteğe bağlı) Enrollment birlikte
 * kurulur ve bir adım başarısız olursa tamamı geri alınır (yarım kayıt kalmaz).
 *
 * NOT: rls-security.test.ts afterAll'da TRUNCATE "Content", "Tenant" CASCADE
 * yapar; bu testler kendi verilerini beforeAll/afterAll ile kurar ve temizler.
 * Öğrenci silme soft-delete'tir; StudentProfile/Enrollment geçmişi korunur.
 */

const hasher = new ScryptPasswordHasher();
const PASSWORD = "test-pass-123!";

const PLATFORM_USER_ID = "99999997-0000-7000-8000-000000000001";
const NORMAL_USER_ID = "99999997-0000-7000-8000-000000000002";

// Tenant test verisi
const ORG_TENANT = "99999997-0000-7000-8000-0000000000b1";
const INDIVIDUAL_TENANT = "99999997-0000-7000-8000-0000000000b2";

// Kurum yapısı (test verisi; Class/AcademicYear CRUD modülü yoktur)
const BRANCH = "99999997-0000-7000-8000-0000000000d1";
const AY_1 = "99999997-0000-7000-8000-0000000000e1";
const AY_2 = "99999997-0000-7000-8000-0000000000e2";
const CLASS_1 = "99999997-0000-7000-8000-0000000000f1";
const CLASS_2 = "99999997-0000-7000-8000-0000000000f2";
const CLASS_3 = "99999997-0000-7000-8000-0000000000f3";

// Level kataloğu (global)
const LEVEL_1 = "99999997-0000-7000-8000-0000000000c1";
const LEVEL_2 = "99999997-0000-7000-8000-0000000000c2";

const ORG_EMAIL = "student-org@example.com";
const INDIVIDUAL_EMAIL = "student-individual@example.com";

describe("student admin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();

    // Tekrar çalıştırmalarda kalıcı olabilecek veriyi hedefli temizle.
    await prisma.enrollment.deleteMany({
      where: {
        OR: [
          { student: { email: { in: [ORG_EMAIL, INDIVIDUAL_EMAIL] } } },
          { tenantId: ORG_TENANT },
          { tenantId: INDIVIDUAL_TENANT },
        ],
      },
    });
    await prisma.studentProfile.deleteMany({
      where: { student: { email: { in: [ORG_EMAIL, INDIVIDUAL_EMAIL] } } },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { user: { email: { in: [ORG_EMAIL, INDIVIDUAL_EMAIL] } } },
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
          { email: { in: [ORG_EMAIL, INDIVIDUAL_EMAIL] } },
        ],
      },
    });
    await prisma.class.deleteMany({ where: { id: { in: [CLASS_1, CLASS_2, CLASS_3] } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: [AY_1, AY_2] } } });
    await prisma.branch.deleteMany({ where: { id: BRANCH } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [ORG_TENANT, INDIVIDUAL_TENANT] } },
    });
    await prisma.level.deleteMany({ where: { id: { in: [LEVEL_1, LEVEL_2] } } });

    const passwordHash = await hasher.hash(PASSWORD);

    await prisma.user.createMany({
      data: [
        {
          id: PLATFORM_USER_ID,
          email: "student-super-admin@example.com",
          displayName: "Öğrenci Super Admin",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
        {
          id: NORMAL_USER_ID,
          email: "student-tenant-user@example.com",
          displayName: "Öğrenci Tenant Kullanıcı",
          passwordHash,
        },
      ],
    });

    await prisma.tenant.createMany({
      data: [
        { id: ORG_TENANT, type: "ORGANIZATION", name: "Öğrenci Okulu" },
        { id: INDIVIDUAL_TENANT, type: "INDIVIDUAL", name: "Öğrenci Bireysel" },
      ],
    });

    // Kurum yapısı: şube + akademik yıllar + sınıflar (yalnızca test verisi).
    await prisma.branch.create({
      data: { id: BRANCH, tenantId: ORG_TENANT, name: "Merkez Şube", code: "MZ" },
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
          branchId: BRANCH,
          academicYearId: AY_1,
          name: "5-A",
          gradeLevel: 5,
        },
        {
          id: CLASS_2,
          tenantId: ORG_TENANT,
          branchId: BRANCH,
          academicYearId: AY_2,
          name: "6-A",
          gradeLevel: 6,
        },
        {
          id: CLASS_3,
          tenantId: ORG_TENANT,
          branchId: BRANCH,
          academicYearId: AY_2,
          name: "7-A",
          gradeLevel: 7,
        },
      ],
    });

    await prisma.level.createMany({
      data: [
        {
          id: LEVEL_1,
          code: "A1",
          name: "Başlangıç",
          minScore: 0,
          maxScore: 20,
          difficultyMin: 0,
          difficultyMax: 2,
          displayOrder: 1,
        },
        {
          id: LEVEL_2,
          code: "A2",
          name: "Temel",
          minScore: 20,
          maxScore: 40,
          difficultyMin: 2,
          difficultyMax: 4,
          displayOrder: 2,
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
    await prisma.enrollment.deleteMany({
      where: {
        OR: [
          { student: { email: { in: [ORG_EMAIL, INDIVIDUAL_EMAIL] } } },
          { tenantId: ORG_TENANT },
          { tenantId: INDIVIDUAL_TENANT },
        ],
      },
    });
    await prisma.studentProfile.deleteMany({
      where: { student: { email: { in: [ORG_EMAIL, INDIVIDUAL_EMAIL] } } },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { user: { email: { in: [ORG_EMAIL, INDIVIDUAL_EMAIL] } } },
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
          { email: { in: [ORG_EMAIL, INDIVIDUAL_EMAIL] } },
        ],
      },
    });
    await prisma.class.deleteMany({ where: { id: { in: [CLASS_1, CLASS_2, CLASS_3] } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: [AY_1, AY_2] } } });
    await prisma.branch.deleteMany({ where: { id: BRANCH } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [ORG_TENANT, INDIVIDUAL_TENANT] } },
    });
    await prisma.level.deleteMany({ where: { id: { in: [LEVEL_1, LEVEL_2] } } });
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
    authorization: `Bearer ${await login("student-super-admin@example.com")}`,
  });
  const tenantUserHeaders = async () => ({
    authorization: `Bearer ${await login("student-tenant-user@example.com")}`,
  });

  // ---------- Güvenlik ----------

  it("Kimliksiz istek: 401 döner", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/students" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("Normal tenant kullanıcısı: 403 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/students",
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("Normal tenant kullanıcısı: oluşturma uçlarına da erişemez (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await tenantUserHeaders(),
      payload: {
        displayName: "X",
        email: "x@example.com",
        password: "12345678",
        tenantId: ORG_TENANT,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("Lookup uçları da platform yetkisi ister (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/student-options/levels",
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------- Öğrenci listesi ----------

  it("Super Admin: öğrencileri listeler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/students",
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
      url: "/admin/students?status=GECE",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // ---------- Öğrenci oluşturma (ORGANIZATION) ----------

  let orgStudentId = "";
  let orgUserId = "";

  it("ORGANIZATION öğrencisi oluşturulur: User + STUDENT membership + StudentProfile + sınıf", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Ali Örnek",
        email: ORG_EMAIL,
        phone: "+905551112233",
        birthYear: 2012,
        password: "student-pass-123!",
        tenantId: ORG_TENANT,
        currentLevelId: LEVEL_1,
        targetLevelId: LEVEL_2,
        classId: CLASS_1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    orgStudentId = body.data.id;
    orgUserId = body.data.user.id;
    expect(body.data.user.displayName).toBe("Ali Örnek");
    expect(body.data.user.email).toBe(ORG_EMAIL);
    expect(body.data.user.phone).toBe("+905551112233");
    expect(body.data.user.birthYear).toBe(2012);
    expect(body.data.tenant.id).toBe(ORG_TENANT);
    expect(body.data.profile.currentLevel?.code).toBe("A1");
    expect(body.data.profile.targetLevel?.code).toBe("A2");

    // STUDENT membership oluştu.
    const studentMembership = body.data.memberships.find(
      (m: { role: string }) => m.role === "STUDENT",
    );
    expect(studentMembership).toBeTruthy();
    expect(studentMembership.status).toBe("ACTIVE");

    // Sınıf kaydı oluştu.
    expect(body.data.enrollments.length).toBe(1);
    expect(body.data.enrollments[0].status).toBe("ACTIVE");
    expect(body.data.enrollments[0].className).toBe("5-A");
    expect(body.data.enrollments[0].academicYearName).toBe("2025-2026");

    // DB'de StudentProfile gerçekten var.
    const dbProfile = await prisma.studentProfile.findFirst({
      where: { id: orgStudentId },
      include: { student: true },
    });
    expect(dbProfile).toBeTruthy();
    expect(dbProfile?.student.email).toBe(ORG_EMAIL);
  });

  it("Oluşturulan öğrenci listede görünür ve sınıfı gösterilir", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/students?search=${encodeURIComponent(ORG_EMAIL)}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const found = body.data.items.find((s: { id: string }) => s.id === orgStudentId);
    expect(found).toBeTruthy();
    expect(found.className).toBe("5-A");
    expect(found.tenantName).toBe("Öğrenci Okulu");
    expect(found.status).toBe("ACTIVE");
  });

  it("Kurum filtresi: yalnızca o kurumun öğrencileri döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/students?tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.every((s: { tenantId: string }) => s.tenantId === ORG_TENANT)).toBe(
      true,
    );
  });

  it("Duplike e-posta: 409 döner (transaction tamamen geri alınır)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Ali Kopya",
        email: ORG_EMAIL,
        password: "student-pass-123!",
        tenantId: ORG_TENANT,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");

    // Yarı kayıt kalmasın: yalnızca bir profil olmalı.
    const profiles = await prisma.studentProfile.count({
      where: { student: { email: ORG_EMAIL } },
    });
    expect(profiles).toBe(1);
  });

  it("Validation: kısa parola 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Kısa",
        email: "kisa-sifre@example.com",
        password: "123",
        tenantId: ORG_TENANT,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Olmayan kurum: 404 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Yok",
        email: "yok-kurum@example.com",
        password: "yok-kurum-pass-123!",
        tenantId: "ffffffff-0000-7000-8000-000000000099",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("Başka kurumun sınıfı seçilemez: 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Yanlış Sınıf",
        email: "yanlis-sinif@example.com",
        password: "yanlis-sinif-pass-123!",
        tenantId: INDIVIDUAL_TENANT,
        classId: CLASS_1,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // ---------- INDIVIDUAL öğrenci ----------

  let individualStudentId = "";

  it("INDIVIDUAL öğrencisi oluşturulur; sınıf ve akademik yıl zorunlu değildir", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Ayşe Bireysel",
        email: INDIVIDUAL_EMAIL,
        birthYear: 2013,
        password: "student-pass-123!",
        tenantId: INDIVIDUAL_TENANT,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    individualStudentId = body.data.id;
    expect(body.data.tenant.type).toBe("INDIVIDUAL");
    expect(body.data.enrollments).toEqual([]);
    const studentMembership = body.data.memberships.find(
      (m: { role: string }) => m.role === "STUDENT",
    );
    expect(studentMembership?.tenantType).toBe("INDIVIDUAL");
    expect(studentMembership?.status).toBe("ACTIVE");
  });

  it("INDIVIDUAL öğrenci listede sınıfsız görünür", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/students?search=${encodeURIComponent(INDIVIDUAL_EMAIL)}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const found = res.json().data.items.find((s: { id: string }) => s.id === individualStudentId);
    expect(found.className).toBeNull();
  });

  // ---------- Transaction rollback ----------

  it("Geçersiz seviye ile oluşturma: 400; yarım öğrenci kaydı kalmaz (rollback)", async () => {
    const email = "rollback-student@example.com";
    const res = await app.inject({
      method: "POST",
      url: "/admin/students",
      headers: await superAdminHeaders(),
      payload: {
        displayName: "Rollback Öğrenci",
        email,
        password: "rollback-pass-123!",
        tenantId: ORG_TENANT,
        currentLevelId: "ffffffff-0000-7000-8000-000000000099",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");

    // User / membership / profile hiçbiri oluşmamış olmalı.
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
    const profileCount = await prisma.studentProfile.count({
      where: { student: { email } },
    });
    expect(profileCount).toBe(0);
  });

  // ---------- Detay / düzenleme ----------

  it("Super Admin: öğrenci detayını görüntüler (bölümler tamam)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/students/${orgStudentId}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.user.displayName).toBe("Ali Örnek");
    expect(d.user.email).toBe(ORG_EMAIL);
    expect(d.tenant.name).toBe("Öğrenci Okulu");
    expect(d.profile.currentLevel.name).toBe("Başlangıç");
    expect(d.profile.targetLevel.name).toBe("Temel");
    expect(Array.isArray(d.memberships)).toBe(true);
    expect(Array.isArray(d.enrollments)).toBe(true);
  });

  it("Olmayan öğrenci detayı: 404 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/students/ffffffff-0000-7000-8000-000000000099",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("StudentProfile güncellenir (seviye değişimi)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/students/${orgStudentId}`,
      headers: await superAdminHeaders(),
      payload: {
        phone: "+905550000000",
        birthYear: 2011,
        currentLevelId: LEVEL_2,
        targetLevelId: null,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.phone).toBe("+905550000000");
    expect(body.data.user.birthYear).toBe(2011);
    expect(body.data.profile.currentLevel?.code).toBe("A2");
    expect(body.data.profile.targetLevel).toBeNull();
  });

  it("Öğrenci hesap durumu değiştirilir", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/students/${orgStudentId}`,
      headers: await superAdminHeaders(),
      payload: { status: "SUSPENDED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.status).toBe("SUSPENDED");

    const back = await app.inject({
      method: "PATCH",
      url: `/admin/students/${orgStudentId}`,
      headers: await superAdminHeaders(),
      payload: { status: "ACTIVE" },
    });
    expect(back.json().data.user.status).toBe("ACTIVE");
  });

  it("Düzenlemede başkasının e-postasına geçme: 409 döner", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/students/${orgStudentId}`,
      headers: await superAdminHeaders(),
      payload: { email: "student-tenant-user@example.com" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  // ---------- Enrollment ----------

  it("Yeni sınıf kaydı oluşturulur (farklı akademik yıl)", async () => {
    // Mevcut ACTIVE kayıt 2025-2026'da (CLASS_1). 2026-2027'ye (CLASS_2) kayıt açılabilir.
    const res = await app.inject({
      method: "POST",
      url: `/admin/students/${orgStudentId}/enrollments`,
      headers: await superAdminHeaders(),
      payload: { classId: CLASS_2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.className).toBe("6-A");
    expect(body.data.academicYearName).toBe("2026-2027");
    expect(body.data.status).toBe("ACTIVE");
  });

  it("Aynı akademik yılda ikinci ACTIVE kayıt: 409 döner", async () => {
    // CLASS_1 (2025-2026) için zaten ACTIVE kayıt var.
    const res = await app.inject({
      method: "POST",
      url: `/admin/students/${orgStudentId}/enrollments`,
      headers: await superAdminHeaders(),
      payload: { classId: CLASS_1 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("Başka kurumun sınıfına kayıt: 400 döner", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/students/${individualStudentId}/enrollments`,
      headers: await superAdminHeaders(),
      payload: { classId: CLASS_1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Enrollment durumu değiştirilebilir: ACTIVE → LEFT", async () => {
    // CLASS_2 (2026-2027) kaydını LEFT yap.
    const list = await app.inject({
      method: "GET",
      url: `/admin/students/${orgStudentId}/enrollments`,
      headers: await superAdminHeaders(),
    });
    expect(list.statusCode).toBe(200);
    const enrollments = list.json().data;
    const class2Enrollment = enrollments.find((e: { classId: string }) => e.classId === CLASS_2);
    expect(class2Enrollment).toBeTruthy();

    const res = await app.inject({
      method: "PATCH",
      url: `/admin/enrollments/${class2Enrollment.id}`,
      headers: await superAdminHeaders(),
      payload: { status: "LEFT" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("LEFT");
    expect(res.json().data.leftAt).toBeTruthy();
  });

  it("LEFT sonrası aynı akademik yıl için yeni ACTIVE kayıt açılabilir", async () => {
    // CLASS_2 (2026-2027) LEFT oldu; aynı yılda başka sınıf (7-A) için yeni
    // ACTIVE kayıt açılabilir (DB partial unique yalnızca ACTIVE'leri kapsar).
    const res = await app.inject({
      method: "POST",
      url: `/admin/students/${orgStudentId}/enrollments`,
      headers: await superAdminHeaders(),
      payload: { classId: CLASS_3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ACTIVE");
    expect(res.json().data.className).toBe("7-A");
  });

  it("COMPLETED durumuna geçilebilir", async () => {
    // Kalan ACTIVE kayıt: CLASS_1 (2025-2026).
    const list = await app.inject({
      method: "GET",
      url: `/admin/students/${orgStudentId}/enrollments`,
      headers: await superAdminHeaders(),
    });
    const enrollments = list.json().data;
    const class1Enrollment = enrollments.find((e: { classId: string }) => e.classId === CLASS_1);
    expect(class1Enrollment.status).toBe("ACTIVE");

    const res = await app.inject({
      method: "PATCH",
      url: `/admin/enrollments/${class1Enrollment.id}`,
      headers: await superAdminHeaders(),
      payload: { status: "COMPLETED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("COMPLETED");
  });

  // ---------- Lookup ----------

  it("Seviye kataloğu listelenir (Türkçe isimler)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/student-options/levels",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const levels = res.json().data;
    expect(levels.some((l: { name: string }) => l.name === "Başlangıç")).toBe(true);
    expect(levels.some((l: { name: string }) => l.name === "Temel")).toBe(true);
  });

  it("Tenant akademik yılları listelenir", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/student-options/academic-years?tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const years = res.json().data;
    expect(years.length).toBe(2);
    expect(years.some((y: { name: string }) => y.name === "2025-2026")).toBe(true);
  });

  it("Tenant sınıfları listelenir (akademik yıl filtresi dahil)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/student-options/classes?tenantId=${ORG_TENANT}&academicYearId=${AY_1}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const classes = res.json().data;
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe("5-A");
  });

  // ---------- Soft delete ----------

  it("Öğrenci soft-delete edilir; listede görünmez; geçmiş korunur", async () => {
    // Silme öncesi enrollment kayıtları DB'de.
    const before = await prisma.enrollment.count({ where: { studentId: orgUserId } });
    expect(before).toBeGreaterThanOrEqual(3);

    const res = await app.inject({
      method: "DELETE",
      url: `/admin/students/${orgStudentId}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deletedAt).toBeTruthy();

    // Listede görünmez.
    const list = await app.inject({
      method: "GET",
      url: "/admin/students",
      headers: await superAdminHeaders(),
    });
    const ids = list.json().data.items.map((s: { id: string }) => s.id);
    expect(ids).not.toContain(orgStudentId);

    // Detaya erişilemez (404).
    const detail = await app.inject({
      method: "GET",
      url: `/admin/students/${orgStudentId}`,
      headers: await superAdminHeaders(),
    });
    expect(detail.statusCode).toBe(404);

    // Tarihçe fiziksel olarak silinmedi: enrollment + studentProfile kayıtları duruyor.
    const after = await prisma.enrollment.count({ where: { studentId: orgUserId } });
    expect(after).toBe(before);
    const profile = await prisma.studentProfile.findUnique({ where: { id: orgStudentId } });
    expect(profile).toBeTruthy();
    const user = await prisma.user.findUnique({ where: { id: orgUserId } });
    expect(user?.deletedAt).toBeTruthy();
  });

  it("Soft-delete sonrası düzenleme: 404 döner", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/students/${orgStudentId}`,
      headers: await superAdminHeaders(),
      payload: { displayName: "Yeni İsim" },
    });
    expect(res.statusCode).toBe(404);
  });
});
