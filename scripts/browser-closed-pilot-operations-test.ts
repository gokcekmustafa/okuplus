import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PACK_PREFIX = "OKU+ 8G8 · ";
const PASSWORD = "8g11-closed-pilot-pass-123!";
const RUN_TAG = Date.now().toString(36);
const EMAIL = `8g11-pilot-${RUN_TAG}@example.com`;
const prisma = new PrismaClient();

let browser: Browser | undefined;
let page: Page | undefined;
let userId = "";
let tenantId = "";
let sessionId = "";

type BrowserApiResult = {
  status: number;
  body: {
    data?: {
      created?: boolean;
      completed?: boolean;
      user?: { id?: string };
      tenantContext?: { tenantId?: string };
      consents?: Array<{ type: string }>;
      bug?: { status?: string };
    };
    error?: { message?: string };
  };
};

function assertTestDatabase(): void {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error("DATABASE_URL yok; browser pilot QA hedefi doğrulanamadı");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  assert.equal(url.protocol, "postgresql:", "QA yalnızca PostgreSQL kabul eder");
  assert.equal(url.hostname, "127.0.0.1", "Pilot browser QA yalnızca local TEST host okur");
  assert.equal(url.port || "5432", "5432", "Pilot browser QA yalnızca TEST portunu okur");
  assert.equal(
    database,
    "oku_plus_test",
    "Pilot browser QA yalnızca oku_plus_test DB'sini kullanır",
  );
}

async function browserApi(
  path: string,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<BrowserApiResult> {
  if (!page) throw new Error("Browser page hazır değil");
  return page.evaluate(
    async ({ path: requestPath, method: requestMethod, body: requestBody }) => {
      const accessToken = localStorage.getItem("oku.accessToken");
      const tenant = localStorage.getItem("oku.tenantId");
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...(tenant ? { "x-tenant-id": tenant } : {}),
        },
        ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
    { path, method, body },
  );
}

async function preflight(): Promise<{ templateVersionId: string; questionVersionIds: string[] }> {
  const template = await prisma.exerciseTemplate.findFirst({
    where: { title: { startsWith: PACK_PREFIX }, status: "PUBLISHED", deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      versions: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          questions: {
            orderBy: { position: "asc" },
            select: { questionVersionId: true },
          },
        },
      },
    },
  });
  const version = template?.versions[0];
  if (!version) throw new Error("TEST 8G8 pack exercise bulunamadı");
  assert.equal(version.questions.length, 4, "Pilot exercise dört soruluk TEST pack olmalı");
  console.log(`1) TEST PREFLIGHT PASS: templateVersion=${version.id} questions=4`);
  return {
    templateVersionId: version.id,
    questionVersionIds: version.questions.map((question) => question.questionVersionId),
  };
}

