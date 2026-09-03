import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import {
  evaluateBasicBadges,
  recordCorrectAnswer,
  recordExerciseCompleted,
  updateStreak,
} from "../src/modules/gamification/index.js";

const TENANT_A = "77777797-0000-7000-8000-0000000000a1";
const TENANT_B = "77777797-0000-7000-8000-0000000000b1";
const STUDENT_A = "77777797-0000-7000-8000-000000000001";
const STUDENT_B = "77777797-0000-7000-8000-000000000002";
const ADMIN = "77777797-0000-7000-8000-000000000099";
const CONTENT = "77777797-0000-7000-8000-0000000000c1";
const QUESTION = "77777797-0000-7000-8000-0000000000d1";
const TEMPLATE = "77777797-0000-7000-8000-0000000000e1";
const TEMPLATE_VERSION = "77777797-0000-7000-8000-0000000000e2";
const PASSWORD = "gamification-pass-123!";
const EMAIL_A = "gamification-a@example.com";
const EMAIL_B = "gamification-b@example.com";
const EMAIL_ADMIN = "gamification-admin@example.com";

let app: FastifyInstance;
let questionVersionId = "";
let sessionId = "";
let attemptId = "";
let createdBadgeId: string | null = null;

async function cleanup() {
  await prisma.studentBadge.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.pointEvent.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.studentStreak.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.attempt.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: { templateVersionId: TEMPLATE_VERSION },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: { templateVersionId: TEMPLATE_VERSION },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersion.deleteMany({ where: { questionId: QUESTION } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: TEMPLATE_VERSION } });
    await tx.contentVersion.deleteMany({ where: { contentId: CONTENT } });
  });
  await prisma.question.deleteMany({ where: { id: QUESTION } });
  await prisma.exerciseTemplate.deleteMany({ where: { id: TEMPLATE } });
  await prisma.content.deleteMany({ where: { id: CONTENT } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.user.deleteMany({ where: { id: { in: [STUDENT_A, STUDENT_B, ADMIN] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
  if (createdBadgeId) await prisma.badge.deleteMany({ where: { id: createdBadgeId } });
}

async function login(email: string, tenantId?: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password: PASSWORD, ...(tenantId ? { tenantId } : {}) },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.tokens.accessToken as string;
}

function headers(token: string, tenantId: string) {
  return { authorization: `Bearer ${token}`, "x-tenant-id": tenantId };
}

describe.sequential("gamification MVP", () => {
  let tokenA = "";
  let tokenB = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const passwordHash = await new ScryptPasswordHasher().hash(PASSWORD);
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, type: "ORGANIZATION", name: "Gamification A" },
        { id: TENANT_B, type: "ORGANIZATION", name: "Gamification B" },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: STUDENT_A, email: EMAIL_A, displayName: "Öğrenci A", passwordHash },
        { id: STUDENT_B, email: EMAIL_B, displayName: "Öğrenci B", passwordHash },
        {
          id: ADMIN,
          email: EMAIL_ADMIN,
          displayName: "Platform Admin",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: TENANT_A, userId: STUDENT_A, role: "STUDENT", status: "ACTIVE" },
        { tenantId: TENANT_B, userId: STUDENT_B, role: "STUDENT", status: "ACTIVE" },
      ],
    });
    await prisma.content.create({
      data: { id: CONTENT, tenantId: TENANT_A, type: "PASSAGE", title: "Metin", difficulty: 1 },
    });
    const contentVersion = await prisma.contentVersion.create({
      data: {
        contentId: CONTENT,
        version: 1,
        title: "Metin v1",
        body: "Metin",
        wordCount: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.question.create({
      data: {
        id: QUESTION,
        contentId: CONTENT,
        position: 1,
        type: "TRUE_FALSE",
        status: "PUBLISHED",
      },
    });
    const questionVersion = await prisma.questionVersion.create({
      data: {
        questionId: QUESTION,
        version: 1,
        prompt: "Doğru mu?",
        correctAnswer: { type: "TRUE_FALSE", answer: true },
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    questionVersionId = questionVersion.id;
    await prisma.exerciseTemplate.create({
      data: {
        id: TEMPLATE,
        tenantId: TENANT_A,
        contentId: CONTENT,
        title: "Gamification Egzersizi",
        type: "COMPREHENSION",
        status: "PUBLISHED",
      },
    });
    await prisma.exerciseTemplateVersion.create({
      data: {
        id: TEMPLATE_VERSION,
        templateId: TEMPLATE,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.exerciseTemplateVersionContent.create({
      data: {
        templateVersionId: TEMPLATE_VERSION,
        contentVersionId: contentVersion.id,
        position: 0,
      },
    });
    await prisma.exerciseTemplateVersionQuestion.create({
      data: {
        templateVersionId: TEMPLATE_VERSION,
        questionVersionId,
        questionId: QUESTION,
        position: 0,
      },
    });
    const badge = await prisma.badge.findUnique({ where: { code: "FIRST_EXERCISE" } });
    if (!badge) {
      const created = await prisma.badge.create({
        data: {
          code: "FIRST_EXERCISE",
          name: "İlk Egzersiz",
          description: "İlk egzersizini tamamladın.",
          icon: "🏅",
        },
      });
      createdBadgeId = created.id;
    }
    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("DAILY_LOGIN point oluşturur", async () => {
    tokenA = await login(EMAIL_A);
    const events = await prisma.pointEvent.findMany({
      where: { tenantId: TENANT_A, studentId: STUDENT_A },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "DAILY_LOGIN",
      points: 20,
      sourceType: "AUTH_LOGIN",
    });
  });

  it("aynı gün login idempotenttir", async () => {
    await login(EMAIL_A);
    expect(
      await prisma.pointEvent.count({
        where: { tenantId: TENANT_A, studentId: STUDENT_A, eventType: "DAILY_LOGIN" },
      }),
    ).toBe(1);
  });

  it("ilk aktivite streak'i 1 yapar", async () => {
    const streak = await prisma.studentStreak.findUnique({
      where: { tenantId_studentId: { tenantId: TENANT_A, studentId: STUDENT_A } },
    });
    expect(streak).toMatchObject({ currentDays: 1, longestDays: 1 });
  });

  it("CORRECT_ANSWER point oluşturur", async () => {
    const session = await prisma.exerciseSession.create({
      data: {
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        templateVersionId: TEMPLATE_VERSION,
        clientSessionId: "gamification-session",
      },
    });
    sessionId = session.id;
    const response = await app.inject({
      method: "POST",
      url: `/admin/questions/${questionVersionId}/attempts`,
      headers: headers(tokenA, TENANT_A),
      payload: { sessionId, answer: true, clientAttemptId: "gamification-attempt" },
    });
    expect(response.statusCode).toBe(200);
    attemptId = response.json().data.id;
    expect(
      await prisma.pointEvent.findFirst({ where: { sourceType: "ATTEMPT", sourceId: attemptId } }),
    ).toMatchObject({ eventType: "CORRECT_ANSWER", points: 10 });
  });

  it("duplicate attempt ve event idempotenttir", async () => {
    const duplicate = await app.inject({
      method: "POST",
      url: `/admin/questions/${questionVersionId}/attempts`,
      headers: headers(tokenA, TENANT_A),
      payload: { sessionId, answer: true, clientAttemptId: "gamification-attempt" },
    });
    expect(duplicate.statusCode).toBe(409);
    const replay = await recordCorrectAnswer({
      tenantId: TENANT_A,
      studentId: STUDENT_A,
      attemptId,
    });
    expect(replay.created).toBe(false);
    expect(
      await prisma.pointEvent.count({ where: { sourceType: "ATTEMPT", sourceId: attemptId } }),
    ).toBe(1);
  });

  it("EXERCISE_COMPLETED point oluşturur", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/admin/exercise-sessions/${sessionId}/complete`,
      headers: headers(tokenA, TENANT_A),
    });
    expect(response.statusCode).toBe(200);
    expect(
      await prisma.pointEvent.findFirst({
        where: { sourceType: "EXERCISE_SESSION", sourceId: sessionId },
      }),
    ).toMatchObject({ eventType: "EXERCISE_COMPLETED", points: 50 });
  });

  it("duplicate completion point oluşturmaz", async () => {
    const duplicate = await app.inject({
      method: "POST",
      url: `/admin/exercise-sessions/${sessionId}/complete`,
      headers: headers(tokenA, TENANT_A),
    });
    expect(duplicate.statusCode).toBe(400);
    const replay = await recordExerciseCompleted({
      tenantId: TENANT_A,
      studentId: STUDENT_A,
      sessionId,
    });
    expect(replay.created).toBe(false);
    expect(
      await prisma.pointEvent.count({
        where: { sourceType: "EXERCISE_SESSION", sourceId: sessionId },
      }),
    ).toBe(1);
  });

  it("badge otomatik verilir", async () => {
    const award = await prisma.studentBadge.findFirst({
      where: { tenantId: TENANT_A, studentId: STUDENT_A, badge: { code: "FIRST_EXERCISE" } },
    });
    expect(award).toMatchObject({ sourceType: "EXERCISE_SESSION", sourceId: sessionId });
  });

  it("duplicate badge önlenir", async () => {
    await evaluateBasicBadges(TENANT_A, STUDENT_A);
    await evaluateBasicBadges(TENANT_A, STUDENT_A);
    expect(
      await prisma.studentBadge.count({
        where: { tenantId: TENANT_A, studentId: STUDENT_A, badge: { code: "FIRST_EXERCISE" } },
      }),
    ).toBe(1);
  });

  it("aynı gün streak artmaz", async () => {
    await prisma.studentStreak.deleteMany({ where: { tenantId: TENANT_B, studentId: STUDENT_B } });
    await updateStreak(TENANT_B, STUDENT_B, new Date("2026-01-01T01:00:00Z"));
    const streak = await updateStreak(TENANT_B, STUDENT_B, new Date("2026-01-01T23:00:00Z"));
    expect(streak.currentDays).toBe(1);
  });

  it("ertesi gün streak artar", async () => {
    const streak = await updateStreak(TENANT_B, STUDENT_B, new Date("2026-01-02T12:00:00Z"));
    expect(streak.currentDays).toBe(2);
  });

  it("longestDays en uzun seriyi korur", async () => {
    const streak = await updateStreak(TENANT_B, STUDENT_B, new Date("2026-01-03T12:00:00Z"));
    expect(streak).toMatchObject({ currentDays: 3, longestDays: 3 });
  });

  it("gün atlanınca streak reset olur", async () => {
    const streak = await updateStreak(TENANT_B, STUDENT_B, new Date("2026-01-05T12:00:00Z"));
    expect(streak).toMatchObject({ currentDays: 1, longestDays: 3 });
  });

  it("student yalnızca kendi verisini görür", async () => {
    tokenB = await login(EMAIL_B);
    const response = await app.inject({
      method: "GET",
      url: `/student/gamification?studentId=${STUDENT_A}`,
      headers: headers(tokenB, TENANT_B),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.totalPoints).toBe(20);
    expect(
      response
        .json()
        .data.recentPointEvents.every((event: { studentId?: string }) => !event.studentId),
    ).toBe(true);
  });

  it("cross-tenant erişim reddedilir", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/student/gamification",
      headers: headers(tokenA, TENANT_B),
    });
    expect(response.statusCode).toBe(403);
  });

  it("totalPoints doğru hesaplanır", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/student/gamification",
      headers: headers(tokenA, TENANT_A),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.totalPoints).toBe(80);
  });

  it("recentPointEvents son hareketleri döndürür", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/student/gamification",
      headers: headers(tokenA, TENANT_A),
    });
    const events = response.json().data.recentPointEvents;
    expect(events).toHaveLength(3);
    expect(events.map((event: { eventType: string }) => event.eventType)).toEqual(
      expect.arrayContaining(["DAILY_LOGIN", "CORRECT_ANSWER", "EXERCISE_COMPLETED"]),
    );
  });

  it("platform login point yazmaz ve öğrenci API'si reddedilir", async () => {
    const adminToken = await login(EMAIL_ADMIN);
    expect(await prisma.pointEvent.count({ where: { studentId: ADMIN } })).toBe(0);
    const response = await app.inject({
      method: "GET",
      url: "/student/gamification",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(403);
  });
});
