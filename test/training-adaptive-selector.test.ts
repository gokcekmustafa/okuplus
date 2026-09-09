import { describe, expect, it } from "vitest";
import { isApiError } from "../src/lib/errors.js";
import {
  adaptiveBandFor,
  deriveAdaptivePerformance,
  deriveAdaptiveSignal,
  planFirstDayTraining,
  planAdaptiveTraining,
  selectAdaptiveCandidate,
  type AdaptiveCandidate,
  type AdaptiveSession,
} from "../src/modules/training/adaptive-selector.js";

const attempt = (score: number, index: number) => ({
  rawScore: score,
  isCorrect: score === 1,
  timeSpentMs: 1000 + index,
  answeredAt: new Date(`2026-09-0${Math.min(index + 1, 9)}T10:00:00.000Z`),
});

function session(
  id: string,
  exposureId: string,
  scores: number[],
  status: AdaptiveSession["status"] = "COMPLETED",
  difficulty: AdaptiveSession["difficulty"] = "DEVELOPING",
): AdaptiveSession {
  return {
    sessionId: id,
    family: "MAIN_IDEA",
    competency: "RC_MAIN_IDEA",
    difficulty,
    exposureId,
    status,
    attempts: scores.map((score, index) => attempt(score, index)),
  };
}

function candidates(): AdaptiveCandidate[] {
  return [
    {
      templateVersionId: "attention-1",
      family: "ATTENTION_BURST",
      competency: "FAST_ATTENTION",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "recognition-1",
      family: "RAPID_RECOGNITION",
      competency: "FAST_RECOGNITION",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "chunking-1",
      family: "PHRASE_CHUNKING",
      competency: "FAST_CHUNKING",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "foundation-1",
      family: "MAIN_IDEA",
      competency: "RC_MAIN_IDEA",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "foundation-2",
      family: "MAIN_IDEA",
      competency: "RC_MAIN_IDEA",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "developing-1",
      family: "MAIN_IDEA",
      competency: "RC_MAIN_IDEA",
      difficulty: "DEVELOPING",
    },
    {
      templateVersionId: "developing-2",
      family: "MAIN_IDEA",
      competency: "RC_MAIN_IDEA",
      difficulty: "DEVELOPING",
    },
    {
      templateVersionId: "challenging-1",
      family: "MAIN_IDEA",
      competency: "RC_MAIN_IDEA",
      difficulty: "CHALLENGING",
    },
    {
      templateVersionId: "challenging-2",
      family: "MAIN_IDEA",
      competency: "RC_MAIN_IDEA",
      difficulty: "CHALLENGING",
    },
    {
      templateVersionId: "detail-1",
      family: "DETAIL_EVIDENCE",
      competency: "RC_DETAIL",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "detail-2",
      family: "DETAIL_EVIDENCE",
      competency: "RC_DETAIL",
      difficulty: "DEVELOPING",
    },
    {
      templateVersionId: "inference-1",
      family: "INFERENCE",
      competency: "RC_INFERENCE",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "inference-2",
      family: "INFERENCE",
      competency: "RC_INFERENCE",
      difficulty: "DEVELOPING",
    },
  ];
}

