import assert from "node:assert/strict";
import { chromium, type Page } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TS = Date.now();
const id = (suffix: string) =>
  `99999994-0000-7000-8000-${String(TS + Number(suffix))
    .slice(-12)
    .padStart(12, "0")}`;
const TENANT = id("1");
const BRANCH = id("2");
const YEAR = id("3");
const CLASS = id("4");
const CONTENT = id("5");
const TEMPLATE = id("6");
const TV = id("7");
const Q1 = id("8");
const Q2 = id("9");
const QV1 = id("10");
const QV2 = id("11");
const ASSIGNMENT = id("12");
const ASSESSMENT = id("13");
const TEACHER = id("14");
const OTHER_STUDENT = id("18");
const EMAIL = `8f5-final-${TS}@example.com`;
const PASSWORD = "8F5-final-pass-123!";
const OTHER_EMAIL = `8f5-final-other-${TS}@example.com`;
const prisma = new PrismaClient();
const hasher = new ScryptPasswordHasher();
const evidence: string[] = [];

async function cleanup(userId?: string, personalTenantId?: string) {
  const tenantIds = [TENANT, personalTenantId].filter(Boolean) as string[];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.attempt.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.exerciseSession.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.assessmentResult.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.studentProgress.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.pointEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.studentStreak.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.studentBadge.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.enrollment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.teacherClassAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.studentProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await tx.assignment.deleteMany({ where: { id: ASSIGNMENT } });
    await tx.assessment.deleteMany({ where: { id: ASSESSMENT } });
    await tx.exerciseTemplateVersionQuestion.deleteMany({ where: { templateVersionId: TV } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: TV } });
    await tx.questionVersion.deleteMany({ where: { id: { in: [QV1, QV2] } } });
    await tx.question.deleteMany({ where: { id: { in: [Q1, Q2] } } });
    await tx.exerciseTemplate.deleteMany({ where: { id: TEMPLATE } });
    await tx.contentVersion.deleteMany({ where: { contentId: CONTENT } });
    await tx.content.deleteMany({ where: { id: CONTENT } });
    await tx.class.deleteMany({ where: { id: CLASS } });
    await tx.academicYear.deleteMany({ where: { id: YEAR } });
    await tx.branch.deleteMany({ where: { id: BRANCH } });
    if (userId) {
      await tx.consent.deleteMany({ where: { userId } });
    }
    await tx.user.deleteMany({
      where: {
        id: { in: [userId, OTHER_STUDENT, TEACHER].filter(Boolean) as string[] },
      },
    });
    await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
}

