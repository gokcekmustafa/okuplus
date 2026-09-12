/*
 * Staging-only student E2E runner.
 *
 * This runner deliberately uses the browser's normal authenticated requests.
 * It does not import Prisma, seed fixtures, perform cleanup, or call admin
 * endpoints. The only writes it can cause are the same placement/training
 * session, attempt, and completion writes a student makes in the product.
 */
import { chromium, type Browser, type Page } from "playwright-core";
import {
  planQuotaAwareAttempts,
  type PracticeQuestionQuota,
  type QuotaAwareAttemptPlan,
} from "./browser-student-full-e2e-policy.js";

const STAGING_ORIGIN = "https://okuplus-git-staging-gokcekmustafas-projects.vercel.app";
const BASE_URL = (process.env.BASE_URL?.trim() || STAGING_ORIGIN).replace(/\/$/u, "");
const CHROME_PATH =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BROWSER_REQUEST_TIMEOUT_MS = 30_000;

const DAILY_FAMILIES = [
  "ATTENTION_BURST",
  "RAPID_RECOGNITION",
  "PHRASE_CHUNKING",
  "MAIN_IDEA",
  "DETAIL_EVIDENCE",
  "INFERENCE",
] as const;

type JsonObject = Record<string, unknown>;

type BrowserApiResult = {
  status: number;
  body: unknown;
};

type StudentQuestion = {
  questionVersionId: string;
  contentId: string;
  contentVersionId: string;
  type: string;
  options: unknown;
  blankIds: string[];
};

type DailyItem = {
  id: string;
  position: number;
  family: string;
  competency: string;
  difficulty: string;
  templateVersionId: string;
  exerciseSessionId: string | null;
  status: string;
  exerciseSessionStatus: string | null;
};

type DailyWork = {
  item: DailyItem;
  questions: StudentQuestion[];
  attemptedQuestionIds: Set<string>;
  retryQuestionIds: Set<string>;
  questionCount: number;
  attemptCount: number;
  questionsLoaded: boolean;
};

type ItemCheckpoint = {
  position: number;
  family: string;
  competency: string;
  questionCount: number;
  rendered: "PASS" | "NOT_RUN";
  submit: "PASS" | "NOT_RUN" | "BLOCKED_BY_QUOTA";
  serverResults: { submitted: number; correct: number; incorrect: number };
  gpDelta: number | null;
  progressDelta: number | null;
  finalStatus: string;
};

type ScoreCoverage = {
  correct: boolean;
  wrong: boolean;
};

type AttemptBudget = {
  maxAttempts: number;
  attempted: number;
  quotaExhausted: boolean;
  budgetExhausted: boolean;
};

type PlacementOutcome = {
  assessmentId: string;
  profile: string;
  gamification: JsonObject;
  mode: "PASS_EXISTING" | "PASS_CREATED";
};

type RunnerReport = {
  status: "PASS" | "PASS_WITH_LIMITATIONS" | "FAIL";
  auth: string;
  placement: string;
  firstTraining: string;
  fastReading: string;
  comprehension: string;
  attempt: string;
  gp: string;
  trainingCompletion: string;
  dailyGoal: string;
  streak: string;
  performance: string;
  adaptiveSelection: string;
  publishedContent: string;
  finalState: string;
  bugs: string[];
  normalFlowWrites: string;
  quotaLimit: number | null;
  quotaUsedAtStart: number | null;
  quotaRemainingAtStart: number | null;
  questionsAttempted: number;
  quotaExhausted: boolean;
  completionBlockedByQuota: boolean;
  items: ItemCheckpoint[];
  stagingE2EReady: "YES" | "LIMITED_BY_FREE_QUOTA" | "NO";
  productionTouched: "NO";
};

type E2EStage =
  | "E2E_START"
  | "AUTH_START"
  | "AUTH_DONE"
  | "PLACEMENT_START"
  | "PLACEMENT_DONE"
  | "FIRST_TRAINING_START"
  | "FIRST_TRAINING_DONE"
  | "EXERCISE_START"
  | "EXERCISE_DONE"
  | "ATTEMPT_START"
  | "ATTEMPT_DONE"
  | "COMPLETION_START"
  | "COMPLETION_DONE"
  | "FINAL_STATE_START"
  | "FINAL_STATE_DONE";

let currentStage: E2EStage = "E2E_START";

function logStage(stage: E2EStage): void {
  currentStage = stage;
  console.log(stage);
}

function logItemCheckpoint(event: "START" | "DONE", checkpoint: ItemCheckpoint): void {
  console.log(
    JSON.stringify({
      checkpoint: `ITEM_${checkpoint.position}_${event}`,
      family: checkpoint.family,
      competency: checkpoint.competency,
      questionCount: checkpoint.questionCount,
      rendered: checkpoint.rendered,
      submit: checkpoint.submit,
      serverResults: checkpoint.serverResults,
      gpDelta: checkpoint.gpDelta,
      progressDelta: checkpoint.progressDelta,
      finalStatus: checkpoint.finalStatus,
    }),
  );
}

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bilinmeyen hata";
}

function assertStagingTarget(): void {
  let parsed: URL;
  try {
    parsed = new URL(BASE_URL);
  } catch {
    throw new Error("BASE_URL geçerli bir URL olmalı");
  }

  if (parsed.origin !== STAGING_ORIGIN) {
    throw new Error(
      `BASE_URL reddedildi: yalnızca onaylı staging origin kullanılabilir (${parsed.origin})`,
    );
  }
  if (/production|okuplus\.online/iu.test(parsed.hostname)) {
    throw new Error("Production BASE_URL full student E2E runner tarafından reddedildi");
  }
}

function requireStudentCredentials(): { email: string; password: string } {
  const email = process.env.STAGING_STUDENT_EMAIL?.trim();
  const password = process.env.STAGING_STUDENT_PASSWORD;
  if (!email || !password) {
    throw new Error("STAGING_STUDENT_EMAIL ve STAGING_STUDENT_PASSWORD gerekli");
  }
  return { email, password };
}

function hasPrivateAnswerFields(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPrivateAnswerFields);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, child]) => {
    if (["correctAnswer", "correctOptionIds", "expectedAnswer", "answerKey"].includes(key)) {
      return true;
    }
    return hasPrivateAnswerFields(child);
  });
}

