import { describe, expect, it } from "vitest";
import {
  MAX_TRAINING_ATTEMPTS_PER_QUESTION,
  decideTrainingAttempt,
} from "../src/modules/training/retry-policy.js";

describe("training retry policy", () => {
  it("allows the initial response and exactly one retry", () => {
    expect(decideTrainingAttempt([])).toEqual({ allowed: true, responseOrder: 1 });
    expect(decideTrainingAttempt([{ isCorrect: false }])).toEqual({
      allowed: true,
      responseOrder: 2,
    });
    expect(MAX_TRAINING_ATTEMPTS_PER_QUESTION).toBe(2);
  });

  it("closes a question after a correct response", () => {
    expect(decideTrainingAttempt([{ isCorrect: true }])).toEqual({
      allowed: false,
      reason: "ALREADY_CORRECT",
    });
  });

  it("fails closed after two incorrect responses", () => {
    expect(decideTrainingAttempt([{ isCorrect: false }, { isCorrect: false }])).toEqual({
      allowed: false,
      reason: "MAX_ATTEMPTS_REACHED",
    });
  });

  it("does not create a second response while the first one is pending", () => {
    expect(decideTrainingAttempt([{ isCorrect: null }])).toEqual({
      allowed: false,
      reason: "PENDING_EVALUATION",
    });
  });
});
