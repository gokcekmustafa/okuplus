import { describe, expect, it } from "vitest";
import {
  buildTrainingFeedback,
  isMainIdeaVersionConfig,
  isTrainingConfigCandidate,
  toMainIdeaRuntimeConfig,
} from "../src/modules/training/runtime.js";
import {
  parseTrainingExerciseVersionConfig,
  toTrainingExerciseVersionConfig,
  type TrainingExerciseContract,
} from "../src/modules/training/exercise-contract.js";

function validConfig() {
  const contract: TrainingExerciseContract = {
    stableKey: "TRAINING_MAIN_IDEA_FOUNDATION",
    version: 1,
    family: "MAIN_IDEA",
    competency: "RC_MAIN_IDEA",
    difficulty: "FOUNDATION",
    estimatedDurationSeconds: 120,
    instructions: "Metnin tamamını oku ve ana düşünceyi seç.",
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
    xp: { completionPoints: 20, correctAnswerBonus: 2, dailyCap: 100 },
    eligibility: {
      usage: "TRAINING_ONLY",
      requiresPublishedContent: true,
      requiresPublishedQuestions: true,
      minimumDifficulty: "FOUNDATION",
      maximumDifficulty: "CHALLENGING",
    },
    versionConfig: { rendererKey: "QUESTION_MULTIPLE_CHOICE", settings: {} },
  };
  return toTrainingExerciseVersionConfig(contract);
}

describe("MAIN_IDEA training runtime contract", () => {
  it("uses a valid immutable version snapshot", () => {
    const config = validConfig();
    expect(isMainIdeaVersionConfig(config)).toBe(true);
    expect(parseTrainingExerciseVersionConfig(config)).toEqual(config);
    expect(toMainIdeaRuntimeConfig(config)).toMatchObject({
      family: "MAIN_IDEA",
      rendererKey: "QUESTION_MULTIPLE_CHOICE",
    });
  });

  it("does not treat a legacy parent snapshot as training config", () => {
    expect(isTrainingConfigCandidate({ renderer: "legacy-catalog-metadata" })).toBe(false);
    expect(isMainIdeaVersionConfig({ renderer: "legacy-catalog-metadata" })).toBe(false);
  });

  it("rejects missing and malformed version config", () => {
    expect(isMainIdeaVersionConfig(null)).toBe(false);
    expect(isMainIdeaVersionConfig({ family: "MAIN_IDEA" })).toBe(false);
  });

  it("keeps configured positive feedback Turkish and short", () => {
    expect(buildTrainingFeedback(validConfig(), true)).toBe("Metnin genel mesajını yakaladın.");
  });

  it("returns corrective feedback without revealing the answer", () => {
    const feedback = buildTrainingFeedback(validConfig(), false);
    expect(feedback).toContain("metnin tamamının ortak mesajını düşün");
    expect(feedback).not.toContain("doğru cevap");
  });

  it("does not generate training feedback for legacy or placement paths", () => {
    expect(buildTrainingFeedback({ canonicalActive: true }, false)).toBeNull();
    expect(buildTrainingFeedback(null, true)).toBeNull();
  });

  it("keeps the renderer contract explicit", () => {
    expect(validConfig().rendererKey).toBe("QUESTION_MULTIPLE_CHOICE");
    expect(validConfig().interactionType).toBe("MULTIPLE_CHOICE");
    expect(validConfig().scoring.openEnded).toBe(false);
  });
});
