import "dotenv/config";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PASSWORD = "browser-individual-pass-123!";
const EMAIL_A = "browser-stage8a-a@example.com";
const EMAIL_B = "browser-stage8a-b@example.com";
const ORG_ID = "8ab00000-0000-7000-8000-0000000000a1";
const CONTENT_ID = "8ab00000-0000-7000-8000-0000000000b1";
const CONTENT_VERSION_ID = "8ab00000-0000-7000-8000-0000000000b2";
const QUESTION_ID = "8ab00000-0000-7000-8000-0000000000c1";
const QUESTION_VERSION_ID = "8ab00000-0000-7000-8000-0000000000c2";
const TEMPLATE_ID = "8ab00000-0000-7000-8000-0000000000d1";
const TEMPLATE_VERSION_ID = "8ab00000-0000-7000-8000-0000000000d2";
const SKILL_ID = "8ab00000-0000-7000-8000-0000000000e1";
const prisma = new PrismaClient();

let userAId = "";
let userBId = "";
let personalTenantId = "";
let personalTenantBId = "";
let sessionId = "";
let attemptId = "";
let createdBadgeId: string | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function testUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAIL_A, EMAIL_B] } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function cleanup(): Promise<void> {
  const userIds = await testUserIds();
  const memberships = await prisma.membership.findMany({
    where: { OR: [{ userId: { in: userIds } }, { tenantId: ORG_ID }] },
    select: { tenantId: true },
  });
  const tenantIds = [
    ORG_ID,
    ...memberships.map((membership) => membership.tenantId),
    personalTenantId,
    personalTenantBId,
  ].filter(Boolean);

  await prisma.studentBadge.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.pointEvent.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentStreak.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentProgress.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assessmentResult.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.attempt.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.sessionContentVersion.deleteMany({
    where: { session: { studentId: { in: userIds } } },
  });
  await prisma.exerciseSession.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentProfile.deleteMany({ where: { studentId: { in: userIds } } });
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

async function seed(): Promise<void> {
  await cleanup();
  await prisma.tenant.create({
    data: { id: ORG_ID, type: "ORGANIZATION", name: "8A Browser Org" },
  });
  await prisma.skill.create({
    data: { id: SKILL_ID, code: "BROWSER8A", name: "Browser 8A", category: "COMPREHENSION" },
  });
  await prisma.content.create({
    data: {
      id: CONTENT_ID,
      type: "PASSAGE",
      title: "Browser 8A global içerik",
      difficulty: 1,
      status: "PUBLISHED",
    },
  });
  await prisma.contentVersion.create({
    data: {
      id: CONTENT_VERSION_ID,
      contentId: CONTENT_ID,
      version: 1,
      title: "Browser 8A v1",
      body: "Bireysel öğrenci egzersiz içeriği.",
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
      prompt: "Bireysel hesap kurum gerektirmez.",
      correctAnswer: { type: "TRUE_FALSE", answer: true },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.exerciseTemplate.create({
    data: {
      id: TEMPLATE_ID,
      contentId: CONTENT_ID,
      title: "Browser 8A egzersiz",
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
  if (!(await prisma.badge.findUnique({ where: { code: "FIRST_EXERCISE" } }))) {
    createdBadgeId = (
      await prisma.badge.create({ data: { code: "FIRST_EXERCISE", name: "İlk Egzersiz" } })
    ).id;
  }
}

async function orphanCount(): Promise<number> {
  const userIds = [...new Set([...(await testUserIds()), userAId, userBId].filter(Boolean))];
  const tenantIds = [personalTenantId, personalTenantBId].filter(Boolean);
  const counts = await Promise.all([
    prisma.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B] } } }),
    prisma.tenant.count({ where: { id: { in: [...tenantIds, ORG_ID] } } }),
    prisma.membership.count({ where: { OR: [{ userId: { in: userIds } }, { tenantId: ORG_ID }] } }),
    prisma.studentProfile.count({ where: { studentId: { in: userIds } } }),
    prisma.exerciseSession.count({ where: { studentId: { in: userIds } } }),
    prisma.attempt.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.studentProgress.count({ where: { studentId: { in: userIds } } }),
    prisma.pointEvent.count({ where: { studentId: { in: userIds } } }),
    prisma.studentBadge.count({ where: { studentId: { in: userIds } } }),
    prisma.studentStreak.count({ where: { studentId: { in: userIds } } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

async function main(): Promise<void> {
  const requests: string[] = [];
  const responses: Array<{ path: string; status: number }> = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    await prisma.$connect();
    await seed();
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROME,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("request", (request) => {
      if (/auth|exercise-sessions|attempts|progress|gamification/.test(request.url())) {
        requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });
    page.on("response", (response) => {
      if (/auth|exercise-sessions|attempts|progress|gamification/.test(response.url())) {
        responses.push({ path: new URL(response.url()).pathname, status: response.status() });
      }
    });

    console.log("[1/20] Signup UI");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#show-signup-btn").click();
    await page.locator("#signup-display-name").fill("Browser Ada");
    await page.locator("#signup-email").fill(EMAIL_A);
    await page.locator("#signup-password").fill(PASSWORD);
    const signupResponse = page.waitForResponse(
      (response) => response.url().endsWith("/auth/signup") && response.status() === 201,
    );
    await page.locator("#signup-submit").click();
    await signupResponse;

    console.log("[2/20] Dashboard/login state");
    await page.locator("#view-app").waitFor({ state: "visible" });
    assert((await page.locator("#topbar-tenant").textContent()) === "Kişisel", "Kişisel UI yok");

    console.log("[3/20] Personal context DB");
    const userA = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL_A } });
    userAId = userA.id;
    personalTenantId = (
      await prisma.membership.findFirstOrThrow({
        where: { userId: userAId, role: "STUDENT", tenant: { type: "INDIVIDUAL" } },
        select: { tenantId: true },
      })
    ).tenantId;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: personalTenantId } });
    assert(tenant.type === "INDIVIDUAL", "Tenant INDIVIDUAL değil");

    console.log("[4/20] Membership DB");
    const membership = await prisma.membership.findFirstOrThrow({
      where: { tenantId: personalTenantId, userId: userAId, role: "STUDENT", status: "ACTIVE" },
    });
    assert(Boolean(membership.startedAt), "ACTIVE membership startedAt yok");

    console.log("[5/20] StudentProfile DB");
    await prisma.studentProfile.findUniqueOrThrow({
      where: { tenantId_studentId: { tenantId: personalTenantId, studentId: userAId } },
    });

    console.log("[6/20] Exercise access");
    const optionsStatus = await page.evaluate(async () => {
      const response = await fetch("/admin/exercise-options", {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return response.status;
    });
    assert(optionsStatus === 200, `Exercise access ${optionsStatus}`);

    console.log("[7/20] Session creation");
    const session = await page.evaluate(
      async ({ studentId, templateVersionId }) => {
        const response = await fetch("/admin/exercise-sessions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            studentId,
            templateVersionId,
            clientSessionId: "browser-stage8a-session",
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { studentId: userAId, templateVersionId: TEMPLATE_VERSION_ID },
    );
    assert(session.status === 200, `Session ${session.status}`);
    sessionId = session.body.data.id;

    console.log("[8/20] Attempt");
    const attempt = await page.evaluate(
      async ({ questionVersionId, exerciseSessionId }) => {
        const response = await fetch(`/admin/questions/${questionVersionId}/attempts`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sessionId: exerciseSessionId,
            answer: true,
            clientAttemptId: "browser-stage8a-attempt",
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { questionVersionId: QUESTION_VERSION_ID, exerciseSessionId: sessionId },
    );
    assert(attempt.status === 200 && attempt.body.data.isCorrect === true, "Attempt başarısız");
    attemptId = attempt.body.data.id;

    console.log("[9/20] Complete");
    const completeStatus = await page.evaluate(async (id) => {
      const response = await fetch(`/admin/exercise-sessions/${id}/complete`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: "{}",
      });
      return response.status;
    }, sessionId);
    assert(completeStatus === 200, `Complete ${completeStatus}`);

    console.log("[10/20] Progress");
    let progressStatus = 0;
    for (let retry = 0; retry < 30; retry += 1) {
      progressStatus = await page.evaluate(async () => {
        const response = await fetch("/student/progress", {
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          },
        });
        const body = await response.json();
        return response.ok && body.data.items.length > 0 ? response.status : 0;
      });
      if (progressStatus === 200) break;
      await page.waitForTimeout(100);
    }
    assert(progressStatus === 200, "Progress oluşmadı");

    console.log("[11/20] Gamification");
    const gamification = await page.evaluate(async () => {
      const response = await fetch("/student/gamification", {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: response.status, body: await response.json() };
    });
    assert(gamification.status === 200 && gamification.body.data.totalPoints >= 80, "Gamification");

    console.log("[12/20] Learning DB tenant doğrulama");
    assert(
      (await prisma.exerciseSession.findUniqueOrThrow({ where: { id: sessionId } })).tenantId ===
        personalTenantId,
      "Session yanlış tenant",
    );
    assert(
      (await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } })).tenantId ===
        personalTenantId,
      "Attempt yanlış tenant",
    );

    console.log("[13/20] Logout");
    await page.locator("#logout-btn").click();
    await page.locator("#view-login").waitFor({ state: "visible" });

    console.log("[14/20] Login again");
    await page.locator("#login-email").fill(EMAIL_A);
    await page.locator("#login-password").fill(PASSWORD);
    const loginResponse = page.waitForResponse(
      (response) => response.url().endsWith("/auth/login") && response.status() === 200,
    );
    await page.locator("#login-submit").click();
    await loginResponse;
    await page.locator("#view-app").waitFor({ state: "visible" });

    console.log("[15/20] Personal context persists");
    assert(
      localStorageValue(await page.evaluate(() => localStorage.getItem("oku.tenantId"))) ===
        personalTenantId,
      "Personal context kalmadı",
    );

    console.log("[16/20] Organization membership fixture");
    await prisma.membership.create({
      data: { tenantId: ORG_ID, userId: userAId, role: "STUDENT", status: "ACTIVE" },
    });
    assert(
      (await prisma.membership.count({ where: { userId: userAId, status: "ACTIVE" } })) === 2,
      "Org membership yok",
    );

    console.log("[17/20] Personal context still default");
    const defaultContext = await page.evaluate(
      async ({ email, password }) => {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        return (await response.json()).data.tenantContext.tenantId;
      },
      { email: EMAIL_A, password: PASSWORD },
    );
    assert(defaultContext === personalTenantId, "Default context personal değil");

    console.log("[18/20] Organization context access");
    const organizationContext = await page.evaluate(
      async ({ email, password, tenantId }) => {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, tenantId }),
        });
        return { status: response.status, body: await response.json() };
      },
      { email: EMAIL_A, password: PASSWORD, tenantId: ORG_ID },
    );
    assert(
      organizationContext.status === 200 &&
        organizationContext.body.data.tenantContext.tenantId === ORG_ID,
      "Organization context açılamadı",
    );

    console.log("[19/20] Cross-user rejection + HTTP evidence");
    const crossUser = await page.evaluate(
      async ({ email, password, foreignSessionId }) => {
        const signup = await fetch("/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, displayName: "Browser Bora" }),
        });
        const signupBody = await signup.json();
        const response = await fetch(`/admin/exercise-sessions/${foreignSessionId}`, {
          headers: {
            authorization: `Bearer ${signupBody.data.tokens.accessToken}`,
            "x-tenant-id": signupBody.data.tenantContext.tenantId,
          },
        });
        return { signupStatus: signup.status, crossStatus: response.status };
      },
      { email: EMAIL_B, password: PASSWORD, foreignSessionId: sessionId },
    );
    assert(crossUser.signupStatus === 201 && crossUser.crossStatus === 403, "Cross-user açık");
    userBId = (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL_B } })).id;
    personalTenantBId = (
      await prisma.membership.findFirstOrThrow({
        where: { userId: userBId, tenant: { type: "INDIVIDUAL" } },
        select: { tenantId: true },
      })
    ).tenantId;
    assert(Boolean(userBId), "İkinci user DB'de yok");
    assert(requests.includes("POST /auth/signup"), "Signup request dinlenmedi");
    assert(
      responses.some((item) => item.path.endsWith("/complete") && item.status === 200),
      "Complete response dinlenmedi",
    );
    assert(
      responses.some((item) => item.path.includes("exercise-sessions") && item.status === 403),
      "Cross-user response dinlenmedi",
    );

    console.log("[20/20] Cleanup + orphan validation");
    await browser.close();
    browser = null;
    await cleanup();
    assert((await orphanCount()) === 0, "Cleanup sonrası orphan bulundu");
    console.log("AŞAMA 8A INDIVIDUAL ACCOUNT E2E: PASS");
  } finally {
    if (browser) await browser.close();
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
  }
}

function localStorageValue(value: string | null): string {
  return value ?? "";
}

main().catch((error) => {
  console.error("AŞAMA 8A INDIVIDUAL ACCOUNT E2E: FAIL", error);
  process.exitCode = 1;
});
