/*
 * Short, staging-only authenticated pilot smoke.
 *
 * This intentionally stops after the first daily exercise is completed. The
 * official staging E2E remains the source of truth for the complete six-item
 * training, idempotency, concurrency, and data-integrity coverage.
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright-core";
import {
  assertMobileSurface,
  login,
  verifySupportAndBugReport,
  VIEWPORTS,
  waitForStudentApp,
} from "./browser-staging-pilot-closure.js";
import { validateStagingBaseUrl } from "./browser-student-full-e2e-policy.js";

const BASE_URL = (process.env.BASE_URL?.trim() ?? "").replace(/\/$/u, "");
const CHROME_PATH =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const REQUEST_TIMEOUT_MS = 30_000;

type JsonObject = Record<string, unknown>;
type BrowserApiResult = { status: number; body: unknown };
type QuestionState = {
  id: string;
  type: string;
  options: string[];
  hasAnswerControl: boolean;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiData<T = unknown>(result: BrowserApiResult): T {
  if (isObject(result.body) && "data" in result.body) return result.body.data as T;
  return result.body as T;
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

function recordString(value: unknown, key: string, label: string): string {
  const result = isObject(value) ? value[key] : undefined;
  if (typeof result !== "string" || !result.trim()) throw new Error(`${label}.${key} eksik`);
  return result;
}

function recordArray(value: unknown, key: string, label: string): unknown[] {
  const result = isObject(value) ? value[key] : undefined;
  if (!Array.isArray(result)) throw new Error(`${label}.${key} listesi eksik`);
  return result;
}

async function browserApi(
  page: Page,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<BrowserApiResult> {
  return page.evaluate(
    async ({ requestPath, method, body, timeoutMs }) => {
      const headers: Record<string, string> = {
        accept: "application/json",
        "x-auth-transport": "cookie",
      };
      const accessToken = window.localStorage.getItem("oku.accessToken");
      const tenantId = window.localStorage.getItem("oku.tenantId");
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;
      if (tenantId) headers["x-tenant-id"] = tenantId;
      if (method && method !== "GET") {
        headers["content-type"] = "application/json";
        const csrfPart = document.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("__Host-oku_csrf="));
        if (csrfPart) {
          const raw = csrfPart.slice("__Host-oku_csrf=".length);
          try {
            headers["x-csrf-token"] = decodeURIComponent(raw);
          } catch {
            headers["x-csrf-token"] = raw;
          }
        }
      }
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(requestPath, {
          method: method ?? "GET",
          credentials: "include",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      } finally {
        window.clearTimeout(timer);
      }
    },
    {
      requestPath: path,
      method: options.method,
      body: options.body,
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
  );
}

function answerForQuestion(question: JsonObject): unknown {
  const type = recordString(question, "type", "question");
  if (type === "MULTIPLE_CHOICE") {
    const options = recordArray(question, "options", "question");
    const first = options.find((option) => isObject(option) && typeof option.id === "string");
    if (!isObject(first)) throw new Error("Placement multiple-choice seçeneği eksik");
    return [recordString(first, "id", "question option")];
  }
  if (type === "TRUE_FALSE") return false;
  if (type === "MATCHING") return {};
  if (type === "FILL_BLANK") {
    const blankIds = Array.isArray(question.blankIds)
      ? question.blankIds.filter((value): value is string => typeof value === "string")
      : [];
    return Object.fromEntries(blankIds.map((id) => [id, ""]));
  }
  return "Kısa yanıt.";
}

async function verifyOnboardingSurface(page: Page): Promise<void> {
  const state = await browserApi(page, "/student/onboarding");
  assertApiOk(state, "onboarding state");
  const stateData = apiData<JsonObject>(state);
  if (stateData.completed !== true) throw new Error("Provisioned student onboarding tamamlanmadı");

  const levels = await browserApi(page, "/student/onboarding/levels");
  assertApiOk(levels, "onboarding levels");
  if (recordArray(apiData<JsonObject>(levels), "levels", "onboarding").length < 1) {
    throw new Error("Onboarding level listesi boş");
  }

  const onboardingPage = page.locator("#page-onboarding");
  await onboardingPage.waitFor({ state: "attached", timeout: 10_000 });
  assert.equal(await onboardingPage.count(), 1);
  assert.ok(
    (await page.locator("#onboard-level option").count()) >= 1,
    "onboarding level control missing",
  );
  assert.equal(await page.locator("#onboarding-level-retry").count(), 1);
}

async function completePlacement(page: Page): Promise<void> {
  const lookup = await browserApi(page, "/student/onboarding/placement");
  assertApiOk(lookup, "placement lookup");
  const assessmentId = recordString(apiData<JsonObject>(lookup), "assessmentId", "placement");
  const existingResult = await browserApi(
    page,
    `/student/assessments/${encodeURIComponent(assessmentId)}/result`,
  );
  assertApiOk(existingResult, "placement result precheck");
  if (apiData(existingResult) === null) {
    const assessmentList = await browserApi(page, "/student/assessments");
    assertApiOk(assessmentList, "assessment list");
    const items = recordArray(apiData<JsonObject>(assessmentList), "items", "assessments");
    const assessment = items.find((item) => isObject(item) && item.id === assessmentId);
    if (!isObject(assessment)) throw new Error("Canonical placement assessment bulunamadı");
    let sessionId =
      typeof assessment.inProgressSessionId === "string" ? assessment.inProgressSessionId : null;
    if (!sessionId) {
      const started = await browserApi(
        page,
        `/student/assessments/${encodeURIComponent(assessmentId)}/start`,
        { method: "POST", body: {} },
      );
      assertApiOk(started, "placement start");
      sessionId = recordString(apiData<JsonObject>(started), "sessionId", "placement start");
    }
    const session = await browserApi(page, `/student/sessions/${encodeURIComponent(sessionId)}`);
    assertApiOk(session, "placement session");
    const questionResult = await browserApi(
      page,
      `/student/sessions/${encodeURIComponent(sessionId)}/questions`,
    );
    assertApiOk(questionResult, "placement questions");
    const questions = recordArray(apiData<JsonObject>(questionResult), "questions", "placement");
    const sessionData = apiData<JsonObject>(session);
    const sessionAttempts = Array.isArray(sessionData.attempts) ? sessionData.attempts : [];
    const attempted = new Set(
      sessionAttempts
        .filter(isObject)
        .map((item) => item.questionVersionId)
        .filter((value): value is string => typeof value === "string"),
    );
    for (const [index, question] of questions.entries()) {
      if (!isObject(question)) continue;
      const questionVersionId = recordString(
        question,
        "questionVersionId",
        `placement question ${index}`,
      );
      if (attempted.has(questionVersionId)) continue;
      const attempt = await browserApi(
        page,
        `/student/questions/${encodeURIComponent(questionVersionId)}/attempts`,
        {
          method: "POST",
          body: {
            sessionId,
            answer: answerForQuestion(question),
            clientAttemptId: `staging-pilot-smoke-placement-${sessionId}-${index}`,
            timeSpentMs: 1000,
          },
        },
      );
      assertApiOk(attempt, "placement attempt");
    }
    const completed = await browserApi(
      page,
      `/student/sessions/${encodeURIComponent(sessionId)}/complete`,
      { method: "POST", body: {} },
    );
    assertApiOk(completed, "placement completion");
    const after = await browserApi(
      page,
      `/student/assessments/${encodeURIComponent(assessmentId)}/result`,
    );
    assertApiOk(after, "placement result");
    if (apiData(after) === null) throw new Error("Placement sonucu oluşmadı");
  }
  const baseline = await browserApi(page, "/student/baseline");
  assertApiOk(baseline, "student baseline");
  if (apiData(baseline) === null) throw new Error("Placement baseline oluşmadı");
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

async function selectAnswer(page: Page, question: QuestionState, index: number): Promise<void> {
  if (question.type === "MULTIPLE_CHOICE") {
    const input = page.locator("#exercise-current-question input[data-exercise-opt]").nth(index);
    await input.check({ force: true });
    return;
  }
  if (question.type === "TRUE_FALSE") {
    await page
      .locator("#exercise-current-question input[data-exercise-tf]")
      .nth(index % 2)
      .check({ force: true });
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
    for (let i = 0; i < (await selects.count()); i += 1)
      await selects.nth(i).selectOption({ index: 1 });
    return;
  }
  const blanks = page.locator("#exercise-current-question input[data-exercise-blank]");
  if ((await blanks.count()) > 0) {
    for (let i = 0; i < (await blanks.count()); i += 1) await blanks.nth(i).fill("gözlem");
    return;
  }
  throw new Error(`Desteklenmeyen exercise input: ${question.type}`);
}

async function runFirstExercise(page: Page): Promise<{ wrong: boolean; correct: boolean }> {
  await page.evaluate(() => {
    const navigate = (window as unknown as { navigate?: (value: string) => void }).navigate;
    if (typeof navigate !== "function") throw new Error("dashboard navigation helper missing");
    navigate("dashboard");
  });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10_000 });
  await page.waitForFunction(
    () => {
      const button = document.getElementById("start-daily-training") as HTMLButtonElement | null;
      return Boolean(button && !button.disabled);
    },
    { timeout: 30_000 },
  );
  const startResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/student/training/daily/start") &&
      response.request().method() === "POST",
    { timeout: REQUEST_TIMEOUT_MS },
  );
  await page.locator("#start-daily-training").click();
  const started = await startResponse;
  assert.equal(started.status(), 200, "daily training start failed");
  const dailyBody = await started.json().catch(() => null);
  const daily = apiData<JsonObject>({ status: started.status(), body: dailyBody });
  const items = recordArray(daily, "items", "daily training");
  const first = items.find(
    (item) =>
      isObject(item) && item.status !== "COMPLETED" && typeof item.exerciseSessionId === "string",
  );
  if (!isObject(first)) throw new Error("Daily training first exercise session eksik");
  const sessionId = recordString(first, "exerciseSessionId", "daily first item");

  await page.waitForSelector("#page-exercise:not(.hidden)", { timeout: REQUEST_TIMEOUT_MS });
  await page.waitForSelector("#exercise-current-question[data-question-version-id]", {
    state: "visible",
    timeout: REQUEST_TIMEOUT_MS,
  });

  let wrong = false;
  let correct = false;
  let currentId = "";
  const choiceIndex = new Map<string, number>();
  for (let step = 0; step < 12; step += 1) {
    const question = await readQuestionState(page);
    if (!question.hasAnswerControl) throw new Error("Exercise answer control görünmedi");
    if (question.id !== currentId) {
      currentId = question.id;
      choiceIndex.set(currentId, 0);
    }
    const index = choiceIndex.get(question.id) ?? 0;
    if (question.type === "MULTIPLE_CHOICE" && index >= question.options.length) {
      throw new Error("Exercise retry için kullanılabilir seçenek kalmadı");
    }
    await selectAnswer(page, question, index);
    const answerResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/student/questions/${encodeURIComponent(question.id)}/attempts`) &&
        response.request().method() === "POST",
      { timeout: REQUEST_TIMEOUT_MS },
    );
    await page.locator("#exercise-submit-attempt").click();
    const response = await answerResponse;
    const body = await response.json().catch(() => null);
    assert.equal(response.status(), 200, `exercise answer failed for ${question.id}`);
    const data = apiData<JsonObject>({ status: response.status(), body });
    const isCorrect = data.isCorrect;
    if (isCorrect !== true && isCorrect !== false)
      throw new Error("Exercise scoring result missing");
    await page.waitForSelector("#exercise-attempt-feedback", { state: "visible", timeout: 10_000 });
    const responseOrder = Number(data.responseOrder ?? 1);
    if (isCorrect === false && responseOrder === 1) {
      wrong = true;
      assert.match(
        await page.locator("#exercise-attempt-feedback").innerText(),
        /Tekrar düşün|Tekrar/i,
      );
      assert.match(await page.locator("#exercise-submit-attempt").innerText(), /Tekrar Cevapla/i);
      choiceIndex.set(question.id, index + 1);
      continue;
    }
    if (isCorrect === true) correct = true;
    const button = page.locator("#exercise-submit-attempt");
    const buttonText = (await button.innerText()).trim();
    if (buttonText.includes("Tamamla")) {
      const completionResponse = page.waitForResponse(
        (candidate) =>
          candidate.url().includes(`/student/sessions/${encodeURIComponent(sessionId)}/complete`) &&
          candidate.request().method() === "POST",
        { timeout: REQUEST_TIMEOUT_MS },
      );
      await button.click();
      assert.equal((await completionResponse).status(), 200, "first exercise completion failed");
      return { wrong, correct };
    }
    const previousId = question.id;
    await button.click();
    await page.waitForFunction(
      (expected) =>
        document.getElementById("exercise-current-question")?.dataset.questionVersionId !==
        expected,
      previousId,
      { timeout: 10_000 },
    );
  }
  throw new Error("First exercise did not complete within smoke limit");
}

async function main(): Promise<void> {
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
      try {
        const body = JSON.parse(request.postData() ?? "") as { clientAttemptId?: string };
        if (!body.clientAttemptId) return;
        const count = (requestCounts.get(body.clientAttemptId) ?? 0) + 1;
        requestCounts.set(body.clientAttemptId, count);
      } catch {
        // The body is not logged; malformed request diagnostics are reported by the assertion.
      }
    });

    await login(page);
    await waitForStudentApp(page);
    const authMe = await browserApi(page, "/auth/me");
    assertApiOk(authMe, "auth/me");
    await verifyOnboardingSurface(page);
    await completePlacement(page);
    const exercise = await runFirstExercise(page);
    for (const viewport of VIEWPORTS) await assertMobileSurface(page, viewport);
    await verifySupportAndBugReport(page);

    const duplicateAnswerRequests = [...requestCounts.values()].filter((count) => count > 1).length;
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);
    assert.deepEqual(unexpectedHttp, []);
    assert.equal(duplicateAnswerRequests, 0);
    if (!exercise.wrong) throw new Error("Smoke exercise did not observe a wrong-answer retry");
    if (!exercise.correct) throw new Error("Smoke exercise did not observe a correct answer");
    console.log(
      JSON.stringify({
        status: "PASS",
        auth: "PASS",
        authMe: "PASS",
        onboarding: "PASS",
        placement: "PASS",
        baseline: "PASS",
        firstTraining: "PASS",
        exercise: "PASS",
        wrongAnswerRetry: "PASS",
        firstExerciseCompletion: "PASS",
        mobile: VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`),
        support: "PASS",
        bugReport: "PASS",
        consoleErrors: 0,
        pageErrors: 0,
        networkErrors: 0,
        unexpectedHttpErrors: 0,
        duplicateAnswerRequests: 0,
        productionTouched: "NO",
      }),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "pilot smoke failed";
  console.error(
    JSON.stringify({ status: "FAIL", message: message.slice(0, 240), productionTouched: "NO" }),
  );
  process.exitCode = 1;
});
