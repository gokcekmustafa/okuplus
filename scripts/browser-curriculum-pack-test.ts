import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright-core";
import {
  FIRST_REAL_CURRICULUM_PACK,
  curriculumPackContentCount,
  curriculumPackQuestionCount,
} from "../src/curriculum/first-real-pack.js";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PACK_PREFIX = "OKU+ 8G8 · ";
const PASSWORD = "8G8-pack-e2e-pass-123";
const E2E_TIMEOUT_MS = 15000;
const prisma = new PrismaClient();
let browser: Browser | undefined;
let userId = "";
let tenantId = "";
let sessionId = "";

type StudentQuestion = {
  hint?: string | null;
  explanation?: string | null;
};

type ApiBody = {
  data?: {
    accessToken?: string;
    tokens?: { accessToken?: string };
    user?: { id?: string };
    tenantContext?: { tenantId?: string };
    questions?: StudentQuestion[];
    items?: unknown[];
    summary?: { sessionCount?: number; attemptCount?: number };
    totalPoints?: number;
    currentDays?: number;
    cooldownHours?: number;
  };
  error?: { message?: string };
};

type PackTemplate = {
  id: string;
  title: string;
  skillId: string | null;
  config: unknown;
  versions: Array<{
    id: string;
    contents: Array<{ contentVersion: { title: string; body: string; status: string } }>;
    questions: Array<{
      position: number;
      questionVersion: {
        id: string;
        status: string;
        hint: string | null;
        explanation: string | null;
      };
    }>;
  }>;
};

async function api(
  path: string,
  token?: string,
  tenant?: string,
  init?: RequestInit,
): Promise<{ response: Response; body: ApiBody }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { "x-tenant-id": tenant } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as ApiBody;
  return { response, body };
}

async function preflight(): Promise<{
  templates: PackTemplate[];
  firstTemplateVersionId: string;
  firstTitle: string;
  firstQuestionVersionIds: string[];
}> {
  const templates: PackTemplate[] = await prisma.exerciseTemplate.findMany({
    where: { title: { startsWith: PACK_PREFIX }, status: "PUBLISHED", deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      skillId: true,
      config: true,
      versions: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          contents: {
            select: { contentVersion: { select: { title: true, body: true, status: true } } },
          },
          questions: {
            orderBy: { position: "asc" },
            select: {
              position: true,
              questionVersion: {
                select: { id: true, status: true, hint: true, explanation: true },
              },
            },
          },
        },
      },
    },
  });
  if (templates.length !== curriculumPackContentCount)
    throw new Error(`8G8 pack yok veya eksik: ${templates.length}/${curriculumPackContentCount}`);
  const versions = templates.flatMap((template) => template.versions);
  assert.equal(
    versions.length,
    curriculumPackContentCount,
    "Her içerik için yayınlı template version gerekli",
  );
  assert.equal(
    new Set(templates.map((template) => template.skillId)).size,
    3,
    "Pack üç ayrı skill kullanmalı",
  );
  assert.equal(
    versions.reduce((total, version) => total + version.questions.length, 0),
    curriculumPackQuestionCount,
  );
  for (const version of versions) {
    assert.equal(version.contents.length, 1, "Her pack template bir reading content taşımalı");
    assert.equal(version.contents[0].contentVersion.status, "PUBLISHED");
    for (const question of version.questions) {
      assert.equal(question.questionVersion.status, "PUBLISHED");
      assert.ok(question.questionVersion.hint, "Hint eksik");
      assert.ok(question.questionVersion.explanation, "Explanation eksik");
    }
  }
  console.log(
    `1) PACK DB PREFLIGHT PASS: contents=${templates.length} questions=${curriculumPackQuestionCount} skills=3`,
  );
  return {
    templates,
    firstTemplateVersionId: versions[0].id,
    firstTitle: versions[0].contents[0].contentVersion.title,
    firstQuestionVersionIds: versions[0].questions.map((question) => question.questionVersion.id),
  };
}

async function createStudent(): Promise<{ email: string; token: string }> {
  const email = `8g8-pack-${Date.now()}@example.com`;
  const signup = await api("/auth/signup", undefined, undefined, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PASSWORD,
      displayName: "8G8 Pack Öğrencisi",
      platform: "WEB",
    }),
  });
  userId = signup.body.data?.user?.id ?? "";
  tenantId = signup.body.data?.tenantContext?.tenantId ?? "";
  assert.equal(
    signup.response.status,
    201,
    `Öğrenci signup başarısız: status=${signup.response.status}`,
  );
  assert.ok(userId && tenantId, "Personal student context oluşturulmadı");
  const login = await api("/auth/login", undefined, undefined, {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, platform: "WEB" }),
  });
  assert.equal(login.response.status, 200, "Öğrenci login başarısız");
  return {
    email,
    token: login.body.data?.tokens?.accessToken ?? login.body.data?.accessToken ?? "",
  };
}

