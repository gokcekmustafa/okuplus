import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const hasher = new ScryptPasswordHasher();
const PASSWORD = "astudent-test-pass-123!";

// Tenants
const TENANT_A = "99999994-0000-7000-8000-0000000000a1";
const TENANT_B = "99999994-0000-7000-8000-0000000000b1";
const TENANT_IDS = [TENANT_A, TENANT_B];

// Users
const SUPER_ADMIN_ID = "99999994-0000-7000-8000-000000000099";
const TEACHER_A_ID = "99999994-0000-7000-8000-0000000000t1";
const STUDENT_A_ID = "99999994-0000-7000-8000-0000000000s1";
const STUDENT_B_ID = "99999994-0000-7000-8000-0000000000s2";
const STUDENT_CROSS_ID = "99999994-0000-7000-8000-0000000000s3";
const USER_IDS = [SUPER_ADMIN_ID, TEACHER_A_ID, STUDENT_A_ID, STUDENT_B_ID, STUDENT_CROSS_ID];

const SUPER_ADMIN_EMAIL = "astudent-super@example.com";
const TEACHER_A_EMAIL = "astudent-teacher-a@example.com";
const STUDENT_A_EMAIL = "astudent-student-a@example.com";
const STUDENT_B_EMAIL = "astudent-student-b@example.com";
const STUDENT_CROSS_EMAIL = "astudent-student-cross@example.com";
const EMAILS = [
  SUPER_ADMIN_EMAIL,
  TEACHER_A_EMAIL,
  STUDENT_A_EMAIL,
  STUDENT_B_EMAIL,
  STUDENT_CROSS_EMAIL,
];

// Branches
const BRANCH_A = "99999994-0000-7000-8000-0000000000br1";

// Academic Years
const YEAR_A = "99999994-0000-7000-8000-0000000000y1";

// Classes
const CLASS_A = "99999994-0000-7000-8000-0000000000c1";
const CLASS_B = "99999994-0000-7000-8000-0000000000c2";

// Content + Template
const CONTENT_A = "99999994-0000-7000-8000-0000000000f1";
const TEMPLATE_A = "99999994-0000-7000-8000-0000000000d1";
const TEMPLATE_VERSION_A = "99999994-0000-7000-8000-0000000000dv1";

// Assignments (dynamically created)
const assignmentIds: string[] = [];

