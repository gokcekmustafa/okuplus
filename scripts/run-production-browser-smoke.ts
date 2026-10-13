import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page, type Request } from "playwright-core";

const BASE_URLS = ["https://www.okupratik.com"] as const;
const REQUEST_TIMEOUT_MS = 30_000;
const READ_PATHS = [
  "/auth/me",
  "/student/today",
  "/student/progress",
  "/student/learning-path",
  "/student/history?page=1&pageSize=5",
  "/student/gamification",
  "/account/entitlements",
] as const;

type DomainReport = {
  baseUrl: string;
  login: "PASS" | "FAIL";
  loginHttpStatus: number | null;
  loginErrorCategory: LoginErrorCategory | null;
  loginFailureReason: LoginFailureReason | null;
  authMe: "PASS" | "FAIL";
  dashboard: "PASS" | "FAIL";
  readPaths: "PASS" | "FAIL";
  assignments: "PASS" | "FAIL";
  assignmentHttpStatus: number | null;
  assignmentCount: number | null;
  assignmentDetail: "PASS" | "FAIL" | "SKIPPED_NO_EXISTING_ASSIGNMENT";
  assignmentDetailHttpStatus: number | null;
  assignmentDetailVerified: boolean;
  navigation: "PASS" | "FAIL";
  logout: "PASS" | "FAIL";
  logoutHttpStatus: number | null;
  logoutFailureReason: LogoutFailureReason | null;
  consoleErrors: number;
  consoleErrorCategories: ConsoleErrorCategory[];
  pageErrors: number;
  pageErrorMessages: string[];
  failedRequests: number;
  httpErrors: number;
  httpErrorRequests: SafeHttpErrorDiagnostic[];
  preventedMutations: number;
  preventedMutationRequests: SafeMutationDiagnostic[];
  locallyFulfilledMutations: number;
  locallyFulfilledMutationRequests: SafeMutationDiagnostic[];
  blockedMutations: number;
  blockedMutationRequests: SafeMutationDiagnostic[];
  error: string | null;
};

type SmokeReport = {
  status: "PASS" | "FAIL";
  browserLaunch: "PASS" | "FAIL";
  browserLaunchFailureReason: BrowserLaunchFailureReason | null;
  domains: DomainReport[];
  productionStateChanged: "NO";
};

export type LoginErrorCategory =
  | "AUTH_REJECTED"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "UNEXPECTED_STATUS"
  | "UNKNOWN";

export type LogoutFailureReason =
  "BUTTON_UNAVAILABLE" | "RESPONSE_TIMEOUT" | "RESPONSE_UNAVAILABLE" | "UNEXPECTED_STATUS";

export type BrowserLaunchFailureReason =
  "EXECUTABLE_NOT_FOUND" | "LAUNCH_TIMEOUT" | "LAUNCH_FAILED";

export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx" | "other";

export type SafeHttpErrorDiagnostic = {
  method: string;
  path: string;
  statusClass: StatusClass;
};

export type SafeMutationDiagnostic = {
  method: string;
  path: string;
};

export type ConsoleErrorCategory = "LEARNING_PATH" | "NETWORK" | "AUTH" | "OTHER";

export const NO_EXISTING_ASSIGNMENT_DETAIL = "SKIPPED_NO_EXISTING_ASSIGNMENT" as const;

type StudentAssignmentSnapshot = {
  id: string;
  title: string;
  className: string;
  teacherName: string;
  templateTitle: string;
  templateType: string;
  learningStepId: string | null;
  dueDate: string | null;
  status: string;
  assignedAt: string | null;
  sessionCount: number;
  hasInProgressSession: boolean;
  inProgressSessionId: string | null;
  sessionStatus: string | null;
  questionCount: number | null;
  attemptedCount: number;
  scoreSummary: unknown;
  organizationName: string | null;
  studentAssignmentId: string | null;
  studentAssignmentStatus: string;
  assignmentSource: string | null;
};

export type StudentAssignmentListSnapshot = {
  items: StudentAssignmentSnapshot[];
  total: number;
  page: number;
  pageSize: number;
};

type ApiJsonResult = {
  status: number;
  payload: unknown | null;
};

const MAX_SAFE_DIAGNOSTICS = 5;

