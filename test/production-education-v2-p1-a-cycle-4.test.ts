import { describe, expect, it } from "vitest";
import { FAST_READING_RENDERERS } from "../src/modules/training/exercise-contract.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE,
  p1ACycle4QuestionVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-4-program.js";

describe("P1-A Cycle 4 authored program", () => {
  it("maps the five existing draft stations to a complete, ordered path", () => {
    const { content, exercises, path } = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM;
    const steps = path.units.flatMap((unit) => unit.steps);

    expect(EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sequence).toBe(4);
    expect(EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations).toHaveLength(5);
    expect(path.code).toBe("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_4_G8_12");
    expect(steps).toHaveLength(5);
    expect(content).toHaveLength(5);
    expect(exercises).toHaveLength(5);
    expect(exercises.reduce((count, exercise) => count + exercise.questions.length, 0)).toBe(15);

    for (const [
      index,
      station,
    ] of EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations.entries()) {
      const contentRecord = content[index];
      const exercise = exercises[index];
      const step = steps[index];
      expect(contentRecord?.key).toBe(station.key);
      expect(contentRecord?.body).toBe(station.text);
      expect(exercise?.contentKey).toBe(station.key);
      expect(step?.key).toBe(station.key);
      expect(step?.prerequisiteStepKeys).toEqual(index === 0 ? undefined : [steps[index - 1]?.key]);
      expect(station.contentOrigin).toBe("ORIGINAL_AUTHORING");
      expect(station.provenanceStatus).toBe("REVIEW_REQUIRED");
      for (const question of station.questions) {
        expect(p1ACycle4QuestionVersionId(station.key, question.key)).toContain("-v4");
        expect(exercise?.questions.some((mapped) => mapped.key === question.key)).toBe(true);
        expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
      }
    }
    expect(steps.at(-1)?.type).toBe("ASSESSMENT");
    expect(EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.assessments).toHaveLength(1);
  });

  it("uses runtime renderers and deterministic choice scoring for each skill family", () => {
    const exercises = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.exercises;
    expect(exercises).toHaveLength(5);
    for (const exercise of exercises) {
      const contract = exercise.contract;
      const expectedRenderer =
        contract.family === "ATTENTION_BURST"
          ? FAST_READING_RENDERERS.ATTENTION_BURST
          : contract.family === "RAPID_RECOGNITION"
            ? FAST_READING_RENDERERS.RAPID_RECOGNITION
            : contract.family === "PHRASE_CHUNKING"
              ? FAST_READING_RENDERERS.PHRASE_CHUNKING
              : "QUESTION_MULTIPLE_CHOICE";
      expect(contract.rendererKey).toBe(expectedRenderer);
      expect(contract.scoring.mode).toBe("DETERMINISTIC");
      expect(contract.interactionType).toBe("MULTIPLE_CHOICE");
    }
  });
});
