import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const hasher = new ScryptPasswordHasher();
const PASSWORD = "assignment-test-pass-123!";

// Tenants
const TENANT_A = "99999994-0000-7000-8000-0000000000a1";
const TENANT_B = "99999994-0000-7000-8000-0000000000b1";
const TENANT_IDS = [TENANT_A, TENANT_B];

// Users
const SUPER_ADMIN_ID = "99999994-0000-7000-8000-000000000099";
const TEACHER_A_ID = "99999994-0000-7000-8000-0000000000t1";
const TEACHER_B_ID = "99999994-0000-7000-8000-0000000000t2";
const TEACHER_CROSS = "99999994-0000-7000-8000-0000000000t3";
const USER_IDS = [SUPER_ADMIN_ID, TEACHER_A_ID, TEACHER_B_ID, TEACHER_CROSS];

const SUPER_ADMIN_EMAIL = "assignment-super@example.com";
const TEACHER_A_EMAIL = "assignment-teacher-a@example.com";
const TEACHER_B_EMAIL = "assignment-teacher-b@example.com";
const TEACHER_CROSS_EMAIL = "assignment-teacher-cross@example.com";
const EMAILS = [SUPER_ADMIN_EMAIL, TEACHER_A_EMAIL, TEACHER_B_EMAIL, TEACHER_CROSS_EMAIL];

// Branches
const BRANCH_A = "99999994-0000-7000-8000-0000000000br1";

// Academic Years
const YEAR_A = "99999994-0000-7000-8000-0000000000y1";

// Classes
const CLASS_A = "99999994-0000-7000-8000-0000000000c1";
const CLASS_B = "99999994-0000-7000-8000-0000000000c2";
const CLASS_INACTIVE = "99999994-0000-7000-8000-0000000000c3";
const CLASS_CROSS = "99999994-0000-7000-8000-0000000000c4";

// Content + Template
const CONTENT_A = "99999994-0000-7000-8000-0000000000f1";
const TEMPLATE_A = "99999994-0000-7000-8000-0000000000d1";
const TEMPLATE_DRAFT = "99999994-0000-7000-8000-0000000000d2";
const TEMPLATE_CROSS = "99999994-0000-7000-8000-0000000000d3";
const TEMPLATE_VERSION_A = "99999994-0000-7000-8000-0000000000dv1";
const TEMPLATE_VERSION_DRAFT = "99999994-0000-7000-8000-0000000000dv2";
const TEMPLATE_VERSION_CROSS = "99999994-0000-7000-8000-0000000000dv3";

// Assignments (dynamically created)
const createdAssignmentIds: string[] = [];

