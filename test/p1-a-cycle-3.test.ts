import { describe, expect, it } from "vitest";
import {
  CYCLE_3_LEARNING_OUTCOMES,
  EDUCATION_V2_P1_A_CYCLE_3_MANIFEST,
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_STATUS,
  buildEducationV2P1ACycle3LearningCycleManifest,
  p1ACycle3ContentVersionId,
  p1ACycle3QuestionVersionId,
  p1ACycle3TemplateVersionId,
  validateEducationV2P1ACycle3Manifest,
  validateP1ACycle3Program,
} from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import { buildEducationV2P1ALearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";
import { validateLearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";

describe("Education V2 P1-A cycle 3 authoring contract", () => {
  it("uses a seven-step, two-unit cycle driven by its learning goals", () => {
    expect(validateP1ACycle3Program()).toEqual([]);
    const steps = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.flatMap((unit) => unit.steps);

    expect(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units).toHaveLength(2);
    expect(steps).toHaveLength(7);
    expect(steps.map((step) => step.type)).toEqual([
      "TEACHING",
      "SMALL_STUDY",
      "PRACTICE",
      "REINFORCEMENT",
      "TEACHING",
      "PRACTICE",
      "ASSESSMENT",
    ]);
    expect(steps.at(-1)?.learningOutcomeKeys).toEqual(
      CYCLE_3_LEARNING_OUTCOMES.map((outcome) => outcome.key),
    );
  });

  it("covers each outcome in instruction, application and the checkpoint", () => {
    const steps = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.flatMap((unit) => unit.steps);
    const instructional = steps.filter((step) => step.type !== "ASSESSMENT");
    const assessment = steps.find((step) => step.type === "ASSESSMENT");

    for (const outcome of CYCLE_3_LEARNING_OUTCOMES) {
      expect(instructional.some((step) => step.learningOutcomeKeys.includes(outcome.key))).toBe(
        true,
      );
      expect(assessment?.learningOutcomeKeys).toContain(outcome.key);
    }
  });

  it("keeps every question complete, Turkish and option-id scored", () => {
    const questions = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.flatMap(
      (exercise) => exercise.questions,
    );

    expect(questions).toHaveLength(16);
    expect(
      questions.every(
        (question) =>
          question.prompt.length > 0 &&
          question.explanation.length > 0 &&
          question.hint.length > 0 &&
          question.options.length === 4 &&
          new Set(question.options.map((option) => option.id)).size === 4 &&
          question.options.some((option) => option.id === question.correctOptionId),
      ),
    ).toBe(true);
    expect(
      questions.every(
        (question) =>
          !/lorem|placeholder|dummy/i.test(`${question.prompt} ${question.explanation}`),
      ),
    ).toBe(true);
  });

  it("keeps correct-option positions balanced and without clear length cues", () => {
    const questions = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.flatMap(
      (exercise) => exercise.questions,
    );
    const counts = new Map<string, number>();
    for (const question of questions) {
      const position = question.options.findIndex(
        (option) => option.id === question.correctOptionId,
      );
      counts.set(
        String.fromCharCode(65 + position),
        (counts.get(String.fromCharCode(65 + position)) ?? 0) + 1,
      );
    }

    expect(counts).toEqual(
      new Map([
        ["A", 4],
        ["B", 4],
        ["C", 4],
        ["D", 4],
      ]),
    );
    expect(
      questions.filter((question) => assessOptionLengthQuality(question)?.clearOutlier),
    ).toHaveLength(0);
  });

  it("keeps immutable cycle-3 identifiers separate from v1/v2 and validates the manifest", () => {
    const content = p1ACycle3ContentVersionId("p1a-v3-evidence-teaching");
    const template = p1ACycle3TemplateVersionId("p1a-v3-evidence-practice");
    const question = p1ACycle3QuestionVersionId(
      "p1a-v3-evidence-practice",
      "p1a-v3-evidence-practice-1",
    );

    expect(new Set([content, template, question]).size).toBe(3);
    expect(content).toContain("cycle-3");
    expect(template).toContain("cycle-3");
    expect(question).toContain("-v3");
    expect(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.programId).not.toBe(
      "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE",
    );
    expect(validateEducationV2P1ACycle3Manifest()).toEqual([]);
    expect(validateLearningCycleManifest(EDUCATION_V2_P1_A_CYCLE_3_MANIFEST).valid).toBe(true);
    expect(buildEducationV2P1ACycle3LearningCycleManifest()).toEqual(
      EDUCATION_V2_P1_A_CYCLE_3_MANIFEST,
    );
  });

  it("keeps the candidate closed and outside canonical readiness", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_3_STATUS).toBe("EXPERT_REVIEW_REQUIRED");
    expect(EDUCATION_V2_P1_A_CYCLE_3_MANIFEST.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(buildEducationV2P1ALearningCycleManifest().cycleVersion).toBe(1);
    expect(buildEducationV2P1ALearningCycleManifest().cycleId).not.toBe(
      EDUCATION_V2_P1_A_CYCLE_3_MANIFEST.cycleId,
    );
  });

  it("rejects broken outcome, source and prerequisite bindings", () => {
    const candidate = structuredClone(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM);
    const first = candidate.path.units[0]?.steps[0];
    const second = candidate.path.units[0]?.steps[1];
    if (!first || !second) throw new Error("Cycle 3 adımları eksik");

    second.learningOutcomeKeys = ["P1A_V3_GENRE_TRANSFER"];
    second.prerequisiteStepKeys = ["missing-step"];

    const errors = validateP1ACycle3Program(candidate);
    expect(errors).toContain("Kazanım içerikle uyumsuz: evidence-small-study-v3 -> RC_DETAIL");
    expect(errors).toContain(
      "Bilinmeyen cycle 3 prerequisite: evidence-small-study-v3 -> missing-step",
    );
  });

  it("rejects duplicate step keys before a candidate can be manifested", () => {
    const candidate = structuredClone(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM);
    const first = candidate.path.units[0]?.steps[0];
    const second = candidate.path.units[0]?.steps[1];
    if (!first || !second) throw new Error("Cycle 3 adımları eksik");

    second.key = first.key;

    expect(validateP1ACycle3Program(candidate)).toContain(`Tekrarlı step: ${first.key}`);
  });
});
