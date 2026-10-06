import { describe, expect, it } from "vitest";
import { validateAttemptTelemetry } from "../src/modules/questions/telemetry.js";

const sessionStartedAt = new Date("2026-09-14T10:00:00.000Z");
const now = new Date("2026-09-14T10:00:05.000Z");

describe("server-validated attempt telemetry", () => {
  it("derives nonnegative durations and keeps hint/retry facts", () => {
    expect(
      validateAttemptTelemetry(
        {
          exposureStartedAt: "2026-09-14T10:00:01.000Z",
          answerStartedAt: "2026-09-14T10:00:03.000Z",
          hintUsed: true,
          isFinal: false,
        },
        sessionStartedAt,
        now,
        1,
        false,
      ),
    ).toMatchObject({
      interactionDurationMs: 4000,
      answerDurationMs: 2000,
      hintUsed: true,
      finalResult: null,
      submittedAt: now,
    });
  });

  it("marks a later response as final and exposes no client-provided duration", () => {
    const result = validateAttemptTelemetry(
      { exposureStartedAt: "2026-09-14T10:00:01.000Z", isFinal: true },
      sessionStartedAt,
      now,
      2,
      true,
    );
    expect(result).toMatchObject({
      interactionDurationMs: 4000,
      answerDurationMs: null,
      finalResult: true,
    });
    expect(result).not.toHaveProperty("timeSpentMs");
  });

  it("ignores impossible client timestamps without blocking the answer", () => {
    expect(
      validateAttemptTelemetry(
        { answerStartedAt: "2026-09-14T09:59:59.000Z" },
        sessionStartedAt,
        now,
      ),
    ).toMatchObject({ answerStartedAt: null, answerDurationMs: null });
    expect(
      validateAttemptTelemetry(
        { exposureStartedAt: "2026-09-14T10:00:06.000Z" },
        sessionStartedAt,
        now,
      ),
    ).toMatchObject({ exposureStartedAt: null, interactionDurationMs: null });
  });

  it("does not fail when a client clock is ahead of the server", () => {
    const result = validateAttemptTelemetry(
      {
        exposureStartedAt: "2026-09-14T10:00:06.000Z",
        answerStartedAt: "2026-09-14T10:00:07.000Z",
      },
      sessionStartedAt,
      now,
      1,
      true,
    );
    expect(result).toMatchObject({
      exposureStartedAt: null,
      answerStartedAt: null,
      interactionDurationMs: null,
      answerDurationMs: null,
      finalResult: true,
    });
  });
});