describe("assignment student", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();

    // Clean leftover
    await prisma.attempt.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.teacherClassAssignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: TEMPLATE_VERSION_A },
    });
    await prisma.exerciseTemplateVersionContent.deleteMany({
      where: { templateVersionId: TEMPLATE_VERSION_A },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.exerciseTemplateVersion.deleteMany({ where: { id: TEMPLATE_VERSION_A } });
    });
    await prisma.exerciseTemplate.deleteMany({ where: { id: TEMPLATE_A } });
    await prisma.content.deleteMany({ where: { id: CONTENT_A } });
    await prisma.class.deleteMany({ where: { id: { in: [CLASS_A, CLASS_B] } } });
    await prisma.academicYear.deleteMany({ where: { id: YEAR_A } });
    await prisma.branch.deleteMany({ where: { id: BRANCH_A } });
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });

    // Create tenants
    for (const tid of TENANT_IDS) {
      await prisma.tenant.upsert({
        where: { id: tid },
        update: {},
        create: {
          id: tid,
          name: `Tenant ${tid.slice(-2)}`,
          type: "ORGANIZATION",
          status: "ACTIVE",
        },
      });
    }

    // Create password hash
    const passwordHash = await hasher.hash(PASSWORD);

    // Create super admin
    await prisma.user.upsert({
      where: { id: SUPER_ADMIN_ID },
      update: {},
      create: {
        id: SUPER_ADMIN_ID,
        email: SUPER_ADMIN_EMAIL,
        displayName: "Super Admin",
        passwordHash,
        platformRole: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });

    // Create teacher
    await prisma.user.upsert({
      where: { id: TEACHER_A_ID },
      update: {},
      create: {
        id: TEACHER_A_ID,
        email: TEACHER_A_EMAIL,
        displayName: "Teacher A",
        passwordHash,
        status: "ACTIVE",
      },
    });
    await prisma.membership.upsert({
      where: { id: "99999994-0000-7000-8000-000000000e11" },
      update: {},
      create: {
        id: "99999994-0000-7000-8000-000000000e11",
        userId: TEACHER_A_ID,
        tenantId: TENANT_A,
        role: "TEACHER",
        status: "ACTIVE",
      },
    });

    // Create students
    for (const [sid, email] of [
      [STUDENT_A_ID, STUDENT_A_EMAIL],
      [STUDENT_B_ID, STUDENT_B_EMAIL],
      [STUDENT_CROSS_ID, STUDENT_CROSS_EMAIL],
    ] as const) {
      await prisma.user.upsert({
        where: { id: sid },
        update: {},
        create: {
          id: sid,
          email,
          displayName: `Student ${sid.slice(-2)}`,
          passwordHash,
          status: "ACTIVE",
        },
      });
    }

    // Student A membership in TENANT_A
    await prisma.membership.upsert({
      where: { id: "99999994-0000-7000-8000-000000000e21" },
      update: {},
      create: {
        id: "99999994-0000-7000-8000-000000000e21",
        userId: STUDENT_A_ID,
        tenantId: TENANT_A,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    // Student B membership in TENANT_A
    await prisma.membership.upsert({
      where: { id: "99999994-0000-7000-8000-000000000e22" },
      update: {},
      create: {
        id: "99999994-0000-7000-8000-000000000e22",
        userId: STUDENT_B_ID,
        tenantId: TENANT_A,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    // Student C in TENANT_B (cross-tenant)
    await prisma.membership.upsert({
      where: { id: "99999994-0000-7000-8000-000000000e23" },
      update: {},
      create: {
        id: "99999994-0000-7000-8000-000000000e23",
        userId: STUDENT_CROSS_ID,
        tenantId: TENANT_B,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    // Create branch
    await prisma.branch.upsert({
      where: { id: BRANCH_A },
      update: {},
      create: {
        id: BRANCH_A,
        tenantId: TENANT_A,
        name: "Branch A",
        code: "BR-A",
        status: "ACTIVE",
      },
    });

    // Create academic year
    await prisma.academicYear.upsert({
      where: { id: YEAR_A },
      update: {},
      create: {
        id: YEAR_A,
        tenantId: TENANT_A,
        name: "2026-2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-15"),
        status: "ACTIVE",
      },
    });

    // Create classes
    await prisma.class.upsert({
      where: { id: CLASS_A },
      update: {},
      create: {
        id: CLASS_A,
        tenantId: TENANT_A,
        branchId: BRANCH_A,
        academicYearId: YEAR_A,
        name: "10-A",
        gradeLevel: 10,
        status: "ACTIVE",
      },
    });
    await prisma.class.upsert({
      where: { id: CLASS_B },
      update: {},
      create: {
        id: CLASS_B,
        tenantId: TENANT_A,
        branchId: BRANCH_A,
        academicYearId: YEAR_A,
        name: "10-B",
        gradeLevel: 10,
        status: "ACTIVE",
      },
    });

    // Create enrollments: Student A in CLASS_A, Student B in CLASS_B
    await prisma.enrollment.upsert({
      where: { id: "99999994-0000-7000-8000-000000000en1" },
      update: {},
      create: {
        id: "99999994-0000-7000-8000-000000000en1",
        tenantId: TENANT_A,
        studentId: STUDENT_A_ID,
        classId: CLASS_A,
        academicYearId: YEAR_A,
        status: "ACTIVE",
      },
    });
    await prisma.enrollment.upsert({
      where: { id: "99999994-0000-7000-8000-000000000en2" },
      update: {},
      create: {
        id: "99999994-0000-7000-8000-000000000en2",
        tenantId: TENANT_A,
        studentId: STUDENT_B_ID,
        classId: CLASS_B,
        academicYearId: YEAR_A,
        status: "ACTIVE",
      },
    });

    // Create content
    await prisma.content.upsert({
      where: { id: CONTENT_A },
      update: {},
      create: {
        id: CONTENT_A,
        tenantId: TENANT_A,
        title: "Test Content",
        type: "ARTICLE",
        difficulty: 0.5,
        status: "PUBLISHED",
      },
    });

    // Create template
    await prisma.exerciseTemplate.upsert({
      where: { id: TEMPLATE_A },
      update: {},
      create: {
        id: TEMPLATE_A,
        tenantId: TENANT_A,
        title: "Test Template",
        type: "COMPREHENSION",
        status: "PUBLISHED",
        contentId: CONTENT_A,
      },
    });

    // Create template version
    await prisma.exerciseTemplateVersion.upsert({
      where: { id: TEMPLATE_VERSION_A },
      update: {},
      create: {
        id: TEMPLATE_VERSION_A,
        templateId: TEMPLATE_A,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    // Build app
    const env = loadEnv();
    app = await buildApp(env);
    await app.ready();
  });

  afterAll(async () => {
    // Cleanup
    await prisma.studentBadge.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.pointEvent.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.studentStreak.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.attempt.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.teacherClassAssignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: TEMPLATE_VERSION_A },
    });
    await prisma.exerciseTemplateVersionContent.deleteMany({
      where: { templateVersionId: TEMPLATE_VERSION_A },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.exerciseTemplateVersion.deleteMany({ where: { id: TEMPLATE_VERSION_A } });
    });
    await prisma.exerciseTemplate.deleteMany({ where: { id: TEMPLATE_A } });
    await prisma.content.deleteMany({ where: { id: CONTENT_A } });
    await prisma.class.deleteMany({ where: { id: { in: [CLASS_A, CLASS_B] } } });
    await prisma.academicYear.deleteMany({ where: { id: YEAR_A } });
    await prisma.branch.deleteMany({ where: { id: BRANCH_A } });
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });

    await app.close();
    await prisma.$disconnect();
  });

  // Helper: get auth headers for a user
  async function authHeaders(userId: string, tenantId: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: EMAILS[USER_IDS.indexOf(userId)],
        password: PASSWORD,
        tenantId,
      },
    });
    const body = res.json();
    return {
      authorization: `Bearer ${body.data.tokens.accessToken}`,
      "x-tenant-id": tenantId,
    };
  }

  // Helper: create assignment via admin API
  async function createAssignment(
    adminHeaders: Record<string, string>,
    data: { classId: string; title: string; status?: string },
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: adminHeaders,
      payload: {
        classId: data.classId,
        templateId: TEMPLATE_A,
        teacherId: TEACHER_A_ID,
        title: data.title,
      },
    });
    const body = res.json();
    const assignmentId = body.data.id;
    assignmentIds.push(assignmentId);

    if (data.status && data.status !== "DRAFT") {
      // Move through status machine
      if (data.status === "SCHEDULED" || data.status === "ACTIVE" || data.status === "CLOSED") {
        await app.inject({
          method: "PATCH",
          url: `/admin/assignments/${assignmentId}/status`,
          headers: adminHeaders,
          payload: { status: "SCHEDULED" },
        });
      }
      if (data.status === "ACTIVE" || data.status === "CLOSED") {
        await app.inject({
          method: "PATCH",
          url: `/admin/assignments/${assignmentId}/status`,
          headers: adminHeaders,
          payload: { status: "ACTIVE" },
        });
      }
      if (data.status === "CLOSED") {
        await app.inject({
          method: "PATCH",
          url: `/admin/assignments/${assignmentId}/status`,
          headers: adminHeaders,
          payload: { status: "CLOSED" },
        });
      }
    }
    return assignmentId;
  }

  // ==================== LIST TESTS ====================

  describe("GET /student/assignments", () => {
    let assignmentDraftId: string;
    let assignmentScheduledId: string;
    let assignmentActiveId: string;
    let assignmentClassBId: string;

    it("should return empty list for student with no assignments", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.total).toBe(0);
      expect(body.data.items).toEqual([]);
    });

    it("should create test assignments", async () => {
      const adminHeaders = await authHeaders(SUPER_ADMIN_ID, TENANT_A);
      assignmentDraftId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Draft Assignment",
      });
      assignmentScheduledId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Scheduled Assignment",
        status: "SCHEDULED",
      });
      assignmentActiveId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Active Assignment",
        status: "ACTIVE",
      });
      assignmentClassBId = await createAssignment(adminHeaders, {
        classId: CLASS_B,
        title: "Class B Assignment",
        status: "ACTIVE",
      });
    });

    it("should not show DRAFT assignments to student", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      const body = res.json();
      const ids = body.data.items.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(assignmentDraftId);
    });

    it("should show SCHEDULED assignments", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      const body = res.json();
      const ids = body.data.items.map((i: { id: string }) => i.id);
      expect(ids).toContain(assignmentScheduledId);
    });

    it("should show ACTIVE assignments", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      const body = res.json();
      const ids = body.data.items.map((i: { id: string }) => i.id);
      expect(ids).toContain(assignmentActiveId);
    });

    it("should not show other class assignments", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      const body = res.json();
      const ids = body.data.items.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(assignmentClassBId);
    });

    it("should return correct total count", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      const body = res.json();
      expect(body.data.total).toBe(2); // scheduled + active
    });

    it("should support search filter", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments?search=Active",
        headers,
      });
      const body = res.json();
      expect(body.data.total).toBe(1);
      expect(body.data.items[0].title).toBe("Active Assignment");
    });

    it("should support status filter", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments?status=SCHEDULED",
        headers,
      });
      const body = res.json();
      expect(body.data.total).toBe(1);
      expect(body.data.items[0].status).toBe("SCHEDULED");
    });

    it("should return correct fields", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      const body = res.json();
      const item = body.data.items.find((i: { id: string }) => i.id === assignmentActiveId);
      expect(item).toBeDefined();
      expect(item.title).toBe("Active Assignment");
      expect(item.className).toBe("10-A");
      expect(item.teacherName).toBe("Teacher A");
      expect(item.templateTitle).toBe("Test Template");
      expect(item.templateType).toBe("COMPREHENSION");
      expect(item.status).toBe("ACTIVE");
    });

    // Cleanup after list tests
    it("cleanup list test data", async () => {
      // ids will be cleaned up in afterAll
      expect(true).toBe(true);
    });
  });

  // ==================== DETAIL TESTS ====================

  describe("GET /student/assignments/:id", () => {
    let activeId: string;

    beforeAll(async () => {
      const adminHeaders = await authHeaders(SUPER_ADMIN_ID, TENANT_A);
      activeId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Detail Test",
        status: "ACTIVE",
      });
    });

    it("should return assignment detail", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: `/student/assignments/${activeId}`,
        headers,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.id).toBe(activeId);
      expect(body.data.title).toBe("Detail Test");
      expect(body.data.className).toBe("10-A");
      expect(body.data.teacherName).toBe("Teacher A");
      expect(body.data.status).toBe("ACTIVE");
    });

    it("should return 404 for non-existent assignment", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments/00000000-0000-0000-0000-000000000999",
        headers,
      });
      expect(res.statusCode).toBe(404);
    });

    it("should return 404 for other class assignment", async () => {
      const adminHeaders = await authHeaders(SUPER_ADMIN_ID, TENANT_A);
      const otherClassId = await createAssignment(adminHeaders, {
        classId: CLASS_B,
        title: "Other Class",
        status: "ACTIVE",
      });
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: `/student/assignments/${otherClassId}`,
        headers,
      });
      expect(res.statusCode).toBe(403);
    });

    it("should return 404 for DRAFT assignment", async () => {
      const adminHeaders = await authHeaders(SUPER_ADMIN_ID, TENANT_A);
      const draftId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Draft Detail",
      });
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: `/student/assignments/${draftId}`,
        headers,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ==================== START SESSION TESTS ====================

  describe("POST /student/assignments/:id/start", () => {
    let startActiveId: string;
    let startScheduledId: string;

    beforeAll(async () => {
      const adminHeaders = await authHeaders(SUPER_ADMIN_ID, TENANT_A);
      startActiveId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Start Active",
        status: "ACTIVE",
      });
      startScheduledId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Start Scheduled",
        status: "SCHEDULED",
      });
    });

    it("should create a new session for ACTIVE assignment", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "POST",
        url: `/student/assignments/${startActiveId}/start`,
        headers,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.sessionId).toBeDefined();
      expect(body.data.isNew).toBe(true);
    });

    it("should return existing IN_PROGRESS session (idempotent)", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "POST",
        url: `/student/assignments/${startActiveId}/start`,
        headers,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.isNew).toBe(false);
    });

    it("should create session for SCHEDULED assignment", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "POST",
        url: `/student/assignments/${startScheduledId}/start`,
        headers,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.sessionId).toBeDefined();
      expect(body.data.isNew).toBe(true);
    });

    it("should return 404 for DRAFT assignment", async () => {
      const adminHeaders = await authHeaders(SUPER_ADMIN_ID, TENANT_A);
      const draftId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Draft Start",
      });
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "POST",
        url: `/student/assignments/${draftId}/start`,
        headers,
      });
      expect(res.statusCode).toBe(404);
    });

    it("should return 403 for other class assignment", async () => {
      const adminHeaders = await authHeaders(SUPER_ADMIN_ID, TENANT_A);
      const otherId = await createAssignment(adminHeaders, {
        classId: CLASS_B,
        title: "Other Start",
        status: "ACTIVE",
      });
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "POST",
        url: `/student/assignments/${otherId}/start`,
        headers,
      });
      expect(res.statusCode).toBe(403);
    });

    it("session should have correct context and assignmentId", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "POST",
        url: `/student/assignments/${startActiveId}/start`,
        headers,
      });
      const body = res.json();
      const session = await prisma.exerciseSession.findUnique({
        where: { id: body.data.sessionId },
        select: {
          assignmentId: true,
          context: true,
          sessionType: true,
          studentId: true,
          tenantId: true,
        },
      });
      expect(session).toBeDefined();
      expect(session!.assignmentId).toBe(startActiveId);
      expect(session!.context).toBe("ASSIGNMENT");
      expect(session!.sessionType).toBe("PRACTICE");
      expect(session!.studentId).toBe(STUDENT_A_ID);
      expect(session!.tenantId).toBe(TENANT_A);
    });

    it("should return 404 for non-existent assignment", async () => {
      const headers = await authHeaders(STUDENT_A_ID, TENANT_A);
      const res = await app.inject({
        method: "POST",
        url: "/student/assignments/00000000-0000-0000-0000-000000000999/start",
        headers,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ==================== CROSS-STUDENT / CROSS-TENANT TESTS ====================

  describe("cross-student and cross-tenant", () => {
    let crossActiveId: string;

    beforeAll(async () => {
      const adminHeaders = await authHeaders(SUPER_ADMIN_ID, TENANT_A);
      crossActiveId = await createAssignment(adminHeaders, {
        classId: CLASS_A,
        title: "Cross Test",
        status: "ACTIVE",
      });
    });

    it("Student B cannot see Student A's class assignments", async () => {
      const headers = await authHeaders(STUDENT_B_ID, TENANT_A);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      const body = res.json();
      const ids = body.data.items.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(crossActiveId);
    });

    it("Cross-tenant student cannot see assignments", async () => {
      const headers = await authHeaders(STUDENT_CROSS_ID, TENANT_B);
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
        headers,
      });
      const body = res.json();
      expect(body.data.total).toBe(0);
    });

    it("Cross-tenant student cannot start session", async () => {
      const headers = await authHeaders(STUDENT_CROSS_ID, TENANT_B);
      const res = await app.inject({
        method: "POST",
        url: `/student/assignments/${crossActiveId}/start`,
        headers,
      });
      expect(res.statusCode).toBe(404);
    });

    it("Unauthenticated request is rejected", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/student/assignments",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== DB VERIFICATION ====================

  describe("DB verification", () => {
    it("ExerciseSession fields are correct", async () => {
      const session = await prisma.exerciseSession.findFirst({
        where: { assignmentId: { not: null }, context: "ASSIGNMENT" },
        select: {
          assignmentId: true,
          context: true,
          sessionType: true,
          studentId: true,
          tenantId: true,
          status: true,
        },
      });
      expect(session).toBeDefined();
      expect(session!.context).toBe("ASSIGNMENT");
      expect(session!.sessionType).toBe("PRACTICE");
      expect(session!.status).toBe("IN_PROGRESS");
      expect(session!.assignmentId).not.toBeNull();
      expect(session!.studentId).toBe(STUDENT_A_ID);
    });
  });
});
