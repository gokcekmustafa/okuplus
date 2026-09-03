import "dotenv/config";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PASSWORD = "browser-gamification-pass-123!";
const TENANT_A = "77777798-0000-7000-8000-0000000000a1";
const TENANT_B = "77777798-0000-7000-8000-0000000000b1";
const STUDENT_A = "77777798-0000-7000-8000-000000000001";
const STUDENT_B = "77777798-0000-7000-8000-000000000002";
const CONTENT = "77777798-0000-7000-8000-0000000000c1";
const QUESTION = "77777798-0000-7000-8000-0000000000d1";
const TEMPLATE = "77777798-0000-7000-8000-0000000000e1";
const TEMPLATE_VERSION = "77777798-0000-7000-8000-0000000000e2";
const EMAIL_A = "browser-gamification-a@example.com";
const EMAIL_B = "browser-gamification-b@example.com";
const prisma = new PrismaClient();

let questionVersionId = "";
let sessionId = "";
let attemptId = "";
let createdBadgeId: string | null = null;

async function cleanup() {
  const userIds = [STUDENT_A, STUDENT_B];
  const personal = await prisma.membership.findMany({
    where: { userId: { in: userIds }, tenant: { type: "INDIVIDUAL" } },
    select: { tenantId: true },
  });
  await prisma.studentBadge.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.pointEvent.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentStreak.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentProgress.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentProfile.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.consent.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
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
  await prisma.content.updateMany({ where: { id: CONTENT }, data: { currentVersionId: null } });
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
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [STUDENT_A, STUDENT_B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: personal.map((m) => m.tenantId) } } });
  if (createdBadgeId) {
    await prisma.badge.deleteMany({ where: { id: createdBadgeId } });
    createdBadgeId = null;
  }
}

