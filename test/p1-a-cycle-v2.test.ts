import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST,
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_V2_STATUS,
  buildEducationV2P1ACycleV2LearningCycleManifest,
  p1ACycleV2ContentVersionId,
  p1ACycleV2QuestionVersionId,
  p1ACycleV2TemplateVersionId,
  validateEducationV2P1ACycleV2Manifest,
  validateP1ACycleV2Program,
} from "../src/curriculum/education-v2-p1-a-cycle-v2-program.js";
import { validateLearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";
import { buildEducationV2P1ALearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";

describe("Education V2 P1-A cycle 2 authoring contract", () => {
  it("contains nine original, ordered steps across two units", () => {
    expect(validateP1ACycleV2Program()).toEqual([]);
    expect(EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.units).toHaveLength(2);
    expect(
      EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.units.flatMap((unit) => unit.steps),
    ).toHaveLength(9);
    expect(
      EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.units
        .flatMap((unit) => unit.steps)
        .map((step) => step.type),
    ).toEqual([
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
  });

  it("her adımı içeriğiyle uyumlu açık bir kazanıma bağlar", () => {
    const steps = EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.units.flatMap((unit) => unit.steps);

    expect(steps.map((step) => step.learningOutcomeKeys)).toEqual([
      ["P1A_V2_STRUCTURE_FOUNDATION"],
      ["P1A_V2_STRUCTURE_FOUNDATION"],
      ["P1A_V2_STRUCTURE_FOUNDATION"],
      ["P1A_V2_STRUCTURE_FOUNDATION"],
      ["P1A_V2_MEANING_RELATIONS"],
      ["P1A_V2_MEANING_RELATIONS"],
      ["P1A_V2_TRANSFER"],
      ["P1A_V2_MEANING_RELATIONS", "P1A_V2_TRANSFER"],
      ["P1A_V2_STRUCTURE_FOUNDATION", "P1A_V2_MEANING_RELATIONS", "P1A_V2_TRANSFER"],
    ]);
  });

  it("içerikle ilgisiz kazanım eşlemesini reddeder", () => {
    const candidate = structuredClone(EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM);
    const firstStep = candidate.path.units[0]?.steps[0];
    if (!firstStep) throw new Error("Cycle v2 ilk adımı eksik");
    firstStep.learningOutcomeKeys = ["P1A_V2_TRANSFER"];

    expect(validateP1ACycleV2Program(candidate)).toContain(
      "Kazanım içerikle uyumsuz: structure-teaching-v2 -> RC_MAIN_IDEA",
    );
  });

  it("passes the shared manifest validator without changing canonical v1", () => {
    expect(validateEducationV2P1ACycleV2Manifest()).toEqual([]);
    expect(validateLearningCycleManifest(EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST).valid).toBe(true);
    expect(buildEducationV2P1ACycleV2LearningCycleManifest()).toEqual(
      EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST,
    );
    expect(buildEducationV2P1ALearningCycleManifest().cycleVersion).toBe(1);
  });

  it("uses cycle-2 immutable identifiers and does not collide with v1 naming", () => {
    const v2Content = p1ACycleV2ContentVersionId("p1a-v2-structure-teach");
    const v2Template = p1ACycleV2TemplateVersionId("p1a-v2-transfer-practice");
    const v2Question = p1ACycleV2QuestionVersionId(
      "p1a-v2-transfer-practice",
      "p1a-v2-transfer-practice-1",
    );
    expect(new Set([v2Content, v2Template, v2Question]).size).toBe(3);
    expect(v2Content).toContain("cycle-2");
    expect(v2Template).toContain("cycle-2");
    expect(v2Question).toContain("-v2");
    expect(EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.programId).not.toBe(
      "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE",
    );
  });

  it("keeps all candidate questions complete, Turkish and option-id scored", () => {
    const questions = EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.exercises.flatMap(
      (exercise) => exercise.questions,
    );
    expect(questions).toHaveLength(22);
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

  it("keeps correct-option positions balanced without forcing equal lengths", () => {
    const counts = new Map<string, number>();
    for (const question of EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.exercises.flatMap(
      (exercise) => exercise.questions,
    )) {
      const position = question.options.findIndex(
        (option) => option.id === question.correctOptionId,
      );
      counts.set(
        String.fromCharCode(65 + position),
        (counts.get(String.fromCharCode(65 + position)) ?? 0) + 1,
      );
    }
    const values = [...counts.values()];
    expect(counts).toEqual(
      new Map([
        ["A", 5],
        ["B", 6],
        ["C", 5],
        ["D", 6],
      ]),
    );
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
  });

  it("keeps v2 correct options from being the sole longest choice", () => {
    const questions = EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.exercises.flatMap(
      (exercise) => exercise.questions,
    );
    // This is a text-length warning only; it does not establish educational
    // validity, which still requires separate editorial and expert review.
    expect(
      questions.filter((question) => {
        const quality = assessOptionLengthQuality(question);
        return quality?.correctIsLongest && quality.margin > 0;
      }),
    ).toHaveLength(0);
    expect(
      questions.filter((question) => assessOptionLengthQuality(question)?.clearOutlier),
    ).toHaveLength(0);
  });

  it("keeps the cycle candidate closed until expert review", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_V2_STATUS).toBe("EXPERT_REVIEW_REQUIRED");
    expect(EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST.completion.nextCycle).toBe("REVIEW_REQUIRED");
  });

  it("rejects broken v2 bindings and prerequisite order", () => {
    const manifest = structuredClone(EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST);
    manifest.steps[1]!.prerequisiteKeys = ["missing-step"];
    manifest.steps[2]!.order = 4;
    const result = validateLearningCycleManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "UNKNOWN_PREREQUISITE")).toBe(true);
    expect(result.errors.some((error) => error.code === "STEP_ORDER")).toBe(true);
  });

  it("does not add cycle v2 to the canonical production readiness builder", async () => {
    const canonical = buildEducationV2P1ALearningCycleManifest();
    expect(canonical.cycleVersion).toBe(1);
    expect(canonical.cycleId).not.toBe(EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST.cycleId);
  });
});
