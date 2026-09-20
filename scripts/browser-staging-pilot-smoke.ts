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
    await page.locator('#exercise-current-question [role="radio"]').first().click();
    return;
  }
  if (question.type === "TRUE_FALSE") {
    await page.locator('#exercise-current-question [role="radio"]').first().click();
    return;
  }
  if (question.type === "OPEN_ENDED") {
    await page
      .locator("#exercise-current-question #exercise-oe-answer")
      .fill("Metindeki kanıta dayalı kısa yanıt.");
    return;
  }
  const selects = page.locator("#exercise-current-question select[data-exercise-match-left]");
  if ((await selects.count()) > 0) {
    for (let index = 0; index < (await selects.count()); index += 1)
      await selects.nth(index).selectOption({ index: 1 });
    return;
  }
  const blanks = page.locator("#exercise-current-question input[data-exercise-blank]");
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
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /stack trace|database_url|at object\.|node_modules/i,
  );
}

async function waitForDashboard(page: Page): Promise<void> {
  await page
    .locator("#page-dashboard:not(.hidden)")
    .waitFor({ state: "visible", timeoutMs: 10_000 });
  await page.locator("#today-card").waitFor({ state: "visible", timeoutMs: 10_000 });
  await page.waitForFunction(
    () => document.getElementById("start-daily-training")?.dataset.todayLoaded === "true",
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  assert.equal(await page.locator("#start-daily-training").isVisible(), true);
}

async function runOneExercise(page: Page): Promise<void> {
  const startButton = page.locator("#start-daily-training");
  assert.equal(await startButton.isEnabled(), true, "daily training CTA is not ready");
  const startResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/student/training/daily/start") &&
      response.request().method() === "POST",
    { timeout: REQUEST_TIMEOUT_MS },
  );
  await startButton.click();
  assert.equal((await startResponse).status(), 200, "daily training start failed");
  await page
    .locator("#page-exercise:not(.hidden)")
    .waitFor({ state: "visible", timeoutMs: REQUEST_TIMEOUT_MS });
  await page
    .locator("#exercise-current-question[data-question-version-id]")
    .waitFor({ state: "visible", timeoutMs: REQUEST_TIMEOUT_MS });

  const question = await readQuestionState(page);
  assert.equal(question.hasAnswerControl, true, "exercise answer control missing");
  await selectAnswer(page, question);
  const answerResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/student/questions/${encodeURIComponent(question.id)}/attempts`) &&
      response.request().method() === "POST",
    { timeout: REQUEST_TIMEOUT_MS },
  );
  await page.locator("#exercise-submit-attempt").click();
  assert.equal((await answerResponse).status(), 200, "exercise answer failed");
  await page
    .locator("#exercise-attempt-feedback")
    .waitFor({ state: "visible", timeoutMs: REQUEST_TIMEOUT_MS });
  assert.ok((await page.locator("#exercise-attempt-feedback").innerText()).trim());
}

async function assertFastViewport(page: Page, viewport: (typeof VIEWPORTS)[number]): Promise<void> {
  await page.setViewportSize(viewport);

  await page.locator('#student-bottom-nav .bottom-nav-item[data-bottom-page="dashboard"]').click();
  await waitForDashboard(page);
  await assertNoOverflow(page, viewport);

  await page.locator('#student-bottom-nav .bottom-nav-item[data-bottom-page="exercise"]').click();
  await page
    .locator("#page-exercise:not(.hidden)")
    .waitFor({ state: "visible", timeoutMs: REQUEST_TIMEOUT_MS });
  await page
    .locator("#exercise-current-question[data-question-version-id]")
    .waitFor({ state: "visible", timeoutMs: REQUEST_TIMEOUT_MS });
  await assertNoOverflow(page, viewport);

  await page.locator('#student-bottom-nav .bottom-nav-item[data-bottom-page="settings"]').click();
  await page
    .locator("#page-settings:not(.hidden)")
    .waitFor({ state: "visible", timeoutMs: 10_000 });
  await page.locator("#pilot-support-open").waitFor({ state: "visible", timeoutMs: 5_000 });
  await page.locator("#pilot-bug-open").waitFor({ state: "visible", timeoutMs: 5_000 });
  await assertNoOverflow(page, viewport);
}

async function verifySupportAndBugReport(page: Page): Promise<void> {
  await page.locator("#pilot-support-open").click();
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "visible", timeoutMs: 5_000 });
  const supportText = await page.locator("#pilot-report-dialog").innerText();
  assert.doesNotMatch(supportText, /stack trace|database_url|at object\.|node_modules/i);
  await page.locator("#pilot-report-close").click();
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "hidden", timeoutMs: 5_000 });

  await page.locator("#pilot-bug-open").click();
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "visible", timeoutMs: 5_000 });
  const bugText = await page.locator("#pilot-report-dialog").innerText();
  assert.doesNotMatch(bugText, /stack trace|database_url|at object\.|node_modules/i);
  await page.locator("#pilot-report-close").click();
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "hidden", timeoutMs: 5_000 });
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const timings: StepTiming[] = [];
  activeStartedAt = startedAt;
  activeTimings = timings;
  const timed = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
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

    await timed("login", () => login(page));
    await timed("authMe", async () => {
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
  console.error(
    JSON.stringify({
      status: "FAIL",
      message: message.slice(0, 240),
      totalDurationMs,
      stepDurations: activeTimings,
      slowStages,
      productionTouched: "NO",
      fullE2e: "NOT_RUN",
    }),
  );
  process.exitCode = 1;
});
