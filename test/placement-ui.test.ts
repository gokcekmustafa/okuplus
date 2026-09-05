import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { CSRF_COOKIE_NAME } from "../src/modules/auth/cookies.js";
import { assertCsrfRequest, createCsrfToken } from "../src/modules/auth/csrf.js";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const setupStart = source.indexOf("function setupOnboardingEvents(");
const setupEnd = source.indexOf("void setupOnboardingEvents();", setupStart);
const setupCode = source.slice(setupStart, setupEnd);

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
  });

  runInContext(`${setupCode}\nsetupOnboardingEvents();`, context);
  return { elements, calls, navigations, get csrfHeaderCalls() { return csrfHeaderCalls; } };
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
    expect(h.navigations).toEqual(["assessments"]);
  });

  it("keeps the existing quick-start POST flow with a JSON body", async () => {
    const h = harness();
    await h.elements.get("onboard-quickstart")!.handlers.click();

    const createSession = h.calls[1];
    expect(createSession.url).toBe("/admin/exercise-sessions");
    expect(createSession.options.method).toBe("POST");
    const body = JSON.parse(String(createSession.options.body)) as Record<string, string>;
    expect(body.studentId).toBe("student-1");
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
});
