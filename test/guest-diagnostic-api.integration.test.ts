import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { buildApp } from "../src/app.js";
import {
  GUEST_COOKIE_NAME,
  GUEST_CSRF_COOKIE_NAME,
} from "../src/modules/guest-diagnostic/cookies.js";
import { GUEST_DIAGNOSTIC_CONFIG_KEY } from "../src/modules/guest-diagnostic/definition.js";
import { loadEnv } from "../src/config/env.js";

const integrationEnabled = process.env.GUEST_API_INTEGRATION === "true";
const integrationDescribe = integrationEnabled ? describe : describe.skip;
const ORIGIN = "https://okuplus.online";

type CookieJar = Partial<Record<typeof GUEST_COOKIE_NAME | typeof GUEST_CSRF_COOKIE_NAME, string>>;
type JsonBody = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

function setCookieHeaders(response: {
  headers: Record<string, string | string[] | undefined>;
}): CookieJar {
  const raw = response.headers["set-cookie"];
  const headers = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const jar: CookieJar = {};
  for (const header of headers) {
    const separator = header.indexOf(";");
    const pair = separator === -1 ? header : header.slice(0, separator);
    const equals = pair.indexOf("=");
    if (equals === -1) continue;
    const name = pair.slice(0, equals);
    const value = decodeURIComponent(pair.slice(equals + 1));
    if (name === GUEST_COOKIE_NAME || name === GUEST_CSRF_COOKIE_NAME) {
      jar[name] = value;
    }
  }
  return jar;
}

function cookieHeader(jar: CookieJar, includeCsrf = true): string {
  const values = [`${GUEST_COOKIE_NAME}=${encodeURIComponent(jar[GUEST_COOKIE_NAME] ?? "")}`];
  if (includeCsrf) {
    values.push(
      `${GUEST_CSRF_COOKIE_NAME}=${encodeURIComponent(jar[GUEST_CSRF_COOKIE_NAME] ?? "")}`,
    );
  }
  return values.join("; ");
}

function stateChangingHeaders(jar: CookieJar, includeCsrf = true): Record<string, string> {
  return {
    origin: ORIGIN,
    cookie: cookieHeader(jar, includeCsrf),
    ...(includeCsrf ? { "x-csrf-token": jar[GUEST_CSRF_COOKIE_NAME] ?? "" } : {}),
  };
}

function body(response: { body: string }): JsonBody {
  return JSON.parse(response.body) as JsonBody;
}

function data(response: { body: string }): Record<string, unknown> {
  const value = body(response).data;
  if (!value) throw new Error("API response data alanı yok");
  return value;
}

