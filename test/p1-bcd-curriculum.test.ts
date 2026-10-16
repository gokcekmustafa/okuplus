import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_P1_BCD_PROGRAMS,
  EDUCATION_V2_P1_BCD_RELEASED_PROGRAMS,
  validateP1BCDProgram,
} from "../src/curriculum/education-v2-p1-bcd-program.js";

describe("P1-B/C/D curriculum manifests", () => {
  it("contains two authored five-step cycles per family while release remains explicit", () => {
    expect(
      EDUCATION_V2_P1_BCD_PROGRAMS.map((program) => `${program.routeFamily}:${program.sequence}`),
    ).toEqual(["B:1", "C:1", "D:1", "B:2", "C:2", "D:2"]);
    expect(EDUCATION_V2_P1_BCD_RELEASED_PROGRAMS.map((program) => program.sequence)).toEqual([
      1, 1, 1,
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
    for (const candidate of EDUCATION_V2_P1_BCD_PROGRAMS.filter(
      (program) => program.sequence === 2,
    )) {
      expect(candidate.cycleVersion).toBe(2);
      expect(candidate.publicationApproved).toBe(false);
      expect(candidate.editorialProvenance?.contentOrigin).toBe("ORIGINAL_FICTION");
      expect(candidate.learningOutcome.statement.length).toBeGreaterThan(30);
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

  it("balances source answer positions in each unreleased continuation package", () => {
    for (const program of EDUCATION_V2_P1_BCD_PROGRAMS.filter((item) => item.sequence === 2)) {
      const positionCounts = [0, 0, 0, 0];
      for (const question of program.exercises.flatMap((exercise) => exercise.questions)) {
        const position = question.options.findIndex(
          (option) => option.id === question.correctOptionId,
        );
        expect(position).toBeGreaterThanOrEqual(0);
        positionCounts[position] = (positionCounts[position] ?? 0) + 1;
      }
      expect(positionCounts).toEqual([3, 3, 3, 3]);
    }
  });

  it("rejects drift between assessment question keys and its template exercise", () => {
    const program = structuredClone(EDUCATION_V2_P1_BCD_PROGRAMS[0]!);
    program.assessments[0]!.questionKeys[0] = "question-from-another-exercise";

    expect(validateP1BCDProgram(program)).toContain(
      `assessment soru/template eşleşmesi uyuşmuyor: ${program.assessments[0]!.key}`,
    );
  });

  it("rejects a broken route prerequisite", () => {
    const program = structuredClone(EDUCATION_V2_P1_BCD_PROGRAMS[0]!);
    program.path.units[0]!.steps[1]!.prerequisiteStepKeys = ["unknown-step"];

    expect(validateP1BCDProgram(program)).toContain(
      `Linear prerequisite zinciri geçersiz: ${program.path.units[0]!.steps[1]!.key}`,
    );
  });
});
