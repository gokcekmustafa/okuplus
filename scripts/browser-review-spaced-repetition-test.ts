import assert from "node:assert/strict";
import type { Browser, Page } from "playwright-core";
import "dotenv/config";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const prisma = new PrismaClient();
const RUN = Date.now();
const EMAIL = `review-${RUN}@example.com`;
const OTHER_EMAIL = `review-other-${RUN}@example.com`;
const PASS = "ReviewE2E123!";
const SKILL_ID = `8g7-review-skill-${RUN}`;
const LEVEL_ID = `8g7-review-level-${RUN}`;
const CONTENT_IDS = [`8g7-review-content-a-${RUN}`, `8g7-review-content-b-${RUN}`];
const CV_IDS = [`8g7-review-cv-a-${RUN}`, `8g7-review-cv-b-${RUN}`];
const QUESTION_IDS = [`8g7-review-q-a-${RUN}`, `8g7-review-q-b-${RUN}`];
const QUESTION_VERSION_IDS = [`8g7-review-qv-a-${RUN}`, `8g7-review-qv-b-${RUN}`];
const TEMPLATE_IDS = [`8g7-review-template-a-${RUN}`, `8g7-review-template-b-${RUN}`];
const TEMPLATE_VERSION_IDS = [`8g7-review-tv-a-${RUN}`, `8g7-review-tv-b-${RUN}`];
const OLD_ATTEMPT_AT = new Date("2026-08-28T09:00:00.000Z");
const PERIOD_START = new Date("2026-08-24T00:00:00.000Z");
const PERIOD_END = new Date("2026-08-30T23:59:59.999Z");
const ownedTenantIds = new Set<string>();

async function seedCurriculum() {
  await prisma.skill.create({
    data: {
      id: SKILL_ID,
      code: `REVIEW_E2E_${RUN}`,
      name: "Review E2E becerisi",
      category: "COMPREHENSION",
      displayOrder: 999,
    },
  });
  await prisma.level.create({
    data: {
      id: LEVEL_ID,
      code: `REVIEW_LEVEL_${RUN}`,
      name: "Review E2E seviyesi",
      minScore: 0,
      maxScore: 100,
      difficultyMin: 0,
      difficultyMax: 5,
      displayOrder: 999,
    },
  });

  for (let i = 0; i < 2; i++) {
    await prisma.content.create({
      data: {
        id: CONTENT_IDS[i],
        type: "PASSAGE",
        title: `Review source ${i === 0 ? "A" : "B"}`,
        difficulty: 1,
        status: "PUBLISHED",
      },
    });
    await prisma.contentVersion.create({
      data: {
        id: CV_IDS[i],
        contentId: CONTENT_IDS[i],
        version: 1,
        title: `Review source ${i === 0 ? "A" : "B"} v1`,
        body: `Bu, review kaynağı ${i === 0 ? "A" : "B"} için kontrollü okuma metnidir.`,
        wordCount: 10,
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-01T09:00:00.000Z"),
      },
    });
    await prisma.content.update({
      where: { id: CONTENT_IDS[i] },
      data: { currentVersionId: CV_IDS[i] },
    });
    await prisma.question.create({
      data: {
        id: QUESTION_IDS[i],
        contentId: CONTENT_IDS[i],
        position: 0,
        type: "TRUE_FALSE",
        skillId: SKILL_ID,
        status: "PUBLISHED",
      },
    });
    await prisma.questionVersion.create({
      data: {
        id: QUESTION_VERSION_IDS[i],
        questionId: QUESTION_IDS[i],
        version: 1,
        prompt: `Review kaynağı ${i === 0 ? "A" : "B"} doğru mu?`,
        correctAnswer: { type: "TRUE_FALSE", answer: true },
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-01T09:00:00.000Z"),
      },
    });
    await prisma.exerciseTemplate.create({
      data: {
        id: TEMPLATE_IDS[i],
        contentId: CONTENT_IDS[i],
        title: `Review set ${i === 0 ? "A" : "B"}`,
        type: "COMPREHENSION",
        skillId: SKILL_ID,
        status: "PUBLISHED",
      },
    });
    await prisma.exerciseTemplateVersion.create({
      data: {
        id: TEMPLATE_VERSION_IDS[i],
        templateId: TEMPLATE_IDS[i],
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-01T09:00:00.000Z"),
      },
    });
    await prisma.exerciseTemplateVersionContent.create({
      data: {
        templateVersionId: TEMPLATE_VERSION_IDS[i],
        contentVersionId: CV_IDS[i],
        position: 0,
      },
    });
    await prisma.exerciseTemplateVersionQuestion.create({
      data: {
        templateVersionId: TEMPLATE_VERSION_IDS[i],
        questionVersionId: QUESTION_VERSION_IDS[i],
        questionId: QUESTION_IDS[i],
        position: 0,
      },
    });
  }
}

