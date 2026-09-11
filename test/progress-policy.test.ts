import { describe, expect, it } from "vitest";
import { summarizeProgressAttempts } from "../src/modules/progress/policy.js";

describe("progress scoring policy", () => {
  it("never counts an unscored correct-looking answer as correct", () => {
    expect(
      summarizeProgressAttempts([
        { isCorrect: true, rawScore: null },
        { isCorrect: true, rawScore: 1 },
        { isCorrect: false, rawScore: 0 },
      ]),
    ).toEqual({ attemptCount: 3, scoredCount: 2, correctCount: 1 });
  });
});
