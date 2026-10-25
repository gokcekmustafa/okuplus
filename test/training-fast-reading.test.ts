import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTrainingFeedback } from "../src/modules/training/runtime.js";
import { buildFastReadingMeasurement } from "../src/modules/training/fast-reading-measurement.js";
import { EDUCATION_V2_P0_PROGRAM } from "../src/curriculum/education-v2-p0-program.js";
import { ACADEMIC_P0_LESSONS } from "../src/curriculum/academic-reading-p0.js";
import { EDUCATION_V2_P1_A_PROGRAM } from "../src/curriculum/education-v2-p1-a-program.js";
import { EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM } from "../src/curriculum/education-v2-p1-a-cycle-v2-program.js";
import { EDUCATION_V2_P1_A_CYCLE_3_PROGRAM } from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import { EDUCATION_V2_P1_A_CYCLE_4_PROGRAM } from "../src/curriculum/education-v2-p1-a-cycle-4-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_5_8,
  EDUCATION_V2_P1_A_CYCLE_9_12,
  EDUCATION_V2_P1_A_CYCLE_13_16,
  EDUCATION_V2_P1_A_CYCLE_17_20,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import { EDUCATION_V2_P1_BCD_PROGRAMS } from "../src/curriculum/education-v2-p1-bcd-program.js";
import {
  parseTrainingExerciseContract,
  resolveTrainingRuntimeConfig,
  safeParseTrainingExerciseVersionConfig,
  toTrainingExerciseVersionConfig,
  validatePublishedExerciseGraph,
  type PublishedExerciseGraph,
  type TrainingExerciseContract,
} from "../src/modules/training/exercise-contract.js";

const fastFamilies = [
  ["ATTENTION_BURST", "FAST_ATTENTION", "QUESTION_ATTENTION_BURST"],
  ["RAPID_RECOGNITION", "FAST_RECOGNITION", "QUESTION_RAPID_RECOGNITION"],
  ["PHRASE_CHUNKING", "FAST_CHUNKING", "QUESTION_PHRASE_CHUNKING"],
] as const;

function fastContract(
  family: (typeof fastFamilies)[number][0],
  competency: (typeof fastFamilies)[number][1],
  rendererKey: (typeof fastFamilies)[number][2],
): TrainingExerciseContract {
  return {
    stableKey: `${family}_FOUNDATION_V1`,
    version: 1,
    family,
    competency,
    difficulty: "FOUNDATION",
    estimatedDurationSeconds: 60,
    instructions: "Kısa metni oku ve en doğru seçeneği işaretle.",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
    scoring: {
      mode: "DETERMINISTIC",
      primarySignal: "ACCURACY",
      timeRole: "SECONDARY",
      maxScore: 1,
      openEnded: false,
    },
    feedback: {
      types: ["POSITIVE", "CORRECTIVE", "HINT"],
      showExplanation: true,
      retryEnabled: true,
      maxMessageLength: 240,
    },
    xp: { completionPoints: 5, correctAnswerBonus: 1, dailyCap: 50 },
    eligibility: {
      usage: "TRAINING_ONLY",
      requiresPublishedContent: true,
      requiresPublishedQuestions: true,
      minimumDifficulty: "FOUNDATION",
      maximumDifficulty: "CHALLENGING",
    },
    versionConfig: { rendererKey, settings: { optionCount: 4, mobileLayout: "STACKED" } },
  };
}

function graph(config: unknown): PublishedExerciseGraph {
  return {
    template: { id: "template-fast-1", tenantId: null, status: "PUBLISHED", deletedAt: null },
    version: {
      id: "template-version-fast-1",
      templateId: "template-fast-1",
      version: 1,
      status: "PUBLISHED",
      deletedAt: null,
      config,
    },
    contents: [
      {
        position: 0,
        contentVersion: {
          id: "content-version-fast-1",
          contentId: "content-fast-1",
          status: "PUBLISHED",
          content: {
            id: "content-fast-1",
            tenantId: null,
            status: "PUBLISHED",
            deletedAt: null,
          },
        },
      },
    ],
    questions: [
      {
        position: 0,
        questionVersion: {
          id: "question-version-fast-1",
          questionId: "question-fast-1",
          status: "PUBLISHED",
          question: {
            id: "question-fast-1",
            contentId: "content-fast-1",
            type: "MULTIPLE_CHOICE",
            status: "PUBLISHED",
            deletedAt: null,
          },
        },
      },
    ],
  };
}