async function seed() {
  await cleanup();
  const passwordHash = await new ScryptPasswordHasher().hash(PASSWORD);
  await prisma.tenant.createMany({
    data: [
      { id: TENANT_A, type: "ORGANIZATION", name: "Browser Gamification A" },
      { id: TENANT_B, type: "ORGANIZATION", name: "Browser Gamification B" },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: STUDENT_A, email: EMAIL_A, displayName: "Gamification Öğrenci A", passwordHash },
      { id: STUDENT_B, email: EMAIL_B, displayName: "Gamification Öğrenci B", passwordHash },
    ],
  });
  await prisma.membership.createMany({
    data: [
      { tenantId: TENANT_A, userId: STUDENT_A, role: "STUDENT", status: "ACTIVE" },
      { tenantId: TENANT_B, userId: STUDENT_B, role: "STUDENT", status: "ACTIVE" },
    ],
  });
  await prisma.content.create({
    data: {
      id: CONTENT,
      tenantId: TENANT_A,
      type: "PASSAGE",
      title: "Browser Gamification İçeriği",
      difficulty: 1,
      status: "PUBLISHED",
    },
  });
  const contentVersion = await prisma.contentVersion.create({
    data: {
      contentId: CONTENT,
      version: 1,
      title: "Gamification İçerik v1",
      body: "Doğru cevap için içerik.",
      wordCount: 4,
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
      prompt: "Oku+ okuma uygulamasıdır.",
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
      title: "Browser Gamification Egzersizi",
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
    data: { templateVersionId: TEMPLATE_VERSION, contentVersionId: contentVersion.id, position: 0 },
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
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function orphanCount() {
  const counts = await Promise.all([
    prisma.studentBadge.count({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } }),
    prisma.pointEvent.count({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } }),
    prisma.studentStreak.count({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } }),
    prisma.attempt.count({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } }),
    prisma.exerciseSession.count({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } }),
    prisma.user.count({ where: { id: { in: [STUDENT_A, STUDENT_B] } } }),
    prisma.tenant.count({ where: { id: { in: [TENANT_A, TENANT_B] } } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

async function main() {
  const requests: string[] = [];
  const responses: Array<{ url: string; status: number }> = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await prisma.$connect();
    await seed();
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROME,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("request", (request) => {
      if (/auth\/login|student\/gamification|exercise-sessions|\/attempts/.test(request.url())) {
        requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });
    page.on("response", (response) => {
      if (/auth\/login|student\/gamification|exercise-sessions|\/attempts/.test(response.url())) {
        responses.push({ url: new URL(response.url()).pathname, status: response.status() });
      }
    });

    console.log("[1/20] Öğrenci login");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#login-email").fill(EMAIL_A);
    await page.locator("#login-password").fill(PASSWORD);
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().endsWith("/auth/login") && response.status() === 200,
      ),
      page.locator("#login-form button[type=submit]").click(),
    ]);
    await page.locator("#view-app").waitFor({ state: "visible" });

    console.log("[2/20] DAILY_LOGIN HTTP/DB evidence");
    const loginEvent = await prisma.pointEvent.findFirst({
      where: { tenantId: TENANT_A, studentId: STUDENT_A, eventType: "DAILY_LOGIN" },
    });
    assert(
      loginEvent?.points === 20 && loginEvent.sourceType === "AUTH_LOGIN",
      "DAILY_LOGIN DB kanıtı yok",
    );

    console.log("[3/20] Gamification sayfası");
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/student/gamification") && response.status() === 200,
      ),
      page.locator('[data-page="badges"]').click(),
    ]);
    await page.locator("#gamification-total-points").waitFor({ state: "visible" });

    console.log("[4/20] İlk toplam puan UI");
    assert(
      (await page.locator("#gamification-total-points").textContent()) === "20",
      "UI toplam puan 20 değil",
    );

    console.log("[5/20] Exercise başlat");
    const sessionResult = await page.evaluate(
      async (params) => {
        const response = await fetch("/admin/exercise-sessions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            studentId: params.studentId,
            templateVersionId: params.templateVersionId,
            clientSessionId: "browser-gamification-session",
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { studentId: STUDENT_A, templateVersionId: TEMPLATE_VERSION },
    );
    assert(sessionResult.status === 200, `Session başlatma ${sessionResult.status}`);
    sessionId = sessionResult.body.data.id;

    console.log("[6/20] Correct answer");
    const attemptResult = await page.evaluate(
      async (params) => {
        const response = await fetch(`/admin/questions/${params.questionVersionId}/attempts`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sessionId: params.sessionId,
            answer: true,
            clientAttemptId: "browser-gamification-attempt",
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { questionVersionId, sessionId },
    );
    assert(
      attemptResult.status === 200 && attemptResult.body.data.isCorrect === true,
      "Doğru cevap başarısız",
    );
    attemptId = attemptResult.body.data.id;

    console.log("[7/20] CORRECT_ANSWER event");
    const correctEvent = await prisma.pointEvent.findFirst({
      where: { sourceType: "ATTEMPT", sourceId: attemptId },
    });
    assert(
      correctEvent?.eventType === "CORRECT_ANSWER" && correctEvent.points === 10,
      "CORRECT_ANSWER DB kanıtı yok",
    );

    console.log("[8/20] Exercise complete");
    const completeResult = await page.evaluate(async (id) => {
      const response = await fetch(`/admin/exercise-sessions/${id}/complete`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: "{}",
      });
      return { status: response.status, body: await response.json() };
    }, sessionId);
    assert(
      completeResult.status === 200 && completeResult.body.data.status === "COMPLETED",
      "Completion başarısız",
    );

    console.log("[9/20] EXERCISE_COMPLETED event");
    const completionEvent = await prisma.pointEvent.findFirst({
      where: { sourceType: "EXERCISE_SESSION", sourceId: sessionId },
    });
    assert(
      completionEvent?.eventType === "EXERCISE_COMPLETED" && completionEvent.points === 50,
      "Completion event yok",
    );

    console.log("[10/20] Streak");
    const streak = await prisma.studentStreak.findUnique({
      where: { tenantId_studentId: { tenantId: TENANT_A, studentId: STUDENT_A } },
    });
    assert(
      streak?.currentDays === 1 && streak.longestDays === 1,
      "Streak DB doğrulaması başarısız",
    );

    console.log("[11/20] Badge");
    const award = await prisma.studentBadge.findFirst({
      where: { tenantId: TENANT_A, studentId: STUDENT_A, badge: { code: "FIRST_EXERCISE" } },
      include: { badge: true },
    });
    assert(
      award?.sourceType === "EXERCISE_SESSION" && award.sourceId === sessionId,
      "Badge DB doğrulaması başarısız",
    );

    console.log("[12/20] UI verification");
    await page.locator('[data-page="dashboard"]').click();
    await page.locator('[data-page="badges"]').click();
    await page.waitForResponse(
      (response) => response.url().includes("/student/gamification") && response.status() === 200,
    );
    assert(
      (await page.locator("#gamification-total-points").textContent()) === "80",
      "UI toplam puan 80 değil",
    );
    assert(
      (await page.locator("#gamification-badges").textContent())?.includes("İlk Egzersiz"),
      "Badge UI'da yok",
    );
    assert(
      (await page.locator("#gamification-events").textContent())?.includes("Egzersiz tamamlandı"),
      "Event UI'da yok",
    );

    console.log("[13/20] Refresh");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#view-app").waitFor({ state: "visible" });
    await page.locator('[data-page="badges"]').click();
    await page.waitForResponse(
      (response) => response.url().includes("/student/gamification") && response.status() === 200,
    );
    assert(
      (await page.locator("#gamification-total-points").textContent()) === "80",
      "Refresh sonrası toplam puan bozuldu",
    );

    console.log("[14/20] Same-day duplicate login");
    const duplicateLogin = await page.evaluate(
      async (credentials) => {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(credentials),
        });
        return response.status;
      },
      { email: EMAIL_A, password: PASSWORD },
    );
    assert(duplicateLogin === 200, "Duplicate login HTTP başarısız");
    assert(
      (await prisma.pointEvent.count({
        where: { tenantId: TENANT_A, studentId: STUDENT_A, eventType: "DAILY_LOGIN" },
      })) === 1,
      "Duplicate DAILY_LOGIN oluştu",
    );

    console.log("[15/20] Duplicate completion");
    const duplicateCompletion = await page.evaluate(async (id) => {
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
    assert(duplicateCompletion === 400, `Duplicate completion status ${duplicateCompletion}`);
    assert(
      (await prisma.pointEvent.count({
        where: { tenantId: TENANT_A, studentId: STUDENT_A, eventType: "EXERCISE_COMPLETED" },
      })) === 1,
      "Duplicate completion point oluştu",
    );

    console.log("[16/20] DB validation");
    const dbEvents = await prisma.pointEvent.findMany({
      where: { tenantId: TENANT_A, studentId: STUDENT_A },
    });
    assert(
      dbEvents.length === 3 && dbEvents.reduce((sum, event) => sum + event.points, 0) === 80,
      "PointEvent toplamı hatalı",
    );
    assert(
      dbEvents.every((event) => event.dedupeKey && event.sourceType && event.sourceId),
      "PointEvent alanları eksik",
    );
    assert(Boolean(streak?.lastActivityDate), "StudentStreak lastActivityDate eksik");
    assert(Boolean(award?.awardedAt && award.badgeId), "StudentBadge alanları eksik");

    console.log("[17/20] Student ownership");
    const ownership = await page.evaluate(
      async (credentials) => {
        const loginResponse = await fetch("/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(credentials),
        });
        const loginBody = await loginResponse.json();
        const response = await fetch(
          `/student/gamification?studentId=${credentials.otherStudentId}`,
          {
            headers: {
              authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
              "x-tenant-id": credentials.tenantId,
            },
          },
        );
        return { status: response.status, body: await response.json() };
      },
      { email: EMAIL_B, password: PASSWORD, tenantId: TENANT_B, otherStudentId: STUDENT_A },
    );
    assert(
      ownership.status === 200 && ownership.body.data.totalPoints === 20,
      "Student ownership izolasyonu başarısız",
    );

    console.log("[18/20] Cross tenant");
    const crossTenant = await page.evaluate(async (tenantId) => {
      const response = await fetch("/student/gamification", {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": tenantId,
        },
      });
      return response.status;
    }, TENANT_B);
    assert(crossTenant === 403, `Cross tenant status ${crossTenant}`);

    console.log("[19/20] HTTP evidence");
    assert(
      requests.some((item) => item === "POST /auth/login"),
      "Login request dinlenmedi",
    );
    assert(
      responses.some((item) => item.url === "/student/gamification" && item.status === 200),
      "Gamification response dinlenmedi",
    );
    assert(
      responses.some((item) => item.url.endsWith("/attempts") && item.status === 200),
      "Attempt response dinlenmedi",
    );
    assert(
      responses.some((item) => item.url.endsWith("/complete") && item.status === 200),
      "Complete response dinlenmedi",
    );

    console.log("[20/20] Cleanup + orphan");
    await browser.close();
    browser = null;
    await cleanup();
    assert((await orphanCount()) === 0, "Cleanup sonrası orphan bulundu");
    console.log("AŞAMA 7B-1 GAMIFICATION E2E: PASS");
  } finally {
    if (browser) await browser.close();
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("AŞAMA 7B-1 GAMIFICATION E2E: FAIL", error);
  process.exitCode = 1;
});
