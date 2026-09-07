import { describe, expect, it } from "vitest";
import {
  buildTrainingFeedback,
  isDetailEvidenceVersionConfig,
  isInferenceVersionConfig,
  isMainIdeaVersionConfig,
  resolveTrainingRuntimeConfig,
} from "../src/modules/training/index.js";
import {
  parseTrainingExerciseContract,
  safeParseTrainingExerciseContract,
  toTrainingExerciseVersionConfig,
  type TrainingExerciseContract,
} from "../src/modules/training/exercise-contract.js";

function inferenceContract(): TrainingExerciseContract {
  return {
    stableKey: "TRAINING_INFERENCE_DEVELOPING",
    version: 1,
    family: "INFERENCE",
    competency: "RC_INFERENCE",
    difficulty: "DEVELOPING",
    estimatedDurationSeconds: 120,
    instructions: "Metni oku ve metinden çıkarılabilecek en güçlü sonucu seç.",
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
      retryEnabled: false,
      maxMessageLength: 240,
    },
    xp: { completionPoints: 12, correctAnswerBonus: 4, dailyCap: 100 },
    eligibility: {
      usage: "TRAINING_ONLY",
      requiresPublishedContent: true,
      requiresPublishedQuestions: true,
      minimumDifficulty: "FOUNDATION",
      maximumDifficulty: "CHALLENGING",
    },
    versionConfig: {
      rendererKey: "QUESTION_MULTIPLE_CHOICE",
      settings: { optionCount: 4, showExplanation: true },
    },
  };
}

describe("INFERENCE training contract", () => {
  it("accepts the typed version-specific contract", () => {
    const contract = parseTrainingExerciseContract(inferenceContract());
    const config = toTrainingExerciseVersionConfig(contract);

    expect(config.family).toBe("INFERENCE");
    expect(config.competency).toBe("RC_INFERENCE");
    expect(config.interactionType).toBe("MULTIPLE_CHOICE");
    expect(config.rendererKey).toBe("QUESTION_MULTIPLE_CHOICE");
    expect(config.settings.optionCount).toBe(4);
    expect(isInferenceVersionConfig(config)).toBe(true);
    expect(isMainIdeaVersionConfig(config)).toBe(false);
    expect(isDetailEvidenceVersionConfig(config)).toBe(false);
    expect(resolveTrainingRuntimeConfig("TRAINING", config)).toMatchObject({
      status: "READY",
      source: "VERSION_SNAPSHOT",
    });
  });

  it("rejects a non-MULTIPLE_CHOICE renderer or option count", () => {
    const invalidRenderer = safeParseTrainingExerciseContract({
      ...inferenceContract(),
      versionConfig: { rendererKey: "QUESTION_TEXT", settings: { optionCount: 4 } },
    });
    const invalidOptionCount = safeParseTrainingExerciseContract({
      ...inferenceContract(),
      versionConfig: {
        rendererKey: "QUESTION_MULTIPLE_CHOICE",
        settings: { optionCount: 3 },
      },
    });

    expect(invalidRenderer.success).toBe(false);
    expect(invalidOptionCount.success).toBe(false);
  });

  it("uses only the version snapshot and fails closed when it is invalid", () => {
    const config = toTrainingExerciseVersionConfig(inferenceContract());
    const parentMetadata = { rendererKey: "PARENT_ONLY", settings: { optionCount: 99 } };

    expect(resolveTrainingRuntimeConfig("TRAINING", config)).toMatchObject({
      status: "READY",
      source: "VERSION_SNAPSHOT",
    });
    expect(parentMetadata).not.toEqual(config);
    expect(resolveTrainingRuntimeConfig("TRAINING", null)).toMatchObject({
      status: "FAIL_CLOSED",
      reason: "MISSING_VERSION_CONFIG",
    });
    expect(isInferenceVersionConfig({ family: "INFERENCE" })).toBe(false);
  });

  it("provides inline inference feedback without exposing the answer", () => {
    const config = toTrainingExerciseVersionConfig(inferenceContract());

    expect(buildTrainingFeedback(config, true)).toBe("Metinden güçlü bir çıkarım yaptın.");
    const incorrect = buildTrainingFeedback(config, false);
    expect(incorrect).toContain("metnin desteklediği çıkarım değil");
    expect(incorrect).not.toContain("doğru cevap");
  });
});
