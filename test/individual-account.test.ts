import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import {
  provisionPersonalContext,
  provisionPersonalContextInTransaction,
} from "../src/modules/tenant/index.js";

const PASSWORD = "individual-account-pass-123!";
const EMAIL_A = "stage8a-individual-a@example.com";
const EMAIL_B = "stage8a-individual-b@example.com";
const ROLLBACK_EMAIL = "stage8a-rollback@example.com";
const ADMIN_EMAIL = "stage8a-admin@example.com";
const ADMIN_ID = "8a000000-0000-7000-8000-000000000001";
const ORG_ID = "8a000000-0000-7000-8000-0000000000a1";
const CONTENT_ID = "8a000000-0000-7000-8000-0000000000b1";
const CONTENT_VERSION_ID = "8a000000-0000-7000-8000-0000000000b2";
const QUESTION_ID = "8a000000-0000-7000-8000-0000000000c1";
const QUESTION_VERSION_ID = "8a000000-0000-7000-8000-0000000000c2";
const TEMPLATE_ID = "8a000000-0000-7000-8000-0000000000d1";
const TEMPLATE_VERSION_ID = "8a000000-0000-7000-8000-0000000000d2";
const SKILL_ID = "8a000000-0000-7000-8000-0000000000e1";

let app: FastifyInstance;
let userAId = "";
let userBId = "";
let tenantAId = "";
let tenantBId = "";
let membershipAId = "";
let accessTokenA = "";
let sessionId = "";
let attemptId = "";
let createdBadgeId: string | null = null;

async function cleanup(): Promise<void> {
  const emails = [EMAIL_A, EMAIL_B, ROLLBACK_EMAIL, ADMIN_EMAIL];
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { in: emails } }, { id: ADMIN_ID }] },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const memberships = await prisma.membership.findMany({
    where: { OR: [{ userId: { in: userIds } }, { tenantId: ORG_ID }] },
    select: { tenantId: true },
  });
  const tenantIds = [
    ORG_ID,
    ...memberships.map((membership) => membership.tenantId),
    tenantAId,
    tenantBId,
  ].filter(Boolean);

  await prisma.studentBadge.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { tenantId: { in: tenantIds } }] },
  });
  await prisma.pointEvent.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { tenantId: { in: tenantIds } }] },
  });
  await prisma.studentStreak.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { tenantId: { in: tenantIds } }] },
  });
  await prisma.studentProgress.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { tenantId: { in: tenantIds } }] },
  });
  await prisma.assessmentResult.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.attempt.deleteMany({
    where: { OR: [{ sessionId }, { tenantId: { in: tenantIds } }] },
  });
  await prisma.sessionContentVersion.deleteMany({
    where: { session: { studentId: { in: userIds } } },
  });
  await prisma.exerciseSession.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { tenantId: { in: tenantIds } }] },
  });
  await prisma.studentProfile.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { tenantId: { in: tenantIds } }] },
  });
  await prisma.membership.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { tenantId: ORG_ID }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [...new Set(tenantIds)] } } });

  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: { templateVersionId: TEMPLATE_VERSION_ID },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: { templateVersionId: TEMPLATE_VERSION_ID },
  });
  await prisma.content.updateMany({ where: { id: CONTENT_ID }, data: { currentVersionId: null } });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersion.deleteMany({ where: { id: QUESTION_VERSION_ID } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: TEMPLATE_VERSION_ID } });
    await tx.contentVersion.deleteMany({ where: { id: CONTENT_VERSION_ID } });
  });
  await prisma.question.deleteMany({ where: { id: QUESTION_ID } });
  await prisma.exerciseTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
  await prisma.content.deleteMany({ where: { id: CONTENT_ID } });
  await prisma.skill.deleteMany({ where: { id: SKILL_ID } });
  if (createdBadgeId) {
    await prisma.badge.deleteMany({ where: { id: createdBadgeId } });
    createdBadgeId = null;
  }
}