async function completeOnboarding(): Promise<void> {
  if (!page) throw new Error("Browser page hazır değil");
  await page.waitForSelector("#page-onboarding:not(.hidden)", { timeout: 15000 });
  await page.fill("#onboard-displayName", "8G11 Kapalı Pilot Öğrencisi");
  await page.fill("#onboard-birthYear", "2010");
  await page.click("#onboarding-next");
  await page.waitForSelector("#onboarding-step-2:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#onboard-level", { index: 1 });
  await page.click('[data-goal="COMPREHENSION"]');
  await page.click("#onboarding-next");
  await page.waitForSelector("#onboarding-step-3:not(.hidden)", { timeout: 5000 });
  await page.check("#onboard-consent-terms");
  await page.check("#onboard-consent-data");
  await page.check("#onboard-consent-parental");
  await page.click("#onboarding-complete");
  await page.waitForSelector("#onboarding-ready:not(.hidden)", { timeout: 10000 });
  const onboardingState = await browserApi("/student/onboarding");
  assert.equal(onboardingState.status, 200);
  assert.equal(onboardingState.body.data?.completed, true);
  assert.deepEqual(
    new Set(onboardingState.body.data?.consents?.map((consent: { type: string }) => consent.type)),
    new Set(["TERMS_OF_SERVICE", "DATA_PROCESSING", "PARENTAL_CONSENT"]),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  const entitlements = await browserApi("/account/entitlements");
  assert.equal(entitlements.status, 200);
  assert.match(JSON.stringify(entitlements.body.data ?? {}), /PLAN_FREE/);
  const entitlementCard = page.locator("#entitlement-card");
  await entitlementCard.waitFor({ state: "visible", timeout: 10000 });
  const entitlementText = await entitlementCard.innerText();
  assert.match(entitlementText, /Ücretsiz/);
  assert.match(entitlementText, /3/);
  assert.match(entitlementText, /20/);
  const premiumCta = page.locator(
    '#entitlement-premium-cta[data-premium-action="OPEN_PREMIUM_INFO"]',
  );
  assert.equal(await premiumCta.isEnabled(), true, "Premium CTA bilgi ekranı için etkin olmalı");
  await premiumCta.click();
  await page.waitForSelector("#page-premium-info:not(.hidden)", { timeout: 5000 });
  const premiumInfoText = await page.locator("#page-premium-info").innerText();
  assert.match(premiumInfoText, /Premium nedir\?/);
  assert.match(premiumInfoText, /Günde 3 alıştırma/);
  assert.match(premiumInfoText, /günlük sınır olmaz/);
  assert.match(premiumInfoText, /Ödeme şu anda kullanıma açık değildir/);
  assert.doesNotMatch(premiumInfoText, /Stripe|PayTR|kart numarası|₺/i);
  await page.click("#premium-info-back");
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 5000 });
  await page.click('[data-bottom-page="settings"]');
  await page.waitForSelector("#page-settings:not(.hidden)", { timeout: 5000 });
  await page.click('#page-settings [data-premium-action="OPEN_PREMIUM_INFO"]');
  await page.waitForSelector("#page-premium-info:not(.hidden)", { timeout: 5000 });
  await page.click("#premium-info-back");
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 5000 });
  console.log("4) ENTITLEMENT + FREE PLAN + PREMIUM INFO CTA/PAGE PASS");
}

async function createAccountThroughBrowser(): Promise<void> {
  if (!page) throw new Error("Browser page hazır değil");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#show-signup-btn");
  await page.fill("#signup-display-name", "8G11 Kapalı Pilot Öğrencisi");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.click("#signup-submit");
  await page.waitForSelector("#page-onboarding:not(.hidden)", { timeout: 15000 });
  const me = await browserApi("/auth/me");
  assert.equal(me.status, 200);
  userId = String(me.body.data?.user?.id ?? "");
  tenantId = String(me.body.data?.tenantContext?.tenantId ?? "");
  assert.ok(userId && tenantId, "Signup personal tenant/session üretmedi");
  console.log("2) BROWSER SIGNUP + PERSONAL TENANT PASS");
  await completeOnboarding();
  console.log("3) CONSENT + ONBOARDING + GOAL + LEVEL PASS");
}

async function recordEvent(
  eventType: string,
  clientEventId: string,
  context?: { sessionId?: string; questionVersionId?: string },
): Promise<BrowserApiResult> {
  return browserApi("/student/pilot/events", "POST", {
    eventType,
    clientEventId,
    ...context,
  });
}

