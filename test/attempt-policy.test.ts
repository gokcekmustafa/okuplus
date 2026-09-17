import { describe, expect, it } from "vitest";
import {
  assertTrainingAttemptAllowed,
  MAX_TRAINING_ATTEMPTS_PER_QUESTION,
} from "../src/modules/questions/attempt-policy.js";

describe("training attempt retry policy", () => {
  it("allows the initial answer and one retry", () => {
    expect(MAX_TRAINING_ATTEMPTS_PER_QUESTION).toBe(2);
    expect(() => assertTrainingAttemptAllowed(0)).not.toThrow();
    expect(() => assertTrainingAttemptAllowed(1)).not.toThrow();
  });

  it("fails closed after the supported retry", () => {
    expect(() => assertTrainingAttemptAllowed(2)).toThrow("en fazla iki kez");
  });
});