async function provisionStudent(email: string, displayName: string) {
  const response = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASS, displayName }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as {
    data: {
      user: { id: string };
      tenantContext: { tenantId: string };
      tokens: { accessToken: string };
    };
  };
  const { id } = body.data.user;
  const tenantId = body.data.tenantContext.tenantId;
  ownedTenantIds.add(tenantId);
  await prisma.studentProfile.update({
    where: { tenantId_studentId: { tenantId, studentId: id } },
    data: { onboardingCompletedAt: new Date(), currentLevelId: LEVEL_ID, learningGoal: "SPEED" },
  });
  await prisma.consent.createMany({
    data: [
      { userId: id, tenantId, type: "TERMS_OF_SERVICE", version: "v1", status: "GRANTED" },
      { userId: id, tenantId, type: "DATA_PROCESSING", version: "v1", status: "GRANTED" },
    ],
  });
  return { userId: id, tenantId, accessToken: body.data.tokens.accessToken };
}

async function seedHistory(studentId: string, tenantId: string) {
  const session = await prisma.exerciseSession.create({
    data: {
      tenantId,
      studentId,
      templateVersionId: TEMPLATE_VERSION_IDS[0],
      context: "INDIVIDUAL",
      sessionType: "PRACTICE",
      status: "COMPLETED",
      startedAt: OLD_ATTEMPT_AT,
      completedAt: OLD_ATTEMPT_AT,
      scoreSummary: { totalQuestions: 1, attempted: 1, scoredCount: 1, averageScore: 0 },
    },
  });
  await prisma.attempt.create({
    data: {
      tenantId,
      sessionId: session.id,
      questionVersionId: QUESTION_VERSION_IDS[0],
      questionId: QUESTION_IDS[0],
      clientAttemptId: `review-old-attempt-${RUN}`,
      answer: false,
      isCorrect: false,
      rawScore: 0,
      responseOrder: 0,
      answeredAt: OLD_ATTEMPT_AT,
    },
  });
  await prisma.studentProgress.create({
    data: {
      tenantId,
      studentId,
      skillId: SKILL_ID,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      sessionCount: 1,
      attemptCount: 1,
      correctCount: 0,
      accuracy: 0,
      lastAttemptAt: OLD_ATTEMPT_AT,
    },
  });
  return session.id;
}