async function runExerciseJourney(
  templateVersionId: string,
  questionVersionIds: string[],
): Promise<void> {
  if (!page) throw new Error("Browser page hazır değil");
  const signupEvent = await recordEvent("SIGNUP_COMPLETED", `signup-${RUN_TAG}`);
  assert.equal(signupEvent.status, 200);
  assert.equal(signupEvent.body.data?.created, true);
  const signupReplay = await recordEvent("SIGNUP_COMPLETED", `signup-${RUN_TAG}`);
  assert.equal(signupReplay.status, 200);
  assert.equal(signupReplay.body.data?.created, false);
  assert.equal(
    (await recordEvent("ONBOARDING_STARTED", `onboarding-start-${RUN_TAG}`)).status,
    200,
  );
  assert.equal(
    (await recordEvent("ONBOARDING_COMPLETED", `onboarding-complete-${RUN_TAG}`)).status,
    200,
  );
  assert.equal((await recordEvent("LEARNING_PATH_OPENED", `path-${RUN_TAG}`)).status, 200);

  await page.waitForSelector("#learning-path [data-template]", { timeout: 15000 });
  const exerciseNode = page.locator(`#learning-path [data-template="${templateVersionId}"]`);
  assert.equal(await exerciseNode.count(), 1, "İlk TEST exercise learning path'te yok");
  // The post-onboarding dashboard loads its path asynchronously. Let the
  // final dashboard render settle before starting the exercise click journey.
  await page.waitForTimeout(1000);
  page.on("dialog", (dialog) => {
    console.log(`browser dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await page.route("**/account/entitlements", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.plan.code = "PLAN_PREMIUM";
    body.data.plan.label = "Premium";
    body.data.features.PRACTICE.dailyLimit = null;
    body.data.features.PRACTICE.remainingToday = null;
    await route.fulfill({ response, body: JSON.stringify(body) });
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  await page.locator("#entitlement-card").waitFor({ state: "visible", timeout: 10000 });
  assert.match(await page.locator("#entitlement-card").innerText(), /Premium/);
  await page.unroute("**/account/entitlements");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  assert.match(await page.locator("#entitlement-card").innerText(), /Ücretsiz/);
  console.log("4A) ENTITLEMENT RESPONSE TAMPERING DOES NOT GRANT SERVER ACCESS PASS");
  for (let index = 0; index < 3; index += 1) {
    const preLimit = await browserApi("/student/exercises/start", "POST", {
      templateVersionId,
      clientSessionId: `premium-limit-${RUN_TAG}-${index}`,
    });
    assert.equal(preLimit.status, 200, "TEST limit hazırlığı kullanım hakkı tüketemedi");
  }
  const limitResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/student/exercises/start"),
    { timeout: 10000 },
  );
  await exerciseNode.click();
  const limitResponse = await limitResponsePromise;
  assert.equal(limitResponse.status(), 403, "Limit sonrası exercise start 403 dönmeli");
  await page.waitForFunction(
    () => Boolean(document.querySelector("#premium-paywall-dialog")?.open),
    undefined,
    { timeout: 5000 },
  );
  const paywallText = await page.locator("#premium-paywall-dialog").innerText();
  assert.match(paywallText, /Günlük ücretsiz hakkın doldu/);
  assert.match(paywallText, /3\/3/);
  assert.match(paywallText, /Premium ile/);
  assert.match(paywallText, /yenilenir/);
  assert.doesNotMatch(paywallText, /Stripe|iyzico|PayTR|checkout|kart numarası|₺/i);
  await page.click("#premium-paywall-close-secondary");
  await prisma.entitlementUsage.deleteMany({ where: { userId } });
  const startResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/student/exercises/start"),
    { timeout: 10000 },
  );
  await exerciseNode.click();
  const startResponse = await startResponsePromise;
  assert.equal(startResponse.status(), 200, "Browser exercise start başarısız");
  // Re-open the exercise surface through the student navigation as well. The
  // click starts the session; this second navigation makes the resume target
  // explicit if a late dashboard render wins the race.
  await page.waitForTimeout(2000);
  await page.locator('[data-bottom-page="exercise"]').click();
  let exerciseReady = false;
  for (let attempt = 0; attempt < 4 && !exerciseReady; attempt += 1) {
    await page.locator('[data-bottom-page="exercise"]').click();
    try {
      await page.waitForSelector("#page-exercise:not(.hidden)", { timeout: 3000 });
      await page.waitForSelector("#exercise-current-question .answer-card", { timeout: 5000 });
      exerciseReady = true;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  assert.ok(exerciseReady, "Browser exercise yüzeyi açılmadı");
  const session = await prisma.exerciseSession.findFirst({
    where: { studentId: userId, tenantId, templateVersionId },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!session) throw new Error("Browser exercise session TEST DB'ye yazılmadı");
  sessionId = session.id;
  assert.equal((await recordEvent("LEARNING_PATH_OPENED", `path-replay-${RUN_TAG}`)).status, 200);
  assert.equal(
    (await recordEvent("EXERCISE_STARTED", `exercise-start-${RUN_TAG}`, { sessionId })).status,
    200,
  );
  assert.equal(
    (
      await recordEvent("QUESTION_VIEWED", `question-view-${RUN_TAG}`, {
        sessionId,
        questionVersionId: questionVersionIds[0],
      })
    ).status,
    200,
  );

  // Refresh before answering: this is the interrupted-session/resume boundary.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.locator('[data-bottom-page="exercise"]').click();
  await page.waitForSelector("#page-exercise:not(.hidden)", { timeout: 10000 });
  await page.waitForSelector("#exercise-current-question .answer-card", { timeout: 15000 });
  assert.equal(
    (await recordEvent("EXERCISE_RESUMED", `resume-${RUN_TAG}`, { sessionId })).status,
    200,
  );

  for (let index = 0; index < questionVersionIds.length; index += 1) {
    const questionId = questionVersionIds[index]!;
    await page.waitForFunction(
      (expectedId) =>
        document.querySelector("#exercise-current-question")?.dataset.questionVersionId ===
        expectedId,
      questionId,
      { timeout: 10000 },
    );
    await page.locator("#exercise-current-question .answer-card").first().click();
    await page.click("#exercise-submit-attempt");
    await page.waitForFunction(
      () =>
        (document.querySelector("#exercise-attempt-feedback") as HTMLElement | null)?.style
          .display === "block",
      undefined,
      { timeout: 10000 },
    );
    assert.equal(
      (
        await recordEvent("QUESTION_ATTEMPTED", `question-attempt-${index}-${RUN_TAG}`, {
          sessionId,
          questionVersionId: questionId,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await recordEvent("QUESTION_ANSWERED", `question-answer-${index}-${RUN_TAG}`, {
          sessionId,
          questionVersionId: questionId,
        })
      ).status,
      200,
    );
    if (index < questionVersionIds.length - 1) {
      await page.click("#exercise-submit-attempt");
    }
  }

  await page.click("#exercise-submit-attempt");
  await page.waitForSelector("#exercise-completion-title", { timeout: 15000 });
  assert.equal(
    (await recordEvent("EXERCISE_COMPLETED", `exercise-complete-${RUN_TAG}`, { sessionId })).status,
    200,
  );
  assert.equal((await recordEvent("STREAK_STARTED", `streak-${RUN_TAG}`)).status, 200);

  const [progress, gamification, review] = await Promise.all([
    browserApi("/student/progress"),
    browserApi("/student/gamification"),
    browserApi("/student/review"),
  ]);
  assert.equal(progress.status, 200);
  assert.equal(gamification.status, 200);
  assert.equal(review.status, 200);
  assert.equal((await recordEvent("REVIEW_STARTED", `review-${RUN_TAG}`)).status, 200);
  console.log(
    `5) BROWSER EXERCISE + ANSWER + FEEDBACK + COMPLETION + XP/STREAK/PROGRESS/REVIEW PASS: session=${sessionId}`,
  );
}

async function runReportsAndAuthJourney(): Promise<void> {
  if (!page) throw new Error("Browser page hazır değil");
  const feedback = await browserApi("/student/pilot/feedback", "POST", {
    clientFeedbackId: `feedback-${RUN_TAG}`,
    category: "QUESTION_CLARITY",
    rating: 4,
    message: "TEST pilot sorusu anlaşılırdı.",
    sessionId,
  });
  assert.equal(feedback.status, 200);
  assert.equal(feedback.body.data?.created, true);
  const feedbackReplay = await browserApi("/student/pilot/feedback", "POST", {
    clientFeedbackId: `feedback-${RUN_TAG}`,
    category: "QUESTION_CLARITY",
    rating: 4,
    message: "TEST pilot sorusu anlaşılırdı.",
    sessionId,
  });
  assert.equal(feedbackReplay.status, 200);
  assert.equal(feedbackReplay.body.data?.created, false);
  const bug = await browserApi("/student/pilot/bug-reports", "POST", {
    clientBugId: `bug-${RUN_TAG}`,
    category: "UNCLEAR_QUESTION",
    description: "TEST pilot raporu: soru kökü yeniden incelenmeli.",
    sessionId,
  });
  assert.equal(bug.status, 200);
  assert.equal(bug.body.data?.bug?.status, "OPEN");
  console.log("6) BROWSER FEEDBACK + BUG REPORT + DUPLICATE REPLAY PASS");

  await page.click("#logout-btn");
  await page.waitForSelector("#login-form:not(.hidden)", { timeout: 10000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("oku.accessToken")), null);
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-password", PASSWORD);
  await page.click("#login-submit");
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 15000 });
  const afterLogin = await browserApi("/auth/me");
  assert.equal(afterLogin.status, 200);
  assert.equal(afterLogin.body.data?.user?.id, userId);
  await page.waitForTimeout(500);
  const premiumTelemetry = await prisma.pilotEvent.findMany({
    where: {
      studentId: userId,
      eventType: {
        in: ["PREMIUM_INFO_VIEWED", "PREMIUM_CTA_CLICKED", "LIMIT_REACHED", "PAYWALL_VIEWED"],
      },
    },
    select: { eventType: true },
  });
  assert.deepEqual(
    new Set(premiumTelemetry.map((event) => event.eventType)),
    new Set(["PREMIUM_INFO_VIEWED", "PREMIUM_CTA_CLICKED", "LIMIT_REACHED", "PAYWALL_VIEWED"]),
  );
  console.log("7) LOGOUT + LOGIN + SESSION RESTORE + PREMIUM TELEMETRY PASS");
}

async function cleanup(): Promise<void> {
  if (!userId) return;
  await prisma.pilotBugReport.deleteMany({ where: { studentId: userId } });
  await prisma.pilotFeedback.deleteMany({ where: { studentId: userId } });
  await prisma.pilotEvent.deleteMany({ where: { studentId: userId } });
  await prisma.studentBadge.deleteMany({ where: { studentId: userId } });
  await prisma.pointEvent.deleteMany({ where: { studentId: userId } });
  await prisma.studentStreak.deleteMany({ where: { studentId: userId } });
  await prisma.studentProgress.deleteMany({ where: { studentId: userId } });
  await prisma.attempt.deleteMany({ where: { session: { studentId: userId } } });
  await prisma.sessionContentVersion.deleteMany({ where: { session: { studentId: userId } } });
  await prisma.exerciseSession.deleteMany({ where: { studentId: userId } });
  await prisma.studentProfile.deleteMany({ where: { studentId: userId } });
  await prisma.membership.deleteMany({ where: { userId: userId } });
  await prisma.authSession.deleteMany({ where: { userId: userId } });
  await prisma.authIdentity.deleteMany({ where: { userId: userId } });
  await prisma.consent.deleteMany({ where: { userId: userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  const remaining = await prisma.tenant.count({ where: { id: tenantId } });
  assert.equal(remaining, 0, "Pilot personal tenant cleanup başarısız");
  console.log("8) TARGETED TEST CLEANUP PASS: pack ve catalog kayıtları değişmedi");
}

async function main(): Promise<void> {
  assertTestDatabase();
  await prisma.$connect();
  const preflightResult = await preflight();
  try {
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await createAccountThroughBrowser();
    await runExerciseJourney(preflightResult.templateVersionId, preflightResult.questionVersionIds);
    await runReportsAndAuthJourney();
    assert.deepEqual(pageErrors, [], `Browser page error: ${pageErrors.join(" | ")}`);
  } finally {
    await browser?.close();
    await cleanup();
    await prisma.$disconnect();
  }
  console.log("✅ CLOSED PILOT OPERATIONS BROWSER REGRESSION PASS");
}

main().catch((error) => {
  console.error(
    `8G-11 CLOSED PILOT BROWSER QA BLOCKED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
});
