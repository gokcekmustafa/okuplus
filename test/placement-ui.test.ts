import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME } from "../src/modules/auth/cookies.js";
import {
  assertCsrfRequest,
  createCookieCsrfGuard,
  createCsrfToken,
} from "../src/modules/auth/csrf.js";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const setupStart = source.indexOf("function setupOnboardingEvents(");
const setupEnd = source.indexOf("void setupOnboardingEvents();", setupStart);
const setupCode = source.slice(setupStart, setupEnd);
const exerciseApiStart = source.indexOf("function exerciseApi(");
const exerciseApiEnd = source.indexOf("function showExerciseError(", exerciseApiStart);
const exerciseApiCode = source.slice(exerciseApiStart, exerciseApiEnd);
const errorFormatterStart = source.indexOf("function formatExerciseSubmissionError(");
const errorFormatterEnd = source.indexOf(
  "async function populateExerciseStudentSelect",
  errorFormatterStart,
);
const errorFormatterCode = source.slice(errorFormatterStart, errorFormatterEnd);

type FetchCall = { url: string; options: Record<string, unknown> };

function element() {
  const handlers: Record<string, () => unknown> = {};
  return {
    handlers,
    textContent: "",
    classList: { add() {}, remove() {} },
    addEventListener(type: string, handler: () => unknown) {
      handlers[type] = handler;
    },
    setAttribute() {},
    removeAttribute() {},
    disabled: false,
  };
}

function harness() {
  const elements = new Map<string, ReturnType<typeof element>>();
  const calls: FetchCall[] = [];
  const navigations: string[] = [];
  let csrfHeaderCalls = 0;

  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id)!;
  };

  const context = createContext({
    $: get,
    authHeaders: () => ({ "content-type": "application/json" }),
    csrfHeaders: () => {
      csrfHeaderCalls += 1;
      return { "x-csrf-token": "csrf-token" };
    },
    getStoredTokens: () => ({ accessToken: null, tenantId: null }),
    document: { querySelectorAll: () => [] },
    fetch: async (url: string, options: Record<string, unknown> = {}) => {
      calls.push({ url, options });
      if (url === "/student/onboarding/quick-start") {
        return { ok: true, data: { templateVersionId: "template-version" } };
      }
      if (url === "/student/onboarding/placement") {
        return { ok: true, data: { assessmentId: "assessment-1" } };
      }
      return { ok: true, data: { sessionId: "session-1" } };
    },
    fetchMe: async () => ({ user: { id: "student-1" } }),
    parseResponse: async (response: { ok: boolean; data: unknown }) => response.data,
    navigate: (page: string) => navigations.push(page),
    loadAssessments: () => undefined,
    loadExercisePage: () => undefined,
    showOnboardingError: () => undefined,
    recordPilotTelemetry: () => undefined,
    formatStudentError: (_error: unknown, fallback: string) => fallback,
  });

  runInContext(`${setupCode}\nsetupOnboardingEvents();`, context);
  return {
    elements,
    calls,
    navigations,
    get csrfHeaderCalls() {
      return csrfHeaderCalls;
    },
  };
}

function exerciseApiHarness(
  accessToken: string | null,
  tenantId: string | null,
  csrfHeader: Record<string, string>,
) {
  const calls: FetchCall[] = [];
  let csrfHeaderCalls = 0;
  const context = createContext({
    getStoredTokens: () => ({ accessToken, tenantId }),
    authHeaders: (token: string | null, selectedTenantId: string | null) => ({
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(selectedTenantId ? { "x-tenant-id": selectedTenantId } : {}),
    }),
    csrfHeaders: () => {
      csrfHeaderCalls += 1;
      return csrfHeader;
    },
    isPlatformUser: false,
    AbortSignal: { timeout: (milliseconds: number) => ({ milliseconds }) },
    fetch: async (url: string, options: Record<string, unknown>) => {
      calls.push({ url, options });
      return { status: 200, ok: true };
    },
  });
  runInContext(exerciseApiCode, context);
  return {
    calls,
    run: (code: string) => runInContext(code, context),
    get csrfHeaderCalls() {
      return csrfHeaderCalls;
    },
  };
}

function errorFormatterHarness() {
  const context = createContext({});
  runInContext(errorFormatterCode, context);
  return { run: (code: string) => runInContext(code, context) };
}

