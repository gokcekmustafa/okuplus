import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTrainingFeedback } from "../src/modules/training/runtime.js";
import {
  parseTrainingExerciseContract,
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
    expect(app).toContain("data.isCorrect === false && !isFastReadingExercise()");
    expect(app).toContain("showExerciseFeedback(data)");
  });
});
