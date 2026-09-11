import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";

const PASSWORD = "release-04-validation-pass!";

function fixtureId(number: number): string {
  return `d4000000-0000-7000-8000-${number.toString().padStart(12, "0")}`;
}

const TENANT_A = fixtureId(1);
const TENANT_B = fixtureId(2);
const STUDENT_A = fixtureId(11);
const STUDENT_B = fixtureId(12);
const ASSESSMENT_ID = fixtureId(20);

const FAMILY_FIXTURES = [
  {
    family: "ATTENTION_BURST",
    competency: "FAST_ATTENTION",
    rendererKey: "QUESTION_ATTENTION_BURST",
    templateType: "FLUENCY",
  },
  {
    family: "RAPID_RECOGNITION",
    competency: "FAST_RECOGNITION",
    rendererKey: "QUESTION_RAPID_RECOGNITION",
    templateType: "FLUENCY",
  },
  {
    family: "PHRASE_CHUNKING",
    competency: "FAST_CHUNKING",
    rendererKey: "QUESTION_PHRASE_CHUNKING",
    templateType: "FLUENCY",
  },
  {
    family: "MAIN_IDEA",
    competency: "RC_MAIN_IDEA",
    rendererKey: "QUESTION_MULTIPLE_CHOICE",
    templateType: "COMPREHENSION",
  },
  {
    family: "DETAIL_EVIDENCE",
    competency: "RC_DETAIL",
    rendererKey: "QUESTION_MULTIPLE_CHOICE",
    templateType: "COMPREHENSION",
  },
  {
    family: "INFERENCE",
    competency: "RC_INFERENCE",
    rendererKey: "QUESTION_MULTIPLE_CHOICE",
    templateType: "INFERENCE",
  },
] as const;

const FIXTURE_IDS = FAMILY_FIXTURES.map((_, index) => ({
  skillId: fixtureId(100 + index),
  contentId: fixtureId(200 + index),
  contentVersionId: fixtureId(300 + index),
  questionId: fixtureId(400 + index),
  questionVersionId: fixtureId(500 + index),
  templateId: fixtureId(600 + index),
  templateVersionId: fixtureId(700 + index),
}));

const TENANT_IDS = [TENANT_A, TENANT_B];
const USER_IDS = [STUDENT_A, STUDENT_B];
const CONTENT_IDS = FIXTURE_IDS.map((entry) => entry.contentId);
const CONTENT_VERSION_IDS = FIXTURE_IDS.map((entry) => entry.contentVersionId);
const QUESTION_IDS = FIXTURE_IDS.map((entry) => entry.questionId);
const QUESTION_VERSION_IDS = FIXTURE_IDS.map((entry) => entry.questionVersionId);
const TEMPLATE_IDS = FIXTURE_IDS.map((entry) => entry.templateId);
const TEMPLATE_VERSION_IDS = FIXTURE_IDS.map((entry) => entry.templateVersionId);
const SKILL_IDS = FIXTURE_IDS.map((entry) => entry.skillId);

let app: FastifyInstance;
let accessTokenA = "";
let accessTokenB = "";
let databaseReady = false;

function assertDisposableDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Release validation DATABASE_URL gerekli");
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const localHost = host === "127.0.0.1" || host === "localhost";
  const blockedHost = /neon\.tech|vercel|production|staging|supabase|amazonaws/i.test(host);
  if (!localHost || blockedHost || url.port !== "5432") {
    throw new Error("Release validation yalnızca disposable localhost PostgreSQL ile çalışır");
  }
}

function authHeaders(token: string, tenantId: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "x-tenant-id": tenantId };
}