async function api(
  path: string,
  accessToken: string,
  tenantId: string,
  init: { method?: string; body?: unknown } = {},
) {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-tenant-id": tenantId,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { response, body: (await response.json()) as { data?: unknown; error?: unknown } };
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
  const userIds = users.map((user) => user.id);
  const memberships = await prisma.membership.findMany({ where: { userId: { in: userIds } } });
  for (const membership of memberships) ownedTenantIds.add(membership.tenantId);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.attempt.deleteMany({ where: { session: { studentId: { in: userIds } } } });
    await tx.sessionContentVersion.deleteMany({
      where: { session: { studentId: { in: userIds } } },
    });
    await tx.exerciseSession.deleteMany({ where: { studentId: { in: userIds } } });
    await tx.studentProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await tx.pointEvent.deleteMany({ where: { studentId: { in: userIds } } });
    await tx.studentStreak.deleteMany({ where: { studentId: { in: userIds } } });
    await tx.studentBadge.deleteMany({ where: { studentId: { in: userIds } } });
    await tx.consent.deleteMany({ where: { userId: { in: userIds } } });
    await tx.studentProfile.deleteMany({ where: { studentId: { in: userIds } } });
    await tx.membership.deleteMany({ where: { userId: { in: userIds } } });
    await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await tx.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.tenant.deleteMany({ where: { id: { in: [...ownedTenantIds] }, type: "INDIVIDUAL" } });
    await tx.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: { in: TEMPLATE_VERSION_IDS } },
    });
    await tx.exerciseTemplateVersionContent.deleteMany({
      where: { templateVersionId: { in: TEMPLATE_VERSION_IDS } },
    });
    await tx.questionVersion.deleteMany({ where: { id: { in: QUESTION_VERSION_IDS } } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: { in: TEMPLATE_VERSION_IDS } } });
    await tx.question.deleteMany({ where: { id: { in: QUESTION_IDS } } });
    await tx.exerciseTemplate.deleteMany({ where: { id: { in: TEMPLATE_IDS } } });
    await tx.contentVersion.deleteMany({ where: { id: { in: CV_IDS } } });
    await tx.content.deleteMany({ where: { id: { in: CONTENT_IDS } } });
    await tx.skill.deleteMany({ where: { id: SKILL_ID } });
    await tx.level.deleteMany({ where: { id: LEVEL_ID } });
  });

  const remaining = await Promise.all([
    prisma.user.count({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } }),
    prisma.tenant.count({ where: { id: { in: [...ownedTenantIds] } } }),
    prisma.exerciseSession.count({ where: { templateVersionId: { in: TEMPLATE_VERSION_IDS } } }),
    prisma.attempt.count({ where: { questionVersionId: { in: QUESTION_VERSION_IDS } } }),
    prisma.studentProgress.count({ where: { skillId: SKILL_ID } }),
    prisma.skill.count({ where: { id: SKILL_ID } }),
  ]);
  assert.deepEqual(remaining, [0, 0, 0, 0, 0, 0]);
  console.log("CLEANUP PASS", JSON.stringify({ remaining }));
}

