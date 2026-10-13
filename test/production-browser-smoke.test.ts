import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Request } from "playwright-core";
import {
  buildSafeLoginDiagnostic,
  buildSafeLoginDiagnosticWithCode,
  buildSmokeStepSummary,
  classifyBrowserLaunchFailure,
  classifyConsoleError,
  classifyLoginFailureReason,
  classifyLoginHttpStatus,
  classifyLogoutResponse,
  consumeJsonLoginErrorBody,
  deriveSmokeStatus,
  isAllowedMutationPath,
  isSmokeLocalMutationPath,
  isMutationMethod,
  markSmokeRequestHandled,
  NO_EXISTING_ASSIGNMENT_DETAIL,
  parseStudentAssignmentDetailPayload,
  parseStudentAssignmentListPayload,
  safeRequestPath,
  sanitizeSmokeDiagnostic,
  smokeExitCode,
  shouldCountFailedRequest,
  statusClass,
  unmarkSmokeRequestHandled,
  type SmokeDomainStatuses,
} from "../scripts/run-production-browser-smoke.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-browser-smoke.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/run-production-browser-smoke.ts", import.meta.url),
  "utf8",
);
const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

describe("production browser smoke safety contract", () => {
  const validDomainStatuses = (
    assignmentDetail: SmokeDomainStatuses["assignmentDetail"] = "PASS",
  ): SmokeDomainStatuses => ({
    login: "PASS",
    authMe: "PASS",
    dashboard: "PASS",
    readPaths: "PASS",
    assignments: "PASS",
    assignmentUi: "PASS",
    assignmentDetail,
    navigation: "PASS",
    logout: "PASS",
    consoleErrors: 0,
    pageErrors: 0,
    failedRequests: 0,
    httpErrors: 0,
    blockedMutations: 0,
  });

  const assignmentItem = {
    id: "assignment-001",
    title: "Ana fikir çalışması",
    className: "8-A",
    teacherName: "OkuPratik",
    templateTitle: "Metin anlama",
    templateType: "MULTIPLE_CHOICE",
    learningStepId: null,
    dueDate: null,
    status: "ACTIVE",
    assignedAt: "2026-10-13T09:00:00.000Z",
    sessionCount: 0,
    hasInProgressSession: false,
    inProgressSessionId: null,
    sessionStatus: null,
    questionCount: null,
    attemptedCount: 0,
    scoreSummary: null,
    organizationName: "OkuPratik",
    studentAssignmentId: "recipient-001",
    studentAssignmentStatus: "ASSIGNED",
    assignmentSource: "MANUAL",
  };

  it("validates the read-only student assignment list contract", () => {
    const payload = {
      data: { items: [assignmentItem], total: 1, page: 1, pageSize: 20 },
    };
    expect(parseStudentAssignmentListPayload(payload)).toEqual(payload.data);
    expect(
      parseStudentAssignmentListPayload({
        data: {
          items: [{ ...assignmentItem, attemptedCount: -1 }],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      }),
    ).toBeNull();
  });

  it("requires assignment detail identity to match the list item", () => {
    const payload = { data: assignmentItem };
    expect(
      parseStudentAssignmentDetailPayload(payload, assignmentItem.id, assignmentItem.title),
    ).toEqual(assignmentItem);
    expect(
      parseStudentAssignmentDetailPayload(payload, "another-assignment", assignmentItem.title),
    ).toBeNull();
    expect(
      parseStudentAssignmentDetailPayload(payload, assignmentItem.id, "Başka ödev"),
    ).toBeNull();
  });

  it("keeps the no-existing-assignment detail outcome explicit", () => {
    expect(NO_EXISTING_ASSIGNMENT_DETAIL).toBe("SKIPPED_NO_EXISTING_ASSIGNMENT");
    const empty = parseStudentAssignmentListPayload({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
    });
    expect(empty?.items).toEqual([]);
  });

  it("keeps assignment navigation separate from dashboard links and preserves logout after check failures", () => {
    expect(script).toContain('.nav-item[data-page="assignments"]');
    expect(script).toContain("assignmentErrorCategory");
    expect(script).toContain("AssignmentSmokeError");
    expect(script).toContain('"API_ERROR"');
    expect(script).toContain('"UI_ERROR"');
    expect(script).toContain('"TEST_CODE_ERROR"');
    expect(script).toContain('const userMenuToggle = page.locator("#user-menu-toggle")');
    expect(script).toContain('response.request().method() === "POST"');
    expect(script).toContain('domain.assignmentDetail === "PASS"');
  });

  it("keeps empty assignment lists explicit and does not treat detail as passed", () => {
    expect(script).toContain('container.querySelector(".empty-learning-state") !== null');
    expect(script).toContain("report.assignmentDetail = NO_EXISTING_ASSIGNMENT_DETAIL");
    expect(script).toContain('domain.assignmentDetail === "PASS"');
    expect(NO_EXISTING_ASSIGNMENT_DETAIL).toBe("SKIPPED_NO_EXISTING_ASSIGNMENT");
  });

  it("derives PASS when all required checks and assignment detail pass", () => {
    expect(deriveSmokeStatus([validDomainStatuses()])).toBe("PASS");
  });

  it("derives PARTIAL when the empty assignment list skips detail only", () => {
    expect(deriveSmokeStatus([validDomainStatuses(NO_EXISTING_ASSIGNMENT_DETAIL)])).toBe("PARTIAL");
    expect(smokeExitCode("PARTIAL")).toBe(0);
    expect(
      buildSmokeStepSummary({
        status: "PARTIAL",
        domains: [{ assignmentDetail: NO_EXISTING_ASSIGNMENT_DETAIL, assignmentCount: 0 }],
      }),
    ).toContain("Ödev detayı: SKIPPED_NO_EXISTING_ASSIGNMENT");
  });

  it("derives FAIL for assignment list API or interface failures", () => {
    expect(deriveSmokeStatus([{ ...validDomainStatuses(), assignments: "FAIL" }])).toBe("FAIL");
    expect(deriveSmokeStatus([{ ...validDomainStatuses(), assignmentUi: "FAIL" }])).toBe("FAIL");
  });

  it("derives FAIL for assignment detail failures", () => {
    expect(deriveSmokeStatus([{ ...validDomainStatuses(), assignmentDetail: "FAIL" }])).toBe(
      "FAIL",
    );
    expect(smokeExitCode("FAIL")).toBe(1);
  });

  it("derives FAIL for logout failures and unexpected blocked mutations", () => {
    expect(deriveSmokeStatus([{ ...validDomainStatuses(), logout: "FAIL" }])).toBe("FAIL");
    expect(deriveSmokeStatus([{ ...validDomainStatuses(), blockedMutations: 1 }])).toBe("FAIL");
  });

  it("runs logout after assignment checks through a separate result path", () => {
    const assignmentStart = script.indexOf(
      'const assignmentListPath = "/student/assignments?page=1&pageSize=20"',
    );
    const assignmentCatch = script.indexOf("report.assignmentError = errorMessage(error)");
    const logoutStart = script.indexOf('const userMenuToggle = page.locator("#user-menu-toggle")');
    expect(assignmentStart).toBeGreaterThan(-1);
    expect(assignmentCatch).toBeGreaterThan(assignmentStart);
    expect(logoutStart).toBeGreaterThan(assignmentCatch);
    expect(script.slice(assignmentStart, logoutStart)).toContain("catch (error)");
    expect(script.slice(logoutStart)).toContain(
      'report.logoutFailureReason = "BUTTON_UNAVAILABLE"',
    );
  });

  it("classifies browser launch failures without exposing runner details", () => {
    expect(
      classifyBrowserLaunchFailure(new Error("browserType.launch: Timeout 30000ms exceeded")),
    ).toBe("LAUNCH_TIMEOUT");
    expect(
      classifyBrowserLaunchFailure(new Error("executable doesn't exist at /runner/secret")),
    ).toBe("EXECUTABLE_NOT_FOUND");
    expect(classifyBrowserLaunchFailure(new Error("browser process exited"))).toBe("LAUNCH_FAILED");
  });

  it("classifies missing and unexpected logout responses without inventing a status", () => {
    expect(classifyLogoutResponse(null)).toBe("RESPONSE_TIMEOUT");
    expect(classifyLogoutResponse(401)).toBe("UNEXPECTED_STATUS");
    expect(classifyLogoutResponse(200)).toBe("SUCCESS");
  });

  it("blocks non-auth mutations without expanding the production allowlist", () => {
    const origin = "https://www.okupratik.com";
    expect(isMutationMethod("POST")).toBe(true);
    expect(isMutationMethod("GET")).toBe(false);
    expect(isAllowedMutationPath(`${origin}/auth/login`, origin)).toBe(true);
    expect(isAllowedMutationPath(`${origin}/auth/logout?token=secret`, origin)).toBe(true);
    expect(isAllowedMutationPath(`${origin}/auth/login`, origin, "PUT")).toBe(false);
    expect(isAllowedMutationPath(`${origin}/student/pilot/events`, origin)).toBe(false);
    expect(isAllowedMutationPath(`${origin}/student/learning-path/client-diagnostic`, origin)).toBe(
      false,
    );
    expect(isAllowedMutationPath(`https://evil.example/auth/login`, origin)).toBe(false);
    expect(isSmokeLocalMutationPath(`${origin}/student/pilot/events`, origin)).toBe(true);
    expect(
      isSmokeLocalMutationPath(`${origin}/student/assignment-recommendations/refresh`, origin),
    ).toBe(true);
    expect(
      isSmokeLocalMutationPath(
        `${origin}/student/assignment-recommendations/refresh`,
        origin,
        "PUT",
      ),
    ).toBe(false);
    expect(isSmokeLocalMutationPath(`${origin}/student/pilot/events`, origin, "PUT")).toBe(false);
    expect(
      isSmokeLocalMutationPath(`${origin}/student/learning-path/client-diagnostic`, origin),
    ).toBe(false);
    expect(isSmokeLocalMutationPath(`https://evil.example/student/pilot/events`, origin)).toBe(
      false,
    );
    expect(
      isSmokeLocalMutationPath(
        "https://evil.example/student/assignment-recommendations/refresh",
        origin,
      ),
    ).toBe(false);
  });

  it("keeps HTTP and console diagnostics safe and bounded", () => {
    expect(statusClass(403)).toBe("4xx");
    expect(statusClass(503)).toBe("5xx");
    expect(statusClass(200)).toBe("2xx");
    expect(
      safeRequestPath(
        "https://www.okupratik.com/student/sessions/session-secret-1234567890?q=token",
      ),
    ).toBe("/student/sessions/[redacted]");
    expect(safeRequestPath("https://www.okupratik.com/auth/login?email=student@example.com")).toBe(
      "/auth/login",
    );
    expect(safeRequestPath("https://www.okupratik.com/student/student%40example.com")).toBe(
      "/student/[redacted]",
    );
    expect(classifyConsoleError("learning-path-render-failed token=secret")).toBe("LEARNING_PATH");
    expect(classifyConsoleError("Failed to fetch /student/today")).toBe("NETWORK");
    expect(classifyConsoleError("unknown browser error")).toBe("OTHER");
    expect(
      sanitizeSmokeDiagnostic(
        "token=secret-token password: secret-password https://example.test/?email=a@example.com",
      ),
    ).toBe("token=[redacted] password=[redacted] [url]");
  });

  it("does not turn intentionally prevented mutations into smoke failures", () => {
    expect(shouldCountFailedRequest(true)).toBe(false);
    expect(shouldCountFailedRequest(false)).toBe(true);
  });

  it("does not count a locally fulfilled request as failed, but restores real failure accounting if fulfillment fails", () => {
    const request = {} as Request;
    const handledRequests = new WeakSet<Request>();

    markSmokeRequestHandled(request, handledRequests);
    expect(shouldCountFailedRequest(handledRequests.has(request))).toBe(false);

    unmarkSmokeRequestHandled(request, handledRequests);
    expect(shouldCountFailedRequest(handledRequests.has(request))).toBe(true);
  });

  it.each([
    [401, "AUTH_REJECTED"],
    [403, "AUTH_REJECTED"],
    [400, "BAD_REQUEST"],
    [429, "RATE_LIMITED"],
    [500, "SERVER_ERROR"],
    [503, "SERVER_ERROR"],
    [404, "UNEXPECTED_STATUS"],
  ] as const)("classifies login HTTP %d safely as %s", (status, category) => {
    expect(classifyLoginHttpStatus(status)).toBe(category);
    expect(buildSafeLoginDiagnostic(status)).toEqual({
      loginHttpStatus: status,
      loginErrorCategory: category,
      loginFailureReason:
        status === 401 ? "AUTH_REJECTED" : status === 403 ? "FORBIDDEN" : category,
    });
  });

  it("maps only known API error codes to fixed failure reasons", () => {
    expect(classifyLoginFailureReason(403, "FORBIDDEN")).toBe("FORBIDDEN");
    expect(classifyLoginFailureReason(403, "UNAUTHORIZED")).toBe("AUTH_REJECTED");
    expect(classifyLoginFailureReason(403)).toBe("FORBIDDEN");
    expect(buildSafeLoginDiagnosticWithCode(403, "FORBIDDEN")).toEqual({
      loginHttpStatus: 403,
      loginErrorCategory: "AUTH_REJECTED",
      loginFailureReason: "FORBIDDEN",
    });
  });

  it("consumes JSON error bodies without exposing their fields", async () => {
    let jsonCalls = 0;
    await expect(
      consumeJsonLoginErrorBody({
        headers: () => ({ "content-type": "application/json; charset=utf-8" }),
        json: async () => {
          jsonCalls += 1;
          return {
            error: { code: "FORBIDDEN", message: "do not report this" },
            email: "student@example.com",
            token: "secret-token",
            password: "secret-password",
          };
        },
      }),
    ).resolves.toBe("FORBIDDEN");
    expect(jsonCalls).toBe(1);

    let textJsonCalls = 0;
    await consumeJsonLoginErrorBody({
      headers: () => ({ "content-type": "text/html" }),
      json: async () => {
        textJsonCalls += 1;
        return { email: "student@example.com" };
      },
    });
    expect(textJsonCalls).toBe(0);

    const report = JSON.stringify(buildSafeLoginDiagnostic(401));
    expect(report).not.toContain("student@example.com");
    expect(report).not.toContain("secret-token");
    expect(report).not.toContain("secret-password");

    const unknownCode = await consumeJsonLoginErrorBody({
      headers: () => ({ "content-type": "application/json" }),
      json: async () => ({ error: { code: "ORIGIN_REJECTED", email: "student@example.com" } }),
    });
    expect(unknownCode).toBeNull();
    expect(JSON.stringify(buildSafeLoginDiagnosticWithCode(403, unknownCode))).not.toContain(
      "ORIGIN_REJECTED",
    );
  });

  it("is manually triggered and protected by production-smoke", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:\s*\n/u);
    expect(workflow).toContain("environment: production-smoke");
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
    expect(workflow).toContain("PRODUCTION_SMOKE_EMAIL: ${{ secrets.PRODUCTION_SMOKE_EMAIL }}");
    expect(workflow).toContain(
      "PRODUCTION_SMOKE_PASSWORD: ${{ secrets.PRODUCTION_SMOKE_PASSWORD }}",
    );
    expect(workflow).toContain("command -v google-chrome");
    expect(workflow).toContain("Verify headless browser launch");
    expect(workflow).toContain("--disable-dev-shm-usage");
  });

  it("allows only login/logout writes and canonical production hosts", () => {
    expect(script).toContain('"https://www.okupratik.com"');
    expect(script).not.toContain('"https://okuplus.vercel.app"');
    expect(script).toContain("url.origin === canonicalOrigin");
    expect(script).toContain('url.pathname === "/auth/login" || url.pathname === "/auth/logout"');
    expect(script).toContain('page.route("**/*"');
    expect(script).toContain('route.abort("blockedbyclient")');
    expect(script).toContain("preventedMutations");
    expect(script).toContain("isSmokeLocalMutationPath");
    expect(script).toContain('"/student/assignment-recommendations/refresh"');
    expect(script).toContain("locallyFulfilledMutationRequests");
    expect(script).toContain("route.fulfill({ status: 204 })");
    expect(script).toContain("markSmokeRequestHandled(request, intentionallyPreventedRequests)");
    expect(script).toContain("unmarkSmokeRequestHandled(request, intentionallyPreventedRequests)");
    expect(script).toContain("intentionallyPreventedRequests");
    expect(script).toContain('page.on("requestfailed", (request)');
    expect(script).toContain("shouldCountFailedRequest");
    expect(script).toContain("blockedMutationRequests");
    expect(script).toContain("httpErrorRequests");
    expect(script).toContain("consoleErrorCategories");
    expect(script).toContain('page.locator("#guest-login-btn")');
    expect(script).toContain('loginUrl.searchParams.set("auth", "google-error")');
    expect(script).toContain('"/student/today"');
    expect(script).toContain('"/student/assignments?page=1&pageSize=20"');
    expect(script).toContain('"#student-assignment-cards"');
    expect(script).toContain('"#assignment-detail-modal:not(.hidden)"');
    expect(script).toContain("SKIPPED_NO_EXISTING_ASSIGNMENT");
    expect(script).toContain(
      "const detailPath = `/student/assignments/${encodeURIComponent(expectedAssignment.id)}`",
    );
    expect(script).not.toContain('data-assignment-start-id="${expectedAssignment.id}"');
    expect(script).not.toContain("page.locator('[data-page=\"assignments\"]')");
    expect(script).toContain('"/student/progress"');
    expect(script).toContain('"/student/history?page=1&pageSize=5"');
    expect(script).toContain("loginHttpStatus");
    expect(script).toContain("loginErrorCategory");
    expect(script).toContain("loginFailureReason");
    expect(script).toContain("browserLaunchFailureReason");
    expect(script).toContain("logoutHttpStatus");
    expect(script).toContain("logoutFailureReason");
    expect(script).toContain('[data-user-menu-action="logout"]');
    expect(script).toContain('page.locator("#user-menu-toggle")');
    expect(script).not.toContain('page.click("#logout-btn")');
    expect(indexHtml).toContain('data-user-menu-action="logout"');
    expect(indexHtml).not.toContain('id="logout-btn"');
    expect(script).toContain("consumeJsonLoginErrorBody");
    expect(script).toContain('productionStateChanged: "NO"');
    expect(script).toContain("pageErrorMessages");
    expect(script).toContain("sanitizePageError");
    expect(script).not.toContain("/student/questions/");
    expect(script).not.toContain("/complete");
    expect(script).not.toContain("prisma");
    expect(script).not.toContain("DATABASE_URL");
    expect(script).not.toContain("secret-password");
    expect(script).not.toContain("request.postData");
  });
});