export function statusClass(status: number): StatusClass {
  if (status >= 200 && status <= 299) return "2xx";
  if (status >= 300 && status <= 399) return "3xx";
  if (status >= 400 && status <= 499) return "4xx";
  if (status >= 500 && status <= 599) return "5xx";
  return "other";
}

function isSensitivePathSegment(segment: string): boolean {
  let decodedSegment = segment;
  try {
    decodedSegment = decodeURIComponent(segment);
  } catch {
    // Keep the encoded segment for the conservative pattern checks below.
  }
  return (
    decodedSegment.includes("@") ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(decodedSegment) ||
    /^[A-Za-z0-9_-]{20,}$/u.test(decodedSegment)
  );
}

export function safeRequestPath(rawUrl: string): string {
  try {
    const pathname = new URL(rawUrl).pathname;
    return pathname
      .split("/")
      .map((segment) => (isSensitivePathSegment(segment) ? "[redacted]" : segment))
      .join("/");
  } catch {
    return "[invalid-url]";
  }
}

export function isMutationMethod(method: string): boolean {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

export function shouldCountFailedRequest(intentionallyPrevented: boolean): boolean {
  return !intentionallyPrevented;
}

export function markSmokeRequestHandled(request: Request, handledRequests: WeakSet<Request>): void {
  handledRequests.add(request);
}

export function unmarkSmokeRequestHandled(
  request: Request,
  handledRequests: WeakSet<Request>,
): void {
  handledRequests.delete(request);
}

export function isAllowedMutationPath(
  rawUrl: string,
  canonicalOrigin: string,
  method = "POST",
): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      method.toUpperCase() === "POST" &&
      url.origin === canonicalOrigin &&
      (url.pathname === "/auth/login" || url.pathname === "/auth/logout")
    );
  } catch {
    return false;
  }
}

export function isSmokeLocalMutationPath(
  rawUrl: string,
  canonicalOrigin: string,
  method = "POST",
): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      method.toUpperCase() === "POST" &&
      url.origin === canonicalOrigin &&
      (url.pathname === "/student/pilot/events" ||
        url.pathname === "/student/assignment-recommendations/refresh")
    );
  } catch {
    return false;
  }
}

export function classifyConsoleError(message: string): ConsoleErrorCategory {
  if (/learning[- ]path|learning-path|öğrenme yolu/iu.test(message)) return "LEARNING_PATH";
  if (/network|fetch|request|timeout| bağlantı/iu.test(message)) return "NETWORK";
  if (/auth|login|logout|csrf|cookie|origin/iu.test(message)) return "AUTH";
  return "OTHER";
}

export function classifyBrowserLaunchFailure(error: unknown): BrowserLaunchFailureReason {
  const message = error instanceof Error ? error.message : "";
  if (/executable|enoent|not found/iu.test(message)) return "EXECUTABLE_NOT_FOUND";
  if (/timeout|timed out/iu.test(message)) return "LAUNCH_TIMEOUT";
  return "LAUNCH_FAILED";
}

export type LoginFailureReason =
  | "AUTH_REJECTED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "UNEXPECTED_STATUS"
  | "UNKNOWN";

export type SafeLoginErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "REQUEST_ERROR"
  | "PAYLOAD_TOO_LARGE";

export function classifyLogoutResponse(
  status: number | null,
): "SUCCESS" | "RESPONSE_TIMEOUT" | "UNEXPECTED_STATUS" {
  if (status === 200) return "SUCCESS";
  if (status === null) return "RESPONSE_TIMEOUT";
  return "UNEXPECTED_STATUS";
}

function isPlaywrightResponseTimeout(error: unknown): boolean {
  return error instanceof Error && /waiting for event ["']response["']/iu.test(error.message);
}

export function classifyLoginHttpStatus(status: number): LoginErrorCategory {
  if (status === 401 || status === 403) return "AUTH_REJECTED";
  if (status === 400) return "BAD_REQUEST";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500 && status <= 599) return "SERVER_ERROR";
  return "UNEXPECTED_STATUS";
}