async function main() {
  let browser: Browser | undefined;
  try {
    await seedCurriculum();
    const student = await provisionStudent(EMAIL, "Review E2E");
    const other = await provisionStudent(OTHER_EMAIL, "Other Review E2E");
    const oldSessionId = await seedHistory(student.userId, student.tenantId);

    const reviewBefore = await api("/student/review", student.accessToken, student.tenantId);
    assert.equal(reviewBefore.response.status, 200);
    assert.equal(reviewBefore.body.data.mode, "FOUNDATION");
    assert.equal(reviewBefore.body.data.available, true);
    assert.equal(reviewBefore.body.data.items.length, 1);
    assert.equal(reviewBefore.body.data.items[0].templateVersionId, TEMPLATE_VERSION_IDS[1]);
    assert.equal(reviewBefore.body.data.items[0].priority, "HIGH");
    console.log("1) REVIEW QUEUE / LOW ACCURACY / ALTERNATE SOURCE PASS");

    const otherReview = await api("/student/review", other.accessToken, other.tenantId);
    assert.equal(otherReview.response.status, 200);
    assert.equal(otherReview.body.data.available, false);
    assert.equal(otherReview.body.data.items.length, 0);
    console.log("2) CROSS-USER REVIEW ISOLATION PASS");

    const crossTenant = await api("/student/review", student.accessToken, other.tenantId);
    assert.equal(crossTenant.response.status, 403);
    console.log("3) CROSS-TENANT REVIEW ISOLATION PASS");

    const browserPage = (browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
    }));
    const page: Page = await browserPage.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    page.setDefaultTimeout(15000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.fill("#login-email", EMAIL);
    await page.fill("#login-password", PASS);
    await page.click("#login-submit");
    await page.waitForSelector("#page-dashboard:not(.hidden)");
    await page.waitForSelector("#review-card:not(.hidden) [data-review-start]");
    const reviewCardText = (await page.locator("#review-card").innerText()) ?? "";
    assert.match(reviewCardText, /Tekrar zamanı/);
    assert.equal(await page.locator("[data-review-start]").count(), 1);
    console.log("4) MOBILE STUDENT TODAY REVIEW CARD PASS");

    const startPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/student/review/start") && response.request().method() === "POST",
    );
    await page.click("[data-review-start]");
    const startResponse = await startPromise;
    assert.equal(startResponse.status(), 200);
    const startBody = (await startResponse.json()) as {
      data: {
        mode: string;
        sessionId: string;
        isNew: boolean;
        item: { templateVersionId: string };
      };
    };
    assert.equal(startBody.data.mode, "REVIEW");
    assert.equal(startBody.data.isNew, true);
    assert.equal(startBody.data.item.templateVersionId, TEMPLATE_VERSION_IDS[1]);
    await page.waitForSelector("#page-exercise:not(.hidden)");
    await page.waitForSelector("#exercise-questions-card", { state: "visible" });
    const startedSession = await prisma.exerciseSession.findUniqueOrThrow({
      where: { id: startBody.data.sessionId },
      select: {
        studentId: true,
        tenantId: true,
        templateVersionId: true,
        context: true,
        sessionType: true,
        assignmentId: true,
        assessmentId: true,
        status: true,
      },
    });
    assert.deepEqual(startedSession, {
      studentId: student.userId,
      tenantId: student.tenantId,
      templateVersionId: TEMPLATE_VERSION_IDS[1],
      context: "INDIVIDUAL",
      sessionType: "PRACTICE",
      assignmentId: null,
      assessmentId: null,
      status: "IN_PROGRESS",
    });
    console.log("5) REVIEW START → EXISTING EXERCISE SESSION PASS");

    const todayWithReview = await api("/student/today", student.accessToken, student.tenantId);
    assert.equal(todayWithReview.response.status, 200);
    assert.equal(todayWithReview.body.data.nextAction.type, "RESUME_SESSION");
    assert.equal(todayWithReview.body.data.nextAction.id, startBody.data.sessionId);
    assert.equal(todayWithReview.body.data.review.available, false);
    console.log("6) TODAY NEXT ACTION / ACTIVE SESSION PRECEDENCE PASS");

    await prisma.exerciseTemplate.update({
      where: { id: TEMPLATE_IDS[1] },
      data: { status: "ARCHIVED" },
    });
    const shortage = await api("/student/review", student.accessToken, student.tenantId);
    assert.equal(shortage.response.status, 200);
    assert.equal(shortage.body.data.available, false);
    assert.ok(shortage.body.data.blocked.insufficientVariation >= 1);
    assert.equal(shortage.body.data.items.length, 0);
    console.log("7) PUBLISHED SOURCE SHORTAGE / NO SAME-SET LOOP PASS");

    await prisma.studentProgress.updateMany({
      where: { studentId: student.userId, tenantId: student.tenantId, skillId: SKILL_ID },
      data: { lastAttemptAt: new Date() },
    });
    await prisma.attempt.updateMany({
      where: { sessionId: oldSessionId },
      data: { answeredAt: new Date() },
    });
    const cooldown = await api("/student/review", student.accessToken, student.tenantId);
    assert.equal(cooldown.response.status, 200);
    assert.equal(cooldown.body.data.available, false);
    assert.ok(cooldown.body.data.blocked.cooldown >= 1);
    console.log("8) CONSERVATIVE 24H COOLDOWN PASS");

    assert.equal(pageErrors.length, 0, pageErrors.join(" | "));
    console.log("9) MOBILE UI PAGEERROR PASS");
    console.log("✅ REVIEW & SPACED REPETITION FOUNDATION E2E PASS");
    void oldSessionId;
  } finally {
    await browser?.close();
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ REVIEW FOUNDATION E2E FAIL", error);
  process.exitCode = 1;
});
