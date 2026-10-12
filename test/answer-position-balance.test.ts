import { describe, expect, it } from "vitest";
import { EDUCATION_V2_P0_PROGRAM } from "../src/curriculum/education-v2-p0-program.js";
import { EDUCATION_V2_P1_A_PROGRAM } from "../src/curriculum/education-v2-p1-a-program.js";
import { EDUCATION_V2_P1_BCD_PROGRAMS } from "../src/curriculum/education-v2-p1-bcd-program.js";
import { reorderOptionsForSession } from "../src/modules/questions/session-option-order.js";

type ManifestQuestion = {
  key: string;
  options: Array<{ id: string; text: string; position: number }>;
  correctOptionId: string;
};

function educationQuestions(): ManifestQuestion[] {
  const programs = [
    EDUCATION_V2_P0_PROGRAM,
    EDUCATION_V2_P1_A_PROGRAM,
    ...EDUCATION_V2_P1_BCD_PROGRAMS,
  ];
  return programs.flatMap((program) => program.exercises.flatMap((exercise) => exercise.questions));
}

describe("student session answer-position balance", () => {
  it("does not leave canonical education questions fixed to one displayed letter", () => {
    const counts = [0, 0, 0, 0];
    const questions = educationQuestions();

    for (let sessionIndex = 0; sessionIndex < 32; sessionIndex += 1) {
      for (const question of questions) {
        const displayed = reorderOptionsForSession(
          question.options,
          `synthetic-session-${sessionIndex}:${question.key}`,
        );
        const correctPosition = displayed.findIndex(
          (option) => option.id === question.correctOptionId,
        );
        expect(correctPosition).toBeGreaterThanOrEqual(0);
        counts[correctPosition] = (counts[correctPosition] ?? 0) + 1;
      }
    }

    const total = counts.reduce((sum, count) => sum + count, 0);
    expect(total).toBe(questions.length * 32);
    expect(Math.min(...counts) / total).toBeGreaterThan(0.15);
    expect(Math.max(...counts) / total).toBeLessThan(0.35);
  });
});
