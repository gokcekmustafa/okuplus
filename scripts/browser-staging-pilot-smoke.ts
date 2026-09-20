/*
 * Fast, staging-only authenticated pilot smoke.
 *
 * This deliberately reuses the already-provisioned staging student and one
 * authenticated browser page. The official staging E2E remains responsible
 * for placement, complete training, telemetry, idempotency, concurrency, and
 * content coverage.
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright-core";
import { login, VIEWPORTS } from "./browser-staging-pilot-closure.js";
import { validateStagingBaseUrl } from "./browser-student-full-e2e-policy.js";

const BASE_URL = (process.env.BASE_URL?.trim() ?? "").replace(/\/$/u, "");
const CHROME_PATH =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const REQUEST_TIMEOUT_MS = 15_000;

type JsonObject = Record<string, unknown>;
type BrowserApiResult = { status: number; body: unknown };
type QuestionState = {
  id: string;
  type: string;
  options: string[];
  hasAnswerControl: boolean;
};
type StepTiming = { name: string; durationMs: number };

let activeTimings: StepTiming[] = [];
let activeStartedAt = 0;
let activeStage = "startup";
let activeSelector = "";
let activePage: Page | null = null;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrorMessage(result: BrowserApiResult): string {
  const body = isObject(result.body) ? result.body : null;
  const error = body && isObject(body.error) ? body.error : null;
  const message = error?.message;
  return typeof message === "string" && message.trim() ? message.trim() : `HTTP ${result.status}`;
}

function assertApiOk(result: BrowserApiResult, label: string): void {
  if (result.status !== 200) throw new Error(`${label} başarısız (${safeErrorMessage(result)})`);
}

async function visibleUnique(page: Page, selector: string, timeoutMs = 10_000) {
  activeSelector = selector;
  const locator = page.locator(selector);
  assert.equal(await locator.count(), 1, `selector eşleşmesi tekil değil: ${selector}`);
  await locator.waitFor({ state: "visible", timeoutMs });
  assert.equal(await locator.isVisible(), true, `selector görünür değil: ${selector}`);
  return locator;
}

async function goToStudentPage(
  page: Page,
  pageName: "dashboard" | "exercise" | "settings",
  expectedSelector: string,
): Promise<void> {
  const navSelector = `#student-bottom-nav .bottom-nav-item[data-bottom-page="${pageName}"]`;
  const nav = await visibleUnique(page, navSelector, 5_000);
  await nav.click();
  await visibleUnique(page, expectedSelector, REQUEST_TIMEOUT_MS);
}

async function browserApi(page: Page, path: string): Promise<BrowserApiResult> {
  return page.evaluate(
    async ({ requestPath, timeoutMs }) => {
      const headers: Record<string, string> = {
        accept: "application/json",
        "x-auth-transport": "cookie",
      };
      const accessToken = window.localStorage.getItem("oku.accessToken");
      const tenantId = window.localStorage.getItem("oku.tenantId");
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;
      if (tenantId) headers["x-tenant-id"] = tenantId;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(requestPath, {
          credentials: "include",
          headers,
          signal: controller.signal,
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      } finally {
        window.clearTimeout(timer);
      }
    },
    { requestPath: path, timeoutMs: REQUEST_TIMEOUT_MS },
  );
}

async function readQuestionState(page: Page): Promise<QuestionState> {
  activeSelector = "#exercise-current-question";
  return page.evaluate(() => {
    const container = document.getElementById("exercise-current-question");
    if (!container) throw new Error("exercise question container missing");
    const id = container.dataset.questionVersionId;
    const type = container.dataset.questionType;
    if (!id || !type) throw new Error("exercise question identity missing");
    const options = [
      ...container.querySelectorAll<HTMLInputElement>("input[data-exercise-opt]"),
    ].map((input) => input.value);
    const hasAnswerControl = Boolean(
      options.length ||
      container.querySelector("input[data-exercise-tf]") ||
      container.querySelector("textarea, select, input[data-exercise-blank]"),
    );
    return { id, type, options, hasAnswerControl };
  });
}

async function selectAnswer(page: Page, question: QuestionState): Promise<void> {
  if (question.type === "MULTIPLE_CHOICE") {
    const selector = '#exercise-current-question [role="radio"]';
    const radios = page.locator(selector);
    activeSelector = selector;
    assert.ok((await radios.count()) >= 1, `visible answer cards missing: ${selector}`);
    await radios.nth(0).click();
    return;
  }
  if (question.type === "TRUE_FALSE") {
    const selector = '#exercise-current-question [role="radio"]';
    const radios = page.locator(selector);
    activeSelector = selector;
    assert.ok((await radios.count()) >= 1, `visible answer cards missing: ${selector}`);
    await radios.nth(0).click();
    return;
  }
  if (question.type === "OPEN_ENDED") {
    const answer = await visibleUnique(page, "#exercise-current-question #exercise-oe-answer");
    await answer.fill("Metindeki kanıta dayalı kısa yanıt.");
    return;
  }
  const selectSelector = "#exercise-current-question select[data-exercise-match-left]";
  const selects = page.locator(selectSelector);
  activeSelector = selectSelector;
  if ((await selects.count()) > 0) {
    for (let index = 0; index < (await selects.count()); index += 1)
      await selects.nth(index).selectOption({ index: 1 });
    return;
  }
  const blankSelector = "#exercise-current-question input[data-exercise-blank]";
  const blanks = page.locator(blankSelector);
  activeSelector = blankSelector;
  if ((await blanks.count()) > 0) {
    for (let index = 0; index < (await blanks.count()); index += 1)
      await blanks.nth(index).fill("gözlem");
    return;
  }
  throw new Error(`Desteklenmeyen exercise input: ${question.type}`);
}

async function assertNoOverflow(page: Page, viewport: (typeof VIEWPORTS)[number]): Promise<void> {
  const metrics = await page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0;
    };
    const controls = [...document.querySelectorAll("button, input, select, textarea")]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.id, width: rect.width, height: rect.height };
      });
    return {
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      controls,
    };
  });
  assert.ok(
    metrics.documentWidth <= metrics.viewport + 1 && metrics.bodyWidth <= metrics.viewport + 1,
    `horizontal overflow at ${viewport.width}px`,
  );
  const criticalIds = new Set(["start-daily-training", "pilot-support-open", "pilot-bug-open"]);
  const criticalControls = metrics.controls.filter((control) => criticalIds.has(control.id));
  assert.ok(
    criticalControls.every((control) => control.width >= 44 && control.height >= 44),
    `critical touch target failure at ${viewport.width}px`,
  );
  activeSelector = "body";
  const visibleText = await page.locator("body").innerText();
  assert.doesNotMatch(visibleText, /stack trace|database_url|at object\.|node_modules/i);
}

async function waitForDashboard(page: Page): Promise<void> {
  await visibleUnique(page, "#page-dashboard");
  await visibleUnique(page, "#today-card");
  await visibleUnique(page, "#start-daily-training");
  activeSelector = '#start-daily-training[data-today-loaded="true"]';
  await page.waitForFunction(
    () => document.getElementById("start-daily-training")?.dataset.todayLoaded === "true",
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
}

async function runOneExercise(page: Page): Promise<void> {
  const startButton = await visibleUnique(page, "#start-daily-training");
  assert.equal(await startButton.isEnabled(), true, "daily training CTA is not ready");
  const startResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/student/training/daily/start") &&
      response.request().method() === "POST",
    { timeout: REQUEST_TIMEOUT_MS },
  );
  activeSelector = "#start-daily-training";
  await startButton.click();
  assert.equal((await startResponse).status(), 200, "daily training start failed");
  await visibleUnique(page, "#page-exercise", REQUEST_TIMEOUT_MS);
  await visibleUnique(
    page,
    "#exercise-current-question[data-question-version-id]",
    REQUEST_TIMEOUT_MS,
  );

  const question = await readQuestionState(page);
  assert.equal(question.hasAnswerControl, true, "exercise answer control missing");
  await selectAnswer(page, question);
  const answerResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/student/questions/${encodeURIComponent(question.id)}/attempts`) &&
      response.request().method() === "POST",
    { timeout: REQUEST_TIMEOUT_MS },
  );
  const submit = await visibleUnique(page, "#exercise-submit-attempt");
  activeSelector = "#exercise-submit-attempt";
  await submit.click();
  assert.equal((await answerResponse).status(), 200, "exercise answer failed");
  await visibleUnique(page, "#exercise-attempt-feedback", REQUEST_TIMEOUT_MS);
  assert.ok((await page.locator("#exercise-attempt-feedback").innerText()).trim());
}

async function assertFastViewport(page: Page, viewport: (typeof VIEWPORTS)[number]): Promise<void> {
  await page.setViewportSize(viewport);

  await goToStudentPage(page, "dashboard", "#page-dashboard");
  await waitForDashboard(page);
  await assertNoOverflow(page, viewport);

  await goToStudentPage(page, "exercise", "#page-exercise");
  await visibleUnique(
    page,
    "#exercise-current-question[data-question-version-id]",
    REQUEST_TIMEOUT_MS,
  );
  await assertNoOverflow(page, viewport);

  await goToStudentPage(page, "settings", "#page-settings");
  await visibleUnique(page, "#pilot-support-open", 5_000);
  await visibleUnique(page, "#pilot-bug-open", 5_000);
  await assertNoOverflow(page, viewport);
}

async function verifySupportAndBugReport(page: Page): Promise<void> {
  await goToStudentPage(page, "settings", "#page-settings");
  const supportButton = await visibleUnique(page, "#pilot-support-open", 5_000);
  activeSelector = "#pilot-support-open";
  await supportButton.click();
  await visibleUnique(page, "#pilot-report-dialog[open]", 5_000);
  await visibleUnique(page, "#pilot-report-category", 5_000);
  await visibleUnique(page, "#pilot-report-message", 5_000);
  const supportSubmit = await visibleUnique(page, "#pilot-report-submit", 5_000);
  assert.equal(await supportSubmit.isEnabled(), true, "support form submit control is disabled");
  const supportText = await page.locator("#pilot-report-dialog").innerText();
  assert.doesNotMatch(supportText, /stack trace|database_url|at object\.|node_modules/i);
  const closeSupport = await visibleUnique(page, "#pilot-report-close", 5_000);
  await closeSupport.click();
  activeSelector = "#pilot-report-dialog[open]";
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "hidden", timeoutMs: 5_000 });

  const bugButton = await visibleUnique(page, "#pilot-bug-open", 5_000);
  activeSelector = "#pilot-bug-open";
  await bugButton.click();
  await visibleUnique(page, "#pilot-report-dialog[open]", 5_000);
  await visibleUnique(page, "#pilot-report-category", 5_000);
  await visibleUnique(page, "#pilot-report-message", 5_000);
  const bugSubmit = await visibleUnique(page, "#pilot-report-submit", 5_000);
  assert.equal(await bugSubmit.isEnabled(), true, "bug report submit control is disabled");
  const bugText = await page.locator("#pilot-report-dialog").innerText();
  assert.doesNotMatch(bugText, /stack trace|database_url|at object\.|node_modules/i);
  const closeBug = await visibleUnique(page, "#pilot-report-close", 5_000);
  await closeBug.click();
  activeSelector = "#pilot-report-dialog[open]";
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "hidden", timeoutMs: 5_000 });
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const timings: StepTiming[] = [];
  activeStartedAt = startedAt;
  activeTimings = timings;
  const timed = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
    activeStage = name;
    const stepStartedAt = Date.now();
    try {
      return await action();
    } finally {
      timings.push({ name, durationMs: Date.now() - stepStartedAt });
    }
  };

  validateStagingBaseUrl(BASE_URL);
  if (!process.env.STAGING_STUDENT_PASSWORD)
    throw new Error("STAGING_STUDENT_PASSWORD is not configured");
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const unexpectedHttp: string[] = [];
  const requestCounts = new Map<string, number>();
  try {
    const page = await browser.newPage({ viewport: VIEWPORTS[0] });
    activePage = page;
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.name));
    page.on("requestfailed", (request) => failedRequests.push(request.url()));
    page.on("response", (response) => {
      if (response.status() >= 400) unexpectedHttp.push(`${response.status()} ${response.url()}`);
    });
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().includes("/student/questions/")) return;
      const key = request.postData() ?? request.url();
      requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
    });

    activeSelector = '#login-email, #login-password, button[aria-label="Giriş yap"]';
    await timed("login", () => login(page));
    await timed("authMe", async () => {
      activeSelector = "/auth/me";
      const result = await browserApi(page, "/auth/me");
      assertApiOk(result, "auth/me");
    });
    await timed("dashboard", () => waitForDashboard(page));
    await timed("oneExercise", () => runOneExercise(page));
    await timed("supportAndBugReport", () => verifySupportAndBugReport(page));
    await timed("mobile", async () => {
      for (const viewport of VIEWPORTS) await assertFastViewport(page, viewport);
    });

    const duplicateAnswerRequests = [...requestCounts.values()].filter((count) => count > 1).length;
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);
    assert.deepEqual(unexpectedHttp, []);
    assert.equal(duplicateAnswerRequests, 0);
    const totalDurationMs = Date.now() - startedAt;
    const slowStages = timings
      .filter((timing) => timing.durationMs > 10_000)
      .map((timing) => timing.name);
    const performanceWarnings = [
      ...slowStages.map((stage) => `${stage}>10s`),
      ...(totalDurationMs > 120_000 ? ["total>120s"] : []),
    ];
    console.log(
      JSON.stringify({
        status: "PASS",
        auth: "PASS",
        authMe: "PASS",
        dashboard: "PASS",
        training: "PASS",
        exercise: "PASS",
        answerFeedback: "PASS",
        support: "PASS",
        bugReport: "PASS",
        mobile: VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`),
        consoleErrors: 0,
        pageErrors: 0,
        networkErrors: 0,
        unexpectedHttpErrors: 0,
        duplicateAnswerRequests,
        totalDurationMs,
        stepDurations: timings,
        slowStages,
        performanceWarnings,
        productionTouched: "NO",
        fullE2e: "NOT_RUN",
      }),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "fast pilot smoke failed";
  const totalDurationMs = activeStartedAt ? Date.now() - activeStartedAt : 0;
  const slowStages = activeTimings
    .filter((timing) => timing.durationMs > 10_000)
    .map((timing) => timing.name);
  const performanceWarnings = [
    ...slowStages.map((stage) => `${stage}>10s`),
    ...(totalDurationMs > 120_000 ? ["total>120s"] : []),
  ];
  console.error(
    JSON.stringify({
      status: "FAIL",
      message: message.slice(0, 240),
      failedStage: activeStage,
      selector: activeSelector || "unknown",
      currentRoute: (() => {
        try {
          return activePage ? new URL(activePage.url()).pathname : "unknown";
        } catch {
          return "unknown";
        }
      })(),
      errorType: error instanceof Error ? error.name : typeof error,
      totalDurationMs,
      stepDurations: activeTimings,
      slowStages,
      performanceWarnings,
      productionTouched: "NO",
      fullE2e: "NOT_RUN",
    }),
  );
  process.exitCode = 1;
});
