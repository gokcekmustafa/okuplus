import { describe, expect, it } from "vitest";
import {
  deriveAdaptivePerformance,
  type AdaptiveSession,
} from "../src/modules/training/adaptive-selector.js";
import {
  toTrainingProgressSummary,
  type TrainingPerformanceSnapshot,
} from "../src/modules/training/performance.js";

function session(
  id: string,
  exposureId: string,
  scores: number[],
  family: AdaptiveSession["family"] = "MAIN_IDEA",
  competency = "RC_MAIN_IDEA",
): AdaptiveSession {
  return {
    sessionId: id,
    family,
    competency,
    difficulty: "DEVELOPING",
    exposureId,
    status: "COMPLETED",
    attempts: scores.map((rawScore, index) => ({
      rawScore,
      isCorrect: rawScore === 1,
      timeSpentMs: 1000,
      answeredAt: new Date(
        `2026-09-${String(Number(id.slice(1)) * 5 + index + 1).padStart(2, "0")}T10:00:00.000Z`,
      ),
    })),
    lastActivityAt: new Date(
      `2026-09-${String(Number(id.slice(1)) + 1).padStart(2, "0")}T10:00:00.000Z`,
    ),
  };
}

function snapshot(sessions: AdaptiveSession[]): TrainingPerformanceSnapshot {
  const performance = deriveAdaptivePerformance(sessions);
  const scoredAttemptCount = sessions.reduce(
    (total, entry) =>
      total +
      entry.attempts.filter(
        (attempt) => typeof attempt.rawScore === "number" && Number.isFinite(attempt.rawScore),
      ).length,
    0,
  );
  const correctCount = sessions.reduce(
    (total, entry) => total + entry.attempts.filter((attempt) => attempt.rawScore === 1).length,
    0,
  );
  return {
    performance,
    sessionCount: sessions.length,
    completedSessionCount: sessions.filter((entry) => entry.status === "COMPLETED").length,
    completedTrainingSessionCount: 0,
    scoredAttemptCount,
    correctCount,
  };
}

describe("training progress analytics v1", () => {
  it("returns all six skills without inventing accuracy for a new learner", () => {
    const result = toTrainingProgressSummary(snapshot([]));

    expect(result.skills).toHaveLength(6);
    expect(result.skills.map((skill) => skill.label)).toEqual([
      "Dikkat",
      "Hızlı Tanıma",
      "Cümle Gruplama",
      "Ana Fikir",
      "Detay",
      "Çıkarım",
    ]);
    expect(result.skills.every((skill) => skill.masteryState === "NOT_STARTED")).toBe(true);
    expect(result.skills.every((skill) => skill.recentAccuracy === null)).toBe(true);
    expect(result.accuracy).toBeNull();
  });

  it("uses only scored rawScore values and exposes recent accuracy/trend", () => {
    const sessions = [
      session("s0", "exposure-a", [1, 0, 1, 0, 0]),
      session("s1", "exposure-b", [1, 1, 1, 1, 1]),
    ];
    const result = toTrainingProgressSummary(snapshot(sessions));
    const mainIdea = result.skills.find((skill) => skill.family === "MAIN_IDEA");

    expect(mainIdea).toBeDefined();
    expect(mainIdea?.scoredAttemptCount).toBe(10);
    expect(mainIdea?.recentAccuracy).toBe(0.7);
    expect(mainIdea?.recent5Accuracy).toBe(1);
    expect(mainIdea?.trend).toBe("DEVELOPING");
    expect(mainIdea?.exposureCount).toBe(2);
    expect(mainIdea?.sessionCount).toBe(2);
  });

  it("keeps family and competency metrics separate", () => {
    const result = toTrainingProgressSummary(
      snapshot([
        session("s0", "main", [1], "MAIN_IDEA", "RC_MAIN_IDEA"),
        session("s1", "detail", [0], "DETAIL_EVIDENCE", "RC_DETAIL"),
      ]),
    );

    expect(result.skills.find((skill) => skill.family === "MAIN_IDEA")?.scoredAttemptCount).toBe(1);
    expect(
      result.skills.find((skill) => skill.family === "DETAIL_EVIDENCE")?.scoredAttemptCount,
    ).toBe(1);
    expect(result.skills.find((skill) => skill.family === "INFERENCE")?.scoredAttemptCount).toBe(0);
  });

  it("does not count an unscored answer merely because isCorrect is present", () => {
    const unscored: AdaptiveSession = {
      ...session("s0", "exposure-a", []),
      attempts: [
        {
          rawScore: null,
          isCorrect: true,
          timeSpentMs: 900,
          answeredAt: new Date("2026-09-01T10:00:00.000Z"),
        },
      ],
    };
    const result = toTrainingProgressSummary(snapshot([unscored]));
    const mainIdea = result.skills.find((skill) => skill.family === "MAIN_IDEA");

    expect(mainIdea?.scoredAttemptCount).toBe(0);
    expect(mainIdea?.masteryState).toBe("NOT_STARTED");
    expect(mainIdea?.recentAccuracy).toBeNull();
  });

  it("does not call two high-accuracy sessions mastery before the full gate", () => {
    const result = toTrainingProgressSummary(
      snapshot([session("s0", "exposure-a", [1, 1]), session("s1", "exposure-b", [1, 1])]),
    );
    const mainIdea = result.skills.find((skill) => skill.family === "MAIN_IDEA");

    expect(mainIdea?.mastery).toBe(false);
    expect(mainIdea?.masteryState).toBe("PRACTICING");
  });
});
