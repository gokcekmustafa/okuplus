import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_P1_BCD_PROGRAMS,
  validateP1BCDProgram,
} from "../src/curriculum/education-v2-p1-bcd-program.js";

describe("P1-B/C/D curriculum manifests", () => {
  it("contains one real five-step route for each adaptive family", () => {
    expect(EDUCATION_V2_P1_BCD_PROGRAMS.map((program) => program.routeFamily)).toEqual([
      "B",
      "C",
      "D",
    ]);
    for (const program of EDUCATION_V2_P1_BCD_PROGRAMS) {
      expect(validateP1BCDProgram(program)).toEqual([]);
      expect(program.path.units).toHaveLength(1);
      expect(program.path.units[0]!.steps).toHaveLength(5);
      expect(program.content).toHaveLength(5);
      expect(program.exercises).toHaveLength(4);
      expect(program.assessments).toHaveLength(1);
      expect(program.content.every((item) => item.body.trim().length >= 50)).toBe(true);
      expect(program.exercises.every((exercise) => exercise.questions.length >= 3)).toBe(true);
      expect(program.content.every((item) => !/lorem|placeholder|todo/i.test(item.body))).toBe(
        true,
      );
    }
  });

  it("has a linear teach, practice, reinforcement and assessment sequence", () => {
    for (const program of EDUCATION_V2_P1_BCD_PROGRAMS) {
      const steps = program.path.units[0]!.steps;
      expect(steps.map((step) => step.type)).toEqual([
        "TEACHING",
        "SMALL_STUDY",
        "PRACTICE",
        "REINFORCEMENT",
        "ASSESSMENT",
      ]);
      expect(steps.slice(1).every((step) => (step.prerequisiteStepKeys?.length ?? 0) === 1)).toBe(
        true,
      );
      expect(steps.at(-1)?.assessmentKey).toBeTruthy();
    }
  });
});
