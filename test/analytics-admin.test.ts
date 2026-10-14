import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { normalizeAnalyticsRange } from "../src/modules/analytics/service.js";

const hasher = new ScryptPasswordHasher();
const PASSWORD = "analytics-test-123!";
const ADMIN_ID = "99999993-0000-7000-8000-000000000001";
const STUDENT_A_ID = "99999993-0000-7000-8000-000000000002";
const STUDENT_B_ID = "99999993-0000-7000-8000-000000000003";
const PLATFORM_ADMIN_ID = "99999993-0000-7000-8000-000000000004";
const TENANT_A = "99999993-0000-7000-8000-0000000000a1";
const TENANT_B = "99999993-0000-7000-8000-0000000000b1";
const TENANT_INDIVIDUAL = "99999993-0000-7000-8000-0000000000c1";
const ADMIN_EMAIL = "analytics-admin@example.com";
const STUDENT_A_EMAIL = "analytics-student-a@example.com";
const STUDENT_B_EMAIL = "analytics-student-b@example.com";
const PLATFORM_ADMIN_EMAIL = "analytics-platform-admin@example.com";

describe.skipIf(!process.env.DATABASE_URL)("admin student analytics", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let platformAccessToken: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.studentLearningStepProgress.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.studentLearningPath.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.studentProfile.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.enrollment.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
          { userId: { in: [ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID, PLATFORM_ADMIN_ID] } },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID, PLATFORM_ADMIN_ID] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });

    const passwordHash = await hasher.hash(PASSWORD);
    await prisma.user.createMany({
      data: [
        { id: ADMIN_ID, email: ADMIN_EMAIL, displayName: "Analitik Yönetici", passwordHash },
        {
          id: STUDENT_A_ID,
          email: STUDENT_A_EMAIL,
          displayName: "Kapsam Öğrencisi A",
          passwordHash,
        },
        {
          id: STUDENT_B_ID,
          email: STUDENT_B_EMAIL,
          displayName: "Diğer Kurum Öğrencisi",
          passwordHash,
        },
        {
          id: PLATFORM_ADMIN_ID,
          email: PLATFORM_ADMIN_EMAIL,
          displayName: "Platform Analitik Yöneticisi",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, type: "ORGANIZATION", name: "Analitik Kurumu" },
        { id: TENANT_B, type: "ORGANIZATION", name: "Diğer Kurum" },
        { id: TENANT_INDIVIDUAL, type: "INDIVIDUAL", name: "Bireysel Alan" },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: TENANT_A, userId: ADMIN_ID, role: "ORG_ADMIN", status: "ACTIVE" },
        { tenantId: TENANT_A, userId: STUDENT_A_ID, role: "STUDENT", status: "ACTIVE" },
        { tenantId: TENANT_B, userId: STUDENT_B_ID, role: "STUDENT", status: "ACTIVE" },
        { tenantId: TENANT_INDIVIDUAL, userId: STUDENT_A_ID, role: "STUDENT", status: "ACTIVE" },
      ],
    });
    await prisma.studentProfile.createMany({
      data: [
        { tenantId: TENANT_A, studentId: STUDENT_A_ID },
        { tenantId: TENANT_B, studentId: STUDENT_B_ID },
        { tenantId: TENANT_INDIVIDUAL, studentId: STUDENT_A_ID },
      ],
    });
    app = await buildApp(loadEnv());
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ADMIN_EMAIL, password: PASSWORD },
      headers: { "x-tenant-id": TENANT_A },
    });
    expect(login.statusCode).toBe(200);
    accessToken = login.json().data.tokens.accessToken;
    const platformLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: PLATFORM_ADMIN_EMAIL, password: PASSWORD },
    });
    expect(platformLogin.statusCode).toBe(200);
    platformAccessToken = platformLogin.json().data.tokens.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.studentLearningStepProgress.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.studentLearningPath.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.studentProfile.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.enrollment.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { tenantId: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
          { userId: { in: [ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID, PLATFORM_ADMIN_ID] } },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID, PLATFORM_ADMIN_ID] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B, TENANT_INDIVIDUAL] } },
    });
    await prisma.$disconnect();
  });

  function headers() {
    return { authorization: `Bearer ${accessToken}`, "x-tenant-id": TENANT_A };
  }

  function platformHeaders() {
    return { authorization: `Bearer ${platformAccessToken}` };
  }

  it("kimlik doğrulaması olmayan isteği reddeder", async () => {
    const response = await app.inject({ method: "GET", url: "/admin/analytics/overview" });
    expect(response.statusCode).toBe(401);
  });

  it("yalnızca aktif tenant kapsamındaki öğrencileri listeler", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/analytics/students",
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.items.map((item: { studentId: string }) => item.studentId)).toEqual([
      STUDENT_A_ID,
    ]);
    expect(JSON.stringify(body)).not.toContain(STUDENT_B_EMAIL);
  });

  it("özet ve tarih aralığı yalnızca salt-okunur analitik verisi döndürür", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/analytics/overview?from=2026-10-01&to=2026-10-14",
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.overview.registeredStudents).toBe(1);
    const invalid = await app.inject({
      method: "GET",
      url: "/admin/analytics/overview?from=2026-10-15&to=2026-10-01",
      headers: headers(),
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("başka tenant öğrencisinin ayrıntısını erişim dışı bırakır", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/admin/analytics/students/${STUDENT_B_ID}`,
      headers: headers(),
    });
    expect(response.statusCode).toBe(403);
  });

  it("SUPER_ADMIN platform genelinde öğrencileri tenant bağlantılarını tekilleştirerek görür", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/analytics/students?tenantType=INDIVIDUAL",
      headers: platformHeaders(),
    });
    expect(response.statusCode).toBe(200);
    const items = response.json().data.items as Array<{
      studentId: string;
      tenantConnections: Array<{ id: string }>;
    }>;
    expect(items.map((item) => item.studentId)).toContain(STUDENT_A_ID);
    expect(items.filter((item) => item.studentId === STUDENT_A_ID)).toHaveLength(1);
    expect(items.find((item) => item.studentId === STUDENT_A_ID)?.tenantConnections).toEqual([
      { id: TENANT_INDIVIDUAL, name: "Bireysel Alan", type: "INDIVIDUAL" },
    ]);
  });

  it("SUPER_ADMIN özeti benzersiz öğrenci sayar ve detayda tenant bağlantılarını gösterir", async () => {
    const overview = await app.inject({
      method: "GET",
      url: "/admin/analytics/overview",
      headers: platformHeaders(),
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().data.overview.registeredStudents).toBeGreaterThanOrEqual(2);

    const detail = await app.inject({
      method: "GET",
      url: `/admin/analytics/students/${STUDENT_A_ID}`,
      headers: platformHeaders(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.student.tenantConnections).toEqual(
      expect.arrayContaining([
        { id: TENANT_A, name: "Analitik Kurumu", type: "ORGANIZATION" },
        { id: TENANT_INDIVIDUAL, name: "Bireysel Alan", type: "INDIVIDUAL" },
      ]),
    );
  });
});

describe("admin analytics helpers", () => {
  it("tarih aralığını deterministik biçimde normalize eder", () => {
    const range = normalizeAnalyticsRange({
      from: new Date("2026-10-01T19:30:00Z"),
      to: new Date("2026-10-14T02:00:00Z"),
    });
    expect(range.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(range.toExclusive.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(() =>
      normalizeAnalyticsRange({ from: new Date("2025-01-01"), to: new Date("2027-01-01") }),
    ).toThrow("en fazla");
  });
});