function versionConfig(fixture: (typeof FAMILY_FIXTURES)[number]) {
  return {
    schemaVersion: 1,
    family: fixture.family,
    competency: fixture.competency,
    difficulty: "FOUNDATION",
    estimatedDurationSeconds: 60,
    instructions: "Metni ve soruyu dikkatle değerlendir.",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
    scoring: {
      mode: "DETERMINISTIC",
      primarySignal: "ACCURACY",
      timeRole: "NONE",
      maxScore: 1,
      openEnded: false,
    },
    feedback: {
      types: ["POSITIVE", "CORRECTIVE", "HINT"],
      showExplanation: true,
      retryEnabled: true,
      maxMessageLength: 80,
    },
    xp: { completionPoints: 1, correctAnswerBonus: 1, dailyCap: 20 },
    eligibility: {
      usage: "TRAINING_ONLY",
      requiresPublishedContent: true,
      requiresPublishedQuestions: true,
      minimumDifficulty: "FOUNDATION",
      maximumDifficulty: "CHALLENGING",
    },
    rendererKey: fixture.rendererKey,
    settings: { optionCount: 4 },
  };
}

async function cleanup(): Promise<void> {
  await prisma.attempt.deleteMany({
    where: { OR: [{ tenantId: { in: TENANT_IDS } }, { session: { studentId: { in: USER_IDS } } }] },
  });
  await prisma.sessionContentVersion.deleteMany({
    where: { session: { studentId: { in: USER_IDS } } },
  });
  await prisma.trainingSessionItem.deleteMany({
    where: { trainingSession: { studentId: { in: USER_IDS } } },
  });
  await prisma.trainingSession.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.exerciseSession.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.entitlementUsage.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.entitlement.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.assessmentResult.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.studentProgress.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.pointEvent.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.studentStreak.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.studentProfile.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.consent.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.membership.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.authIdentity.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: { in: TEMPLATE_VERSION_IDS } },
    });
    await tx.exerciseTemplateVersionContent.deleteMany({
      where: { templateVersionId: { in: TEMPLATE_VERSION_IDS } },
    });
    await tx.questionVersion.deleteMany({ where: { id: { in: QUESTION_VERSION_IDS } } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: { in: TEMPLATE_VERSION_IDS } } });
    await tx.contentVersion.deleteMany({ where: { id: { in: CONTENT_VERSION_IDS } } });
    await tx.question.deleteMany({ where: { id: { in: QUESTION_IDS } } });
    await tx.exerciseTemplate.deleteMany({ where: { id: { in: TEMPLATE_IDS } } });
    await tx.contentSkill.deleteMany({ where: { contentId: { in: CONTENT_IDS } } });
    await tx.content.deleteMany({ where: { id: { in: CONTENT_IDS } } });
    await tx.skill.deleteMany({ where: { id: { in: SKILL_IDS } } });
    await tx.assessment.deleteMany({ where: { id: ASSESSMENT_ID } });
  });
  await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
}