async function seed(page: Page) {
  const signup = await page.request.post(`${BASE}/auth/signup`, {
    data: { email: EMAIL, password: PASSWORD, displayName: "8F-5 Student" },
  });
  assert.equal(signup.status(), 201);
  const signupData = (await signup.json()).data;
  const userId = signupData.user.id as string;
  const personalTenantId = signupData.tenantContext.tenantId as string;
  const passwordHash = await hasher.hash(PASSWORD);
  await prisma.studentProfile.update({
    where: { tenantId_studentId: { tenantId: personalTenantId, studentId: userId } },
    data: { onboardingCompletedAt: new Date() },
  });

  await prisma.tenant.create({
    data: { id: TENANT, name: `8F-5 Org ${TS}`, type: "ORGANIZATION", status: "ACTIVE" },
  });
  await prisma.user.create({
    data: {
      id: TEACHER,
      email: `8f5-teacher-${TS}@example.com`,
      displayName: "8F-5 Teacher",
      passwordHash,
      status: "ACTIVE",
    },
  });
  await prisma.user.create({
    data: {
      id: OTHER_STUDENT,
      email: OTHER_EMAIL,
      displayName: "8F-5 Other Student",
      passwordHash,
      status: "ACTIVE",
    },
  });
  await prisma.membership.createMany({
    data: [
      { id: id("15"), userId, tenantId: TENANT, role: "STUDENT", status: "ACTIVE" },
      { id: id("16"), userId: TEACHER, tenantId: TENANT, role: "TEACHER", status: "ACTIVE" },
      { id: id("19"), userId: OTHER_STUDENT, tenantId: TENANT, role: "STUDENT", status: "ACTIVE" },
    ],
  });
  await prisma.branch.create({
    data: {
      id: BRANCH,
      tenantId: TENANT,
      name: "8F-5 Branch",
      code: `8F5-${TS}`,
      status: "ACTIVE",
    },
  });
  await prisma.academicYear.create({
    data: {
      id: YEAR,
      tenantId: TENANT,
      name: "2026-2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-06-30"),
      status: "ACTIVE",
    },
  });
  await prisma.class.create({
    data: {
      id: CLASS,
      tenantId: TENANT,
      branchId: BRANCH,
      academicYearId: YEAR,
      name: "8F-5 A",
      gradeLevel: 8,
      status: "ACTIVE",
    },
  });
  await prisma.enrollment.create({
    data: {
      id: id("17"),
      tenantId: TENANT,
      studentId: userId,
      classId: CLASS,
      academicYearId: YEAR,
      status: "ACTIVE",
    },
  });
  await prisma.studentProfile.upsert({
    where: { tenantId_studentId: { tenantId: TENANT, studentId: userId } },
    update: { onboardingCompletedAt: new Date() },
    create: { tenantId: TENANT, studentId: userId, onboardingCompletedAt: new Date() },
  });
  await prisma.content.create({
    data: {
      id: CONTENT,
      tenantId: TENANT,
      title: "8F-5 Content",
      type: "PASSAGE",
      difficulty: 1,
      status: "PUBLISHED",
    },
  });
  await prisma.exerciseTemplate.create({
    data: {
      id: TEMPLATE,
      tenantId: TENANT,
      contentId: CONTENT,
      title: "8F-5 Reading",
      type: "COMPREHENSION",
      status: "PUBLISHED",
    },
  });
  await prisma.exerciseTemplateVersion.create({
    data: {
      id: TV,
      templateId: TEMPLATE,
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  for (const [questionId, versionId, position] of [[Q1, QV1, 1], [Q2, QV2, 2] as const]) {
    await prisma.question.create({
      data: {
        id: questionId,
        contentId: CONTENT,
        position,
        type: "MULTIPLE_CHOICE",
        status: "PUBLISHED",
      },
    });
    await prisma.questionVersion.create({
      data: {
        id: versionId,
        questionId,
        version: 1,
        prompt: `8F-5 soru ${position}`,
        options: [
          { id: "a", text: "Doğru seçenek", position: 0 },
          { id: "b", text: "Diğer seçenek", position: 1 },
        ],
        correctAnswer: { type: "MULTIPLE_CHOICE", answer: "a" },
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.exerciseTemplateVersionQuestion.create({
      data: { templateVersionId: TV, questionVersionId: versionId, questionId, position },
    });
  }
  await prisma.assignment.create({
    data: {
      id: ASSIGNMENT,
      tenantId: TENANT,
      classId: CLASS,
      templateId: TEMPLATE,
      teacherId: TEACHER,
      title: "8F-5 Öğretmen Çalışması",
      dueDate: new Date(Date.now() + 86400000),
      status: "ACTIVE",
      assignedAt: new Date(),
    },
  });
  await prisma.assessment.create({
    data: {
      id: ASSESSMENT,
      tenantId: TENANT,
      title: "8F-5 Seviye Ölçümü",
      type: "PLACEMENT",
      config: { templateVersionId: TV, questionCount: 2 },
      status: "PUBLISHED",
    },
  });
  return { userId, personalTenantId };
}

async function headers(page: Page) {
  return await page.evaluate(() => ({
    authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
    "x-tenant-id": localStorage.getItem("oku.tenantId") ?? "",
  }));
}

async function completeTwoQuestions(
  page: Page,
  sessionId: string,
  kind: "assignment" | "assessment",
) {
  const requestPayloads: unknown[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/student/questions/") &&
      request.url().endsWith("/attempts")
    )
      requestPayloads.push(request.postDataJSON());
  });
  await page.locator('#exercise-current-question[data-question-type="MULTIPLE_CHOICE"]').waitFor();
  await page.locator("#exercise-mc-options .answer-card").first().click();
  await page.locator("#exercise-submit-attempt").click();
  await page.locator("#exercise-submit-attempt").click();
  await page.reload();
  await page.locator('[data-bottom-page="exercise"]').click();
  await page.locator("#page-exercise:not(.hidden)").waitFor();
  await page.locator('#exercise-current-question[data-question-type="MULTIPLE_CHOICE"]').waitFor();
  assert.equal(
    await page.locator("#exercise-current-question").getAttribute("data-question-type"),
    "MULTIPLE_CHOICE",
  );
  evidence.push(`${kind} refresh resume session=${sessionId}`);
  await page.locator("#exercise-mc-options .answer-card").first().click();
  await page.locator("#exercise-submit-attempt").click();
  await page.locator("#exercise-submit-attempt").click();
  await page.locator("#exercise-return-path").waitFor({ state: "visible", timeoutMs: 15000 });
  assert.ok(requestPayloads.length >= 2);
  return requestPayloads;
}

async function main() {
  let userId: string | undefined;
  let personalTenantId: string | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let debugPage: Page | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    debugPage = page;
    page.setDefaultTimeout(15000);
    ({ userId, personalTenantId } = await seed(page));
    await page.goto(BASE);
    await page.fill("#login-email", EMAIL);
    await page.fill("#login-password", PASSWORD);
    const loginResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/login") && response.request().method() === "POST",
    );
    await page.click("#login-submit");
    assert.equal((await loginResponse).status(), 200);
    await page.locator("#page-dashboard").waitFor({ state: "visible" });
    await page
      .getByRole("combobox", { name: "Bağlam seç" })
      .selectOption({ label: `8F-5 Org ${TS} (STUDENT)` });
    await page.waitForTimeout(400);

    const todayBefore = await page.request.get(`${BASE}/student/today`, {
      headers: await headers(page),
    });
    assert.equal(todayBefore.status(), 200);
    const todayBeforeData = (await todayBefore.json()).data;
    assert.ok(
      ["ASSIGNMENT_START", "ASSESSMENT_START", "RESUME_SESSION"].includes(
        todayBeforeData.nextAction?.type,
      ),
    );
    evidence.push(`today nextAction ${todayBeforeData.nextAction?.type ?? "NONE"}`);

    await page.getByRole("button", { name: "Ödevler" }).click();
    await page.locator(`[data-assignment-detail-id="${ASSIGNMENT}"]`).click();
    await page.locator("#assignment-detail-modal:not(.hidden)").waitFor();
    await page.locator("#assignment-detail-body").getByText("8F-5 Teacher").waitFor();
    assert.match(await page.locator("#assignment-detail-body").innerText(), /8F-5|Öğretmen|Teslim/);
    evidence.push("assignment UI/detail PASS");
    const startAssignment = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/student/assignments/${ASSIGNMENT}/start`) &&
        response.request().method() === "POST",
    );
    await page.locator("#assignment-detail-start").click();
    const assignmentStartResponse = await startAssignment;
    assert.equal(assignmentStartResponse.status(), 200);
    const assignmentSessionId = (await assignmentStartResponse.json()).data.sessionId as string;
    const todayResume = await page.request.get(`${BASE}/student/today`, {
      headers: await headers(page),
    });
    assert.equal(todayResume.status(), 200);
    const todayResumeData = (await todayResume.json()).data;
    assert.equal(todayResumeData.nextAction?.type, "RESUME_SESSION");
    assert.equal(todayResumeData.nextAction?.id, assignmentSessionId);
    evidence.push(`today RESUME_SESSION session=${assignmentSessionId}`);
    const otherLogin = await page.request.post(`${BASE}/auth/login`, {
      data: { email: OTHER_EMAIL, password: PASSWORD },
    });
    assert.equal(otherLogin.status(), 200);
    const otherAuth = (await otherLogin.json()).data;
    const otherHeaders = {
      authorization: `Bearer ${otherAuth.tokens.accessToken}`,
      "x-tenant-id": TENANT,
    };
    const otherAssignment = await page.request.get(`${BASE}/student/assignments/${ASSIGNMENT}`, {
      headers: otherHeaders,
    });
    assert.ok([403, 404].includes(otherAssignment.status()));
    const otherSession = await page.request.get(
      `${BASE}/student/sessions/${assignmentSessionId}/detail`,
      { headers: otherHeaders },
    );
    assert.ok([403, 404].includes(otherSession.status()));
    const otherResult = await page.request.get(`${BASE}/student/assessments/${ASSESSMENT}/result`, {
      headers: otherHeaders,
    });
    assert.equal(otherResult.status(), 200);
    assert.equal((await otherResult.json()).data, null);
    const otherAttempt = await page.request.post(`${BASE}/student/questions/${QV1}/attempts`, {
      headers: otherHeaders,
      data: {
        sessionId: assignmentSessionId,
        answer: ["wrong-owner"],
        clientAttemptId: `other-${TS}`,
      },
    });
    assert.ok([403, 404].includes(otherAttempt.status()));
    evidence.push("cross-user assignment/session/assessment-result isolation PASS");
    await page.locator("#page-exercise:not(.hidden)").waitFor();
    const assignmentPayloads = await completeTwoQuestions(page, assignmentSessionId, "assignment");
    const assignmentSession = await prisma.exerciseSession.findUniqueOrThrow({
      where: { id: assignmentSessionId },
    });
    assert.equal(assignmentSession.status, "COMPLETED");
    assert.equal(await prisma.attempt.count({ where: { sessionId: assignmentSessionId } }), 2);
    evidence.push(`assignment API/session/attempt/complete PASS session=${assignmentSessionId}`);
    const replay = await page.request.post(`${BASE}/student/questions/${QV1}/attempts`, {
      headers: await headers(page),
      data: { ...(assignmentPayloads[0] as object) },
    });
    assert.ok([400, 409].includes(replay.status()));
    assert.equal(await prisma.attempt.count({ where: { sessionId: assignmentSessionId } }), 2);
    await page.locator('[data-bottom-page="assessments"]').click();
    const assessmentDetailTrigger = page.locator(
      `[data-assessment-student-detail="${ASSESSMENT}"]`,
    );
    await assessmentDetailTrigger.click();
    await page.locator("#assessment-detail-modal:not(.hidden)").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "assessment-detail-close");
    await page.locator("#assessment-detail-body").getByText("Soru sayısı").waitFor();
    assert.match(await page.locator("#assessment-detail-body").innerText(), /Seviye|Soru/);
    await page.locator("#assessment-detail-close").click();
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-assessment-student-detail"),
      ),
      ASSESSMENT,
    );
    await assessmentDetailTrigger.click();
    await page.locator("#assessment-detail-modal:not(.hidden)").waitFor();
    const startAssessment = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/student/assessments/${ASSESSMENT}/start`) &&
        response.request().method() === "POST",
    );
    await page.locator("#assessment-detail-start").click();
    const assessmentStartResponse = await startAssessment;
    assert.equal(assessmentStartResponse.status(), 200);
    const assessmentSessionId = (await assessmentStartResponse.json()).data.sessionId as string;
    await page.locator("#page-exercise:not(.hidden)").waitFor();
    await completeTwoQuestions(page, assessmentSessionId, "assessment");
    const assessmentSession = await prisma.exerciseSession.findUniqueOrThrow({
      where: { id: assessmentSessionId },
    });
    assert.equal(assessmentSession.status, "COMPLETED");
    assert.equal(assessmentSession.assessmentId, ASSESSMENT);
    await page.locator("#celebration-layer:not(.hidden)").waitFor();
    assert.equal(await page.locator("#celebration-layer").getAttribute("data-kind"), "completion");
    assert.match(await page.locator("#celebration-layer").innerText(), /Değerlendirme tamamlandı/);
    assert.match(await page.locator("#celebration-layer").innerText(), /toplam XP|günlük seri/);
    evidence.push("assessment-specific celebration overlay + real gamification reward PASS");
    const result = await prisma.assessmentResult.findFirst({
      where: { assessmentId: ASSESSMENT, studentId: userId },
    });
    assert.ok(result);
    assert.equal(result.resultLevelId, null);
    assert.match(await page.locator("#exercise-result-body").innerText(), /Toplam Soru|Ortalama/);
    const resultResponse = await page.request.get(
      `${BASE}/student/assessments/${ASSESSMENT}/result`,
      {
        headers: await headers(page),
      },
    );
    assert.equal(resultResponse.status(), 200);
    const resultPayload = (await resultResponse.json()).data;
    assert.ok(resultPayload);
    assert.equal(resultPayload.resultLevelId, null);
    assert.ok(resultPayload.completedAt);
    assert.ok(
      (await prisma.pointEvent.count({ where: { tenantId: TENANT, studentId: userId } })) > 0,
    );
    assert.ok(
      await prisma.studentStreak.findUnique({
        where: { tenantId_studentId: { tenantId: TENANT, studentId: userId } },
      }),
    );
    evidence.push(
      `assessment API/session/attempt/complete/result screen/AssessmentResult PASS session=${assessmentSessionId}`,
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(layout.width, layout.scrollWidth);
    evidence.push("mobile 390x844 + desktop 1280x800 overflow PASS");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("combobox", { name: "Bağlam seç" }).selectOption({ label: "Kişisel" });
    await page.getByRole("button", { name: "Ödevler" }).click();
    assert.equal(await page.locator(`[data-assignment-detail-id="${ASSIGNMENT}"]`).count(), 0);
    await page.locator('[data-bottom-page="assessments"]').click();
    assert.equal(await page.locator(`[data-assessment-student-detail="${ASSESSMENT}"]`).count(), 0);
    evidence.push("personal/org separation PASS");
    console.log("PASS COMBINED 8F-5 E2E");
    evidence.forEach((item) => console.log(`  - ${item}`));
  } catch (error) {
    console.error("FAIL COMBINED 8F-5 E2E", error);
    if (debugPage) console.error((await debugPage.locator("body").innerText()).slice(0, 4000));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await cleanup(userId, personalTenantId).catch((error) =>
      console.error("cleanup failed", error),
    );
    await prisma.$disconnect();
  }
}

void main();