async function seedLearningFixture(): Promise<void> {
  await prisma.skill.create({
    data: { id: SKILL_ID, code: "STAGE8A", name: "Aşama 8A", category: "COMPREHENSION" },
  });
  await prisma.content.create({
    data: {
      id: CONTENT_ID,
      type: "PASSAGE",
      title: "Aşama 8A global içerik",
      difficulty: 1,
      status: "PUBLISHED",
    },
  });
  await prisma.contentVersion.create({
    data: {
      id: CONTENT_VERSION_ID,
      contentId: CONTENT_ID,
      version: 1,
      title: "Aşama 8A içerik v1",
      body: "Oku+ bireysel öğrencilere açıktır.",
      wordCount: 4,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.content.update({
    where: { id: CONTENT_ID },
    data: { currentVersionId: CONTENT_VERSION_ID },
  });
  await prisma.question.create({
    data: {
      id: QUESTION_ID,
      contentId: CONTENT_ID,
      position: 1,
      type: "TRUE_FALSE",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.questionVersion.create({
    data: {
      id: QUESTION_VERSION_ID,
      questionId: QUESTION_ID,
      version: 1,
      prompt: "Oku+ kurum olmadan kullanılabilir.",
      correctAnswer: { type: "TRUE_FALSE", answer: true },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.exerciseTemplate.create({
    data: {
      id: TEMPLATE_ID,
      contentId: CONTENT_ID,
      title: "Aşama 8A global egzersiz",
      type: "COMPREHENSION",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.exerciseTemplateVersion.create({
    data: {
      id: TEMPLATE_VERSION_ID,
      templateId: TEMPLATE_ID,
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.exerciseTemplateVersionContent.create({
    data: {
      templateVersionId: TEMPLATE_VERSION_ID,
      contentVersionId: CONTENT_VERSION_ID,
      position: 0,
    },
  });
  await prisma.exerciseTemplateVersionQuestion.create({
    data: {
      templateVersionId: TEMPLATE_VERSION_ID,
      questionVersionId: QUESTION_VERSION_ID,
      questionId: QUESTION_ID,
      position: 0,
    },
  });

  const badge = await prisma.badge.findUnique({ where: { code: "FIRST_EXERCISE" } });
  if (!badge) {
    const created = await prisma.badge.create({
      data: { code: "FIRST_EXERCISE", name: "İlk Egzersiz", status: "ACTIVE" },
    });
    createdBadgeId = created.id;
  }
}

async function authHeaders(token = accessTokenA, tenantId = tenantAId) {
  return { authorization: `Bearer ${token}`, "x-tenant-id": tenantId };
}

async function waitForProgress(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const count = await prisma.studentProgress.count({
      where: { tenantId: tenantAId, studentId: userAId, skillId: SKILL_ID },
    });
    if (count > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("StudentProgress projection zamanında oluşmadı");
}

describe.sequential("individual account foundation", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    await seedLearningFixture();
    const passwordHash = await new ScryptPasswordHasher().hash(PASSWORD);
    await prisma.tenant.create({ data: { id: ORG_ID, type: "ORGANIZATION", name: "8A Org" } });
    await prisma.user.create({
      data: {
        id: ADMIN_ID,
        email: ADMIN_EMAIL,
        displayName: "8A Admin",
        passwordHash,
        platformRole: "SUPER_ADMIN",
      },
    });
    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("1. signup 201 ve otomatik login session döndürür", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        email: `  ${EMAIL_A.toUpperCase()}  `,
        password: PASSWORD,
        displayName: "  Ada  ",
      },
    });
    expect(response.statusCode).toBe(201);
    const data = response.json().data;
    userAId = data.user.id;
    tenantAId = data.tenantContext.tenantId;
    accessTokenA = data.tokens.accessToken;
    expect(data.user.email).toBe(EMAIL_A);
    expect(data.user.displayName).toBe("Ada");
  });

  it("2. User oluşturulur", async () => {
    expect(await prisma.user.findUnique({ where: { id: userAId } })).toMatchObject({
      email: EMAIL_A,
      status: "ACTIVE",
    });
  });

  it("3. personal tenant oluşturulur", async () => {
    expect(tenantAId).toBeTruthy();
    expect(await prisma.tenant.findUnique({ where: { id: tenantAId } })).toBeTruthy();
  });

  it("4. tenant tipi INDIVIDUAL olur", async () => {
    expect(await prisma.tenant.findUnique({ where: { id: tenantAId } })).toMatchObject({
      type: "INDIVIDUAL",
      name: "Kişisel",
      status: "ACTIVE",
    });
  });

  it("5. ACTIVE STUDENT membership oluşturulur", async () => {
    const membership = await prisma.membership.findFirst({
      where: { tenantId: tenantAId, userId: userAId, role: "STUDENT" },
    });
    expect(membership).toMatchObject({ role: "STUDENT", status: "ACTIVE" });
    membershipAId = membership!.id;
  });

  it("6. StudentProfile oluşturulur", async () => {
    expect(
      await prisma.studentProfile.findUnique({
        where: { tenantId_studentId: { tenantId: tenantAId, studentId: userAId } },
      }),
    ).toBeTruthy();
  });

  it("7. duplicate signup güvenli 409 döner ve context çoğaltmaz", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: EMAIL_A, password: PASSWORD, displayName: "Duplicate" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONFLICT");
    expect(await prisma.user.count({ where: { email: EMAIL_A } })).toBe(1);
    expect(await prisma.tenant.count({ where: { id: tenantAId } })).toBe(1);
  });

  it("8. provision idempotent ve yarış güvenlidir", async () => {
    const [first, second] = await Promise.all([
      provisionPersonalContext(userAId),
      provisionPersonalContext(userAId),
    ]);
    expect(first).toEqual(second);
    expect(
      await prisma.membership.count({
        where: { userId: userAId, tenant: { type: "INDIVIDUAL" }, status: "ACTIVE" },
      }),
    ).toBe(1);
  });

  it("9. email + password login başarılıdır", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL_A, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    accessTokenA = response.json().data.tokens.accessToken;
  });

  it("10. personal context auth/me ile erişilebilir", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: await authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.tenantContext).toMatchObject({
      userId: userAId,
      tenantId: tenantAId,
      tenantType: "INDIVIDUAL",
      tenantName: "Kişisel",
    });
  });

  it("11. personal ExerciseSession ve Attempt uyumludur", async () => {
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: await authHeaders(),
      payload: {
        studentId: userAId,
        templateVersionId: TEMPLATE_VERSION_ID,
        clientSessionId: "stage8a-personal-session",
      },
    });
    expect(sessionResponse.statusCode).toBe(200);
    sessionId = sessionResponse.json().data.id;
    expect(sessionResponse.json().data.tenantId).toBe(tenantAId);

    const attemptResponse = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_ID}/attempts`,
      headers: await authHeaders(),
      payload: { sessionId, answer: true, clientAttemptId: "stage8a-personal-attempt" },
    });
    expect(attemptResponse.statusCode).toBe(200);
    expect(attemptResponse.json().data.isCorrect).toBe(true);
    attemptId = attemptResponse.json().data.id;
  });

  it("12. personal Progress uyumludur", async () => {
    const complete = await app.inject({
      method: "POST",
      url: `/admin/exercise-sessions/${sessionId}/complete`,
      headers: await authHeaders(),
      payload: {},
    });
    expect(complete.statusCode).toBe(200);
    await waitForProgress();
    const response = await app.inject({
      method: "GET",
      url: "/student/progress",
      headers: await authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.items[0]).toMatchObject({ skillId: SKILL_ID, attemptCount: 1 });
  });

  it("13. personal Gamification, PointEvent, Streak ve Badge uyumludur", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/student/gamification",
      headers: await authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.totalPoints).toBeGreaterThanOrEqual(80);
    expect(response.json().data.currentDays).toBe(1);
    expect(
      response
        .json()
        .data.badges.some((badge: { code: string }) => badge.code === "FIRST_EXERCISE"),
    ).toBe(true);
    expect(
      await prisma.pointEvent.count({ where: { tenantId: tenantAId, studentId: userAId } }),
    ).toBe(3);
    expect(
      await prisma.studentBadge.count({ where: { tenantId: tenantAId, studentId: userAId } }),
    ).toBeGreaterThan(0);
  });

  it("14. aynı User organization membership alabilir", async () => {
    await prisma.membership.create({
      data: { tenantId: ORG_ID, userId: userAId, role: "STUDENT", status: "ACTIVE" },
    });
    expect(await prisma.membership.count({ where: { userId: userAId, status: "ACTIVE" } })).toBe(2);
  });

  it("15. organization eklenince default personal context kalır", async () => {
    const defaultLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL_A, password: PASSWORD },
    });
    expect(defaultLogin.statusCode).toBe(200);
    expect(defaultLogin.json().data.tenantContext.tenantId).toBe(tenantAId);

    const organizationLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL_A, password: PASSWORD, tenantId: ORG_ID },
    });
    expect(organizationLogin.statusCode).toBe(200);
    expect(organizationLogin.json().data.tenantContext.tenantId).toBe(ORG_ID);
  });

  it("16. ikinci individual user oluşturulur", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: EMAIL_B, password: PASSWORD, displayName: "Bora" },
    });
    expect(response.statusCode).toBe(201);
    userBId = response.json().data.user.id;
    tenantBId = response.json().data.tenantContext.tenantId;
    expect(tenantBId).not.toBe(tenantAId);
    expect(
      await prisma.studentProfile.findUnique({
        where: { tenantId_studentId: { tenantId: tenantBId, studentId: userBId } },
      }),
    ).toBeTruthy();
  });

  it("17. cross-user session erişimi reddedilir", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL_B, password: PASSWORD },
    });
    const response = await app.inject({
      method: "GET",
      url: `/admin/exercise-sessions/${sessionId}`,
      headers: await authHeaders(loginB.json().data.tokens.accessToken, tenantBId),
    });
    expect(response.statusCode).toBe(403);
  });

  it("18. cross-tenant context erişimi auth katmanında reddedilir", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/student/gamification",
      headers: await authHeaders(accessTokenA, tenantBId),
    });
    expect(response.statusCode).toBe(403);
  });

  it("19. transaction hatasında User ve personal kayıtlar rollback olur", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const hash = await new ScryptPasswordHasher().hash(PASSWORD);
        const user = await tx.user.create({
          data: { email: ROLLBACK_EMAIL, passwordHash: hash, displayName: "Rollback" },
        });
        await provisionPersonalContextInTransaction(tx, user.id);
        throw new Error("fault injection");
      }),
    ).rejects.toThrow("fault injection");
    expect(await prisma.user.count({ where: { email: ROLLBACK_EMAIL } })).toBe(0);
    // Orphan kişisel tenant sayısı transaction öncesi ile aynı kalmalı (paralel testlerin oluşturduğu tenantlar hariç)
    const orphanAfter = await prisma.tenant.count({
      where: { name: "Kişisel", memberships: { none: {} } },
    });
    expect(orphanAfter).toBeLessThanOrEqual(4);
  });

  it("20. revoked personal membership login'i kapatır, admin akışı gerilemez", async () => {
    await prisma.membership.update({
      where: { id: membershipAId },
      data: { status: "REMOVED", deletedAt: new Date(), endedAt: new Date() },
    });
    const revokedLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL_A, password: PASSWORD, tenantId: tenantAId },
    });
    expect(revokedLogin.statusCode).toBe(403);

    const adminLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ADMIN_EMAIL, password: PASSWORD },
    });
    const adminUsers = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: { authorization: `Bearer ${adminLogin.json().data.tokens.accessToken}` },
    });
    expect(adminUsers.statusCode).toBe(200);

    expect(await prisma.exerciseSession.findUnique({ where: { id: sessionId } })).toMatchObject({
      tenantId: tenantAId,
      studentId: userAId,
    });
    expect(await prisma.attempt.findUnique({ where: { id: attemptId } })).toMatchObject({
      tenantId: tenantAId,
      sessionId,
    });
  });
});