async function completeOnboarding(page: Page): Promise<void> {
  await page.waitForSelector("#page-onboarding:not(.hidden)", { timeout: E2E_TIMEOUT_MS });
  await page.fill("#onboard-displayName", "8G8 Pack Öğrencisi");
  await page.fill("#onboard-birthYear", "2010");
  await page.click("#onboarding-next");
  await page.waitForSelector("#onboarding-step-2:not(.hidden)", { timeout: E2E_TIMEOUT_MS });
  await page.selectOption("#onboard-level", { index: 1 });
  await page.click('[data-goal="COMPREHENSION"]');
  await page.click("#onboarding-next");
  await page.waitForSelector("#onboarding-step-3:not(.hidden)", { timeout: E2E_TIMEOUT_MS });
  await page.check("#onboard-consent-terms");
  await page.check("#onboard-consent-data");
  await page.check("#onboard-consent-parental");
  const completeResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/student/onboarding/complete") &&
      response.request().method() === "POST",
    { timeout: E2E_TIMEOUT_MS },
  );
  await page.click("#onboarding-complete");
  const completeResponse = await completeResponsePromise;
  assert.ok(
    completeResponse.status() >= 200 && completeResponse.status() < 300,
    `Onboarding complete başarısız: status=${completeResponse.status()}`,
  );
  const completeBody = (await completeResponse.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { completed?: boolean };
  };
  assert.equal(completeBody.success, true, "Onboarding complete success=true dönmedi");
  assert.equal(completeBody.data?.completed, true, "Onboarding complete completed=true dönmedi");
  await page.waitForSelector("#onboarding-ready:not(.hidden)", { timeout: E2E_TIMEOUT_MS });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
}

