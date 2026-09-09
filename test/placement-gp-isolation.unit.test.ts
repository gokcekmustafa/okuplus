import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("placement GP isolation", () => {
  it("does not award correct-answer GP for assessment sessions", () => {
    const questionService = readFileSync(
      new URL("../src/modules/questions/service.ts", import.meta.url),
      "utf8",
    );

    expect(questionService).toContain(
      "attempt.isCorrect === true && session.assessmentId === null",
    );
  });

  it("does not award exercise-completion GP for assessment sessions", () => {
    const sessionService = readFileSync(
      new URL("../src/modules/sessions/service.ts", import.meta.url),
      "utf8",
    );

    expect(sessionService).toContain("if (!session.assessmentId)");
  });
});
