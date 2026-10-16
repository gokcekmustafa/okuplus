import { describe, expect, it } from "vitest";
import {
  CYCLE_3_LEARNING_OUTCOMES,
  CYCLE_3_EXERCISE_OUTCOME_KEYS,
  CYCLE_3_QUESTION_OUTCOME_KEYS,
  EDUCATION_V2_P1_A_CYCLE_3_MANIFEST,
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_EXPLICIT_PUBLICATION_APPROVED,
  EDUCATION_V2_P1_A_CYCLE_3_STATUS,
  buildEducationV2P1ACycle3LearningCycleManifest,
  isEducationV2P1ACycle3ProductionAssignmentEnabled,
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

  it("gives each teaching station a worked example and guided task linked to its next exercise", () => {
    const steps = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.flatMap((unit) => unit.steps);
    const teachingSteps = steps.filter((step) => step.type === "TEACHING");
    expect(teachingSteps).toHaveLength(2);

    for (const step of teachingSteps) {
      const content = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content.find(
        (item) => item.key === step.contentKey,
      );
      const lesson = content?.lesson;
      expect(lesson?.objective).toBeTruthy();
      expect(lesson?.explanation).toBeTruthy();
      expect(lesson?.workedExample).toBeTruthy();
      expect(lesson?.guidedPractice).toContain("Şimdi dene");
      expect(lesson?.nextExerciseKey).toBe(steps[steps.indexOf(step) + 1]?.exerciseKey);
    }
    expect(validateP1ACycle3Program()).toEqual([]);
  });

  it("keeps every question explicitly bound to the outcome it is intended to measure", () => {
    const exercises = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises;
    const questionMap = CYCLE_3_QUESTION_OUTCOME_KEYS as Record<
      string,
      Record<string, readonly string[]>
    >;

    expect(Object.keys(CYCLE_3_EXERCISE_OUTCOME_KEYS).sort()).toEqual(
      exercises.map((exercise) => exercise.key).sort(),
    );
    expect(
      exercises.every((exercise) => {
        const mapped = questionMap[exercise.key];
        return (
          mapped &&
          Object.keys(mapped).sort().join("|") ===
            exercise.questions
              .map((question) => question.key)
              .sort()
              .join("|") &&
          Object.values(mapped).every((outcomes) => outcomes.length > 0)
        );
      }),
    ).toBe(true);
    expect(
      new Set(Object.values(questionMap).flatMap((mapping) => Object.keys(mapping))),
    ).toHaveLength(16);
    expect(validateP1ACycle3Program()).toEqual([]);
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

  it("measures transfer on an unseen pair of informational and narrative texts", () => {
    const program = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM;
    const assessment = program.exercises.find((exercise) => exercise.key === "p1a-v3-assessment");
    const assessmentContent = program.content.find((item) => item.key === assessment?.contentKey);
    const question = assessment?.questions.find((item) => item.key === "p1a-v3-assessment-4");
    const correctOption = question?.options.find(
      (option) => option.id === question.correctOptionId,
    );

    expect(assessmentContent?.body).toContain("Bilgilendirici metin");
    expect(assessmentContent?.body).toContain("Anlatı metni");
    expect(
      program.exercises.some(
        (exercise) =>
          exercise.key !== assessment?.key && exercise.contentKey === assessment?.contentKey,
      ),
    ).toBe(false);
    expect(question?.prompt).toContain("İki metindeki");
    expect(CYCLE_3_QUESTION_OUTCOME_KEYS["p1a-v3-assessment"]["p1a-v3-assessment-4"]).toContain(
      "P1A_V3_GENRE_TRANSFER",
    );
    expect(correctOption?.text).toContain("Açıklamalar");
    expect(correctOption?.text).toContain("başlıklar");
    expect(question?.correctOptionId).toBe("b");
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
    expect(
      questions.filter((question) => {
        const correct = question.options.find((option) => option.id === question.correctOptionId);
        return (
          correct &&
          question.options.filter((option) => option.text.length > correct.text.length).length ===
            0 &&
          question.options.filter((option) => option.text.length === correct.text.length).length ===
            1
        );
      }),
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

  it("records Cycle 3's explicit release without changing first-cycle readiness", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_3_STATUS).toBe("PUBLISHED");
    expect(EDUCATION_V2_P1_A_CYCLE_3_EXPLICIT_PUBLICATION_APPROVED).toBe(true);
    expect(isEducationV2P1ACycle3ProductionAssignmentEnabled()).toBe(true);
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

  it("rejects teaching without a structured lesson or its linked next exercise", () => {
    const missingLesson = structuredClone(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM);
    const teachingContent = missingLesson.content.find(
      (item) => item.key === "p1a-v3-evidence-teaching",
    );
    if (!teachingContent) throw new Error("Cycle 3 öğretim içeriği eksik");
    delete teachingContent.lesson;
    expect(validateP1ACycle3Program(missingLesson)).toContain(
      "Öğretim içeriğinde yapılandırılmış ders eksik: evidence-teaching-v3",
    );

    const mismatchedExercise = structuredClone(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM);
    const transferContent = mismatchedExercise.content.find(
      (item) => item.key === "p1a-v3-transfer-teaching",
    );
    if (!transferContent?.lesson) throw new Error("Cycle 3 aktarım dersi eksik");
    transferContent.lesson.nextExerciseKey = "missing-exercise";
    expect(validateP1ACycle3Program(mismatchedExercise)).toContain(
      "Öğretim ve sonraki alıştırma bağlantısı geçersiz: transfer-teaching-v3",
    );
  });

  it("rejects a question that loses its explicit outcome binding", () => {
    const candidate = structuredClone(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM);
    const question = candidate.exercises[0]?.questions[0];
    if (!question) throw new Error("Cycle 3 sorusu eksik");

    question.key = "cycle-3-unmapped-question";

    expect(validateP1ACycle3Program(candidate)).toContain(
      `Soru kazanım eşlemesi eksik: ${candidate.exercises[0]!.key} -> ${question.key}`,
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
