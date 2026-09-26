import { describe, expect, it } from "vitest";
import { lessonMetadataSchema } from "../src/modules/lessons/contract.js";
import {
  EDUCATION_V2_P0_PROGRAM,
  EDUCATION_V2_P0_PROGRAM_ID,
  EDUCATION_V2_P0_SKILL_MANIFEST,
  lessonMetadataFor,
} from "../src/curriculum/education-v2-p0-program.js";

describe("Education V2 P0 first program manifest", () => {
  it("iki eğitim alanında öğretimden uygulamaya kadar küçük bir akış tanımlar", () => {
    expect(EDUCATION_V2_P0_PROGRAM.programId).toBe(EDUCATION_V2_P0_PROGRAM_ID);
    expect(EDUCATION_V2_P0_PROGRAM.paths).toHaveLength(3);
    expect(EDUCATION_V2_P0_PROGRAM.paths.map((path) => path.area)).toEqual([
      "FAST_READING",
      "READING_COMPREHENSION",
      "COMMON",
    ]);

    for (const path of EDUCATION_V2_P0_PROGRAM.paths) {
      expect(path.steps.map((step) => step.type)).toEqual(
        path.area === "COMMON"
          ? ["REINFORCEMENT", "ASSESSMENT"]
          : ["TEACHING", "SMALL_STUDY", "PRACTICE"],
      );
    }
  });

  it("gerçek yayın öncesi içerik sözleşmesini ve Türkçe ders metadata'sını doğrular", () => {
    expect(EDUCATION_V2_P0_PROGRAM.content).toHaveLength(8);
    expect(EDUCATION_V2_P0_PROGRAM.exercises).toHaveLength(6);
    expect(
      EDUCATION_V2_P0_PROGRAM.exercises.reduce(
        (total, exercise) => total + exercise.questions.length,
        0,
      ),
    ).toBe(14);

    const lessonContents = EDUCATION_V2_P0_PROGRAM.content.filter((content) => content.lesson);
    expect(lessonContents).toHaveLength(2);
    const contentKeys = new Set(EDUCATION_V2_P0_PROGRAM.content.map((content) => content.key));
    const exerciseKeys = new Set(EDUCATION_V2_P0_PROGRAM.exercises.map((exercise) => exercise.key));
    const questionKeys = new Set(
      EDUCATION_V2_P0_PROGRAM.exercises.flatMap((exercise) =>
        exercise.questions.map((question) => question.key),
      ),
    );
    for (const content of EDUCATION_V2_P0_PROGRAM.content) {
      if (content.lesson) expect(exerciseKeys).toContain(content.lesson.nextExerciseKey);
    }
    for (const exercise of EDUCATION_V2_P0_PROGRAM.exercises) {
      expect(contentKeys).toContain(exercise.contentKey);
    }
    for (const path of EDUCATION_V2_P0_PROGRAM.paths) {
      for (const step of path.steps) {
        if (step.contentKey) expect(contentKeys).toContain(step.contentKey);
        if (step.exerciseKey) expect(exerciseKeys).toContain(step.exerciseKey);
      }
    }
    for (const assessment of EDUCATION_V2_P0_PROGRAM.assessments) {
      expect(exerciseKeys).toContain(assessment.templateExerciseKey);
      for (const questionKey of assessment.questionKeys)
        expect(questionKeys).toContain(questionKey);
    }
    for (const content of lessonContents) {
      expect(lessonMetadataSchema.parse(lessonMetadataFor(content))).toMatchObject({
        lessonType: "LEARNING_LESSON",
        contractVersion: 1,
        skillCode: content.skillCode,
      });
    }

    for (const exercise of EDUCATION_V2_P0_PROGRAM.exercises) {
      expect(exercise.contract.schemaVersion).toBe(1);
      expect(exercise.questions.length).toBeGreaterThanOrEqual(2);
      for (const question of exercise.questions) {
        expect(question.options).toHaveLength(4);
        expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
        expect(question.prompt).not.toMatch(/TODO|lorem ipsum/i);
      }
    }
  });

  it("ortak pekiştirmeyi iki bağımsız uygulamaya, testi de pekiştirmeye bağlar", () => {
    const fastPath = EDUCATION_V2_P0_PROGRAM.paths.find((path) => path.area === "FAST_READING");
    const readingPath = EDUCATION_V2_P0_PROGRAM.paths.find(
      (path) => path.area === "READING_COMPREHENSION",
    );
    const commonPath = EDUCATION_V2_P0_PROGRAM.paths.find((path) => path.area === "COMMON");
    const reinforcement = commonPath?.steps.find((step) => step.type === "REINFORCEMENT");
    const assessment = commonPath?.steps.find((step) => step.type === "ASSESSMENT");
    const readingPractice = readingPath?.steps.find((step) => step.type === "PRACTICE");

    expect(fastPath?.steps.map((step) => step.type)).toEqual([
      "TEACHING",
      "SMALL_STUDY",
      "PRACTICE",
    ]);
    expect(readingPath?.steps.map((step) => step.type)).toEqual([
      "TEACHING",
      "SMALL_STUDY",
      "PRACTICE",
    ]);
    expect(reinforcement?.prerequisiteStepKeys).toEqual([
      "fast-practice",
      "reading-comprehension-practice",
    ]);
    expect(assessment?.prerequisiteStepKeys).toEqual(["shared-reinforcement"]);
    expect(assessment?.completionRule?.minimumScore).toBe(0.75);
    expect(readingPractice?.key).toBe("reading-comprehension-practice");
    expect(EDUCATION_V2_P0_PROGRAM.assessments[0]?.config).toMatchObject({
      questionCount: 4,
      minimumScorableCount: 4,
      minimumAnsweredCount: 4,
    });
  });

  it("program skill kataloğu placement kapsamını değiştirmeden altı alanı tanımlar", () => {
    expect(EDUCATION_V2_P0_SKILL_MANIFEST.map((skill) => skill.code)).toEqual([
      "FAST_ATTENTION",
      "FAST_RECOGNITION",
      "FAST_CHUNKING",
      "RC_MAIN_IDEA",
      "RC_DETAIL",
      "RC_INFERENCE",
    ]);
    expect(
      EDUCATION_V2_P0_SKILL_MANIFEST.slice(0, 3).every(
        (skill) => skill.category === "COMPREHENSION",
      ),
    ).toBe(true);
    expect(EDUCATION_V2_P0_SKILL_MANIFEST.slice(3).map((skill) => skill.category)).toEqual([
      "MAIN_IDEA",
      "DETAIL",
      "INFERENCE",
    ]);
  });
});
