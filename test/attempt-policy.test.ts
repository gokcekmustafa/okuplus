import { describe, expect, it } from "vitest";
import {
  assertTrainingAttemptAllowed,
  MAX_TRAINING_ATTEMPTS_PER_QUESTION,
} from "../src/modules/questions/attempt-policy.js";
import {
  decideTrainingAttempt,
  shouldEnforceStudentAttemptLimit,
} from "../src/modules/training/retry-policy.js";

describe("training attempt retry policy", () => {
  it("allows the initial answer and one retry", () => {
    expect(MAX_TRAINING_ATTEMPTS_PER_QUESTION).toBe(2);
    expect(() => assertTrainingAttemptAllowed(0)).not.toThrow();
    expect(() => assertTrainingAttemptAllowed(1)).not.toThrow();
  });

  it("fails closed after the supported retry", () => {
    expect(() => assertTrainingAttemptAllowed(2)).toThrow("en fazla iki kez");
  });

  it("allows one retry after a wrong first answer and rejects every further answer", () => {
    expect(decideTrainingAttempt([])).toEqual({ allowed: true, responseOrder: 1 });
    expect(decideTrainingAttempt([{ isCorrect: false }])).toEqual({
      allowed: true,
      responseOrder: 2,
    });
    expect(decideTrainingAttempt([{ isCorrect: false }, { isCorrect: false }])).toEqual({
      allowed: false,
      reason: "MAX_ATTEMPTS_REACHED",
    });
  });

  it("caps learning-path assessment steps independently of training config", () => {
    expect(
      shouldEnforceStudentAttemptLimit({
        isStudent: true,
        learningStepId: "learning-step-assessment",
        assessmentId: "assessment-1",
        isTrainingVersion: false,
      }),
    ).toBe(true);
  });

  it("does not extend the learning-path cap to unrelated official assessments", () => {
    expect(
      shouldEnforceStudentAttemptLimit({
        isStudent: true,
        learningStepId: null,
        assessmentId: "official-assessment",
        isTrainingVersion: false,
      }),
    ).toBe(false);
  });
});