export function buildSafeLoginDiagnostic(status: number): {
  loginHttpStatus: number;
  loginErrorCategory: LoginErrorCategory;
  loginFailureReason: LoginFailureReason;
} {
  return {
    loginHttpStatus: status,
    loginErrorCategory: classifyLoginHttpStatus(status),
    loginFailureReason: classifyLoginFailureReason(status),
  };
}

export function classifyLoginFailureReason(
  status: number,
  safeErrorCode?: SafeLoginErrorCode | null,
): LoginFailureReason {
  switch (safeErrorCode) {
    case "UNAUTHORIZED":
      return "AUTH_REJECTED";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "VALIDATION_ERROR":
    case "REQUEST_ERROR":
    case "PAYLOAD_TOO_LARGE":
      return "BAD_REQUEST";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "SERVICE_UNAVAILABLE":
    case "INTERNAL_ERROR":
      return "SERVER_ERROR";
  }

  if (status === 401) return "AUTH_REJECTED";
  if (status === 403) return "FORBIDDEN";
  if (status === 400) return "BAD_REQUEST";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500 && status <= 599) return "SERVER_ERROR";
  if (status > 0) return "UNEXPECTED_STATUS";
  return "UNKNOWN";
}

function isSafeLoginErrorCode(value: unknown): value is SafeLoginErrorCode {
  return (
    value === "UNAUTHORIZED" ||
    value === "FORBIDDEN" ||
    value === "VALIDATION_ERROR" ||
    value === "RATE_LIMITED" ||
    value === "SERVICE_UNAVAILABLE" ||
    value === "INTERNAL_ERROR" ||
    value === "REQUEST_ERROR" ||
    value === "PAYLOAD_TOO_LARGE"
  );
}

function readSafeLoginErrorCode(payload: unknown): SafeLoginErrorCode | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return null;
  const code = (error as { code?: unknown }).code;
  return isSafeLoginErrorCode(code) ? code : null;
}

export function buildSafeLoginDiagnosticWithCode(
  status: number,
  safeErrorCode?: SafeLoginErrorCode | null,
): {
  loginHttpStatus: number;
  loginErrorCategory: LoginErrorCategory;
  loginFailureReason: LoginFailureReason;
} {
  return {
    loginHttpStatus: status,
    loginErrorCategory: classifyLoginHttpStatus(status),
    loginFailureReason: classifyLoginFailureReason(status, safeErrorCode),
  };
}

type JsonResponseLike = {
  headers(): Record<string, string>;
  json(): Promise<unknown>;
};

/** Consume JSON errors without copying their body into logs or reports. */
export async function consumeJsonLoginErrorBody(
  response: JsonResponseLike,
): Promise<SafeLoginErrorCode | null> {
  const contentType = Object.entries(response.headers()).find(
    ([name]) => name.toLowerCase() === "content-type",
  )?.[1];
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType !== "application/json" && !mediaType.endsWith("+json")) return null;
  try {
    return readSafeLoginErrorCode(await response.json());
  } catch {
    /* Malformed error bodies are intentionally treated as unavailable. */
    return null;
  }
}

export function sanitizeSmokeDiagnostic(message: string): string {
  return message
    .replace(/https?:\/\/[^\s"'<>]+/giu, "[url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[email]")
    .replace(
      /\b(bearer|token|password|secret|cookie)\b(?:\s*(?::|=)\s*|\s+)[^\s,;]+/giu,
      "$1=[redacted]",
    )
    .slice(0, 240);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? sanitizeSmokeDiagnostic(error.message) : "Browser smoke failed";
}

function sanitizePageError(error: Error): string {
  return sanitizeSmokeDiagnostic(`${error.name}: ${error.message}`);
}

function requireCredentials(): { email: string; password: string } {
  const email = process.env.PRODUCTION_SMOKE_EMAIL?.trim();
  const password = process.env.PRODUCTION_SMOKE_PASSWORD;
  if (!email || !password) throw new Error("Production smoke credentials are not configured");
  return { email, password };
}

function pushSafeDiagnostic<T>(items: T[], item: T): void {
  if (items.length < MAX_SAFE_DIAGNOSTICS) items.push(item);
}

async function apiStatus(page: Page, path: string): Promise<number> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, {
      credentials: "include",
      headers: { accept: "application/json", "x-auth-transport": "cookie" },
    });
    return response.status;
  }, path);
}