integrationDescribe("Guest Diagnostic V1 API integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let admin: PrismaClient;
  let sessionA: string;
  let sessionB: string;
  let sessionC: string;
  let cookiesA: CookieJar;
  let cookiesB: CookieJar;
  let cookiesC: CookieJar;
  let answersByPosition: Record<number, unknown>;
  let configId: string;

  async function createSession(): Promise<{ id: string; cookies: CookieJar }> {
    const response = await app.inject({
      method: "POST",
      url: "/guest/diagnostics",
      headers: { origin: ORIGIN },
    });
    expect(response.statusCode).toBe(201);
    const result = body(response);
    const resultData = data(response);
    expect(result.success).toBe(true);
    expect(resultData).not.toHaveProperty("token");
    expect(resultData).not.toHaveProperty("csrfToken");
    return { id: resultData.sessionId as string, cookies: setCookieHeaders(response) };
  }

  async function correctAnswerForPosition(position: number): Promise<unknown> {
    const row = await admin.guestDiagnosticItem.findFirstOrThrow({
      where: { sessionId: sessionA, position },
      select: { questionVersion: { select: { correctAnswer: true } } },
    });
    const correctAnswer = row.questionVersion.correctAnswer as {
      type?: string;
      correctOptionIds?: string[];
    };
    if (correctAnswer.type !== "MULTIPLE_CHOICE" || !correctAnswer.correctOptionIds?.length) {
      throw new Error(`CI candidate answer formatı beklenmiyor: ${position}`);
    }
    return correctAnswer.correctOptionIds;
  }

  async function answer(
    sessionId: string,
    jar: CookieJar,
    position: number,
    clientAnswerId: string,
    extra: Record<string, unknown> = {},
  ) {
    return app.inject({
      method: "POST",
      url: `/guest/diagnostics/${sessionId}/answers`,
      headers: stateChangingHeaders(jar),
      payload: {
        itemId: `item-${position}`,
        clientAnswerId,
        answer: answersByPosition[position],
        ...extra,
      },
    });
  }

  beforeAll(async () => {
    const env = loadEnv({ CORS_ORIGIN: ORIGIN });
    app = await buildApp(env);
    await app.ready();
    admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await admin.$connect();

    const createdA = await createSession();
    const createdB = await createSession();
    const createdC = await createSession();
    sessionA = createdA.id;
    sessionB = createdB.id;
    sessionC = createdC.id;
    cookiesA = createdA.cookies;
    cookiesB = createdB.cookies;
    cookiesC = createdC.cookies;
    answersByPosition = Object.fromEntries(
      await Promise.all(
        Array.from({ length: 8 }, async (_, index) => {
          const position = index + 1;
          return [position, await correctAnswerForPosition(position)];
        }),
      ),
    );
    const config = await admin.guestDiagnosticRecommendationConfig.findUniqueOrThrow({
      where: { configKey_version: { configKey: GUEST_DIAGNOSTIC_CONFIG_KEY, version: 1 } },
      select: { id: true },
    });
    configId = config.id;
  });

  afterAll(async () => {
    await admin?.$disconnect();
    await app?.close();
  });

  it("creates an isolated session and never persists the plaintext token", async () => {
    const stored = await admin.guestDiagnosticSession.findUniqueOrThrow({
      where: { id: sessionA },
      select: { tokenHash: true },
    });
    expect(cookiesA[GUEST_COOKIE_NAME]).toBeTruthy();
    expect(cookiesA[GUEST_CSRF_COOKIE_NAME]).toBeTruthy();
    expect(stored.tokenHash).not.toBe(cookiesA[GUEST_COOKIE_NAME]);
  });

  it("allows the owner to read questions and rejects another session", async () => {
    const own = await app.inject({
      method: "GET",
      url: `/guest/diagnostics/${sessionA}/questions`,
      headers: { cookie: cookieHeader(cookiesA) },
    });
    expect(own.statusCode).toBe(200);
    expect(data(own).questions).toHaveLength(8);

    const crossSession = await app.inject({
      method: "GET",
      url: `/guest/diagnostics/${sessionB}/questions`,
      headers: { cookie: cookieHeader(cookiesA) },
    });
    expect(crossSession.statusCode).toBe(404);
  });

  it("enforces CSRF and session ownership for answer submission", async () => {
    const missingCsrf = await answer(sessionA, cookiesA, 1, "missing-csrf");
    expect(missingCsrf.statusCode).toBe(403);

    const invalidCsrf = await app.inject({
      method: "POST",
      url: `/guest/diagnostics/${sessionA}/answers`,
      headers: {
        ...stateChangingHeaders(cookiesA),
        cookie: cookieHeader({
          ...cookiesA,
          [GUEST_CSRF_COOKIE_NAME]: "wrong-csrf",
        }),
        "x-csrf-token": "wrong-csrf",
      },
      payload: { itemId: "item-1", clientAnswerId: "invalid-csrf", answer: answersByPosition[1] },
    });
    expect(invalidCsrf.statusCode).toBe(403);

    const crossSession = await answer(sessionB, cookiesA, 1, "cross-session");
    expect(crossSession.statusCode).toBe(404);
  });

  it("scores on the server and ignores client correctness/score fields", async () => {
    const first = await answer(sessionA, cookiesA, 1, "answer-1");
    expect(first.statusCode).toBe(200);

    const manipulated = await answer(sessionA, cookiesA, 2, "answer-2", {
      isCorrect: false,
      score: 0,
    });
    expect(manipulated.statusCode).toBe(200);
    expect(data(manipulated).isCorrect).toBe(true);
    expect(data(manipulated).rawScore).toBe(1);

    const duplicate = await answer(sessionA, cookiesA, 2, "answer-2");
    expect(duplicate.statusCode).toBe(200);
    expect(data(duplicate).idempotent).toBe(true);
  });

  it("does not complete before all eight answers are present", async () => {
    const incomplete = await app.inject({
      method: "POST",
      url: `/guest/diagnostics/${sessionA}/complete`,
      headers: stateChangingHeaders(cookiesA),
    });
    expect(incomplete.statusCode).toBe(400);
  });

  it("completes once, returns the canonical result contract, and rejects new answers", async () => {
    for (let position = 3; position <= 8; position += 1) {
      const response = await answer(sessionA, cookiesA, position, `answer-${position}`);
      expect(response.statusCode).toBe(200);
    }

    const completed = await app.inject({
      method: "POST",
      url: `/guest/diagnostics/${sessionA}/complete`,
      headers: stateChangingHeaders(cookiesA),
    });
    expect(completed.statusCode).toBe(200);
    expect(data(completed)).toMatchObject({
      contractVersion: 1,
      recommendationMode: "RECOMMENDATION_ONLY",
      questionCount: 8,
      answeredCount: 8,
      scoredQuestionCount: 8,
      score: 1,
      flags: {
        officialPlacement: false,
        studentProfileUpdated: false,
        baselineCreated: false,
        assessmentResultCreated: false,
      },
    });

    const result = await app.inject({
      method: "GET",
      url: `/guest/diagnostics/${sessionA}/result`,
      headers: { cookie: cookieHeader(cookiesA) },
    });
    expect(result.statusCode).toBe(200);
    expect(data(result).recommendedLevelCode).toBe("R4_ADVANCED");

    const duplicateComplete = await app.inject({
      method: "POST",
      url: `/guest/diagnostics/${sessionA}/complete`,
      headers: stateChangingHeaders(cookiesA),
    });
    expect(duplicateComplete.statusCode).toBe(200);
    expect(data(duplicateComplete)).toEqual(data(result));

    const answerAfterComplete = await answer(sessionA, cookiesA, 3, "after-complete");
    expect(answerAfterComplete.statusCode).toBe(404);

    expect(await admin.guestDiagnosticResult.count({ where: { sessionId: sessionA } })).toBe(1);
  });

  it("rejects an expired session", async () => {
    await admin.guestDiagnosticSession.update({
      where: { id: sessionB },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await app.inject({
      method: "GET",
      url: `/guest/diagnostics/${sessionB}/questions`,
      headers: { cookie: cookieHeader(cookiesB) },
    });
    expect(expired.statusCode).toBe(404);
  });

  it("returns recommendation unavailable when the published config is disabled during a session", async () => {
    await admin.guestDiagnosticRecommendationConfig.update({
      where: { id: configId },
      data: { enabled: false, status: "DRAFT" },
    });
    try {
      for (let position = 1; position <= 8; position += 1) {
        const response = await answer(sessionC, cookiesC, position, `config-off-${position}`);
        expect(response.statusCode).toBe(200);
      }
      const completed = await app.inject({
        method: "POST",
        url: `/guest/diagnostics/${sessionC}/complete`,
        headers: stateChangingHeaders(cookiesC),
      });
      expect(completed.statusCode).toBe(200);
      expect(data(completed).resultState).toBe("RECOMMENDATION_UNAVAILABLE");
      expect(data(completed).recommendedLevelCode).toBeNull();
    } finally {
      await admin.guestDiagnosticRecommendationConfig.update({
        where: { id: configId },
        data: { enabled: true, status: "PUBLISHED", publishedAt: new Date() },
      });
    }
  });
});