describe("assignment admin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();

    // Clean leftover
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.teacherClassAssignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseTemplateVersionQuestion.deleteMany({
      where: {
        templateVersionId: {
          in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT, TEMPLATE_VERSION_CROSS],
        },
      },
    });
    await prisma.exerciseTemplateVersionContent.deleteMany({
      where: {
        templateVersionId: {
          in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT, TEMPLATE_VERSION_CROSS],
        },
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.exerciseTemplateVersion.deleteMany({
        where: { id: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT, TEMPLATE_VERSION_CROSS] } },
      });
    });
    await prisma.exerciseTemplate.deleteMany({
      where: { id: { in: [TEMPLATE_A, TEMPLATE_DRAFT, TEMPLATE_CROSS] } },
    });
    await prisma.content.deleteMany({ where: { id: CONTENT_A } });
    await prisma.class.deleteMany({
      where: { id: { in: [CLASS_A, CLASS_B, CLASS_INACTIVE, CLASS_CROSS] } },
    });
    await prisma.academicYear.deleteMany({ where: { id: YEAR_A } });
    await prisma.branch.deleteMany({ where: { id: BRANCH_A } });
    await prisma.user.deleteMany({
      where: { OR: [{ id: { in: USER_IDS } }, { email: { in: EMAILS } }] },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });

    // Seed tenants
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, name: "Assignment Test Org A", type: "ORGANIZATION", status: "ACTIVE" },
        { id: TENANT_B, name: "Assignment Test Org B", type: "ORGANIZATION", status: "ACTIVE" },
      ],
    });

    // Seed users
    const passwordHash = await hasher.hash(PASSWORD);
    await prisma.user.createMany({
      data: [
        {
          id: SUPER_ADMIN_ID,
          email: SUPER_ADMIN_EMAIL,
          displayName: "Super Admin",
          passwordHash,
          platformRole: "SUPER_ADMIN",
          status: "ACTIVE",
        },
        {
          id: TEACHER_A_ID,
          email: TEACHER_A_EMAIL,
          displayName: "Teacher A",
          passwordHash,
          status: "ACTIVE",
        },
        {
          id: TEACHER_B_ID,
          email: TEACHER_B_EMAIL,
          displayName: "Teacher B",
          passwordHash,
          status: "ACTIVE",
        },
        {
          id: TEACHER_CROSS,
          email: TEACHER_CROSS_EMAIL,
          displayName: "Teacher Cross",
          passwordHash,
          status: "ACTIVE",
        },
      ],
    });

    // Memberships
    await prisma.membership.createMany({
      data: [
        { userId: TEACHER_A_ID, tenantId: TENANT_A, role: "TEACHER", status: "ACTIVE" },
        {
          id: "99999994-0000-7000-8000-000000000mem1",
          userId: TEACHER_B_ID,
          tenantId: TENANT_A,
          role: "TEACHER",
          status: "ACTIVE",
        },
        {
          id: "99999994-0000-7000-8000-000000000mem2",
          userId: TEACHER_CROSS,
          tenantId: TENANT_B,
          role: "TEACHER",
          status: "ACTIVE",
        },
      ],
    });

    // Branch + Academic Year
    await prisma.branch.create({
      data: { id: BRANCH_A, tenantId: TENANT_A, name: "Branch A", code: "BR-A" },
    });
    await prisma.academicYear.create({
      data: {
        id: YEAR_A,
        tenantId: TENANT_A,
        name: "2025-2026",
        status: "ACTIVE",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-06-30"),
      },
    });

    // Classes
    await prisma.class.createMany({
      data: [
        {
          id: CLASS_A,
          tenantId: TENANT_A,
          branchId: BRANCH_A,
          academicYearId: YEAR_A,
          name: "10-A",
          gradeLevel: 10,
          status: "ACTIVE",
        },
        {
          id: CLASS_B,
          tenantId: TENANT_A,
          branchId: BRANCH_A,
          academicYearId: YEAR_A,
          name: "10-B",
          gradeLevel: 10,
          status: "ACTIVE",
        },
        {
          id: CLASS_INACTIVE,
          tenantId: TENANT_A,
          branchId: BRANCH_A,
          academicYearId: YEAR_A,
          name: "11-C",
          gradeLevel: 11,
          status: "ARCHIVED",
        },
        {
          id: CLASS_CROSS,
          tenantId: TENANT_B,
          branchId: BRANCH_A,
          academicYearId: YEAR_A,
          name: "9-A",
          gradeLevel: 9,
          status: "ACTIVE",
        },
      ],
    });

    // Content (required by template)
    await prisma.content.create({
      data: {
        id: CONTENT_A,
        tenantId: TENANT_A,
        title: "Assignment Test Content",
        type: "PASSAGE",
        difficulty: 1.0,
      },
    });

    // Templates
    await prisma.exerciseTemplate.createMany({
      data: [
        {
          id: TEMPLATE_A,
          tenantId: TENANT_A,
          contentId: CONTENT_A,
          title: "Published Template",
          type: "COMPREHENSION",
          status: "PUBLISHED",
        },
        {
          id: TEMPLATE_DRAFT,
          tenantId: TENANT_A,
          contentId: CONTENT_A,
          title: "Draft Template",
          type: "COMPREHENSION",
          status: "DRAFT",
        },
        {
          id: TEMPLATE_CROSS,
          tenantId: TENANT_B,
          contentId: CONTENT_A,
          title: "Cross Tenant Template",
          type: "COMPREHENSION",
          status: "PUBLISHED",
        },
      ],
    });

    // Template versions
    await prisma.exerciseTemplateVersion.createMany({
      data: [
        { id: TEMPLATE_VERSION_A, templateId: TEMPLATE_A, version: 1, status: "PUBLISHED" },
        { id: TEMPLATE_VERSION_DRAFT, templateId: TEMPLATE_DRAFT, version: 1, status: "DRAFT" },
        { id: TEMPLATE_VERSION_CROSS, templateId: TEMPLATE_CROSS, version: 1, status: "PUBLISHED" },
      ],
    });

    // Teacher-class assignments
    await prisma.teacherClassAssignment.createMany({
      data: [
        { tenantId: TENANT_A, classId: CLASS_A, teacherId: TEACHER_A_ID, subject: "Matematik" },
        { tenantId: TENANT_A, classId: CLASS_B, teacherId: TEACHER_B_ID, subject: "Fizik" },
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
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.teacherClassAssignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseTemplateVersionQuestion.deleteMany({
      where: {
        templateVersionId: {
          in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT, TEMPLATE_VERSION_CROSS],
        },
      },
    });
    await prisma.exerciseTemplateVersionContent.deleteMany({
      where: {
        templateVersionId: {
          in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT, TEMPLATE_VERSION_CROSS],
        },
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.exerciseTemplateVersion.deleteMany({
        where: { id: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT, TEMPLATE_VERSION_CROSS] } },
      });
    });
    await prisma.exerciseTemplate.deleteMany({
      where: { id: { in: [TEMPLATE_A, TEMPLATE_DRAFT, TEMPLATE_CROSS] } },
    });
    await prisma.content.deleteMany({ where: { id: CONTENT_A } });
    await prisma.class.deleteMany({
      where: { id: { in: [CLASS_A, CLASS_B, CLASS_INACTIVE, CLASS_CROSS] } },
    });
    await prisma.academicYear.deleteMany({ where: { id: YEAR_A } });
    await prisma.branch.deleteMany({ where: { id: BRANCH_A } });
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

  it("401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/assignments" });
    expect(res.statusCode).toBe(401);
  });

  it("empty list returns 0 items", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("create assignment with valid data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: {
        classId: CLASS_A,
        templateId: TEMPLATE_A,
        teacherId: TEACHER_A_ID,
        title: "First Assignment",
      },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.title).toBe("First Assignment");
    expect(d.status).toBe("DRAFT");
    expect(d.className).toBe("10-A");
    expect(d.teacherName).toBe("Teacher A");
    expect(d.templateTitle).toBe("Published Template");
    createdAssignmentIds.push(d.id);
  });

  it("create with dueDate", async () => {
    const due = new Date("2026-09-15T12:00:00Z").toISOString();
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: {
        classId: CLASS_A,
        templateId: TEMPLATE_A,
        teacherId: TEACHER_A_ID,
        title: "Due Date Assignment",
        dueDate: due,
      },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.dueDate).toBeTruthy();
    expect(d.title).toBe("Due Date Assignment");
    createdAssignmentIds.push(d.id);
  });

  it("reject missing title", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: { classId: CLASS_A, templateId: TEMPLATE_A, teacherId: TEACHER_A_ID },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("reject missing classId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: { templateId: TEMPLATE_A, teacherId: TEACHER_A_ID, title: "No Class" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("reject non-existent class", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: {
        classId: "00000000-0000-0000-0000-000000000999",
        templateId: TEMPLATE_A,
        teacherId: TEACHER_A_ID,
        title: "X",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("reject inactive class", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: {
        classId: CLASS_INACTIVE,
        templateId: TEMPLATE_A,
        teacherId: TEACHER_A_ID,
        title: "Inactive Class",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("reject non-existent teacher", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: {
        classId: CLASS_A,
        templateId: TEMPLATE_A,
        teacherId: "00000000-0000-0000-0000-000000000999",
        title: "X",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("reject draft template", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: {
        classId: CLASS_A,
        templateId: TEMPLATE_DRAFT,
        teacherId: TEACHER_A_ID,
        title: "Draft Template",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("reject cross-tenant teacher", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: {
        classId: CLASS_A,
        templateId: TEMPLATE_A,
        teacherId: TEACHER_CROSS,
        title: "Cross Tenant",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("reject cross-tenant template", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: await superAdminHeaders(),
      payload: {
        classId: CLASS_A,
        templateId: TEMPLATE_CROSS,
        teacherId: TEACHER_A_ID,
        title: "Cross Tenant Tpl",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("get assignment by id", async () => {
    const id = createdAssignmentIds[0];
    const res = await app.inject({
      method: "GET",
      url: `/admin/assignments/${id}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.id).toBe(id);
    expect(d.title).toBe("First Assignment");
    expect(d.status).toBe("DRAFT");
  });

  it("list with search filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assignments?search=First",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(body.data.items[0].title).toContain("First");
  });

  it("list with status filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assignments?status=DRAFT",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.every((a: { status: string }) => a.status === "DRAFT")).toBe(true);
  });

  it("update assignment title", async () => {
    const id = createdAssignmentIds[0];
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/assignments/${id}`,
      headers: await superAdminHeaders(),
      payload: { title: "First Assignment Updated" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe("First Assignment Updated");
  });

  it("transition DRAFT → SCHEDULED", async () => {
    const id = createdAssignmentIds[0];
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/assignments/${id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "SCHEDULED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("SCHEDULED");
    expect(res.json().data.assignedAt).toBeTruthy();
  });

  it("reject invalid transition SCHEDULED → DRAFT", async () => {
    const id = createdAssignmentIds[0];
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/assignments/${id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "DRAFT" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("transition SCHEDULED → ACTIVE", async () => {
    const id = createdAssignmentIds[0];
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/assignments/${id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ACTIVE");
  });

  it("transition ACTIVE → CLOSED", async () => {
    const id = createdAssignmentIds[0];
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/assignments/${id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "CLOSED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("CLOSED");
  });

  it("reject delete of CLOSED assignment", async () => {
    const id = createdAssignmentIds[0];
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/assignments/${id}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("delete DRAFT assignment", async () => {
    const id = createdAssignmentIds[1];
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/assignments/${id}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const check = await app.inject({
      method: "GET",
      url: `/admin/assignments/${id}`,
      headers: await superAdminHeaders(),
    });
    expect(check.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("list class assignments", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/classes/${CLASS_A}/assignments`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("reject non-existent assignment get", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assignments/00000000-0000-0000-0000-000000000999",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
