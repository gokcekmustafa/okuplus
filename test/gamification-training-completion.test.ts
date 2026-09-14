import { describe, expect, it } from "vitest";
import { isTrainingStreakEvent, POINT_RULES } from "../src/modules/gamification/service.js";

describe("training completion gamification contract", () => {
  it("uses a distinct daily completion award and streak trigger", () => {
    expect(POINT_RULES.TRAINING_SESSION_COMPLETED).toBe(15);
    expect(isTrainingStreakEvent("TRAINING_SESSION_COMPLETED")).toBe(true);
    expect(isTrainingStreakEvent("DAILY_LOGIN")).toBe(false);
    expect(isTrainingStreakEvent("CORRECT_ANSWER")).toBe(false);
    expect(isTrainingStreakEvent("EXERCISE_COMPLETED")).toBe(false);
  });
});
