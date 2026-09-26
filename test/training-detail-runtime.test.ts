import { describe, expect, it } from "vitest";
import {
  buildTrainingFeedback,
  isDetailEvidenceVersionConfig,
  isMainIdeaVersionConfig,
  resolveTrainingRuntimeConfig,
  toDetailEvidenceRuntimeConfig,
} from "../src/modules/training/runtime.js";
import {
  parseTrainingExerciseContract,
  parseTrainingExerciseVersionConfig,
  safeParseTrainingExerciseContract,
  toTrainingExerciseVersionConfig,
  type TrainingExerciseContract,
} from "../src/modules/training/exercise-contract.js";

function detailContract(): TrainingExerciseContract {
  return {
    stableKey: "TRAINING_DETAIL_EVIDENCE_DEVELOPING",
    version: 1,
    family: "DETAIL_EVIDENCE",
    competency: "RC_DETAIL",
    difficulty: "DEVELOPING",
    estimatedDurationSeconds: 120,
    instructions: "Pasajda sorulan ayrıntıyı bul ve doğru seçeneği işaretle.",
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

describe("DETAIL_EVIDENCE training contract", () => {
  it("accepts the typed version-specific contract", () => {
    const contract = parseTrainingExerciseContract(detailContract());
    const config = toTrainingExerciseVersionConfig(contract);

    expect(config.family).toBe("DETAIL_EVIDENCE");
    expect(config.competency).toBe("RC_DETAIL");
    expect(config.interactionType).toBe("MULTIPLE_CHOICE");
    expect(config.rendererKey).toBe("QUESTION_MULTIPLE_CHOICE");
    expect(config.settings.optionCount).toBe(4);
    expect(isDetailEvidenceVersionConfig(config)).toBe(true);
    expect(isMainIdeaVersionConfig(config)).toBe(false);
    expect(resolveTrainingRuntimeConfig("TRAINING", config)).toMatchObject({
      status: "READY",
      source: "VERSION_SNAPSHOT",
    });
  });

  it("rejects a non-MULTIPLE_CHOICE renderer or option count", () => {
    const invalidRenderer = safeParseTrainingExerciseContract({
      ...detailContract(),
      versionConfig: { rendererKey: "QUESTION_TEXT", settings: { optionCount: 4 } },
    });
    const invalidOptionCount = safeParseTrainingExerciseContract({
      ...detailContract(),
      versionConfig: {
        rendererKey: "QUESTION_MULTIPLE_CHOICE",
        settings: { optionCount: 3 },
      },
    });

    expect(invalidRenderer.success).toBe(false);
    expect(invalidOptionCount.success).toBe(false);
  });

  it("keeps the version snapshot as the only runtime source", () => {
    const versionConfig = toTrainingExerciseVersionConfig(detailContract());
    const runtimeConfig = toDetailEvidenceRuntimeConfig(versionConfig);
    const parentMetadata = { rendererKey: "PARENT_ONLY", settings: { optionCount: 99 } };

    expect(parseTrainingExerciseVersionConfig(versionConfig)).toEqual(versionConfig);
    expect(runtimeConfig.family).toBe("DETAIL_EVIDENCE");
    expect(runtimeConfig.rendererKey).toBe("QUESTION_MULTIPLE_CHOICE");
    expect(resolveTrainingRuntimeConfig("TRAINING", versionConfig)).toMatchObject({
      status: "READY",
      source: "VERSION_SNAPSHOT",
    });
    expect(parentMetadata).not.toEqual(runtimeConfig);
  });

  it("provides short inline detail feedback without exposing an answer", () => {
    const config = toTrainingExerciseVersionConfig(detailContract());

    expect(buildTrainingFeedback(config, true)).toBe("Metindeki ayrıntıyı doğru yakaladın.");
    const incorrect = buildTrainingFeedback(config, false);
    expect(incorrect).toContain("pasajdaki bilgiyi doğru yansıtmıyor");
    expect(incorrect).not.toContain("doğru cevap");
  });

  it("fails closed for missing or invalid detail config", () => {
    expect(isDetailEvidenceVersionConfig(null)).toBe(false);
    expect(isDetailEvidenceVersionConfig({ family: "DETAIL_EVIDENCE" })).toBe(false);
    expect(resolveTrainingRuntimeConfig("TRAINING", null)).toMatchObject({
      status: "FAIL_CLOSED",
      reason: "MISSING_VERSION_CONFIG",
    });
  });
});
