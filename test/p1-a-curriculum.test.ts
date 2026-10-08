import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_P1_A_PROGRAM,
  EDUCATION_V2_P1_A_PROGRAM_ID,
  EDUCATION_V2_P1_A_PATH_CODE_PREFIX,
  EDUCATION_V2_P1_A_ASSESSMENT_MINIMUM_SCORE,
  validateP1AProgram,
} from "../src/curriculum/education-v2-p1-a-program.js";

describe("Education V2 P1-A curriculum contract", () => {
  it("contains the canonical meaning-and-structure path", () => {
    expect(validateP1AProgram()).toEqual([]);
    expect(EDUCATION_V2_P1_A_PROGRAM.programId).toBe(EDUCATION_V2_P1_A_PROGRAM_ID);
    expect(EDUCATION_V2_P1_A_PROGRAM.path.code).toBe(`${EDUCATION_V2_P1_A_PATH_CODE_PREFIX}G8_12`);
    expect(EDUCATION_V2_P1_A_PROGRAM.path.units).toHaveLength(2);
    expect(EDUCATION_V2_P1_A_PROGRAM.path.units.flatMap((unit) => unit.steps)).toHaveLength(9);
  });

  it("keeps every non-teaching step bound to a published exercise or assessment contract", () => {
    const exercises = new Set(EDUCATION_V2_P1_A_PROGRAM.exercises.map((exercise) => exercise.key));
    const assessments = new Set(
      EDUCATION_V2_P1_A_PROGRAM.assessments.map((assessment) => assessment.key),
    );
    for (const step of EDUCATION_V2_P1_A_PROGRAM.path.units.flatMap((unit) => unit.steps)) {
      if (step.type === "TEACHING") expect(step.contentKey).toBeTruthy();
      if (step.type === "ASSESSMENT") expect(assessments.has(step.assessmentKey!)).toBe(true);
      if (step.type !== "TEACHING" && step.type !== "ASSESSMENT") {
        expect(exercises.has(step.exerciseKey!)).toBe(true);
      }
    }
  });

  it("contains the intended teach → study → practice → reinforcement → assessment sequence", () => {
    const steps = EDUCATION_V2_P1_A_PROGRAM.path.units.flatMap((unit) => unit.steps);
    expect(steps.map((step) => step.type)).toEqual([
      "TEACHING",
      "SMALL_STUDY",
      "PRACTICE",
      "REINFORCEMENT",
      "TEACHING",
      "SMALL_STUDY",
      "PRACTICE",
      "REINFORCEMENT",
      "ASSESSMENT",
    ]);
    expect(steps.at(-1)?.completionRule?.minimumScore).toBe(
      EDUCATION_V2_P1_A_ASSESSMENT_MINIMUM_SCORE,
    );
    expect(steps.slice(1).every((step) => (step.prerequisiteStepKeys?.length ?? 0) > 0)).toBe(true);
  });

  it("keeps all user-facing authored text in Turkish", () => {
    for (const content of EDUCATION_V2_P1_A_PROGRAM.content) {
      expect(content.title).not.toMatch(/lorem|placeholder|dummy/i);
      expect(content.body).not.toMatch(/lorem|placeholder|dummy/i);
    }
    for (const exercise of EDUCATION_V2_P1_A_PROGRAM.exercises) {
      expect(exercise.title).not.toMatch(/lorem|placeholder|dummy/i);
      for (const question of exercise.questions) {
        expect(question.prompt).not.toMatch(/lorem|placeholder|dummy/i);
        expect(
          question.options.every((option) => !/lorem|placeholder|dummy/i.test(option.text)),
        ).toBe(true);
      }
    }
  });
});
