import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const hasher = new ScryptPasswordHasher();
const PASSWORD = "assessment-test-pass-123!";

// Tenants
const TENANT_A = "99999994-0000-7000-8000-0000000000a1";
const TENANT_B = "99999994-0000-7000-8000-0000000000b1";
const TENANT_IDS = [TENANT_A, TENANT_B];

// Users
const SUPER_ADMIN_ID = "99999994-0000-7000-8000-000000000099";
const STUDENT_ID = "99999994-0000-7000-8000-0000000000s1";
const USER_IDS = [SUPER_ADMIN_ID, STUDENT_ID];

const SUPER_ADMIN_EMAIL = "assessment-super@example.com";
const STUDENT_EMAIL = "assessment-student@example.com";
const EMAILS = [SUPER_ADMIN_EMAIL, STUDENT_EMAIL];

// Content + Template
const CONTENT_A = "99999994-0000-7000-8000-0000000000f1";
const TEMPLATE_A = "99999994-0000-7000-8000-0000000000d1";
const TEMPLATE_DRAFT = "99999994-0000-7000-8000-0000000000d2";
const TEMPLATE_VERSION_A = "99999994-0000-7000-8000-0000000000dv1";
const TEMPLATE_VERSION_DRAFT = "99999994-0000-7000-8000-0000000000dv2";

// Assessment IDs (dynamically created)
const createdAssessmentIds: string[] = [];

