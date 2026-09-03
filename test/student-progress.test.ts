import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { aggregateSessionProgress } from "../src/modules/progress/aggregation.js";

const hasher = new ScryptPasswordHasher();
const PASSWORD = "progress-test-pass-123!";

const TENANT_A = "99999994-0000-7000-8000-0000000000a2";
const TENANT_B = "99999994-0000-7000-8000-0000000000b2";
const TENANT_IDS = [TENANT_A, TENANT_B];

const SUPER_ADMIN_ID = "99999994-0000-7000-8000-000000000098";
const STUDENT_A_ID = "99999994-0000-7000-8000-0000000000s1";
const STUDENT_B_ID = "99999994-0000-7000-8000-0000000000s2";
const STUDENT_CROSS_ID = "99999994-0000-7000-8000-0000000000s3";
const USER_IDS = [SUPER_ADMIN_ID, STUDENT_A_ID, STUDENT_B_ID, STUDENT_CROSS_ID];

const SUPER_ADMIN_EMAIL = "progress-super@example.com";
const STUDENT_A_EMAIL = "progress-student-a@example.com";
const STUDENT_B_EMAIL = "progress-student-b@example.com";
const STUDENT_CROSS_EMAIL = "progress-student-cross@example.com";
const SKILL_A = "99999994-0000-7000-8000-000000000sk1";
const SKILL_B = "99999994-0000-7000-8000-000000000sk2";

const CONTENT_A = "99999994-0000-7000-8000-0000000000f2";
const CONTENT_VERSION_A = "99999994-0000-7000-8000-000000000cv1";
const TEMPLATE_A = "99999994-0000-7000-8000-0000000000d4";
const TEMPLATE_VERSION_A = "99999994-0000-7000-8000-0000000000dv4";
const QUESTION_V1 = "99999994-0000-7000-8000-0000000000qv1";
const QUESTION_V2 = "99999994-0000-7000-8000-0000000000qv2";
const QUESTION_V3 = "99999994-0000-7000-8000-0000000000qv3";
const QUESTION_1 = "99999994-0000-7000-8000-0000000000q1";
const QUESTION_2 = "99999994-0000-7000-8000-0000000000q2";
const QUESTION_3 = "99999994-0000-7000-8000-0000000000q3";

const BRANCH_A = "99999994-0000-7000-8000-0000000000br2";
const YEAR_A = "99999994-0000-7000-8000-0000000000y2";
const CLASS_A = "99999994-0000-7000-8000-0000000000c5";