async function browserApi(
  page: Page,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<BrowserApiResult> {
  return page.evaluate(
    async ({ requestPath, method, body, requestTimeoutMs }) => {
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
      const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(requestPath, {
          method: method ?? "GET",
          credentials: "include",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        return {
          status: response.status,
          body: await response.json().catch(() => null),
        };
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    {
      requestPath: path,
      method: options.method,
      body: options.body,
      requestTimeoutMs: BROWSER_REQUEST_TIMEOUT_MS,
    },
  );
}

function assertApiOk(result: BrowserApiResult, label: string): void {
  if (result.status !== 200) {
    throw new Error(`${label} başarısız (${safeErrorMessage(result)})`);
  }
}

function asRecord(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`${label} response formatı geçersiz`);
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} listesi response formatı geçersiz`);
  return value;
}

function readString(value: unknown, key: string, label: string): string {
  const result = isObject(value) ? value[key] : undefined;
  if (typeof result !== "string" || !result.trim()) throw new Error(`${label}.${key} eksik`);
  return result;
}

function readOptionalString(value: unknown, key: string): string | null {
  const result = isObject(value) ? value[key] : undefined;
  return typeof result === "string" && result.trim() ? result : null;
}

function readNumber(value: unknown, key: string, label: string): number {
  const result = isObject(value) ? value[key] : undefined;
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`${label}.${key} eksik veya geçersiz`);
  }
  return result;
}

function readNullableNumber(value: unknown, key: string, label: string): number | null {
  const result = isObject(value) ? value[key] : undefined;
  if (result === null) return null;
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`${label}.${key} eksik veya geçersiz`);
  }
  return result;
}

function readPracticeQuestionQuota(value: unknown): PracticeQuestionQuota {
  const data = asRecord(apiData({ status: 200, body: value }), "entitlements.data");
  const plan = asRecord(data.plan, "entitlements.plan");
  const features = asRecord(data.features, "entitlements.features");
  const practiceQuestion = asRecord(features.PRACTICE_QUESTION, "entitlements.PRACTICE_QUESTION");
  const dailyLimit = readNullableNumber(
    practiceQuestion,
    "dailyLimit",
    "entitlements.PRACTICE_QUESTION",
  );
  const usedToday = readNumber(practiceQuestion, "usedToday", "entitlements.PRACTICE_QUESTION");
  const remainingToday = readNullableNumber(
    practiceQuestion,
    "remainingToday",
    "entitlements.PRACTICE_QUESTION",
  );
  if (!Number.isInteger(usedToday) || usedToday < 0) {
    throw new Error("entitlements.PRACTICE_QUESTION.usedToday geçersiz");
  }
  if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 0)) {
    throw new Error("entitlements.PRACTICE_QUESTION.dailyLimit geçersiz");
  }
  if (remainingToday !== null && (!Number.isInteger(remainingToday) || remainingToday < 0)) {
    throw new Error("entitlements.PRACTICE_QUESTION.remainingToday geçersiz");
  }
  return {
    plan: readString(plan, "code", "entitlements.plan"),
    dailyLimit,
    usedToday,
    remainingToday,
  };
}

function canAttempt(budget: AttemptBudget): boolean {
  return budget.attempted < budget.maxAttempts;
}

function isQuestionQuotaExhausted(result: BrowserApiResult): boolean {
  return (
    result.status === 403 && safeErrorMessage(result).includes("Günlük ücretsiz soru hakkın doldu")
  );
}

function readQuestions(value: unknown): StudentQuestion[] {
  const rows = asArray(asRecord(value, "questions").questions, "questions");
  return rows.map((row, index) => {
    const question = asRecord(row, `questions[${index}]`);
    const questionVersionId = readString(question, "questionVersionId", `questions[${index}]`);
    const contentId = readString(question, "contentId", `questions[${index}]`);
    const contentVersionId = readString(question, "contentVersionId", `questions[${index}]`);
    const type = readString(question, "type", `questions[${index}]`);
    const blankIds = Array.isArray(question.blankIds)
      ? question.blankIds.filter((id): id is string => typeof id === "string")
      : [];
    if (hasPrivateAnswerFields(question)) {
      throw new Error("Öğrenci soru response'unda doğru cevap alanı sızdı");
    }
    return {
      questionVersionId,
      contentId,
      contentVersionId,
      type,
      options: question.options,
      blankIds,
    };
  });
}

function optionIds(question: StudentQuestion): string[] {
  if (!Array.isArray(question.options)) return [];
  return question.options
    .filter(isObject)
    .map((option) => option.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function answerForQuestion(question: StudentQuestion): unknown {
  switch (question.type) {
    case "MULTIPLE_CHOICE": {
      const first = optionIds(question)[0];
      if (!first) throw new Error("MULTIPLE_CHOICE sorusunda seçenek bulunamadı");
      return [first];
    }
    case "TRUE_FALSE":
      return false;
    case "MATCHING":
      return {};
    case "FILL_BLANK":
      return Object.fromEntries(question.blankIds.map((blankId) => [blankId, ""]));
    case "OPEN_ENDED":
      return "Pasajda verilen bilgileri temel alan kısa bir yanıt.";
    default:
      throw new Error(`Desteklenmeyen soru tipi: ${question.type}`);
  }
}

function retryAnswerForQuestion(question: StudentQuestion, firstAnswer: unknown): unknown {
  if (question.type === "MULTIPLE_CHOICE") {
    const firstIds = Array.isArray(firstAnswer)
      ? firstAnswer.filter((value): value is string => typeof value === "string")
      : [];
    const alternative = optionIds(question).find((id) => !firstIds.includes(id));
    return alternative ? [alternative] : firstAnswer;
  }
  if (question.type === "TRUE_FALSE" && typeof firstAnswer === "boolean") {
    return !firstAnswer;
  }
  return firstAnswer;
}

function attemptedIds(value: unknown): Set<string> {
  const attempts = isObject(value) && Array.isArray(value.attempts) ? value.attempts : [];
  return new Set(
    attempts
      .filter(isObject)
      .map((attempt) => attempt.questionVersionId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
  );
}

function retryQuestionIds(value: unknown): Set<string> {
  const attempts = isObject(value) && Array.isArray(value.attempts) ? value.attempts : [];
  return new Set(
    attempts
      .filter(isObject)
      .filter((attempt) => attempt.isCorrect === false && Number(attempt.responseOrder || 1) === 1)
      .map((attempt) => attempt.questionVersionId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
  );
}

function needsQuestionAttempt(entry: DailyWork, questionVersionId: string): boolean {
  return (
    !entry.attemptedQuestionIds.has(questionVersionId) ||
    entry.retryQuestionIds.has(questionVersionId)
  );
}

async function login(page: Page, credentials: { email: string; password: string }): Promise<void> {
  await page.goto(`${BASE_URL}/`, {
    waitUntil: "networkidle",
    timeout: BROWSER_REQUEST_TIMEOUT_MS,
  });
  await page.waitForSelector("#login-form", { state: "visible", timeout: 30_000 });
  await page.fill("#login-email", credentials.email);
  await page.fill("#login-password", credentials.password);
  const loginResponse = page.waitForResponse(
    (response) => response.url().endsWith("/auth/login") && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.click("#login-submit");
  const response = await loginResponse;
  const body = await response.json().catch(() => null);
  if (response.status() !== 200) {
    const result: BrowserApiResult = { status: response.status(), body };
    throw new Error(`Öğrenci login başarısız (${safeErrorMessage(result)})`);
  }
  await page.waitForSelector("#view-app:not(.hidden)", { state: "visible", timeout: 30_000 });
}

async function assertStudentAuth(page: Page): Promise<void> {
  const me = await browserApi(page, "/auth/me");
  assertApiOk(me, "auth/me");
  const data = asRecord(apiData(me), "auth/me.data");
  const user = asRecord(data.user, "auth/me.user");
  if (typeof user.id !== "string" || !user.id) throw new Error("auth/me öğrenci kimliği eksik");
  if (user.platformRole !== null && user.platformRole !== undefined) {
    throw new Error("Test hesabı platform kullanıcısı; öğrenci akışı reddedildi");
  }
  const tenantContext = asRecord(data.tenantContext, "auth/me.tenantContext");
  if (typeof tenantContext.tenantId !== "string" || !tenantContext.tenantId) {
    throw new Error("Öğrenci tenant context eksik");
  }
  if (tenantContext.tenantType !== "INDIVIDUAL") {
    throw new Error("Test hesabı individual student tenant context'inde değil");
  }

  const contexts = await browserApi(page, "/auth/contexts");
  assertApiOk(contexts, "auth/contexts");
  const contextRows = asArray(
    asRecord(apiData(contexts), "auth/contexts.data").contexts,
    "contexts",
  );
  const hasStudentContext = contextRows.some(
    (row) =>
      isObject(row) && row.active === true && row.isPersonal === true && row.role === "STUDENT",
  );
  if (!hasStudentContext) throw new Error("Aktif individual STUDENT membership doğrulanamadı");
}

async function runPlacement(
  page: Page,
  baselineGamification: JsonObject,
): Promise<PlacementOutcome> {
  const placementLookup = await browserApi(page, "/student/onboarding/placement");
  assertApiOk(placementLookup, "placement assessment lookup");
  const assessmentId = readString(apiData(placementLookup), "assessmentId", "placement lookup");

  const resultBefore = await browserApi(
    page,
    `/student/assessments/${encodeURIComponent(assessmentId)}/result`,
  );
  assertApiOk(resultBefore, "placement result precheck");
  if (apiData(resultBefore) !== null) {
    const profileResult = await browserApi(page, "/student/onboarding");
    assertApiOk(profileResult, "existing placement learning profile");
    if (apiData(profileResult) === null) {
      throw new Error("Mevcut placement sonucu var ancak learning profile okunamadı");
    }

    const existingGamificationResult = await browserApi(page, "/student/gamification");
    assertApiOk(existingGamificationResult, "existing placement gamification");
    const existingGamification = asRecord(
      apiData(existingGamificationResult),
      "existing placement gamification.data",
    );

    return {
      assessmentId,
      profile: "PASS_EXISTING",
      gamification: existingGamification,
      mode: "PASS_EXISTING",
    };
  }

  const assessmentList = await browserApi(page, "/student/assessments");
  assertApiOk(assessmentList, "student assessments");
  const items = asArray(
    asRecord(apiData(assessmentList), "student assessments.data").items,
    "assessments",
  );
  const assessment = items.find((row) => isObject(row) && row.id === assessmentId);
  if (!assessment) throw new Error("Canonical placement assessment öğrenci listesinde bulunamadı");
  if (isObject(assessment) && assessment.sessionStatus === "COMPLETED") {
    throw new Error(
      "Placement session tamamlanmış fakat sonuç bulunamadı; güvenli tekrar durduruldu",
    );
  }

  let sessionId = isObject(assessment)
    ? readOptionalString(assessment, "inProgressSessionId")
    : null;
  if (!sessionId) {
    const started = await browserApi(
      page,
      `/student/assessments/${encodeURIComponent(assessmentId)}/start`,
      { method: "POST", body: {} },
    );
    assertApiOk(started, "placement start");
    sessionId = readString(apiData(started), "sessionId", "placement start");
  }

  const sessionState = await browserApi(page, `/student/sessions/${encodeURIComponent(sessionId)}`);
  assertApiOk(sessionState, "placement session state");
  const questionResult = await browserApi(
    page,
    `/student/sessions/${encodeURIComponent(sessionId)}/questions`,
  );
  assertApiOk(questionResult, "placement questions");
  const questions = readQuestions(apiData(questionResult));
  if (questions.length === 0) throw new Error("Placement için soru bulunamadı");
  const existing = attemptedIds(apiData(sessionState));

  for (const [index, question] of questions.entries()) {
    if (existing.has(question.questionVersionId)) continue;
    const attempt = await browserApi(
      page,
      `/student/questions/${encodeURIComponent(question.questionVersionId)}/attempts`,
      {
        method: "POST",
        body: {
          sessionId,
          answer: answerForQuestion(question),
          clientAttemptId: `staging-full-e2e-placement-${sessionId}-${index}`,
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
  assertApiOk(completed, "placement complete");

  const resultAfter = await browserApi(
    page,
    `/student/assessments/${encodeURIComponent(assessmentId)}/result`,
  );
  assertApiOk(resultAfter, "placement result");
  const resultData = apiData(resultAfter);
  if (resultData === null) throw new Error("Placement sonucu completion sonrasında oluşmadı");

  const profile = await browserApi(page, "/student/onboarding");
  assertApiOk(profile, "learning profile");

  const afterGamification = await browserApi(page, "/student/gamification");
  assertApiOk(afterGamification, "placement gamification check");
  const afterData = asRecord(apiData(afterGamification), "gamification.data");
  const beforePoints = readNumber(baselineGamification, "totalPoints", "baseline gamification");
  const afterPoints = readNumber(afterData, "totalPoints", "placement gamification");
  const beforeStreak = readNumber(baselineGamification, "currentDays", "baseline gamification");
  const afterStreak = readNumber(afterData, "currentDays", "placement gamification");
  if (afterPoints !== beforePoints || afterStreak !== beforeStreak) {
    throw new Error("Placement GP veya streak değerini değiştirdi");
  }

  return {
    assessmentId,
    profile: "PASS",
    gamification: afterData,
    mode: "PASS_CREATED",
  };
}

async function readDailyWork(
  page: Page,
  dailyId: string,
): Promise<{ daily: JsonObject; work: DailyWork[] }> {
  const dailyResult = await browserApi(
    page,
    `/student/training/daily/${encodeURIComponent(dailyId)}`,
  );
  assertApiOk(dailyResult, "daily training state");
  const daily = asRecord(apiData(dailyResult), "daily training.data");
  const itemRows = asArray(daily.items, "daily training items");
  const items: DailyItem[] = itemRows.map((row, index) => {
    const item = asRecord(row, `daily.items[${index}]`);
    return {
      id: readString(item, "id", `daily.items[${index}]`),
      position: readNumber(item, "position", `daily.items[${index}]`),
      family: readString(item, "family", `daily.items[${index}]`),
      competency: readString(item, "competency", `daily.items[${index}]`),
      difficulty: readString(item, "difficulty", `daily.items[${index}]`),
      templateVersionId: readString(item, "templateVersionId", `daily.items[${index}]`),
      exerciseSessionId: readOptionalString(item, "exerciseSessionId"),
      status: readString(item, "status", `daily.items[${index}]`),
      exerciseSessionStatus: readOptionalString(item, "exerciseSessionStatus"),
    };
  });

  const work: DailyWork[] = [];
  for (const item of items) {
    if (!item.exerciseSessionId)
      throw new Error(`Daily item ${item.position} exercise session eksik`);
    const detailResult = await browserApi(
      page,
      `/student/sessions/${encodeURIComponent(item.exerciseSessionId)}/detail`,
    );
    assertApiOk(detailResult, `daily item ${item.position} detail`);
    const detail = asRecord(apiData(detailResult), `daily item ${item.position}.detail`);
    const questionCount = readNumber(detail, "questionCount", `daily item ${item.position}.detail`);
    const attemptCount = readNumber(detail, "attemptCount", `daily item ${item.position}.detail`);
    if (questionCount < 1) {
      throw new Error(`Daily item ${item.position} için soru sayısı bulunamadı`);
    }

    let questions: StudentQuestion[] = [];
    let attemptedQuestionIds = new Set<string>();
    let retryQuestionIdsForEntry = new Set<string>();
    const questionsLoaded = item.status === "IN_PROGRESS" || item.status === "COMPLETED";
    if (questionsLoaded) {
      const sessionState = await browserApi(
        page,
        `/student/sessions/${encodeURIComponent(item.exerciseSessionId)}`,
      );
      assertApiOk(sessionState, `daily item ${item.position} session state`);
      attemptedQuestionIds = attemptedIds(apiData(sessionState));
      retryQuestionIdsForEntry = retryQuestionIds(apiData(sessionState));
      const questionResult = await browserApi(
        page,
        `/student/sessions/${encodeURIComponent(item.exerciseSessionId)}/questions`,
      );
      assertApiOk(questionResult, `daily item ${item.position} questions`);
      questions = readQuestions(apiData(questionResult));
      if (questions.length === 0)
        throw new Error(`Daily item ${item.position} için soru bulunamadı`);
      if (questions.length !== questionCount) {
        throw new Error(
          `Daily item ${item.position} soru sayısı detail ile eşleşmedi (${questions.length}/${questionCount})`,
        );
      }
    }
    work.push({
      item,
      questions,
      attemptedQuestionIds,
      retryQuestionIds: retryQuestionIdsForEntry,
      questionCount,
      attemptCount,
      questionsLoaded,
    });
  }
  return { daily, work };
}

function countOutstandingQuestions(work: DailyWork[]): number {
  return work.reduce(
    (total, entry) =>
      total +
      Math.max(
        0,
        entry.questionCount -
          (entry.questionsLoaded ? entry.attemptedQuestionIds.size : entry.attemptCount),
      ) +
      entry.retryQuestionIds.size,
    0,
  );
}

async function loadDailyItemQuestions(
  page: Page,
  dailyId: string,
  entry: DailyWork,
): Promise<void> {
  if (!entry.item.exerciseSessionId) {
    throw new Error(`Daily item ${entry.item.position} exercise session eksik`);
  }
  const dailyResult = await browserApi(
    page,
    `/student/training/daily/${encodeURIComponent(dailyId)}`,
  );
  assertApiOk(dailyResult, "daily state before item questions");
  const daily = asRecord(apiData(dailyResult), "daily current.data");
  const rows = asArray(daily.items, "daily current.items");
  const row = rows.find((candidate) => isObject(candidate) && candidate.id === entry.item.id);
  if (!isObject(row)) throw new Error(`Daily item ${entry.item.position} bulunamadı`);
  const status = readString(row, "status", `daily item ${entry.item.position}`);
  entry.item.status = status;
  if (status === "COMPLETED") return;
  if (status !== "IN_PROGRESS") {
    throw new Error(`Daily item ${entry.item.position} henüz sıraya gelmedi`);
  }

  const sessionState = await browserApi(
    page,
    `/student/sessions/${encodeURIComponent(entry.item.exerciseSessionId)}`,
  );
  assertApiOk(sessionState, `daily item ${entry.item.position} session state`);
  const questionResult = await browserApi(
    page,
    `/student/sessions/${encodeURIComponent(entry.item.exerciseSessionId)}/questions`,
  );
  assertApiOk(questionResult, `daily item ${entry.item.position} questions`);
  const questions = readQuestions(apiData(questionResult));
  if (questions.length === 0)
    throw new Error(`Daily item ${entry.item.position} için soru bulunamadı`);
  if (questions.length !== entry.questionCount) {
    throw new Error(
      `Daily item ${entry.item.position} soru sayısı detail ile eşleşmedi (${questions.length}/${entry.questionCount})`,
    );
  }
  entry.questions = questions;
  entry.attemptedQuestionIds = attemptedIds(apiData(sessionState));
  entry.retryQuestionIds = retryQuestionIds(apiData(sessionState));
  entry.attemptCount = entry.attemptedQuestionIds.size;
  entry.questionsLoaded = true;
}

async function assertPublishedGraph(
  page: Page,
  item: DailyItem,
  questions: StudentQuestion[],
): Promise<void> {
  if (!item.exerciseSessionId) throw new Error(`Daily item ${item.position} session eksik`);
  const detailResult = await browserApi(
    page,
    `/student/sessions/${encodeURIComponent(item.exerciseSessionId)}/detail`,
  );
  assertApiOk(detailResult, `daily item ${item.position} detail`);
  const detail = asRecord(apiData(detailResult), `daily item ${item.position}.detail`);
  const templateVersion = asRecord(
    detail.templateVersion,
    `daily item ${item.position}.templateVersion`,
  );
  if (templateVersion.status !== "PUBLISHED") {
    throw new Error(`Daily item ${item.position} published olmayan template version kullandı`);
  }

  // Pending daily items are intentionally not exposed through the student
  // session route until the planner advances them. Their published template
  // state is validated from the detail projection and their question graph is
  // checked when loadDailyItemQuestions promotes the item.
  if (questions.length === 0) return;

  const studentSession = await browserApi(
    page,
    `/student/sessions/${encodeURIComponent(item.exerciseSessionId)}`,
  );
  assertApiOk(studentSession, `daily item ${item.position} student session`);
  const sessionData = asRecord(
    apiData(studentSession),
    `daily item ${item.position}.studentSession`,
  );
  const versionData = asRecord(
    sessionData.templateVersion,
    `daily item ${item.position}.studentTemplateVersion`,
  );
  const contents = asArray(versionData.contents, `daily item ${item.position}.contents`);
  for (const question of questions) {
    const mappedContent = contents.find((entry) => {
      if (!isObject(entry) || !isObject(entry.contentVersion)) return false;
      return (
        entry.contentVersion.id === question.contentVersionId &&
        entry.contentVersion.contentId === question.contentId &&
        typeof entry.contentVersion.body === "string" &&
        entry.contentVersion.body.trim().length > 0
      );
    });
    if (!mappedContent) {
      throw new Error(
        `Daily item ${item.position} Question → ContentVersion mapping doğrulanamadı`,
      );
    }
  }
}

async function readPracticeQuestionEntitlement(page: Page): Promise<PracticeQuestionQuota> {
  const result = await browserApi(page, "/account/entitlements");
  assertApiOk(result, "account entitlements");
  return readPracticeQuestionQuota(result.body);
}

async function readProgressSnapshot(
  page: Page,
): Promise<{ scoredAttemptCount: number; totalPoints: number }> {
  const progress = await browserApi(page, "/student/progress");
  assertApiOk(progress, "progress checkpoint");
  const data = asRecord(apiData(progress), "progress checkpoint.data");
  const training = asRecord(data.training, "progress checkpoint.training");
  const gamification = await browserApi(page, "/student/gamification");
  assertApiOk(gamification, "gamification checkpoint");
  const gamificationData = asRecord(apiData(gamification), "gamification checkpoint.data");
  return {
    scoredAttemptCount: readNumber(training, "scoredAttemptCount", "progress checkpoint.training"),
    totalPoints: readNumber(gamificationData, "totalPoints", "gamification checkpoint"),
  };
}

function checkpointFor(checkpoints: ItemCheckpoint[], position: number): ItemCheckpoint {
  const checkpoint = checkpoints.find((entry) => entry.position === position);
  if (!checkpoint) throw new Error(`Item checkpoint bulunamadı: ${position}`);
  return checkpoint;
}

async function loadBrowserExerciseQuestion(
  page: Page,
  sessionId: string,
  questionVersionId: string,
): Promise<void> {
  // The SPA's navigation starts loadExercisePage() asynchronously. When a
  // daily item is promoted immediately after the previous item completes, a
  // second navigate("exercise") can observe the first load's in-flight guard
  // and leave the previous question in the DOM. Wait for the requested ID and
  // retry the official resume helper once after the first load settles.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.evaluate((id) => {
      const resume = (window as unknown as { resumeTodaySession?: (value: string) => void })
        .resumeTodaySession;
      if (typeof resume !== "function") throw new Error("student resume helper bulunamadı");
      resume(id);
    }, sessionId);
    try {
      await page.waitForSelector("#page-exercise:not(.hidden)", {
        state: "visible",
        timeout: BROWSER_REQUEST_TIMEOUT_MS,
      });
      await page.waitForFunction(
        (expectedId) => {
          const element = document.getElementById("exercise-current-question");
          if (!element || element.getAttribute("data-question-version-id") !== expectedId) {
            return false;
          }
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        },
        questionVersionId,
        { timeout: BROWSER_REQUEST_TIMEOUT_MS },
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await page.waitForFunction(
          () =>
            document.getElementById("exercise-load-status")?.textContent?.trim() !==
            "Alıştırma yükleniyor…",
          { timeout: BROWSER_REQUEST_TIMEOUT_MS },
        );
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Browser exercise question yüklenemedi");
}

async function waitForStudentAppReady(page: Page): Promise<void> {
  // The shell is revealed before restoreSession() finishes applying the
  // student role, and completed onboarding redirects through an asynchronous
  // onboarding check. Wait for the settled student dashboard so that redirect
  // cannot race exercise navigation.
  await page.waitForFunction(
    () => {
      const app = document.getElementById("view-app");
      const dashboard = document.getElementById("page-dashboard");
      return Boolean(
        app &&
        !app.classList.contains("hidden") &&
        app.classList.contains("student-shell") &&
        dashboard &&
        !dashboard.classList.contains("hidden"),
      );
    },
    { timeout: BROWSER_REQUEST_TIMEOUT_MS },
  );
  await page.waitForLoadState("networkidle", { timeout: BROWSER_REQUEST_TIMEOUT_MS });
}

async function probeExerciseRender(
  page: Page,
  sessionId: string,
  questionVersionId: string,
): Promise<void> {
  // Each daily item has its own exercise session. Use a fresh page in the
  // authenticated browser context so the previous item's SPA state cannot
  // race the promoted item's render.
  const renderPage = await page.context().newPage();
  try {
    await renderPage.goto(`${BASE_URL}/`, {
      waitUntil: "networkidle",
      timeout: BROWSER_REQUEST_TIMEOUT_MS,
    });
    await renderPage.waitForSelector("#view-app:not(.hidden)", {
      state: "visible",
      timeout: BROWSER_REQUEST_TIMEOUT_MS,
    });
    await waitForStudentAppReady(renderPage);
    await loadBrowserExerciseQuestion(renderPage, sessionId, questionVersionId);
  } finally {
    await renderPage.close().catch(() => undefined);
  }
}

async function submitAttempt(
  page: Page,
  sessionId: string,
  question: StudentQuestion,
  answer: unknown,
  clientAttemptId: string,
  budget: AttemptBudget,
): Promise<JsonObject | null> {
  if (!canAttempt(budget)) {
    budget.budgetExhausted = true;
    return null;
  }
  const result = await browserApi(
    page,
    `/student/questions/${encodeURIComponent(question.questionVersionId)}/attempts`,
    {
      method: "POST",
      body: { sessionId, answer, clientAttemptId, timeSpentMs: 1000 },
    },
  );
  if (isQuestionQuotaExhausted(result)) {
    budget.quotaExhausted = true;
    return null;
  }
  assertApiOk(result, `training attempt ${question.questionVersionId}`);
  const data = asRecord(apiData(result), "attempt.data");
  if (data.questionVersionId !== question.questionVersionId) {
    throw new Error("Attempt response questionVersionId ile istek eşleşmedi");
  }
  budget.attempted += 1;
  return data;
}

async function probeInlineFeedback(
  page: Page,
  candidate: DailyWork,
  budget: AttemptBudget,
): Promise<JsonObject | null> {
  if (!canAttempt(budget)) {
    budget.budgetExhausted = true;
    return null;
  }
  if (!candidate.item.exerciseSessionId)
    throw new Error("Inline feedback için exercise session eksik");
  const question = candidate.questions.find(
    (entry) =>
      entry.type === "MULTIPLE_CHOICE" && needsQuestionAttempt(candidate, entry.questionVersionId),
  );
  if (!question) throw new Error("Inline feedback için yanıtsız MULTIPLE_CHOICE soru bulunamadı");

  await loadBrowserExerciseQuestion(
    page,
    candidate.item.exerciseSessionId,
    question.questionVersionId,
  );
  const selector = "#exercise-mc-options label.answer-card[role='radio']:visible";
  await page.waitForSelector(selector, { timeout: BROWSER_REQUEST_TIMEOUT_MS });
  await page.locator(selector).first().click();
  await page.waitForFunction(
    () => {
      const button = document.getElementById("exercise-submit-attempt") as HTMLButtonElement | null;
      return Boolean(
        button && !button.disabled && button.textContent?.includes("Cevabı kontrol et"),
      );
    },
    { timeout: 15_000 },
  );
  const expectedPath = `/student/questions/${encodeURIComponent(question.questionVersionId)}/attempts`;
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes(expectedPath) && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.click("#exercise-submit-attempt");
  const response = await responsePromise;
  const body = await response.json().catch(() => null);
  if (isQuestionQuotaExhausted({ status: response.status(), body })) {
    budget.quotaExhausted = true;
    return null;
  }
  if (response.status() !== 200) {
    throw new Error(
      `Browser answer başarısız (${safeErrorMessage({ status: response.status(), body })})`,
    );
  }
  const attempt = asRecord(apiData({ status: response.status(), body }), "browser attempt.data");
  await page.waitForSelector("#exercise-attempt-feedback", { state: "visible", timeout: 10_000 });
  const feedback = await page.$eval("#exercise-attempt-feedback", (element) => ({
    text: element.textContent?.trim() ?? "",
    display: getComputedStyle(element).display,
  }));
  if (!feedback.text || feedback.display === "none") throw new Error("Inline feedback görünmedi");
  if ((await page.locator("#celebration-layer:not(.hidden)").count()) > 0) {
    throw new Error("Ara cevapta celebration popup göründü");
  }
  budget.attempted += 1;
  if (attempt.isCorrect === false) {
    candidate.retryQuestionIds.add(question.questionVersionId);
  } else {
    candidate.retryQuestionIds.delete(question.questionVersionId);
  }
  candidate.attemptedQuestionIds.add(question.questionVersionId);
  return attempt;
}

async function ensureScoreCoverage(
  page: Page,
  work: DailyWork[],
  coverage: ScoreCoverage,
  runId: string,
  budget: AttemptBudget,
): Promise<void> {
  if (coverage.correct && coverage.wrong) return;
  if (budget.quotaExhausted || budget.budgetExhausted) return;
  const target = work.find((entry) =>
    entry.questions.some(
      (question) => question.type === "MULTIPLE_CHOICE" && optionIds(question).length >= 2,
    ),
  );
  if (!target?.item.exerciseSessionId) return;
  const question = target.questions.find(
    (entry) => entry.type === "MULTIPLE_CHOICE" && optionIds(entry).length >= 2,
  );
  if (!question) return;
  const choices = optionIds(question);
  if (choices.length < 2) throw new Error("Doğru/yanlış coverage için en az iki seçenek gerekli");

  const optionsToTry = coverage.correct || coverage.wrong ? choices.slice(1) : choices;
  for (const [index, optionId] of optionsToTry.entries()) {
    if (coverage.correct && coverage.wrong) break;
    const data = await submitAttempt(
      page,
      target.item.exerciseSessionId,
      question,
      [optionId],
      `${runId}-coverage-${target.item.position}-${index}`,
      budget,
    );
    if (!data) return;
    target.attemptedQuestionIds.add(question.questionVersionId);
    if (data.isCorrect === true) coverage.correct = true;
    if (data.isCorrect === false) coverage.wrong = true;
  }
}

async function processDailyWork(
  page: Page,
  dailyId: string,
  work: DailyWork[],
  coverage: ScoreCoverage,
  runId: string,
  budget: AttemptBudget,
  checkpoints: ItemCheckpoint[],
): Promise<JsonObject | null> {
  for (const entry of work.sort((a, b) => a.item.position - b.item.position)) {
    const checkpoint = checkpointFor(checkpoints, entry.item.position);
    if (entry.item.status === "COMPLETED") {
      checkpoint.finalStatus = "COMPLETED";
      logItemCheckpoint("DONE", checkpoint);
      continue;
    }
    const sessionId = entry.item.exerciseSessionId;
    if (!sessionId) throw new Error(`Daily item ${entry.item.position} session eksik`);
    logItemCheckpoint("START", checkpoint);
    await loadDailyItemQuestions(page, dailyId, entry);
    if (entry.item.status === "COMPLETED") {
      checkpoint.finalStatus = "COMPLETED";
      logItemCheckpoint("DONE", checkpoint);
      continue;
    }
    await assertPublishedGraph(page, entry.item, entry.questions);
    const firstQuestion =
      entry.questions.find((question) => needsQuestionAttempt(entry, question.questionVersionId)) ??
      entry.questions[0];
    if (!firstQuestion) throw new Error(`Daily item ${entry.item.position} için soru bulunamadı`);
    await probeExerciseRender(page, sessionId, firstQuestion.questionVersionId);
    checkpoint.rendered = "PASS";
    const before = await readProgressSnapshot(page);
    let submitted = 0;
    let correct = 0;

    for (const [index, question] of entry.questions.entries()) {
      if (!needsQuestionAttempt(entry, question.questionVersionId)) continue;
      const hadRetryPending = entry.retryQuestionIds.has(question.questionVersionId);
      let data = await submitAttempt(
        page,
        sessionId,
        question,
        answerForQuestion(question),
        `${runId}-item-${entry.item.position}-question-${index}`,
        budget,
      );
      if (!data) {
        checkpoint.submit = "BLOCKED_BY_QUOTA";
        checkpoint.finalStatus = "BLOCKED_BY_QUOTA";
        checkpoint.serverResults = { submitted, correct, incorrect: submitted - correct };
        const afterQuota = await readProgressSnapshot(page);
        checkpoint.gpDelta = afterQuota.totalPoints - before.totalPoints;
        checkpoint.progressDelta = afterQuota.scoredAttemptCount - before.scoredAttemptCount;
        logItemCheckpoint("DONE", checkpoint);
        return null;
      }
      submitted += 1;
      if (data.isCorrect === true) correct += 1;
      if (data.isCorrect === true) coverage.correct = true;
      if (data.isCorrect === false) coverage.wrong = true;

      // A first wrong answer leaves the item retry-pending. Consume exactly
      // one retry before allowing the exercise session to complete.
      if (data.isCorrect === false && !hadRetryPending) {
        const retryData = await submitAttempt(
          page,
          sessionId,
          question,
          retryAnswerForQuestion(question, answerForQuestion(question)),
          `${runId}-item-${entry.item.position}-question-${index}-retry`,
          budget,
        );
        if (!retryData) {
          checkpoint.submit = "BLOCKED_BY_QUOTA";
          checkpoint.finalStatus = "BLOCKED_BY_QUOTA";
          checkpoint.serverResults = { submitted, correct, incorrect: submitted - correct };
          const afterQuota = await readProgressSnapshot(page);
          checkpoint.gpDelta = afterQuota.totalPoints - before.totalPoints;
          checkpoint.progressDelta = afterQuota.scoredAttemptCount - before.scoredAttemptCount;
          logItemCheckpoint("DONE", checkpoint);
          return null;
        }
        data = retryData;
        submitted += 1;
        if (data.isCorrect === true) correct += 1;
        if (data.isCorrect === true) coverage.correct = true;
        if (data.isCorrect === false) coverage.wrong = true;
      }
      entry.attemptedQuestionIds.add(question.questionVersionId);
      entry.retryQuestionIds.delete(question.questionVersionId);
    }

    const current = await browserApi(
      page,
      `/student/sessions/${encodeURIComponent(sessionId)}/detail`,
    );
    assertApiOk(current, `daily item ${entry.item.position} pre-complete state`);
    const currentData = asRecord(apiData(current), `daily item ${entry.item.position}.state`);
    if (currentData.status === "IN_PROGRESS") {
      const completed = await browserApi(
        page,
        `/student/sessions/${encodeURIComponent(sessionId)}/complete`,
        { method: "POST", body: {} },
      );
      assertApiOk(completed, `daily item ${entry.item.position} complete`);
    }

    const refreshed = await browserApi(
      page,
      `/student/training/daily/${encodeURIComponent(dailyId)}`,
    );
    assertApiOk(refreshed, "daily state after item completion");
    const refreshedData = asRecord(apiData(refreshed), "daily refreshed.data");
    const refreshedItems = asArray(refreshedData.items, "daily refreshed.items");
    const refreshedItem = refreshedItems.find((row) => isObject(row) && row.id === entry.item.id);
    if (!isObject(refreshedItem) || refreshedItem.status !== "COMPLETED") {
      throw new Error(`Daily item ${entry.item.position} completion state doğrulanamadı`);
    }
    const after = await readProgressSnapshot(page);
    checkpoint.submit = submitted > 0 ? "PASS" : "NOT_RUN";
    checkpoint.serverResults = { submitted, correct, incorrect: submitted - correct };
    checkpoint.gpDelta = after.totalPoints - before.totalPoints;
    checkpoint.progressDelta = after.scoredAttemptCount - before.scoredAttemptCount;
    checkpoint.finalStatus = "COMPLETED";
    logItemCheckpoint("DONE", checkpoint);
  }
  const finalDailyResult = await browserApi(
    page,
    `/student/training/daily/${encodeURIComponent(dailyId)}`,
  );
  assertApiOk(finalDailyResult, "final daily state");
  const finalDaily = asRecord(apiData(finalDailyResult), "final daily.data");
  if (finalDaily.status !== "COMPLETED") throw new Error("Daily Training tamamlanmadı");
  const completedItems = readNumber(finalDaily, "completedItems", "final daily");
  const totalItems = readNumber(finalDaily, "totalItems", "final daily");
  if (completedItems !== totalItems)
    throw new Error("Daily item tamamlanma sayısı toplamla eşleşmedi");
  return finalDaily;
}

async function main(): Promise<void> {
  const report: RunnerReport = {
    status: "PASS",
    auth: "NOT_RUN",
    placement: "NOT_RUN",
    firstTraining: "NOT_RUN",
    fastReading: "NOT_RUN",
    comprehension: "NOT_RUN",
    attempt: "NOT_RUN",
    gp: "NOT_RUN",
    trainingCompletion: "NOT_RUN",
    dailyGoal: "NOT_RUN",
    streak: "NOT_RUN",
    performance: "NOT_RUN",
    adaptiveSelection: "NOT_RUN",
    publishedContent: "NOT_RUN",
    finalState: "NOT_RUN",
    bugs: [],
    normalFlowWrites: "PLACEMENT/TRAINING SESSION, ATTEMPT VE COMPLETION AKIŞIYLA SINIRLI",
    quotaLimit: null,
    quotaUsedAtStart: null,
    quotaRemainingAtStart: null,
    questionsAttempted: 0,
    quotaExhausted: false,
    completionBlockedByQuota: false,
    items: [],
    stagingE2EReady: "NO",
    productionTouched: "NO",
  };

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    logStage("E2E_START");
    assertStagingTarget();
    const credentials = requireStudentCredentials();
    const runId = `staging-full-e2e-${Date.now()}`;

    logStage("AUTH_START");
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      timeout: BROWSER_REQUEST_TIMEOUT_MS,
    });
    const browserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await browserContext.newPage();
    await login(page, credentials);
    await assertStudentAuth(page);
    report.auth = "PASS";
    logStage("AUTH_DONE");

    logStage("PLACEMENT_START");
    const baselineGamificationResult = await browserApi(page, "/student/gamification");
    assertApiOk(baselineGamificationResult, "baseline gamification");
    const baselineGamification = asRecord(
      apiData(baselineGamificationResult),
      "baseline gamification.data",
    );

    const placement = await runPlacement(page, baselineGamification);
    report.placement =
      placement.mode === "PASS_EXISTING"
        ? `PASS_EXISTING (assessment=${placement.assessmentId}, mevcut placement sonucu ve profil kullanıldı; yeni placement yazımı yapılmadı)`
        : `PASS (assessment=${placement.assessmentId}, GP/streak değişmedi)`;
    logStage("PLACEMENT_DONE");

    logStage("FIRST_TRAINING_START");
    const todayBefore = await browserApi(page, "/student/today");
    assertApiOk(todayBefore, "today precheck");
    const todayBeforeData = asRecord(apiData(todayBefore), "today.data");
    const existingDaily = isObject(todayBeforeData.dailyTraining)
      ? todayBeforeData.dailyTraining
      : null;
    if (existingDaily?.status === "COMPLETED") {
      throw new Error(
        "Bugünkü Training zaten tamamlanmış; güvenli tekrar için yeni test hesabı gerekli",
      );
    }

    const dailyStart = await browserApi(page, "/student/training/daily/start", {
      method: "POST",
      body: {},
    });
    assertApiOk(dailyStart, "daily training start");
    const dailyStartData = asRecord(apiData(dailyStart), "daily start.data");
    const dailyId = readString(dailyStartData, "id", "daily start");
    const { daily, work } = await readDailyWork(page, dailyId);
    const itemCheckpoints: ItemCheckpoint[] = work
      .slice()
      .sort((a, b) => a.item.position - b.item.position)
      .map((entry) => ({
        position: entry.item.position,
        family: entry.item.family,
        competency: entry.item.competency,
        questionCount: entry.questionCount,
        rendered: "NOT_RUN",
        submit: "NOT_RUN",
        serverResults: { submitted: 0, correct: 0, incorrect: 0 },
        gpDelta: null,
        progressDelta: null,
        finalStatus: entry.item.status,
      }));
    report.items = itemCheckpoints;
    const totalItems = readNumber(daily, "totalItems", "daily");
    if (totalItems !== work.length || totalItems < 6) {
      throw new Error("Daily composition item sayısı runtime sözleşmesiyle uyuşmuyor");
    }
    const families = work.map((entry) => entry.item.family);
    const missingFamilies = DAILY_FAMILIES.filter((family) => !families.includes(family));
    if (missingFamilies.length > 0) {
      throw new Error(`Daily composition eksik family içeriyor: ${missingFamilies.join(", ")}`);
    }
    const duplicatePositions =
      new Set(work.map((entry) => entry.item.position)).size !== work.length;
    if (duplicatePositions) throw new Error("Daily item position değerleri unique değil");
    if (daily.firstDay !== true && daily.status !== "IN_PROGRESS") {
      throw new Error("Daily Training first-day/resume durumu geçersiz");
    }
    report.firstTraining =
      daily.firstDay === true
        ? `PASS (firstDay=true, ${totalItems} item)`
        : `PASS_RESUME (mevcut IN_PROGRESS daily training, ${totalItems} item)`;
    report.fastReading = "PASS (ATTENTION_BURST/RAPID_RECOGNITION/PHRASE_CHUNKING mevcut)";
    report.comprehension = "PASS (MAIN_IDEA/DETAIL_EVIDENCE/INFERENCE mevcut)";
    report.adaptiveSelection =
      "PASS (family, competency, difficulty, templateVersionId ve adaptiveBand plan içinde taşındı)";
    logStage("FIRST_TRAINING_DONE");

    const quota = await readPracticeQuestionEntitlement(page);
    const outstandingQuestionCount = countOutstandingQuestions(work);
    const quotaPlan: QuotaAwareAttemptPlan = planQuotaAwareAttempts(
      quota,
      outstandingQuestionCount,
    );
    report.quotaLimit = quotaPlan.quotaLimit;
    report.quotaUsedAtStart = quotaPlan.quotaUsedAtStart;
    report.quotaRemainingAtStart = quotaPlan.quotaRemainingAtStart;
    report.completionBlockedByQuota = quotaPlan.completionBlockedByQuota;

    const budget: AttemptBudget = {
      // A full run may need one retry after each first wrong answer. The
      // budget is only a ceiling; no extra request is sent unless scoring
      // actually returns a first wrong result.
      maxAttempts: quotaPlan.fullCompletionPossible
        ? quotaPlan.plannedAttemptCount * 2
        : quotaPlan.plannedAttemptCount,
      attempted: 0,
      quotaExhausted: quotaPlan.quotaRemainingAtStart === 0,
      budgetExhausted: false,
    };

    for (const entry of [...work].sort((a, b) => a.item.position - b.item.position)) {
      await assertPublishedGraph(page, entry.item, entry.questions);
    }
    report.publishedContent =
      "PASS (student graph yalnız published template/content graph üzerinden yüklendi)";

    const trainingGamificationBeforeResult = await browserApi(page, "/student/gamification");
    assertApiOk(trainingGamificationBeforeResult, "training gamification baseline");
    const trainingGamificationBefore = asRecord(
      apiData(trainingGamificationBeforeResult),
      "training gamification baseline.data",
    );

    logStage("EXERCISE_START");
    const coverage: ScoreCoverage = { correct: false, wrong: false };
    const uiCandidate = work.find((entry) =>
      entry.questions.some(
        (question) =>
          question.type === "MULTIPLE_CHOICE" &&
          needsQuestionAttempt(entry, question.questionVersionId),
      ),
    );

    logStage("ATTEMPT_START");
    if (quotaPlan.plannedAttemptCount > 0) {
      if (!uiCandidate) throw new Error("Inline feedback için uygun unanswered item bulunamadı");
      await waitForStudentAppReady(page);
      const uiAttempt = await probeInlineFeedback(page, uiCandidate, budget);
      if (uiAttempt) checkpointFor(itemCheckpoints, uiCandidate.item.position).rendered = "PASS";
      if (uiAttempt?.isCorrect === true) coverage.correct = true;
      if (uiAttempt?.isCorrect === false) coverage.wrong = true;
      if (!quotaPlan.fullCompletionPossible) {
        await ensureScoreCoverage(page, work, coverage, runId, budget);
      }
    }

    report.questionsAttempted = budget.attempted;
    report.quotaExhausted = budget.quotaExhausted;
    if (budget.attempted === 0) {
      report.attempt = "NOT_RUN (PRACTICE_QUESTION kotası bu çalışma için kullanılabilir değil)";
    } else if (coverage.correct && coverage.wrong) {
      report.attempt =
        "PASS (en az bir doğru ve bir yanlış server-side scoring; inline feedback doğrulandı)";
    } else {
      report.attempt = `PASS_WITH_LIMITATIONS (${budget.attempted} kontrollü attempt; doğru/yanlış kapsamı tamamlanmadı)`;
    }
    logStage("ATTEMPT_DONE");
    logStage("EXERCISE_DONE");

    const trainingGamificationAfterAttemptResult = await browserApi(page, "/student/gamification");
    assertApiOk(trainingGamificationAfterAttemptResult, "training gamification after attempts");
    const trainingGamificationAfterAttempt = asRecord(
      apiData(trainingGamificationAfterAttemptResult),
      "training gamification after attempts.data",
    );
    const pointsAtStart = readNumber(
      trainingGamificationBefore,
      "totalPoints",
      "training gamification baseline",
    );
    const pointsAfterAttempt = readNumber(
      trainingGamificationAfterAttempt,
      "totalPoints",
      "training gamification after attempts",
    );
    if (budget.attempted > 0 && pointsAfterAttempt < pointsAtStart) {
      throw new Error("Training attempt sonrası GP değeri azaldı");
    }
    if (budget.attempted > 0) {
      report.gp = `PASS (attempt sonrası totalGP=${pointsAfterAttempt} API'den gözlendi)`;
    } else {
      report.gp = "NOT_RUN (attempt quota bütçesi yok)";
    }

    logStage("COMPLETION_START");
    let finalDaily: JsonObject | null = null;
    if (quotaPlan.fullCompletionPossible) {
      finalDaily = await processDailyWork(
        page,
        dailyId,
        work,
        coverage,
        runId,
        budget,
        itemCheckpoints,
      );
      if (finalDaily) {
        if (!coverage.correct || !coverage.wrong) {
          throw new Error("Günlük akışta hem doğru hem yanlış server-side sonuç gözlenemedi");
        }
        report.attempt =
          "PASS (en az bir doğru ve bir yanlış server-side scoring; inline feedback doğrulandı)";
        report.trainingCompletion = `PASS (${readNumber(finalDaily, "completedItems", "final daily")} / ${readNumber(finalDaily, "totalItems", "final daily")})`;

        const beforeDuplicate = await browserApi(page, "/student/gamification");
        assertApiOk(beforeDuplicate, "duplicate completion baseline");
        const lastItem = [...work].sort((a, b) => b.item.position - a.item.position)[0];
        if (!lastItem?.item.exerciseSessionId) throw new Error("Son daily item session eksik");
        const duplicateCompletion = await browserApi(
          page,
          `/student/sessions/${encodeURIComponent(lastItem.item.exerciseSessionId)}/complete`,
          { method: "POST", body: {} },
        );
        if (
          duplicateCompletion.status !== 200 &&
          (duplicateCompletion.status < 400 || duplicateCompletion.status >= 500)
        ) {
          throw new Error("Duplicate completion beklenmeyen response verdi");
        }
        const afterDuplicate = await browserApi(page, "/student/gamification");
        assertApiOk(afterDuplicate, "duplicate completion state");
        const beforeDuplicateData = asRecord(apiData(beforeDuplicate), "duplicate baseline.data");
        const afterDuplicateData = asRecord(apiData(afterDuplicate), "duplicate after.data");
        if (
          readNumber(beforeDuplicateData, "totalPoints", "duplicate baseline") !==
            readNumber(afterDuplicateData, "totalPoints", "duplicate after") ||
          readNumber(beforeDuplicateData, "currentDays", "duplicate baseline") !==
            readNumber(afterDuplicateData, "currentDays", "duplicate after")
        ) {
          throw new Error("Duplicate completion GP/streak değerini tekrar ilerletti");
        }

        const todayAfter = await browserApi(page, "/student/today");
        assertApiOk(todayAfter, "today final");
        const todayAfterData = asRecord(apiData(todayAfter), "today final.data");
        const goal = asRecord(todayAfterData.dailyGoal, "daily goal");
        if (goal.status !== "COMPLETED") throw new Error("Daily goal COMPLETED olmadı");
        report.dailyGoal = "PASS (COMPLETED)";
        report.streak = `PASS (currentStreak=${readNumber(afterDuplicateData, "currentDays", "gamification")}, duplicate artış yok)`;
        report.gp = `PASS (totalGP=${readNumber(finalDaily, "totalGP", "final daily")}, PointEvent sonucu API'den gözlendi)`;
        report.stagingE2EReady = "YES";
      } else {
        if (!budget.quotaExhausted) {
          throw new Error("Full completion planı beklenenden önce attempt bütçesine ulaştı");
        }
        report.status = "PASS_WITH_LIMITATIONS";
        report.completionBlockedByQuota = true;
        report.trainingCompletion = "COMPLETION_BLOCKED_BY_FREE_QUOTA";
        report.dailyGoal = "NOT_RUN (TrainingSession tamamlanmadı)";
        report.streak = "NOT_ADVANCED (TrainingSession tamamlanmadı)";
        report.stagingE2EReady = "LIMITED_BY_FREE_QUOTA";
      }
    } else {
      report.status = "PASS_WITH_LIMITATIONS";
      report.trainingCompletion = "COMPLETION_BLOCKED_BY_FREE_QUOTA";
      report.dailyGoal = "NOT_RUN (TrainingSession tamamlanmadı)";
      report.streak = "NOT_ADVANCED (TrainingSession tamamlanmadı)";
      report.stagingE2EReady = "LIMITED_BY_FREE_QUOTA";
    }
    report.questionsAttempted = budget.attempted;
    report.quotaExhausted = report.quotaExhausted || budget.quotaExhausted;
    logStage("COMPLETION_DONE");

    logStage("FINAL_STATE_START");
    const progressBefore = await browserApi(page, "/student/progress");
    assertApiOk(progressBefore, "progress");
    const progressData = asRecord(apiData(progressBefore), "progress.data");
    const trainingProgress = asRecord(progressData.training, "progress.training");
    const scoredAttemptCount = readNumber(
      trainingProgress,
      "scoredAttemptCount",
      "progress.training",
    );
    if (budget.attempted > 0 && scoredAttemptCount < 1) {
      throw new Error("Training performance scored attempt güncellenmedi");
    }
    report.performance =
      budget.attempted > 0
        ? "PASS (student progress training aggregate okunabildi)"
        : "NOT_RUN (bu çalışmada yeni attempt yapılmadı)";

    const learningPath = await browserApi(page, "/student/learning-path");
    assertApiOk(learningPath, "learning path");
    const learningPathData = asRecord(apiData(learningPath), "learning path.data");
    if (!Array.isArray(learningPathData.nodes))
      throw new Error("Adaptive learning path response formatı geçersiz");
    report.adaptiveSelection =
      "PASS (daily planner adaptive metadata + learning path response doğrulandı)";

    const placementResult = await browserApi(
      page,
      `/student/assessments/${encodeURIComponent(placement.assessmentId)}/result`,
    );
    assertApiOk(placementResult, "final placement result");
    if (apiData(placementResult) === null) throw new Error("Final placement result kayboldu");
    const finalDailyRead = await browserApi(
      page,
      `/student/training/daily/${encodeURIComponent(dailyId)}`,
    );
    assertApiOk(finalDailyRead, "final daily read");
    report.finalState =
      report.status === "PASS"
        ? "PASS (placement, daily session, attempts, GP/streak/goal/progress API read-only kontrolleri)"
        : "PASS_WITH_LIMITATIONS (quota nedeniyle günlük tamamlanma ve streak doğrulanmadı)";
    logStage("FINAL_STATE_DONE");
  } catch (error) {
    report.status = "FAIL";
    report.bugs.push(`[${currentStage}] ${errorMessage(error)}`);
  } finally {
    if (page) await page.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.status === "FAIL") process.exitCode = 1;
}

try {
  await main();
} catch (error: unknown) {
  console.log(
    JSON.stringify(
      {
        status: "FAIL",
        failedStage: currentStage,
        error: errorMessage(error),
        productionTouched: "NO",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