async function apiJson(page: Page, path: string): Promise<ApiJsonResult> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, {
      credentials: "include",
      headers: { accept: "application/json", "x-auth-transport": "cookie" },
    });
    let payload: unknown | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { status: response.status, payload };
  }, path);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function isAssignmentSnapshot(value: unknown): value is StudentAssignmentSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const requiredStrings = [
    "id",
    "title",
    "className",
    "teacherName",
    "templateTitle",
    "templateType",
    "status",
    "studentAssignmentStatus",
  ];
  if (requiredStrings.some((key) => typeof item[key] !== "string" || item[key] === "")) {
    return false;
  }
  return (
    isNullableString(item.learningStepId) &&
    isNullableString(item.dueDate) &&
    isNullableString(item.assignedAt) &&
    typeof item.sessionCount === "number" &&
    Number.isInteger(item.sessionCount) &&
    item.sessionCount >= 0 &&
    typeof item.hasInProgressSession === "boolean" &&
    isNullableString(item.inProgressSessionId) &&
    isNullableString(item.sessionStatus) &&
    isNullableNonNegativeInteger(item.questionCount) &&
    typeof item.attemptedCount === "number" &&
    Number.isInteger(item.attemptedCount) &&
    item.attemptedCount >= 0 &&
    "scoreSummary" in item &&
    item.scoreSummary !== undefined &&
    isNullableString(item.organizationName) &&
    isNullableString(item.studentAssignmentId) &&
    isNullableString(item.assignmentSource)
  );
}

function unwrapApiData(payload: unknown): unknown | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const data = (payload as { data?: unknown }).data;
  return data === undefined ? null : data;
}

export function parseStudentAssignmentListPayload(
  payload: unknown,
): StudentAssignmentListSnapshot | null {
  const data = unwrapApiData(payload);
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const result = data as Record<string, unknown>;
  if (
    !Array.isArray(result.items) ||
    typeof result.total !== "number" ||
    !Number.isInteger(result.total) ||
    result.total < result.items.length ||
    typeof result.page !== "number" ||
    !Number.isInteger(result.page) ||
    result.page !== 1 ||
    typeof result.pageSize !== "number" ||
    !Number.isInteger(result.pageSize) ||
    result.pageSize !== 20 ||
    result.items.some((item) => !isAssignmentSnapshot(item))
  ) {
    return null;
  }
  return result as StudentAssignmentListSnapshot;
}

export function parseStudentAssignmentDetailPayload(
  payload: unknown,
  expectedId: string,
  expectedTitle: string,
): StudentAssignmentSnapshot | null {
  const data = unwrapApiData(payload);
  return isAssignmentSnapshot(data) && data.id === expectedId && data.title === expectedTitle
    ? data
    : null;
}