describe("fast-reading training v1", () => {
  it.each(fastFamilies)("validates the %s contract", (family, competency, rendererKey) => {
    const contract = fastContract(family, competency, rendererKey);
    expect(parseTrainingExerciseContract(contract).family).toBe(family);
    const config = toTrainingExerciseVersionConfig(contract);
    expect(config.interactionType).toBe("MULTIPLE_CHOICE");
    expect(config.contentRequirement).toBe("REQUIRED");
    expect(config.questionRequirement).toBe("REQUIRED");
    expect(config.scoring.primarySignal).toBe("ACCURACY");
    expect(config.scoring.timeRole).toBe("SECONDARY");
    expect(config.settings.optionCount).toBe(4);
  });

  it("rejects a fast config that tries to use the comprehension renderer", () => {
    const contract = fastContract("ATTENTION_BURST", "FAST_ATTENTION", "QUESTION_ATTENTION_BURST");
    const config = toTrainingExerciseVersionConfig(contract);
    expect(
      safeParseTrainingExerciseVersionConfig({
        ...config,
        rendererKey: "QUESTION_MULTIPLE_CHOICE",
      }).success,
    ).toBe(false);
  });

  it.each(fastFamilies)("requires a published graph for %s", (family, competency, rendererKey) => {
    const contract = fastContract(family, competency, rendererKey);
    const invalid = graph(toTrainingExerciseVersionConfig(contract));
    invalid.contents = [];
    invalid.questions = [];
    const result = validatePublishedExerciseGraph(contract, invalid);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Published ContentVersion gerekli",
        "Published QuestionVersion gerekli",
      ]),
    );
  });

  it("keeps deterministic scoring and family-specific inline feedback", () => {
    const feedback = fastFamilies.map(([family, competency, rendererKey]) =>
      buildTrainingFeedback(
        toTrainingExerciseVersionConfig(fastContract(family, competency, rendererKey)),
        true,
      ),
    );
    expect(feedback).toEqual([
      "Güzel yakaladın.",
      "Hızlı ve doğru yakaladın.",
      "İfadeyi anlamlı bir parça olarak yakaladın.",
    ]);
    expect(feedback.join(" ")).not.toContain("XP");
  });

  it("includes each fast-reading family once in the daily composition", async () => {
    const { DAILY_TRAINING_COMPOSITION } = await import("../src/modules/training/daily-session.js");
    expect(DAILY_TRAINING_COMPOSITION.map((item) => item.family)).toEqual([
      "ATTENTION_BURST",
      "RAPID_RECOGNITION",
      "PHRASE_CHUNKING",
      "MAIN_IDEA",
      "DETAIL_EVIDENCE",
      "INFERENCE",
    ]);
  });

  it("renders accessible family markers and keeps answer controls server-scored", () => {
    const app = readFileSync("public/app.js", "utf8");
    expect(app).toContain("exercise-fast-reading");
    expect(app).toContain("data-training-family");
    expect(app).toContain('role="radio"');
    expect(app).toContain('tabindex="0"');
    expect(app).toContain("data-exercise-opt hidden");
    const submitHandler = app.slice(
      app.indexOf("async function handleExerciseSubmitAttempt()"),
      app.indexOf("async function handleExerciseComplete()"),
    );
    // All families now keep corrective feedback inline, including fast reading.
    expect(submitHandler).not.toContain("showCelebration(");
    expect(submitHandler).toContain("showExerciseFeedback(data)");
  });

  it("marks every source fast-reading exercise as timed secondary to accuracy", () => {
    const programs = [
      EDUCATION_V2_P0_PROGRAM,
      EDUCATION_V2_P1_A_PROGRAM,
      EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
      EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
      EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
      ...EDUCATION_V2_P1_A_CYCLE_5_8.map((cycle) => cycle.program),
      ...EDUCATION_V2_P1_A_CYCLE_9_12.map((cycle) => cycle.program),
      ...EDUCATION_V2_P1_A_CYCLE_13_16.map((cycle) => cycle.program),
      ...EDUCATION_V2_P1_A_CYCLE_17_20.map((cycle) => cycle.program),
      ...EDUCATION_V2_P1_BCD_PROGRAMS,
    ];
    const fastExercises = programs.flatMap((program) =>
      program.exercises.filter((exercise) =>
        ["ATTENTION_BURST", "RAPID_RECOGNITION", "PHRASE_CHUNKING"].includes(
          exercise.contract.family,
        ),
      ),
    );
    expect(fastExercises).toHaveLength(23);
    expect(
      fastExercises.every((exercise) => exercise.contract.scoring.timeRole === "SECONDARY"),
    ).toBe(true);
    const timedAuthoringLessons = ACADEMIC_P0_LESSONS.filter(
      (lesson) =>
        lesson.area === "FAST_READING" &&
        lesson.measurementSignals.includes("CONTROLLED_TASK_TIME"),
    );
    expect(timedAuthoringLessons).toHaveLength(3);
  });

  it("keeps speed secondary and withholds the speed indicator when comprehension is low", () => {
    const recorded = buildFastReadingMeasurement({
      family: "ATTENTION_BURST",
      readingDurationMs: 30_000,
      sessionAgeMs: 60_000,
      contentBodies: [Array.from({ length: 20 }, (_, index) => `kelime${index + 1}`).join(" ")],
      comprehensionAccuracy: 1,
    });
    expect(recorded).toMatchObject({ status: "RECORDED", speedEligible: true });
    expect(recorded?.wordsPerMinute).toBe(40);
    expect(
      buildFastReadingMeasurement({
        family: "PHRASE_CHUNKING",
        readingDurationMs: 30_000,
        sessionAgeMs: 60_000,
        contentBodies: ["Bir metin burada bulunuyor."],
        comprehensionAccuracy: 0.5,
      })?.speedEligible,
    ).toBe(false);
    expect(
      buildFastReadingMeasurement({
        family: "MAIN_IDEA",
        readingDurationMs: 30_000,
        sessionAgeMs: 60_000,
        contentBodies: ["Bir metin."],
        comprehensionAccuracy: 1,
      }),
    ).toBeNull();
    const legacyFastConfig = toTrainingExerciseVersionConfig(
      fastContract("ATTENTION_BURST", "FAST_ATTENTION", "QUESTION_ATTENTION_BURST"),
    );
    legacyFastConfig.scoring.timeRole = "NONE";
    expect(resolveTrainingRuntimeConfig("TRAINING", legacyFastConfig)).toMatchObject({
      status: "READY",
      config: { scoring: { primarySignal: "ACCURACY", timeRole: "SECONDARY" } },
    });
    expect(
      buildFastReadingMeasurement({
        family: "ATTENTION_BURST",
        readingDurationMs: 20_000,
        sessionAgeMs: 10_000,
        contentBodies: ["Bir metin."],
        comprehensionAccuracy: 1,
      })?.status,
    ).toBe("NOT_RECORDED");
  });

  it("collects only visible foreground reading time and pauses across interruptions", async () => {
    const { createForegroundReadingTimer } = await import("../public/fast-reading-timer.js");
    let now = 0;
    const timer = createForegroundReadingTimer(() => now);
    timer.resume();
    now = 2_000;
    timer.pause();
    now = 20_000;
    expect(timer.elapsedMs()).toBe(2_000);
    timer.resume();
    now = 23_500;
    expect(timer.finish()).toBe(5_500);
    expect(timer.isRunning()).toBe(false);
    timer.resume();
    now = 30_000;
    expect(timer.elapsedMs()).toBe(5_500);
  });

  it("shows reading first, starts question exposure after the explicit handoff, and never scores speed as accuracy", () => {
    const app = readFileSync("public/app.js", "utf8");
    const html = readFileSync("public/index.html", "utf8");
    const readStage = app.slice(
      app.indexOf("function currentFastReadingMeasurement"),
      app.indexOf("function renderExerciseResult"),
    );
    expect(readStage).toContain(
      'document.addEventListener("visibilitychange", updateFastReadingClock)',
    );
    expect(readStage).toContain("card.getBoundingClientRect()");
    expect(readStage).toContain('window.addEventListener("scroll", updateFastReadingClock');
    expect(readStage).toContain("measurement.timer.finish()");
    expect(app).toContain("body: JSON.stringify(completionBody)");
    expect(app).toContain("fastReading.speedEligible");
    expect(html).toContain("Metni okudum, sorulara geç");
    expect(app).toContain(
      "const readingPending = Boolean(readingMeasurement && !readingMeasurement.completed)",
    );
  });
});