async function runStudentFlow(
  email: string,
  token: string,
  firstTemplateVersionId: string,
  firstTitle: string,
  firstQuestionVersionIds: string[],
): Promise<void> {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.fill("#login-email", email);
  await page.fill("#login-password", PASSWORD);
  await page.click("#login-submit");
  await completeOnboarding(page);
  const packLabels = await page.locator("#learning-path .path-node").allTextContents();
  for (const content of FIRST_REAL_CURRICULUM_PACK.contents)
    assert.ok(
      packLabels.some((label) => label.includes(content.title)),
      `${content.title} Learning Path'te yok`,
    );
  console.log(
    `2) STUDENT LEARNING PATH PASS: packNodes=${FIRST_REAL_CURRICULUM_PACK.contents.length}`,
  );

  const node = page.locator(`[data-template="${firstTemplateVersionId}"]`);
  await node.waitFor({ state: "visible", timeout: 10000 });
  await node.click();
  await page.waitForSelector("#page-exercise:not(.hidden)", { timeout: 10000 });
  await page.waitForSelector("#student-reading-card", { state: "visible", timeout: 10000 });
  assert.equal(await page.textContent("#student-reading-heading"), firstTitle);
  const session = await prisma.exerciseSession.findFirst({
    where: { studentId: userId },
    orderBy: { startedAt: "desc" },
    select: { id: true, templateVersionId: true },
  });
  assert.ok(session, "Pack exercise session oluşmadı");
  sessionId = session.id;
  assert.equal(session.templateVersionId, firstTemplateVersionId);
  const questionResponse = await api(`/student/sessions/${sessionId}/questions`, token, tenantId);
  assert.equal(questionResponse.response.status, 200);
  assert.equal(questionResponse.body.data.questions.length, 4);
  const serialized = JSON.stringify(questionResponse.body.data);
  assert.equal(
    serialized.includes("correctAnswer"),
    false,
    "Student response correctAnswer sızdırdı",
  );
  assert.equal(serialized.includes('"answer"'), false, "Student response answer sızdırdı");
  const questions = questionResponse.body.data?.questions ?? [];
  assert.ok(questions.every((question) => question.hint && question.explanation));
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.viewport + 1 &&
      dimensions.bodyScrollWidth <= dimensions.viewport + 1,
    `Mobil taşma: ${JSON.stringify(dimensions)}`,
  );
  assert.deepEqual(pageErrors, [], `Browser pageerror: ${pageErrors.join(" | ")}`);
  assert.deepEqual(consoleErrors, [], `Browser console error: ${consoleErrors.join(" | ")}`);
  console.log(
    `3) STUDENT EXERCISE + READING + QUESTION PRIVACY PASS: questions=4 mobile=${JSON.stringify(dimensions)}`,
  );

  assert.equal(firstQuestionVersionIds.length, 4, "İlk pack template dört soru taşımalı");
  const firstContent = FIRST_REAL_CURRICULUM_PACK.contents[0];
  for (const [index, questionVersionId] of firstQuestionVersionIds.entries()) {
    const correctAnswer = firstContent.questions[index]?.correctAnswer as {
      answer?: unknown;
      correctOptionIds?: string[];
    };
    const expectedAnswer =
      correctAnswer?.answer ??
      (correctAnswer?.correctOptionIds ? [...correctAnswer.correctOptionIds] : undefined);
    assert.notEqual(expectedAnswer, undefined, `Pack answer eksik: question=${index + 1}`);
    const attempt = await api(`/admin/questions/${questionVersionId}/attempts`, token, tenantId, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        answer: expectedAnswer,
        clientAttemptId: `8g8-pack-${sessionId}-${index + 1}`,
      }),
    });
    assert.equal(attempt.response.status, 200, `Pack attempt başarısız: question=${index + 1}`);
  }
  const completed = await api(`/admin/exercise-sessions/${sessionId}/complete`, token, tenantId, {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(completed.response.status, 200, "Pack exercise completion başarısız");

  let progress = await api("/student/progress", token, tenantId);
  for (let retry = 0; retry < 30; retry += 1) {
    if (progress.body.data?.summary?.sessionCount === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
    progress = await api("/student/progress", token, tenantId);
  }
  assert.equal(progress.response.status, 200, "Pack progress endpoint başarısız");
  assert.equal(progress.body.data?.summary?.sessionCount, 1, "Pack progress session sayısı yanlış");
  assert.equal(progress.body.data?.summary?.attemptCount, 4, "Pack progress attempt sayısı yanlış");

  const gamification = await api("/student/gamification", token, tenantId);
  assert.equal(gamification.response.status, 200, "Pack gamification endpoint başarısız");
  assert.ok((gamification.body.data?.totalPoints ?? 0) > 0, "Pack XP üretilmedi");
  assert.ok((gamification.body.data?.currentDays ?? 0) >= 1, "Pack streak üretilmedi");

  const review = await api("/student/review", token, tenantId);
  assert.equal(review.response.status, 200, "Pack review endpoint başarısız");
  assert.equal(review.body.data?.cooldownHours, 24, "Review cooldown sözleşmesi değişti");
  console.log(
    `4) STUDENT ANSWER + COMPLETION + PROGRESS + XP/STREAK + REVIEW PASS: attempts=4 xp=${gamification.body.data?.totalPoints} streak=${gamification.body.data?.currentDays} review=200`,
  );
}

async function cleanup(): Promise<void> {
  if (!userId && !tenantId) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    if (userId) {
      await tx.attempt.deleteMany({ where: { session: { studentId: userId } } });
      await tx.studentProgress.deleteMany({ where: { studentId: userId } });
      await tx.pointEvent.deleteMany({ where: { studentId: userId } });
      await tx.studentBadge.deleteMany({ where: { studentId: userId } });
      await tx.studentStreak.deleteMany({ where: { studentId: userId } });
      await tx.consent.deleteMany({ where: { userId } });
      await tx.exerciseSession.deleteMany({ where: { studentId: userId } });
      await tx.studentProfile.deleteMany({ where: { studentId: userId } });
      await tx.membership.deleteMany({ where: { userId } });
      await tx.authSession.deleteMany({ where: { userId } });
      await tx.authIdentity.deleteMany({ where: { userId } });
      await tx.user.deleteMany({ where: { id: userId } });
    }
    if (tenantId) await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
  const [users, tenants, sessions] = await Promise.all([
    prisma.user.count({ where: { id: userId } }),
    prisma.tenant.count({ where: { id: tenantId } }),
    prisma.exerciseSession.count({ where: { id: sessionId } }),
  ]);
  assert.deepEqual([users, tenants, sessions], [0, 0, 0]);
  console.log("5) TARGETED STUDENT FIXTURE CLEANUP PASS: pack content untouched");
}

async function main(): Promise<void> {
  await prisma.$connect();
  try {
    const preflightResult = await preflight();
    const student = await createStudent();
    await runStudentFlow(
      student.email,
      student.token,
      preflightResult.firstTemplateVersionId,
      preflightResult.firstTitle,
      preflightResult.firstQuestionVersionIds,
    );
  } finally {
    await browser?.close();
    await cleanup();
    await prisma.$disconnect();
  }
  console.log("✅ CURRICULUM PACK E2E PASS");
}

main().catch((error) => {
  console.error(
    `CURRICULUM PACK E2E ÇALIŞTIRILAMADI: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
});