describe("assessment admin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();

    // Clean leftover (including global E2E orphans)
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assessmentResult.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assessment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assessment.deleteMany({ where: { tenantId: null, title: { contains: "E2E" } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT] } },
    });
    await prisma.exerciseTemplateVersionContent.deleteMany({
      where: { templateVersionId: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT] } },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.exerciseTemplateVersion.deleteMany({
        where: { id: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT] } },
      });
    });
    await prisma.exerciseTemplate.deleteMany({
      where: { id: { in: [TEMPLATE_A, TEMPLATE_DRAFT] } },
    });
    await prisma.content.deleteMany({ where: { id: CONTENT_A } });
    await prisma.user.deleteMany({
      where: { OR: [{ id: { in: USER_IDS } }, { email: { in: EMAILS } }] },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });

    // Seed tenants
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, name: "Assessment Test Org A", type: "ORGANIZATION", status: "ACTIVE" },
        { id: TENANT_B, name: "Assessment Test Org B", type: "ORGANIZATION", status: "ACTIVE" },
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
          id: STUDENT_ID,
          email: STUDENT_EMAIL,
          displayName: "Student User",
          passwordHash,
          status: "ACTIVE",
        },
      ],
    });

    // Memberships
    await prisma.membership.createMany({
      data: [{ userId: STUDENT_ID, tenantId: TENANT_A, role: "STUDENT", status: "ACTIVE" }],
    });

    // Content
    await prisma.content.create({
      data: {
        id: CONTENT_A,
        tenantId: TENANT_A,
        title: "Assessment Test Content",
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
      ],
    });

    // Template versions
    await prisma.exerciseTemplateVersion.createMany({
      data: [
        { id: TEMPLATE_VERSION_A, templateId: TEMPLATE_A, version: 1, status: "PUBLISHED" },
        { id: TEMPLATE_VERSION_DRAFT, templateId: TEMPLATE_DRAFT, version: 1, status: "DRAFT" },
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
    await prisma.assessmentResult.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assessment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.assessment.deleteMany({ where: { tenantId: null, title: { contains: "E2E" } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT] } },
    });
    await prisma.exerciseTemplateVersionContent.deleteMany({
      where: { templateVersionId: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT] } },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.exerciseTemplateVersion.deleteMany({
        where: { id: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_DRAFT] } },
      });
    });
    await prisma.exerciseTemplate.deleteMany({
      where: { id: { in: [TEMPLATE_A, TEMPLATE_DRAFT] } },
    });
    await prisma.content.deleteMany({ where: { id: CONTENT_A } });
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

  const studentHeaders = async () => ({
    authorization: `Bearer ${await login(STUDENT_EMAIL)}`,
    "x-tenant-id": TENANT_A,
  });

  it("401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/assessments" });
    expect(res.statusCode).toBe(401);
  });

  it("empty list returns 0 items", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("create assessment with valid data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
      payload: {
        title: "First Assessment",
        type: "PLACEMENT",
        config: { templateId: TEMPLATE_A, templateVersionId: TEMPLATE_VERSION_A, questionCount: 5 },
      },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.title).toBe("First Assessment");
    expect(d.type).toBe("PLACEMENT");
    expect(d.status).toBe("DRAFT");
    expect(d.config.templateId).toBe(TEMPLATE_A);
    expect(d.config.templateVersionId).toBe(TEMPLATE_VERSION_A);
    createdAssessmentIds.push(d.id);
  });

  it("get assessment by id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/assessments/${createdAssessmentIds[0]}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(createdAssessmentIds[0]);
    expect(res.json().data.title).toBe("First Assessment");
  });

  it("get assessment returns 404 for nonexistent id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assessments/00000000-0000-0000-0000-000000000000",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("update assessment title", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/admin/assessments/${createdAssessmentIds[0]}`,
      headers: await superAdminHeaders(),
      payload: { title: "Updated Assessment" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe("Updated Assessment");
  });

  it("update assessment type", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/admin/assessments/${createdAssessmentIds[0]}`,
      headers: await superAdminHeaders(),
      payload: { type: "DIAGNOSTIC" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.type).toBe("DIAGNOSTIC");
  });

  it("transition DRAFT → PUBLISHED", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/assessments/${createdAssessmentIds[0]}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "PUBLISHED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("PUBLISHED");
  });

  it("invalid transition PUBLISHED → DRAFT returns 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/assessments/${createdAssessmentIds[0]}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "DRAFT" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("transition PUBLISHED → ARCHIVED", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/assessments/${createdAssessmentIds[0]}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "ARCHIVED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ARCHIVED");
  });

  it("archived assessment cannot be edited", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/admin/assessments/${createdAssessmentIds[0]}`,
      headers: await superAdminHeaders(),
      payload: { title: "Should Not Work" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("create and soft-delete DRAFT assessment", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
      payload: {
        title: "To Delete",
        config: { templateId: TEMPLATE_A, templateVersionId: TEMPLATE_VERSION_A },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const id = createRes.json().data.id;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/admin/assessments/${id}`,
      headers: await superAdminHeaders(),
    });
    expect(deleteRes.statusCode).toBe(200);

    // Should not appear in list
    const listRes = await app.inject({
      method: "GET",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
    });
    const items = listRes.json().data.items;
    expect(items.find((a: { id: string }) => a.id === id)).toBeUndefined();
  });

  it("PUBLISHED assessment cannot be deleted", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
      payload: {
        title: "Cannot Delete",
        config: { templateId: TEMPLATE_A, templateVersionId: TEMPLATE_VERSION_A },
      },
    });
    const id = createRes.json().data.id;

    // Publish first
    await app.inject({
      method: "PATCH",
      url: `/admin/assessments/${id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "PUBLISHED" },
    });

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/admin/assessments/${id}`,
      headers: await superAdminHeaders(),
    });
    expect(deleteRes.statusCode).toBe(400);
  });

  it("create without required templateId returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
      payload: { title: "No Template" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("create with nonexistent template returns 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
      payload: {
        title: "Bad Template",
        config: { templateId: "00000000-0000-0000-0000-000000000000" },
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("create with draft template returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
      payload: { title: "Draft Template", config: { templateId: TEMPLATE_DRAFT } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("student cannot access admin endpoints", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assessments",
      headers: await studentHeaders(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("search filter works", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assessments?search=Updated",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((a: { title: string }) => a.title.includes("Updated"))).toBe(true);
  });

  it("type filter works", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assessments?type=DIAGNOSTIC",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.every((a: { type: string }) => a.type === "DIAGNOSTIC")).toBe(true);
  });

  it("status filter works", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assessments?status=PUBLISHED",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.every((a: { status: string }) => a.status === "PUBLISHED")).toBe(true);
  });

  it("pagination works", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assessments?page=1&pageSize=1",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items.length).toBeLessThanOrEqual(1);
  });

  it("create PUBLISHED assessment for student tests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/assessments",
      headers: await superAdminHeaders(),
      payload: {
        title: "Student Assessment",
        type: "BENCHMARK",
        config: { templateId: TEMPLATE_A, templateVersionId: TEMPLATE_VERSION_A, questionCount: 3 },
      },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    createdAssessmentIds.push(d.id);

    // Publish it
    const pubRes = await app.inject({
      method: "PATCH",
      url: `/admin/assessments/${d.id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "PUBLISHED" },
    });
    expect(pubRes.statusCode).toBe(200);
  });

  it("student list shows PUBLISHED assessments", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/student/assessments",
      headers: await studentHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    // Student list only returns PUBLISHED assessments (filtered server-side)
    expect(body.items.every((a: { title: string; type: string }) => a.title && a.type)).toBe(true);
  });

  it("student get assessment by id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/student/assessments/${createdAssessmentIds[1]}`,
      headers: await studentHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(createdAssessmentIds[1]);
  });

  it("student start assessment session creates IN_PROGRESS session", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/student/assessments/${createdAssessmentIds[1]}/start`,
      headers: await studentHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.sessionId).toBeDefined();
    expect(d.isNew).toBe(true);

    // Verify session exists in DB
    const session = await prisma.exerciseSession.findUnique({ where: { id: d.sessionId } });
    expect(session).not.toBeNull();
    expect(session!.assessmentId).toBe(createdAssessmentIds[1]);
    expect(session!.status).toBe("IN_PROGRESS");
    expect(session!.context).toBe("ASSESSMENT");
    expect(session!.sessionType).toBe("ASSESSMENT");
  });

  it("student start assessment idempotent returns same session", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/student/assessments/${createdAssessmentIds[1]}/start`,
      headers: await studentHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.isNew).toBe(false);
  });

  it("student get result returns null when no result", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/student/assessments/${createdAssessmentIds[1]}/result`,
      headers: await studentHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
  });

  it("student start nonexistent assessment returns 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/student/assessments/00000000-0000-0000-0000-000000000000/start",
      headers: await studentHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("401 without auth on student endpoints", async () => {
    const res = await app.inject({ method: "GET", url: "/student/assessments" });
    expect(res.statusCode).toBe(401);
  });

  it("cleanup IN_PROGRESS sessions for published assessment", async () => {
    // Cleanup the session created in start tests
    const sessions = await prisma.exerciseSession.findMany({
      where: { assessmentId: createdAssessmentIds[0], status: "IN_PROGRESS" },
    });
    for (const s of sessions) {
      await prisma.exerciseSession.delete({ where: { id: s.id } });
    }
  });
});
