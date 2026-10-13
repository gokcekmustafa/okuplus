import { describe, expect, it } from "vitest";
import { EDUCATION_V2_P0_PROGRAM } from "../src/curriculum/education-v2-p0-program.js";
import { EDUCATION_V2_P1_A_PROGRAM } from "../src/curriculum/education-v2-p1-a-program.js";
import { assessMultipleChoicePackageQuality } from "../src/curriculum/option-length-quality.js";

function questionsOf(program: typeof EDUCATION_V2_P0_PROGRAM | typeof EDUCATION_V2_P1_A_PROGRAM) {
  return program.exercises.flatMap((exercise) =>
    exercise.questions.map((question) => ({
      key: question.key,
      options: question.options,
      correctOptionId: question.correctOptionId,
    })),
  );
}

describe("multiple-choice package quality", () => {
  it("reports answer position and option-length cues per question for active packages", () => {
    const p0 = assessMultipleChoicePackageQuality(questionsOf(EDUCATION_V2_P0_PROGRAM));
    const p1a = assessMultipleChoicePackageQuality(questionsOf(EDUCATION_V2_P1_A_PROGRAM));

    expect(p0.questionCount).toBeGreaterThan(8);
    expect(p1a.questionCount).toBeGreaterThan(8);
    expect(Object.keys(p0.correctPositionCounts)).toEqual(expect.arrayContaining(["A", "B"]));
    expect(Object.keys(p1a.correctPositionCounts)).toEqual(expect.arrayContaining(["A", "B"]));
    expect(p0.questionReports).toHaveLength(p0.questionCount);
    expect(p1a.questionReports).toHaveLength(p1a.questionCount);
    expect(p0.correctUniqueLongestRatio).toBeGreaterThanOrEqual(0);
    expect(p1a.correctUniqueLongestRatio).toBeGreaterThanOrEqual(0);
    // The runtime removes the fixed-letter cue, while these immutable source
    // packages remain visible to editorial review until a new content version
    // is authored and published.
    expect(p0.needsEditorialReview).toBe(true);
    expect(p1a.needsEditorialReview).toBe(true);
  });

  it("flags a package-level position or unique-longest cue without changing scoring data", () => {
    const report = assessMultipleChoicePackageQuality(
      [
        {
          key: "q-1",
          options: [
            { id: "a", text: "Doğru yanıt" },
            { id: "b", text: "Başka" },
            { id: "c", text: "Başka bir seçenek" },
            { id: "d", text: "Bir diğer seçenek" },
          ],
          correctOptionId: "a",
        },
        {
          key: "q-2",
          options: [
            { id: "a", text: "Doğru yanıt" },
            { id: "b", text: "Başka" },
            { id: "c", text: "Başka bir seçenek" },
            { id: "d", text: "Bir diğer seçenek" },
          ],
          correctOptionId: "a",
        },
      ],
      { minimumQuestionCount: 1, maxPositionRatio: 0.5, uniqueLongestRatio: 0.5 },
    );

    expect(report.needsEditorialReview).toBe(true);
    expect(report.correctPositionCounts).toEqual({ A: 2 });
    expect(report.questionReports.map((question) => question.key)).toEqual(["q-1", "q-2"]);
  });
});