async function runDomain(
  browser: Browser,
  baseUrl: (typeof BASE_URLS)[number],
  credentials: { email: string; password: string },
): Promise<DomainReport> {
  const report: DomainReport = {
    baseUrl,
    login: "FAIL",
    loginHttpStatus: null,
    loginErrorCategory: null,
    loginFailureReason: null,
    authMe: "FAIL",
    dashboard: "FAIL",
    readPaths: "FAIL",
    assignments: "FAIL",
    assignmentHttpStatus: null,
    assignmentCount: null,
    assignmentDetail: "FAIL",
    assignmentDetailHttpStatus: null,
    assignmentDetailVerified: false,
    navigation: "FAIL",
    logout: "FAIL",
    logoutHttpStatus: null,
    logoutFailureReason: null,
    consoleErrors: 0,
    consoleErrorCategories: [],
    pageErrors: 0,
    pageErrorMessages: [],
    failedRequests: 0,
    httpErrors: 0,
    httpErrorRequests: [],
    preventedMutations: 0,
    preventedMutationRequests: [],
    locallyFulfilledMutations: 0,
    locallyFulfilledMutationRequests: [],
    blockedMutations: 0,
    blockedMutationRequests: [],
    error: null,
  };
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const intentionallyPreventedRequests = new WeakSet<Request>();
  try {
    const canonicalOrigin = new URL(baseUrl).origin;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!isMutationMethod(request.method())) {
        await route.continue();
        return;
      }

      const diagnostic = {
        method: request.method().toUpperCase(),
        path: safeRequestPath(request.url()),
      } satisfies SafeMutationDiagnostic;
      if (isAllowedMutationPath(request.url(), canonicalOrigin, request.method())) {
        await route.continue();
        return;
      }

      // Keep telemetry and client diagnostics out of production. A prevented
      // request is reported separately from a guard failure so the smoke can
      // prove that no unexpected mutation reached the server.
      report.preventedMutations += 1;
      pushSafeDiagnostic(report.preventedMutationRequests, diagnostic);
      if (isSmokeLocalMutationPath(request.url(), canonicalOrigin, request.method())) {
        markSmokeRequestHandled(request, intentionallyPreventedRequests);
        try {
          await route.fulfill({ status: 204 });
          report.locallyFulfilledMutations += 1;
          pushSafeDiagnostic(report.locallyFulfilledMutationRequests, diagnostic);
        } catch {
          unmarkSmokeRequestHandled(request, intentionallyPreventedRequests);
          report.blockedMutations += 1;
          pushSafeDiagnostic(report.blockedMutationRequests, diagnostic);
        }
        return;
      }
      try {
        markSmokeRequestHandled(request, intentionallyPreventedRequests);
        await route.abort("blockedbyclient");
      } catch {
        unmarkSmokeRequestHandled(request, intentionallyPreventedRequests);
        report.blockedMutations += 1;
        pushSafeDiagnostic(report.blockedMutationRequests, diagnostic);
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        report.consoleErrors += 1;
        const category = classifyConsoleError(message.text());
        if (!report.consoleErrorCategories.includes(category)) {
          pushSafeDiagnostic(report.consoleErrorCategories, category);
        }
      }
    });
    page.on("pageerror", (error) => {
      report.pageErrors += 1;
      if (report.pageErrorMessages.length < 5) {
        report.pageErrorMessages.push(sanitizePageError(error));
      }
    });
    page.on("requestfailed", (request) => {
      if (!shouldCountFailedRequest(intentionallyPreventedRequests.has(request))) return;
      report.failedRequests += 1;
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        report.httpErrors += 1;
        pushSafeDiagnostic(report.httpErrorRequests, {
          method: response.request().method().toUpperCase(),
          path: safeRequestPath(response.url()),
          statusClass: statusClass(response.status()),
        });
      }
    });

    // The app's social-login error return path intentionally opens the normal
    // credential form. Use it to make the smoke deterministic even when the
    // anonymous guest shell is not selected during the first paint.
    const loginUrl = new URL(`${baseUrl}/`);
    loginUrl.searchParams.set("auth", "google-error");
    await page.goto(loginUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });
    // If the guest shell is selected despite the explicit login return state,
    // use the same visible login affordance as a real user.
    const loginForm = page.locator("#login-form");
    if (!(await loginForm.isVisible())) {
      await page.locator("#guest-login-btn").waitFor({
        state: "visible",
        timeout: REQUEST_TIMEOUT_MS,
      });
      await page.locator("#guest-login-btn").click();
    }
    await page.waitForSelector("#login-form", { state: "visible", timeout: REQUEST_TIMEOUT_MS });
    const loginResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/auth/login" &&
        response.request().method() === "POST",
      { timeout: REQUEST_TIMEOUT_MS },
    );
    await page.fill("#login-email", credentials.email);
    await page.fill("#login-password", credentials.password);
    await page.click("#login-submit");
    const loginResponseResult = await loginResponse;
    const loginStatus = loginResponseResult.status();
    if (loginStatus !== 200) {
      const safeErrorCode = await consumeJsonLoginErrorBody(loginResponseResult);
      Object.assign(report, buildSafeLoginDiagnosticWithCode(loginStatus, safeErrorCode));
      throw new Error("Production login failed");
    }
    report.loginHttpStatus = loginStatus;
    report.login = "PASS";
    await page.waitForSelector("#view-app:not(.hidden)", {
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
    report.dashboard = "PASS";

    if ((await apiStatus(page, "/auth/me")) !== 200) throw new Error("/auth/me failed");
    report.authMe = "PASS";
    const statuses = await Promise.all(READ_PATHS.map((path) => apiStatus(page, path)));
    if (statuses.some((status) => status !== 200)) throw new Error("Production read path failed");
    report.readPaths = "PASS";

    const assignmentListPath = "/student/assignments?page=1&pageSize=20";
    const assignmentListResponse = await apiJson(page, assignmentListPath);
    report.assignmentHttpStatus = assignmentListResponse.status;
    const assignmentList =
      assignmentListResponse.status === 200
        ? parseStudentAssignmentListPayload(assignmentListResponse.payload)
        : null;
    if (!assignmentList) throw new Error("Student assignment list schema failed");
    report.assignmentCount = assignmentList.items.length;
    report.assignments = "PASS";

    const progressNav = page.locator('[data-page="progress"]');
    if ((await progressNav.count()) !== 1) throw new Error("Progress navigation missing");
    await progressNav.click();
    await page.waitForSelector("#page-progress:not(.hidden)", {
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
    report.navigation = "PASS";

    const assignmentsNav = page.locator('[data-page="assignments"]');
    if ((await assignmentsNav.count()) !== 1) throw new Error("Assignments navigation missing");
    await assignmentsNav.click();
    await page.waitForSelector("#page-assignments:not(.hidden)", {
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
    await page.waitForSelector("#student-assignment-view:not(.hidden)", {
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });

    await page.waitForFunction(
      (expectedCount) => {
        const container = document.querySelector("#student-assignment-cards");
        if (!container) return false;
        const cards = container.querySelectorAll("article.assignment-student-card");
        return expectedCount === 0
          ? container.querySelector(".empty-learning-state") !== null
          : cards.length === expectedCount;
      },
      assignmentList.items.length,
      { timeout: REQUEST_TIMEOUT_MS },
    );
    const renderedAssignments = await page
      .locator("#student-assignment-cards")
      .evaluate((container) =>
        Array.from(container.querySelectorAll("article.assignment-student-card")).map((card) => ({
          id: card.querySelector<HTMLElement>("[data-assignment-detail-id]")?.dataset
            .assignmentDetailId,
          title: card.querySelector("h3")?.textContent?.trim(),
        })),
      );
    if (renderedAssignments.length !== assignmentList.items.length) {
      throw new Error("Student assignment list does not match the interface");
    }
    const renderedById = new Map(renderedAssignments.map((item) => [item.id, item.title] as const));
    if (assignmentList.items.some((item) => renderedById.get(item.id) !== item.title)) {
      throw new Error("Student assignment interface data does not match the API");
    }

    if (assignmentList.items.length === 0) {
      await page.locator("#student-assignment-cards .empty-learning-state").waitFor({
        state: "visible",
        timeout: REQUEST_TIMEOUT_MS,
      });
      report.assignmentDetail = NO_EXISTING_ASSIGNMENT_DETAIL;
    } else {
      const expectedAssignment = assignmentList.items[0];
      const detailPath = `/student/assignments/${encodeURIComponent(expectedAssignment.id)}`;
      const detailResponse = await apiJson(page, detailPath);
      report.assignmentDetailHttpStatus = detailResponse.status;
      const detail =
        detailResponse.status === 200
          ? parseStudentAssignmentDetailPayload(
              detailResponse.payload,
              expectedAssignment.id,
              expectedAssignment.title,
            )
          : null;
      if (!detail) throw new Error("Student assignment detail schema failed");

      const detailButtons = page.locator("#student-assignment-cards [data-assignment-detail-id]");
      const detailButtonIndex = await detailButtons.evaluateAll(
        (buttons, expectedId) =>
          buttons.findIndex(
            (button) => (button as HTMLElement).dataset.assignmentDetailId === expectedId,
          ),
        expectedAssignment.id,
      );
      if (detailButtonIndex < 0) throw new Error("Student assignment detail action missing");
      await detailButtons.nth(detailButtonIndex).click();
      await page.waitForSelector("#assignment-detail-modal:not(.hidden)", {
        state: "visible",
        timeout: REQUEST_TIMEOUT_MS,
      });
      const detailTitle = await page.locator("#assignment-detail-title").textContent();
      if (detailTitle?.trim() !== detail.title) {
        throw new Error("Student assignment detail title does not match the API");
      }
      report.assignmentDetail = "PASS";
      report.assignmentDetailVerified = true;
    }

    const userMenuToggle = page.locator("#user-menu-toggle");
    const logoutButton = page.locator('[data-user-menu-action="logout"]');
    try {
      await userMenuToggle.click();
      await logoutButton.waitFor({ state: "visible", timeout: REQUEST_TIMEOUT_MS });
    } catch {
      report.logoutFailureReason = "BUTTON_UNAVAILABLE";
      report.error = "Production logout button unavailable";
      return report;
    }

    const logoutResponse = page
      .waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/auth/logout" &&
          response.request().method() === "POST",
        { timeout: REQUEST_TIMEOUT_MS },
      )
      .then((response) => ({ response, failureReason: null as LogoutFailureReason | null }))
      .catch((error: unknown) => ({
        response: null,
        failureReason: isPlaywrightResponseTimeout(error)
          ? ("RESPONSE_TIMEOUT" as const)
          : ("RESPONSE_UNAVAILABLE" as const),
      }));

    try {
      await logoutButton.click();
    } catch {
      // Always consume the response promise so a failed click cannot leave an
      // unhandled timeout that obscures the actual smoke failure.
      await logoutResponse;
      report.logoutFailureReason = "BUTTON_UNAVAILABLE";
      report.error = "Production logout button unavailable";
      return report;
    }

    const logoutResponseResult = await logoutResponse;
    if (!logoutResponseResult.response) {
      report.logoutFailureReason = logoutResponseResult.failureReason;
      report.error = "Production logout response unavailable";
      return report;
    }
    report.logoutHttpStatus = logoutResponseResult.response.status();
    if (classifyLogoutResponse(report.logoutHttpStatus) !== "SUCCESS") {
      report.logoutFailureReason = "UNEXPECTED_STATUS";
      report.error = "Production logout failed";
      return report;
    }
    await page.waitForSelector("#view-login:not(.hidden)", {
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
    report.logout = "PASS";
    if (report.blockedMutations > 0)
      throw new Error("Unexpected production mutation request observed");
    if (report.consoleErrors || report.pageErrors || report.failedRequests || report.httpErrors) {
      throw new Error("Production browser diagnostics reported an error");
    }
  } catch (error) {
    if (report.login === "FAIL" && report.loginErrorCategory === null) {
      report.loginErrorCategory = "UNKNOWN";
    }
    if (report.login === "FAIL" && report.loginFailureReason === null) {
      report.loginFailureReason = "UNKNOWN";
    }
    report.error = errorMessage(error);
  } finally {
    await context.close().catch(() => undefined);
  }
  return report;
}

async function main(): Promise<void> {
  const credentials = requireCredentials();
  let browser: Browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
      headless: true,
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    const browserLaunchFailureReason = classifyBrowserLaunchFailure(error);
    console.log(
      JSON.stringify(
        {
          status: "FAIL",
          browserLaunch: "FAIL",
          browserLaunchFailureReason,
          domains: [],
          productionStateChanged: "NO",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  let domains: DomainReport[] = [];
  try {
    domains = await Promise.all(
      BASE_URLS.map((baseUrl) => runDomain(browser, baseUrl, credentials)),
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
  const report: SmokeReport = {
    status: domains.every(
      (domain) =>
        domain.login === "PASS" &&
        domain.authMe === "PASS" &&
        domain.dashboard === "PASS" &&
        domain.readPaths === "PASS" &&
        domain.assignments === "PASS" &&
        domain.assignmentDetail === "PASS" &&
        domain.navigation === "PASS" &&
        domain.logout === "PASS" &&
        domain.consoleErrors === 0 &&
        domain.pageErrors === 0 &&
        domain.failedRequests === 0 &&
        domain.httpErrors === 0 &&
        domain.blockedMutations === 0,
    )
      ? "PASS"
      : "FAIL",
    browserLaunch: "PASS",
    browserLaunchFailureReason: null,
    domains,
    productionStateChanged: "NO",
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "FAIL") process.exitCode = 1;
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          status: "FAIL",
          error: errorMessage(error),
          productionStateChanged: "NO",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