async function createFixture(): Promise<void> {
  const hasher = new ScryptPasswordHasher();
  const passwordHash = await hasher.hash(PASSWORD);

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_A, type: "INDIVIDUAL", name: "Release 0.4 Tenant A", status: "ACTIVE" },
      { id: TENANT_B, type: "INDIVIDUAL", name: "Release 0.4 Tenant B", status: "ACTIVE" },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: STUDENT_A,
        email: "release-04-a@example.com",
        displayName: "Release Student A",
        passwordHash,
        status: "ACTIVE",
      },
      {
        id: STUDENT_B,
        email: "release-04-b@example.com",
        displayName: "Release Student B",
        passwordHash,
        status: "ACTIVE",
      },
    ],
  });
  await prisma.membership.createMany({
    data: [
      {
        tenantId: TENANT_A,
        userId: STUDENT_A,
        role: "STUDENT",
        status: "ACTIVE",
        startedAt: new Date(),
      },
      {
        tenantId: TENANT_B,
        userId: STUDENT_B,
        role: "STUDENT",
        status: "ACTIVE",
        startedAt: new Date(),
      },
    ],
  });
  await prisma.studentProfile.createMany({
    data: [
      { tenantId: TENANT_A, studentId: STUDENT_A, learningGoal: "SPEED" },
      { tenantId: TENANT_B, studentId: STUDENT_B, learningGoal: "SPEED" },
    ],
  });
  await prisma.skill.createMany({
    data: FAMILY_FIXTURES.map((fixture, index) => ({
      id: SKILL_IDS[index],
      code: fixture.competency,
      name: fixture.competency,
      category: "COMPREHENSION" as const,
      displayOrder: index,
    })),
  });

  for (const [index, fixture] of FAMILY_FIXTURES.entries()) {
    const ids = FIXTURE_IDS[index];
    const contentVersionConfig = versionConfig(fixture);
    await prisma.content.create({
      data: {
        id: ids.contentId,
        type: "PASSAGE",
        title: `Release 0.4 ${fixture.family}`,
        difficulty: 1,
        status: "PUBLISHED",
      },
    });
    await prisma.contentSkill.create({ data: { contentId: ids.contentId, skillId: ids.skillId } });
    await prisma.contentVersion.create({
      data: {
        id: ids.contentVersionId,
        contentId: ids.contentId,
        version: 1,
        title: `Release 0.4 ${fixture.family} v1`,
        body: "Bu disposable fixture, okuma antrenmanı için kısa bir pasajdır.",
        wordCount: 9,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.content.update({
      where: { id: ids.contentId },
      data: { currentVersionId: ids.contentVersionId },
    });
    await prisma.question.create({
      data: {
        id: ids.questionId,
        contentId: ids.contentId,
        position: 1,
        type: "MULTIPLE_CHOICE",
        skillId: ids.skillId,
        status: "PUBLISHED",
      },
    });
    await prisma.questionVersion.create({
      data: {
        id: ids.questionVersionId,
        questionId: ids.questionId,
        version: 1,
        prompt: `${fixture.family} fixture sorusu`,
        options: [
          { id: "A", text: "Birinci seçenek" },
          { id: "B", text: "İkinci seçenek" },
          { id: "C", text: "Üçüncü seçenek" },
          { id: "D", text: "Dördüncü seçenek" },
        ],
        correctAnswer: { type: "MULTIPLE_CHOICE", correctOptionIds: ["A"], allowMultiple: false },
        explanation: "Fixture açıklaması.",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.exerciseTemplate.create({
      data: {
        id: ids.templateId,
        title: `Release 0.4 ${fixture.family}`,
        type: fixture.templateType,
        skillId: ids.skillId,
        status: "PUBLISHED",
        config: { stableFixtureIdentity: `RELEASE-0-4-${fixture.family}` },
      },
    });
    await prisma.exerciseTemplateVersion.create({
      data: {
        id: ids.templateVersionId,
        templateId: ids.templateId,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
        config: contentVersionConfig,
      },
    });
    await prisma.exerciseTemplateVersionContent.create({
      data: {
        templateVersionId: ids.templateVersionId,
        contentVersionId: ids.contentVersionId,
        position: 0,
      },
    });
    await prisma.exerciseTemplateVersionQuestion.create({
      data: {
        templateVersionId: ids.templateVersionId,
        questionVersionId: ids.questionVersionId,
        questionId: ids.questionId,
        position: 0,
      },
    });
  }

  await prisma.assessment.create({
    data: {
      id: ASSESSMENT_ID,
      title: "Release 0.4 placement fixture",
      type: "PLACEMENT",
      status: "PUBLISHED",
      config: { validationOnly: true },
    },
  });
  await prisma.assessmentResult.create({
    data: {
      tenantId: TENANT_A,
      studentId: STUDENT_A,
      assessmentId: ASSESSMENT_ID,
      score: 0.8,
      metrics: { validationOnly: true },
    },
  });
  await prisma.entitlement.create({
    data: {
      id: fixtureId(30),
      userId: STUDENT_A,
      tenantId: TENANT_A,
      scope: "PERSONAL",
      plan: "PLAN_FREE",
      active: true,
      source: "RELEASE_VALIDATION",
    },
  });
  await prisma.pointEvent.create({
    data: {
      id: fixtureId(31),
      tenantId: TENANT_A,
      studentId: STUDENT_A,
      eventType: "EXERCISE_COMPLETED",
      points: 5,
      sourceType: "RELEASE_VALIDATION",
      sourceId: fixtureId(32),
      dedupeKey: "release-04-validation-point",
    },
  });
  await prisma.studentStreak.create({
    data: {
      id: fixtureId(33),
      tenantId: TENANT_A,
      studentId: STUDENT_A,
      currentDays: 2,
      longestDays: 2,
      lastActivityDate: new Date(),
    },
  });
}

async function login(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.tokens.accessToken as string;
}

describe.sequential("Release 0.4 disposable PostgreSQL validation", () => {
  beforeAll(async () => {
    assertDisposableDatabase();
    await prisma.$connect();
    databaseReady = true;
    await cleanup();
    await createFixture();
    app = await buildApp(loadEnv());
    await app.ready();
    accessTokenA = await login("release-04-a@example.com");
    accessTokenB = await login("release-04-b@example.com");
  });

  afterAll(async () => {
    if (!databaseReady) return;
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("validates the authenticated dashboard read chain and tenant isolation", async () => {
    const headersA = authHeaders(accessTokenA, TENANT_A);
    const headersB = authHeaders(accessTokenB, TENANT_B);

    const before = await app.inject({ method: "GET", url: "/student/today", headers: headersA });
    expect(before.statusCode).toBe(200);
    expect(before.json().data.placementHandoff).toBe(true);
    expect(before.json().data.currentStreak).toBe(2);
    expect(before.json().data.totalPoints).toBe(5);

    const dailyStart = await app.inject({
      method: "POST",
      url: "/student/training/daily/start",
      headers: headersA,
      payload: {},
    });
    expect(dailyStart.statusCode).toBe(200);
    const daily = dailyStart.json().data;
    expect(daily.totalItems).toBe(6);
    expect(daily.items).toHaveLength(6);
    expect(daily.firstDay).toBe(true);
    expect(daily.placementHandoff).toBe(true);

    const dailyRead = await app.inject({
      method: "GET",
      url: `/student/training/daily/${daily.id}`,
      headers: headersA,
    });
    expect(dailyRead.statusCode).toBe(200);
    expect(dailyRead.json().data.studentId).toBe(STUDENT_A);

    const today = await app.inject({ method: "GET", url: "/student/today", headers: headersA });
    expect(today.statusCode).toBe(200);
    expect(today.json().data.dailyTraining.id).toBe(daily.id);

    const progress = await app.inject({
      method: "GET",
      url: "/student/progress",
      headers: headersA,
    });
    expect(progress.statusCode).toBe(200);

    const gamification = await app.inject({
      method: "GET",
      url: "/student/gamification",
      headers: headersA,
    });
    expect(gamification.statusCode).toBe(200);
    expect(gamification.json().data.totalPoints).toBe(5);
    expect(gamification.json().data.currentDays).toBe(2);

    const entitlements = await app.inject({
      method: "GET",
      url: "/account/entitlements",
      headers: headersA,
    });
    expect(entitlements.statusCode).toBe(200);
    expect(entitlements.json().data.plan.code).toBe("PLAN_FREE");
    expect(entitlements.json().data.features.PRACTICE_QUESTION.dailyLimit).toBe(20);

    const learningPath = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: headersA,
    });
    expect(learningPath.statusCode).toBe(200);

    const history = await app.inject({
      method: "GET",
      url: "/student/history?page=1&pageSize=5",
      headers: headersA,
    });
    expect(history.statusCode).toBe(200);

    const crossTenantDaily = await app.inject({
      method: "GET",
      url: `/student/training/daily/${daily.id}`,
      headers: headersB,
    });
    expect(crossTenantDaily.statusCode).toBe(404);

    const crossTenantToday = await app.inject({
      method: "GET",
      url: "/student/today",
      headers: { ...headersA, "x-tenant-id": TENANT_B },
    });
    expect([400, 403]).toContain(crossTenantToday.statusCode);
  });
});
