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
const TENANT_A = "99999993-0000-7000-8000-0000000000a1";
const TENANT_B = "99999993-0000-7000-8000-0000000000b1";
const ADMIN_EMAIL = "analytics-admin@example.com";
const STUDENT_A_EMAIL = "analytics-student-a@example.com";
const STUDENT_B_EMAIL = "analytics-student-b@example.com";

describe.skipIf(!process.env.DATABASE_URL)("admin student analytics", () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.studentLearningStepProgress.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.studentLearningPath.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.studentProfile.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { tenantId: { in: [TENANT_A, TENANT_B] } },
          { userId: { in: [ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID] } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });

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
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, type: "ORGANIZATION", name: "Analitik Kurumu" },
        { id: TENANT_B, type: "ORGANIZATION", name: "Diğer Kurum" },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: TENANT_A, userId: ADMIN_ID, role: "ORG_ADMIN", status: "ACTIVE" },
        { tenantId: TENANT_A, userId: STUDENT_A_ID, role: "STUDENT", status: "ACTIVE" },
        { tenantId: TENANT_B, userId: STUDENT_B_ID, role: "STUDENT", status: "ACTIVE" },
      ],
    });
    await prisma.studentProfile.createMany({
      data: [
        { tenantId: TENANT_A, studentId: STUDENT_A_ID },
        { tenantId: TENANT_B, studentId: STUDENT_B_ID },
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
  });

  afterAll(async () => {
    await app?.close();
    await prisma.studentLearningStepProgress.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.studentLearningPath.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.studentProfile.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.membership.deleteMany({
      where: {
        OR: [
          { tenantId: { in: [TENANT_A, TENANT_B] } },
          { userId: { in: [ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID] } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
    await prisma.$disconnect();
  });

  function headers() {
    return { authorization: `Bearer ${accessToken}`, "x-tenant-id": TENANT_A };
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