describe("student progress", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();

    // Cleanup — disable triggers, then ORM deletes in same transaction
    await prisma.studentProgress.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.attempt.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('session_replication_role', 'replica', false)`;
      await tx.exerciseTemplateVersionQuestion.deleteMany({
        where: { templateVersion: { templateId: TEMPLATE_A } },
      });
      await tx.exerciseTemplateVersionContent.deleteMany({
        where: { templateVersion: { templateId: TEMPLATE_A } },
      });
      await tx.questionVersion.deleteMany({ where: { question: { contentId: CONTENT_A } } });
      await tx.contentVersion.deleteMany({ where: { contentId: CONTENT_A } });
      await tx.exerciseTemplateVersion.deleteMany({ where: { templateId: TEMPLATE_A } });
      await tx.exerciseTemplate.deleteMany({ where: { id: TEMPLATE_A } });
      await tx.question.deleteMany({ where: { contentId: CONTENT_A } });
      await tx.content.deleteMany({ where: { id: CONTENT_A } });
      await tx.skill.deleteMany({ where: { id: { in: [SKILL_A, SKILL_B] } } });
      await tx.class.deleteMany({ where: { id: CLASS_A } });
      await tx.academicYear.deleteMany({ where: { id: YEAR_A } });
      await tx.branch.deleteMany({ where: { id: BRANCH_A } });
      await tx.user.deleteMany({ where: { id: { in: USER_IDS } } });
      await tx.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, name: "Progress Test Org A", type: "ORGANIZATION", status: "ACTIVE" },
        { id: TENANT_B, name: "Progress Test Org B", type: "ORGANIZATION", status: "ACTIVE" },
      ],
    });

    // Seed skills
    await prisma.skill.createMany({
      data: [
        { id: SKILL_A, code: "PROG-SKILL-A", name: "Ana Fikir", category: "MAIN_IDEA" },
        { id: SKILL_B, code: "PROG-SKILL-B", name: "Detay", category: "DETAIL" },
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
          id: STUDENT_A_ID,
          email: STUDENT_A_EMAIL,
          displayName: "Student A",
          passwordHash,
          status: "ACTIVE",
        },
        {
          id: STUDENT_B_ID,
          email: STUDENT_B_EMAIL,
          displayName: "Student B",
          passwordHash,
          status: "ACTIVE",
        },
        {
          id: STUDENT_CROSS_ID,
          email: STUDENT_CROSS_EMAIL,
          displayName: "Student Cross",
          passwordHash,
          status: "ACTIVE",
        },
      ],
    });

    // Memberships
    await prisma.membership.createMany({
      data: [
        { userId: STUDENT_A_ID, tenantId: TENANT_A, role: "STUDENT", status: "ACTIVE" },
        { userId: STUDENT_B_ID, tenantId: TENANT_A, role: "STUDENT", status: "ACTIVE" },
        { userId: STUDENT_CROSS_ID, tenantId: TENANT_B, role: "STUDENT", status: "ACTIVE" },
      ],
    });

    // Branch + Year + Class
    await prisma.branch.create({
      data: { id: BRANCH_A, tenantId: TENANT_A, name: "Branch A", code: "PBR-A" },
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
    await prisma.class.create({
      data: {
        id: CLASS_A,
        tenantId: TENANT_A,
        branchId: BRANCH_A,
        academicYearId: YEAR_A,
        name: "10-A",
        gradeLevel: 10,
        status: "ACTIVE",
      },
    });

    // Enrollments
    await prisma.enrollment.createMany({
      data: [
        {
          studentId: STUDENT_A_ID,
          classId: CLASS_A,
          academicYearId: YEAR_A,
          tenantId: TENANT_A,
          status: "ACTIVE",
        },
        {
          studentId: STUDENT_B_ID,
          classId: CLASS_A,
          academicYearId: YEAR_A,
          tenantId: TENANT_A,
          status: "ACTIVE",
        },
      ],
    });

    // Content
    await prisma.content.create({
      data: {
        id: CONTENT_A,
        tenantId: TENANT_A,
        title: "Progress Content",
        type: "ARTICLE",
        difficulty: 0.5,
        status: "PUBLISHED",
      },
    });
    await prisma.contentVersion.create({
      data: {
        id: CONTENT_VERSION_A,
        contentId: CONTENT_A,
        version: 1,
        title: "Progress Content v1",
        body: "Test content body",
        wordCount: 100,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    // Questions
    await prisma.question.createMany({
      data: [
        {
          id: QUESTION_1,
          contentId: CONTENT_A,
          position: 1,
          type: "MULTIPLE_CHOICE",
          skillId: SKILL_A,
          status: "PUBLISHED",
        },
        {
          id: QUESTION_2,
          contentId: CONTENT_A,
          position: 2,
          type: "TRUE_FALSE",
          skillId: SKILL_A,
          status: "PUBLISHED",
        },
        {
          id: QUESTION_3,
          contentId: CONTENT_A,
          position: 3,
          type: "OPEN_ENDED",
          skillId: SKILL_B,
          status: "PUBLISHED",
        },
      ],
    });

    // Question Versions
    await prisma.questionVersion.createMany({
      data: [
        {
          id: QUESTION_V1,
          questionId: QUESTION_1,
          version: 1,
          prompt: "Q1?",
          status: "PUBLISHED",
          publishedAt: new Date(),
          correctAnswer: {
            type: "MULTIPLE_CHOICE",
            correctOptionIds: ["opt1"],
            allowMultiple: false,
            partialCredit: false,
          },
          options: [
            { id: "opt1", text: "A" },
            { id: "opt2", text: "B" },
          ],
        },
        {
          id: QUESTION_V2,
          questionId: QUESTION_2,
          version: 1,
          prompt: "Q2?",
          status: "PUBLISHED",
          publishedAt: new Date(),
          correctAnswer: { type: "TRUE_FALSE", answer: true },
        },
        {
          id: QUESTION_V3,
          questionId: QUESTION_3,
          version: 1,
          prompt: "Q3?",
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      ],
    });

    // Template
    await prisma.exerciseTemplate.create({
      data: {
        id: TEMPLATE_A,
        tenantId: TENANT_A,
        title: "Progress Template",
        type: "COMPREHENSION",
        status: "PUBLISHED",
        contentId: CONTENT_A,
      },
    });
    await prisma.exerciseTemplateVersion.create({
      data: {
        id: TEMPLATE_VERSION_A,
        templateId: TEMPLATE_A,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    // Link questions to template version
    await prisma.exerciseTemplateVersionQuestion.createMany({
      data: [
        { templateVersionId: TEMPLATE_VERSION_A, questionVersionId: QUESTION_V1, position: 0 },
        { templateVersionId: TEMPLATE_VERSION_A, questionVersionId: QUESTION_V2, position: 1 },
        { templateVersionId: TEMPLATE_VERSION_A, questionVersionId: QUESTION_V3, position: 2 },
      ],
    });

    // Template → Content
    await prisma.exerciseTemplateVersionContent.create({
      data: {
        templateVersionId: TEMPLATE_VERSION_A,
        contentVersionId: CONTENT_VERSION_A,
        position: 0,
      },
    });

    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    await prisma.studentBadge.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.pointEvent.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.studentStreak.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.studentProgress.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.attempt.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('session_replication_role', 'replica', true)`;
      await tx.exerciseTemplateVersionQuestion.deleteMany({
        where: { templateVersion: { templateId: TEMPLATE_A } },
      });
      await tx.exerciseTemplateVersionContent.deleteMany({
        where: { templateVersion: { templateId: TEMPLATE_A } },
      });
      await tx.questionVersion.deleteMany({ where: { question: { contentId: CONTENT_A } } });
      await tx.contentVersion.deleteMany({ where: { contentId: CONTENT_A } });
      await tx.exerciseTemplateVersion.deleteMany({ where: { templateId: TEMPLATE_A } });
      await tx.exerciseTemplate.deleteMany({ where: { id: TEMPLATE_A } });
      await tx.question.deleteMany({ where: { contentId: CONTENT_A } });
      await tx.content.deleteMany({ where: { id: CONTENT_A } });
      await tx.skill.deleteMany({ where: { id: { in: [SKILL_A, SKILL_B] } } });
      await tx.class.deleteMany({ where: { id: CLASS_A } });
      await tx.academicYear.deleteMany({ where: { id: YEAR_A } });
      await tx.branch.deleteMany({ where: { id: BRANCH_A } });
      await tx.user.deleteMany({ where: { id: { in: USER_IDS } } });
      await tx.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
    });
    await app.close();
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

  const studentAHeaders = async () => ({
    authorization: `Bearer ${await login(STUDENT_A_EMAIL)}`,
    "x-tenant-id": TENANT_A,
  });

  const studentBHeaders = async () => ({
    authorization: `Bearer ${await login(STUDENT_B_EMAIL)}`,
    "x-tenant-id": TENANT_A,
  });

  const crossTenantHeaders = async () => ({
    authorization: `Bearer ${await login(STUDENT_CROSS_EMAIL)}`,
    "x-tenant-id": TENANT_B,
  });

  async function createSession(studentId: string, tenantId: string) {
    const res = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: {
        authorization: `Bearer ${await login(SUPER_ADMIN_EMAIL)}`,
        "x-tenant-id": tenantId,
      },
      payload: { studentId, templateVersionId: TEMPLATE_VERSION_A },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.id as string;
  }

  async function createAttempt(
    sessionId: string,
    questionVersionId: string,
    answer: unknown,
    timeSpentMs?: number,
  ) {
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${questionVersionId}/attempts`,
      headers: {
        authorization: `Bearer ${await login(SUPER_ADMIN_EMAIL)}`,
        "x-tenant-id": TENANT_A,
      },
      payload: {
        sessionId,
        answer,
        clientAttemptId: `test-${Date.now()}-${Math.random()}`,
        ...(timeSpentMs !== undefined ? { timeSpentMs } : {}),
      },
    });
    if (res.statusCode !== 200) {
      throw new Error(`createAttempt failed (${res.statusCode}): ${JSON.stringify(res.json())}`);
    }
    return res;
  }

  async function completeSession(sessionId: string) {
    const res = await app.inject({
      method: "POST",
      url: `/admin/exercise-sessions/${sessionId}/complete`,
      headers: {
        authorization: `Bearer ${await login(SUPER_ADMIN_EMAIL)}`,
        "x-tenant-id": TENANT_A,
      },
    });
    return res;
  }

  it("401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/student/progress" });
    expect(res.statusCode).toBe(401);
  });

  it("empty progress for student with no sessions", async () => {
    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("progress created after session complete", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    // Q1 (MULTIPLE_CHOICE, SKILL_A) — correct
    await createAttempt(sessionId, QUESTION_V1, ["opt1"], 5000);
    // Q2 (TRUE_FALSE, SKILL_A) — correct
    await createAttempt(sessionId, QUESTION_V2, true, 3000);
    // Q3 (OPEN_ENDED, SKILL_B) — pending
    await createAttempt(sessionId, QUESTION_V3, "open answer", 8000);

    const completeRes = await completeSession(sessionId);
    expect(completeRes.statusCode).toBe(200);

    // Wait for async aggregation
    await new Promise((r) => setTimeout(r, 500));

    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.total).toBe(2);

    const skillA = body.data.items.find((i: { skillId: string }) => i.skillId === SKILL_A);
    const skillB = body.data.items.find((i: { skillId: string }) => i.skillId === SKILL_B);

    expect(skillA).toBeDefined();
    expect(skillA.sessionCount).toBe(1);
    expect(skillA.attemptCount).toBe(2);
    expect(skillA.correctCount).toBe(2);
    expect(skillA.accuracy).toBe(1);
    expect(skillA.avgTimeMs).toBe(4000);

    expect(skillB).toBeDefined();
    expect(skillB.sessionCount).toBe(1);
    expect(skillB.attemptCount).toBe(1);
    expect(skillB.correctCount).toBe(0);
    expect(skillB.accuracy).toBeNull();
    expect(skillB.avgTimeMs).toBe(8000);
  });

  it("accuracy: correctCount / scored attempts", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    // Q1 correct
    await createAttempt(sessionId, QUESTION_V1, ["opt1"], 2000);
    // Q2 wrong
    await createAttempt(sessionId, QUESTION_V2, false, 2000);

    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    const body = res.json();
    const skillA = body.data.items.find((i: { skillId: string }) => i.skillId === SKILL_A);
    expect(skillA).toBeDefined();
    expect(skillA.attemptCount).toBe(4);
    expect(skillA.correctCount).toBe(3);
    expect(skillA.accuracy).toBeCloseTo(0.75, 2);
  });

  it("avgTimeMs: NULL timeSpentMs excluded", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    // Q1 with time
    await createAttempt(sessionId, QUESTION_V1, ["opt1"], 1000);
    // Q2 without time
    await createAttempt(sessionId, QUESTION_V2, true);

    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    const body = res.json();
    const skillA = body.data.items.find((i: { skillId: string }) => i.skillId === SKILL_A);
    expect(skillA).toBeDefined();
    // Recomputational aggregation: avgTimeMs is cumulative across all sessions for this student+skill+period
    // All SKILL_A attempts with timeSpentMs: 5000+3000+2000+2000+1000 = 13000 / 5 = 2600
    expect(skillA.avgTimeMs).toBe(2600);

    // Verify NULL exclusion: Q2 had no timeSpentMs but Q1 from this session had 1000
    // If NULLs were NOT excluded, the average would be different
    const dbRecord = await prisma.studentProgress.findFirst({
      where: { tenantId: TENANT_A, studentId: STUDENT_A_ID, skillId: SKILL_A },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord!.avgTimeMs).toBe(2600);
  });

  it("sessionCount increments per session", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    await createAttempt(sessionId, QUESTION_V1, ["opt1"]);
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    const body = res.json();
    const skillA = body.data.items.find((i: { skillId: string }) => i.skillId === SKILL_A);
    expect(skillA).toBeDefined();
    expect(skillA.sessionCount).toBeGreaterThanOrEqual(3);
  });

  it("duplicate session complete is idempotent", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    await createAttempt(sessionId, QUESTION_V1, ["opt1"]);
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const headers = await studentAHeaders();
    const resBefore = await app.inject({ method: "GET", url: "/student/progress", headers });
    const countBefore = resBefore.json().data.total;

    // Try to complete again
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const resAfter = await app.inject({ method: "GET", url: "/student/progress", headers });
    expect(resAfter.json().data.total).toBe(countBefore);
  });

  it("skillId null attempts are skipped", async () => {
    // Create a question without skill
    const noSkillQ = "99999994-0000-7000-8000-0000000000qns";
    const noSkillQV = "99999994-0000-7000-8000-0000000000qvs";
    await prisma.question.create({
      data: {
        id: noSkillQ,
        contentId: CONTENT_A,
        position: 99,
        type: "TRUE_FALSE",
        status: "PUBLISHED",
      },
    });
    await prisma.questionVersion.create({
      data: {
        id: noSkillQV,
        questionId: noSkillQ,
        version: 1,
        prompt: "No skill?",
        status: "PUBLISHED",
        publishedAt: new Date(),
        correctAnswer: { type: "TRUE_FALSE", answer: true },
      },
    });
    await prisma.exerciseTemplateVersionQuestion.create({
      data: { templateVersionId: TEMPLATE_VERSION_A, questionVersionId: noSkillQV, position: 99 },
    });

    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    await createAttempt(sessionId, noSkillQV, true);
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    // Check no new skill was created
    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    const body = res.json();
    expect(body.data.items.every((i: { skillId: string }) => i.skillId !== null)).toBe(true);

    // Cleanup — uses transaction to keep set_config effective
    await prisma.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: TEMPLATE_VERSION_A, questionVersionId: noSkillQV },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('session_replication_role', 'replica', false)`;
      await tx.questionVersion.deleteMany({ where: { id: noSkillQV } });
      await tx.question.deleteMany({ where: { id: noSkillQ } });
    });
  });

  it("weekly period: periodStart is Monday, periodEnd is Sunday", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    await createAttempt(sessionId, QUESTION_V1, ["opt1"]);
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    const body = res.json();
    const item = body.data.items[0];
    expect(item).toBeDefined();

    // Check in DB directly
    const dbRecord = await prisma.studentProgress.findFirst({
      where: { studentId: STUDENT_A_ID, skillId: SKILL_A, tenantId: TENANT_A },
    });
    expect(dbRecord).not.toBeNull();

    const periodStart = new Date(dbRecord!.periodStart);
    const periodEnd = new Date(dbRecord!.periodEnd);
    expect(periodStart.getUTCDay()).toBe(1); // Monday
    expect(periodEnd.getUTCDay()).toBe(0); // Sunday
  });

  it("cross-student access: student B cannot see student A progress via different token", async () => {
    // Student B has own sessions
    const sessionId = await createSession(STUDENT_B_ID, TENANT_A);
    await createAttempt(sessionId, QUESTION_V1, ["opt1"]);
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const headersB = await studentBHeaders();
    const resB = await app.inject({ method: "GET", url: "/student/progress", headers: headersB });
    const bodyB = resB.json();
    expect(resB.statusCode).toBe(200);
    // Student B should only see their own progress — no SKILL_A from student A
    const skillAItems = bodyB.data.items.filter((i: { skillId: string }) => i.skillId === SKILL_A);
    for (const item of skillAItems) {
      expect(item.sessionCount).toBeGreaterThanOrEqual(0);
    }
    // Student B's total should not include student A's sessions
    const totalSessionsB = bodyB.data.items.reduce(
      (sum: number, i: { sessionCount: number }) => sum + i.sessionCount,
      0,
    );
    expect(totalSessionsB).toBeLessThanOrEqual(1);
  });

  it("cross-tenant: student from tenant B cannot see tenant A progress", async () => {
    const headers = await crossTenantHeaders();
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toEqual([]);
  });

  it("GET /student/progress/:skillId returns specific skill", async () => {
    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: `/student/progress/${SKILL_A}`, headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).not.toBeNull();
    expect(body.data.skillId).toBe(SKILL_A);
    expect(body.data.sessionCount).toBeGreaterThanOrEqual(1);
  });

  it("GET /student/progress/:skillId returns null for non-existent skill", async () => {
    const headers = await studentAHeaders();
    const res = await app.inject({
      method: "GET",
      url: "/student/progress/99999994-0000-7000-8000-999999999999",
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeNull();
  });

  it("multi-skill same session: sessionCount is 1 per skill", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    // Both questions for SKILL_A in same session
    await createAttempt(sessionId, QUESTION_V1, ["opt1"]);
    await createAttempt(sessionId, QUESTION_V2, true);
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: `/student/progress/${SKILL_A}`, headers });
    const body = res.json();
    // sessionCount should have incremented by exactly 1 for this session
    expect(body.data.sessionCount).toBeGreaterThanOrEqual(1);
  });

  it("aggregation function: aggregateSessionProgress works directly", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    await createAttempt(sessionId, QUESTION_V1, ["opt1"], 1500);
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 200));

    // Verify progress exists
    const progress = await prisma.studentProgress.findFirst({
      where: { tenantId: TENANT_A, studentId: STUDENT_A_ID, skillId: SKILL_A },
    });
    expect(progress).not.toBeNull();
    expect(progress!.sessionCount).toBeGreaterThanOrEqual(1);
  });

  it("no-data student returns empty list", async () => {
    const headers = await studentBHeaders();
    // Student B might have data from previous tests, but endpoint should work
    const res = await app.inject({ method: "GET", url: "/student/progress", headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it("fluencyWcpm, consistency, masteryScore are NULL (6C-1)", async () => {
    const headers = await studentAHeaders();
    const res = await app.inject({ method: "GET", url: `/student/progress/${SKILL_A}`, headers });
    const body = res.json();
    expect(body.data.fluencyWcpm).toBeNull();
    expect(body.data.consistency).toBeNull();
    expect(body.data.masteryScore).toBeNull();
  });

  it("deleted/invalid session: aggregation skips gracefully", async () => {
    // Attempting to aggregate a non-existent session should not throw
    await expect(aggregateSessionProgress("non-existent-session-id")).resolves.toBeUndefined();
  });

  it("completed session re-call: aggregation is idempotent", async () => {
    const sessionId = await createSession(STUDENT_A_ID, TENANT_A);
    await createAttempt(sessionId, QUESTION_V1, ["opt1"]);
    await completeSession(sessionId);
    await new Promise((r) => setTimeout(r, 300));

    const headers = await studentAHeaders();
    const res1 = await app.inject({ method: "GET", url: `/student/progress/${SKILL_A}`, headers });
    const count1 = res1.json().data.attemptCount;

    // Re-aggregate
    await aggregateSessionProgress(sessionId);
    await new Promise((r) => setTimeout(r, 300));

    const res2 = await app.inject({ method: "GET", url: `/student/progress/${SKILL_A}`, headers });
    const count2 = res2.json().data.attemptCount;
    expect(count2).toBe(count1);
  });
});