describe("adaptive training selector v1", () => {
  it("routes weak performance to needs review and a weak band", () => {
    const signal = deriveAdaptiveSignal(
      [session("s1", "e1", [1, 0, 0, 1, 0])],
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
    );

    expect(signal.status).toBe("NEEDS_REVIEW");
    expect(signal.band).toBe("WEAK");
    expect(signal.accuracy).toBe(0.4);
    expect(signal.consecutiveFailures).toBe(1);
  });

  it("detects two consecutive failures even with a small sample", () => {
    const signal = deriveAdaptiveSignal(
      [session("s1", "e1", [1, 0, 0])],
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
    );

    expect(signal.status).toBe("NEEDS_REVIEW");
    expect(signal.consecutiveFailures).toBe(2);
  });

  it("keeps the 0.60 boundary out of the weak state", () => {
    const signal = deriveAdaptiveSignal(
      [session("s1", "e1", [1, 1, 0, 1, 0])],
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
    );

    expect(signal.accuracy).toBe(0.6);
    expect(signal.status).not.toBe("NEEDS_REVIEW");
  });

  it("detects high performance only after two high-accuracy sessions", () => {
    const signal = deriveAdaptiveSignal(
      [session("s1", "e1", [1, 1]), session("s2", "e2", [1, 1])],
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
    );

    expect(signal.highAccuracySessionCount).toBe(2);
    expect(signal.band).toBe("STRETCH");
    expect(signal.status).toBe("STABLE");
  });

  it("applies the mastery gate without activating a level assignment", () => {
    const sessions = [
      session("s1", "e1", [1, 1, 1, 1]),
      session("s2", "e2", [1, 1, 1]),
      session("s3", "e3", [1, 1, 1]),
    ];
    const signal = deriveAdaptiveSignal(sessions, "MAIN_IDEA", "RC_MAIN_IDEA");

    expect(signal.scoredCount).toBe(10);
    expect(signal.scoredSessionCount).toBe(3);
    expect(signal.exposureCount).toBe(3);
    expect(signal.mastery).toBe(true);
    expect(signal.status).toBe("STABLE");
  });

  it("records completion, abandonment and response time as secondary signals", () => {
    const signal = deriveAdaptiveSignal(
      [session("s1", "e1", [1], "ABANDONED"), session("s2", "e2", [1])],
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
    );

    expect(signal.completionCount).toBe(1);
    expect(signal.abandonmentCount).toBe(1);
    expect(signal.averageResponseTimeMs).toBeGreaterThan(0);
  });

  it("uses lower, same and higher difficulty pools deterministically", () => {
    const signal = deriveAdaptiveSignal(
      [session("s1", "e1", [1, 0], "COMPLETED", "DEVELOPING")],
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
    );
    const all = candidates().filter((candidate) => candidate.family === "MAIN_IDEA");

    expect(selectAdaptiveCandidate(all, signal, "WEAK")?.difficulty).toBe("FOUNDATION");
    expect(selectAdaptiveCandidate(all, signal, "NORMAL")?.difficulty).toBe("DEVELOPING");
    expect(selectAdaptiveCandidate(all, signal, "STRETCH")?.difficulty).toBe("CHALLENGING");
  });

  it("avoids recent exposure when another candidate exists", () => {
    const signal = deriveAdaptiveSignal(
      [session("s1", "developing-1", [1])],
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
    );
    const developing = candidates().filter(
      (candidate) => candidate.family === "MAIN_IDEA" && candidate.difficulty === "DEVELOPING",
    );

    expect(selectAdaptiveCandidate(developing, signal, "NORMAL")?.templateVersionId).toBe(
      "developing-2",
    );
  });

  it("returns the same plan for the same input and keeps placement isolated", () => {
    const performance = deriveAdaptivePerformance([]);
    const input = candidates();
    const first = planAdaptiveTraining(input, performance, "student-1:2026-09-07");
    const second = planAdaptiveTraining(input, performance, "student-1:2026-09-07");

    expect(first).toEqual(second);
    expect(first.items).toHaveLength(6);
    expect(first.items.map((item) => item.family)).not.toContain("PLACEMENT");
    expect(first.items.map((item) => item.family)).toEqual([
      "ATTENTION_BURST",
      "RAPID_RECOGNITION",
      "PHRASE_CHUNKING",
      "MAIN_IDEA",
      "DETAIL_EVIDENCE",
      "INFERENCE",
    ]);
  });

  it("constrains weak and high states without crossing their safety direction", () => {
    const weakPerformance = deriveAdaptivePerformance([session("s1", "e1", [0, 0])]);
    const weakPlan = planAdaptiveTraining(candidates(), weakPerformance, "student-1:day");
    expect(
      weakPlan.items.filter((item) => item.family === "MAIN_IDEA").map((item) => item.band),
    ).not.toContain("STRETCH");

    const highPerformance = deriveAdaptivePerformance([
      session("s1", "e1", [1, 1]),
      session("s2", "e2", [1, 1]),
    ]);
    const highPlan = planAdaptiveTraining(candidates(), highPerformance, "student-1:day");
    expect(
      highPlan.items.filter((item) => item.family === "MAIN_IDEA").map((item) => item.band),
    ).not.toContain("WEAK");
  });

  it("uses the documented 50/35/15 deterministic bucket boundaries", () => {
    const bands = new Set(
      Array.from({ length: 20 }, (_, index) => adaptiveBandFor("student", index + 1, "MAIN_IDEA")),
    );
    expect(bands).toEqual(new Set(["WEAK", "NORMAL", "STRETCH"]));
  });

  it("keeps a not-started learner in the foundation-safe route", () => {
    const plan = planAdaptiveTraining(
      candidates(),
      deriveAdaptivePerformance([]),
      "student-1:first-day",
    );
    expect(plan.items.every((item) => item.difficulty === "FOUNDATION")).toBe(true);
    expect(plan.items.some((item) => item.band === "STRETCH")).toBe(false);
  });

  it("uses a deterministic foundation-first plan for the first training day", () => {
    const first = planFirstDayTraining(candidates(), "student-1:2026-09-07");
    const second = planFirstDayTraining(candidates(), "student-1:2026-09-07");

    expect(first).toEqual(second);
    expect(first.items.map((item) => item.family)).toEqual([
      "ATTENTION_BURST",
      "RAPID_RECOGNITION",
      "PHRASE_CHUNKING",
      "MAIN_IDEA",
      "DETAIL_EVIDENCE",
      "INFERENCE",
    ]);
    expect(first.items.every((item) => item.difficulty === "FOUNDATION")).toBe(true);
  });

  it("fails closed with a validation error when a required family is unavailable", () => {
    let thrown: unknown;
    try {
      planFirstDayTraining([candidates()[3]], "student-1:2026-09-07");
    } catch (error) {
      thrown = error;
    }

    expect(isApiError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    expect((thrown as Error).message).toContain("ATTENTION_BURST");
  });
});