describe("placement onboarding UI request contract", () => {
  it("sends an empty JSON object and the existing CSRF header for placement start", async () => {
    const h = harness();
    await h.elements.get("onboard-placement")!.handlers.click();

    const start = h.calls[1];
    expect(start.url).toBe("/student/assessments/assessment-1/start");
    expect(start.options.method).toBe("POST");
    expect(start.options.body).toBe("{}");
    expect(start.options.headers).toEqual({
      "content-type": "application/json",
      "x-csrf-token": "csrf-token",
    });
    expect(h.csrfHeaderCalls).toBe(1);
    expect(h.navigations).toEqual(["exercise"]);
  });

  it("starts quick-start through the student exercise API with a JSON body", async () => {
    const h = harness();
    await h.elements.get("onboard-quickstart")!.handlers.click();

    const startSession = h.calls[1];
    expect(startSession.url).toBe("/student/exercises/start");
    expect(startSession.options.method).toBe("POST");
    expect(startSession.options.headers).toEqual({
      "content-type": "application/json",
      "x-csrf-token": "csrf-token",
    });
    const body = JSON.parse(String(startSession.options.body)) as Record<string, string>;
    expect(body.templateVersionId).toBe("template-version");
    expect(body.clientSessionId).toEqual(expect.any(String));
    expect(h.navigations).toEqual(["exercise"]);
  });
});

describe("placement cookie-only CSRF contract", () => {
  const secret = "placement-test-secret";
  const origin = "https://staging.example.test";

  function request(csrfCookie: string, csrfHeader: string): FastifyRequest {
    return {
      headers: {
        cookie: `${CSRF_COOKIE_NAME}=${csrfCookie}`,
        "x-csrf-token": csrfHeader,
        origin,
      },
    } as unknown as FastifyRequest;
  }

  it("accepts a matching signed CSRF cookie/header pair", () => {
    const token = createCsrfToken(secret);
    expect(() => assertCsrfRequest(request(token, token), secret, [origin])).not.toThrow();
  });

  it("rejects an invalid or expired CSRF token", () => {
    const token = createCsrfToken(secret);
    expect(() => assertCsrfRequest(request(token, "expired-or-invalid"), secret, [origin])).toThrow(
      "CSRF doğrulaması gerekli",
    );
  });

  function cookieRequest(csrfCookie: string, headers: Record<string, string> = {}): FastifyRequest {
    return {
      method: "POST",
      url: "/student/questions/question-1/attempts",
      headers: {
        cookie: `${ACCESS_COOKIE_NAME}=access-token; ${CSRF_COOKIE_NAME}=${csrfCookie}`,
        origin,
        ...headers,
      },
    } as unknown as FastifyRequest;
  }

  it("requires CSRF for cookie-only answer requests and keeps Bearer compatibility", async () => {
    const guard = createCookieCsrfGuard(secret, [origin], { cookieAuthEnabled: true });
    const token = createCsrfToken(secret);

    await expect(guard(cookieRequest(token))).rejects.toThrow("CSRF doğrulaması gerekli");
    await expect(guard(cookieRequest(token, { "x-csrf-token": "invalid-token" }))).rejects.toThrow(
      "CSRF doğrulaması gerekli",
    );
    await expect(guard(cookieRequest(token, { "x-csrf-token": token }))).resolves.toBeUndefined();
    await expect(
      guard(cookieRequest(token, { authorization: "Bearer bearer-token" })),
    ).resolves.toBeUndefined();
  });
});

describe("exercise answer request security", () => {
  it("adds the existing CSRF header to placement answer POSTs", async () => {
    const h = exerciseApiHarness(null, null, { "x-csrf-token": "csrf-token" });
    await h.run('exerciseApi("/questions/question-1/attempts", { method: "POST", body: "{}" })');

    expect(h.calls[0]?.url).toBe("/student/questions/question-1/attempts");
    expect(h.calls[0]?.options.headers).toEqual({
      "content-type": "application/json",
      "x-csrf-token": "csrf-token",
    });
    expect(h.csrfHeaderCalls).toBe(1);
  });

  it("preserves Bearer answer requests when no cookie CSRF token exists", async () => {
    const h = exerciseApiHarness("bearer-token", "tenant-1", {});
    await h.run('exerciseApi("/questions/question-1/attempts", { method: "POST", body: "{}" })');

    expect(h.calls[0]?.options.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer bearer-token",
      "x-tenant-id": "tenant-1",
    });
  });
});

describe("safe submission error diagnostics", () => {
  it("shows safe status/code diagnostics without response details", () => {
    const h = errorFormatterHarness();
    const message = h.run(
      'formatExerciseSubmissionError({ status: 403, code: "FORBIDDEN", details: { secret: "hidden" } })',
    );

    expect(message).toContain("HTTP 403 · FORBIDDEN");
    expect(message).not.toContain("hidden");
    expect(message).not.toContain("secret");
  });
});
