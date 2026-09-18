import { describe, expect, it } from "vitest";
import {
  buildHintRepairPlan,
  requestWithDiagnostics,
  type RuntimeQuestionRow,
} from "../scripts/provision-staging-runtime-question-hints.ts";

function row(overrides: Partial<RuntimeQuestionRow> = {}): RuntimeQuestionRow {
  return {
    questionId: "question-1",
    questionVersionId: "question-version-1",
    contentVersionId: "content-version-1",
    version: 1,
    status: "PUBLISHED",
    skillCode: "FAST_ATTENTION",
    prompt: "Soru",
    options: [{ id: "a", text: "A" }],
    correctAnswer: { type: "MULTIPLE_CHOICE", correctOptionIds: ["a"] },
    explanation: "Açıklama",
    hint: null,
    difficulty: 0.25,
    ...overrides,
  };
}

const hints = new Map([["FAST_ATTENTION", "Başlık ve tekrar eden anahtar sözcüklere odaklan."]]);

describe("staging runtime question hint repair plan", () => {
  it("keeps a published question with a hint idempotently unchanged", () => {
    const plan = buildHintRepairPlan([row({ hint: "Mevcut ipucu" })], hints);

    expect(plan).toEqual([
      expect.objectContaining({ action: "NOOP", questionVersionId: "question-version-1" }),
    ]);
  });

  it("creates one next version when the published version has no hint", () => {
    const plan = buildHintRepairPlan([row()], hints);

    expect(plan).toEqual([
      expect.objectContaining({
        action: "CREATE",
        questionId: "question-1",
        hint: "Başlık ve tekrar eden anahtar sözcüklere odaklan.",
      }),
    ]);
  });

  it("resumes the single matching partial version without creating a duplicate", () => {
    const plan = buildHintRepairPlan(
      [
        row(),
        row({
          questionVersionId: "question-version-2",
          version: 2,
          status: "REVIEW",
          hint: "Başlık ve tekrar eden anahtar sözcüklere odaklan.",
        }),
      ],
      hints,
    );

    expect(plan).toEqual([
      expect.objectContaining({ action: "RESUME", questionVersionId: "question-version-2" }),
    ]);
  });

  it("fails closed when partial versions are ambiguous or hint source is missing", () => {
    expect(() =>
      buildHintRepairPlan(
        [
          row(),
          row({
            questionVersionId: "question-version-2",
            version: 2,
            status: "DRAFT",
            hint: hints.get("FAST_ATTENTION"),
          }),
          row({
            questionVersionId: "question-version-3",
            version: 3,
            status: "REVIEW",
            hint: hints.get("FAST_ATTENTION"),
          }),
        ],
        hints,
      ),
    ).toThrow("birden fazla aktif taslak");

    expect(() => buildHintRepairPlan([row({ skillCode: "UNKNOWN" })], hints)).toThrow(
      "canonical hint kaynağı yok",
    );
  });
});

describe("staging runtime question request diagnostics", () => {
  it("records a successful HTTP response without response-body data", async () => {
    const diagnostics: unknown[] = [];
    const result = await requestWithDiagnostics(
      "https://staging.example.invalid",
      "/admin/questions/00000000-0000-4000-8000-000000000001/publish?token=redacted",
      undefined,
      { method: "POST", body: "{}" },
      {
        operation: "question-version-publish",
        fetchImpl: async () =>
          new Response(JSON.stringify({ data: { status: "PUBLISHED" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      },
    );

    expect(result.response.status).toBe(200);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        operation: "question-version-publish",
        method: "POST",
        path: "/admin/questions/:id/publish",
        responseReceived: true,
        status: 200,
        timeoutMs: 30_000,
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("PUBLISHED");
    expect(JSON.stringify(diagnostics)).not.toContain("token");
  });

  it("records an HTTP error as a received response", async () => {
    const diagnostics: unknown[] = [];
    const result = await requestWithDiagnostics(
      "https://staging.example.invalid",
      "/auth/login",
      undefined,
      { method: "POST", body: "{}" },
      {
        operation: "reviewer-login",
        fetchImpl: async () => new Response("bad request", { status: 400 }),
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      },
    );

    expect(result.response.status).toBe(400);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        operation: "reviewer-login",
        responseReceived: true,
        status: 400,
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("bad request");
  });

  it("records a network failure without exposing the failing URL", async () => {
    const diagnostics: unknown[] = [];
    const error = new Error("fetch failed");
    (error as Error & { cause?: unknown }).cause = { code: "ECONNRESET" };

    await expect(
      requestWithDiagnostics(
        "https://staging.example.invalid",
        "/auth/me",
        undefined,
        {},
        {
          operation: "reviewer-me",
          fetchImpl: async () => {
            throw error;
          },
          onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        },
      ),
    ).rejects.toThrow("fetch failed");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        operation: "reviewer-me",
        responseReceived: false,
        fetchErrorName: "Error",
        fetchErrorMessage: "fetch failed",
        fetchErrorCode: "ECONNRESET",
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("staging.example.invalid");
  });

  it("classifies an aborted request as a timeout", async () => {
    const diagnostics: unknown[] = [];

    await expect(
      requestWithDiagnostics(
        "https://staging.example.invalid",
        "/health",
        undefined,
        {},
        {
          operation: "health",
          timeoutMs: 5,
          fetchImpl: async (_input, init) =>
            await new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
                once: true,
              });
            }),
          onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        },
      ),
    ).rejects.toThrow("aborted");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        operation: "health",
        responseReceived: false,
        fetchErrorName: "TimeoutError",
        fetchErrorMessage: "request timeout",
        timeoutMs: 5,
      }),
    ]);
  });
});
