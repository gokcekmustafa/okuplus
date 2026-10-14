import { describe, expect, it } from "vitest";
import {
  classifyExerciseTemplateVersionConfig,
  sanitizedTrainingConfigIssues,
  type ExerciseTemplateVersionConfigRow,
} from "../src/lib/exercise-template-version-config-policy.js";

const validConfig = {
  schemaVersion: 1,
  family: "MAIN_IDEA",
  competency: "RC_MAIN_IDEA",
  difficulty: "FOUNDATION",
  estimatedDurationSeconds: 120,
  instructions: "Metni oku ve ana düşünceyi seç.",
  interactionType: "MULTIPLE_CHOICE",
  contentRequirement: "REQUIRED",
  questionRequirement: "REQUIRED",
  scoring: {
    mode: "DETERMINISTIC",
    primarySignal: "ACCURACY",
    timeRole: "NONE",
    maxScore: 1,
    openEnded: false,
  },
  feedback: {
    types: ["POSITIVE"],
    showExplanation: true,
    retryEnabled: false,
    maxMessageLength: 80,
  },
  xp: { completionPoints: 10, correctAnswerBonus: 2, dailyCap: 40 },
  eligibility: {
    usage: "TRAINING_ONLY",
    requiresPublishedContent: true,
    requiresPublishedQuestions: true,
    minimumDifficulty: "FOUNDATION",
    maximumDifficulty: "CHALLENGING",
  },
  rendererKey: "QUESTION_MULTIPLE_CHOICE",
  settings: { optionCount: 4 },
};

function row(overrides: Partial<ExerciseTemplateVersionConfigRow> = {}) {
  return {
    versionConfig: null,
    parentConfig: validConfig,
    parentExists: true,
    templateType: "COMPREHENSION",
    versionStatus: "PUBLISHED",
    ...overrides,
  } satisfies ExerciseTemplateVersionConfigRow;
}

describe("ExerciseTemplateVersion config policy", () => {
  it("requires a backfill only when a training version is missing a valid snapshot", () => {
    expect(classifyExerciseTemplateVersionConfig(row())).toEqual({
      kind: "BACKFILL_REQUIRED",
      parent: "VALID",
    });
    expect(
      classifyExerciseTemplateVersionConfig(row({ parentConfig: { catalogOnly: true } })),
    ).toEqual({ kind: "BACKFILL_REQUIRED", parent: "INVALID" });
  });

  it("keeps canonical placement versions out of the training-config backfill", () => {
    expect(
      classifyExerciseTemplateVersionConfig(
        row({
          parentConfig: {
            canonicalManifestId: "OKU-READING-PLACEMENT-V1",
            canonicalManifestVersion: "1.1.0",
          },
          templateType: "MIXED",
        }),
      ),
    ).toEqual({ kind: "CANONICAL_PLACEMENT_EXEMPT" });
  });

  it("exempts canonical placement versions even when their placement config is present", () => {
    expect(
      classifyExerciseTemplateVersionConfig(
        row({
          versionConfig: { canonicalManifestId: "OKU-READING-PLACEMENT-V1" },
          parentConfig: { canonicalManifestId: "OKU-READING-PLACEMENT-V1" },
          templateType: "MIXED",
          versionStatus: "PUBLISHED",
        }),
      ),
    ).toEqual({ kind: "CANONICAL_PLACEMENT_EXEMPT" });
  });

  it("does not exempt a similarly shaped non-placement template", () => {
    expect(
      classifyExerciseTemplateVersionConfig(
        row({
          parentConfig: { canonicalManifestId: "OKU-READING-PLACEMENT-V1" },
          templateType: "COMPREHENSION",
        }),
      ),
    ).toEqual({ kind: "BACKFILL_REQUIRED", parent: "INVALID" });
  });

  it("does not exempt an unpublished placement template version", () => {
    expect(
      classifyExerciseTemplateVersionConfig(
        row({
          parentConfig: { canonicalManifestId: "OKU-READING-PLACEMENT-V1" },
          templateType: "MIXED",
          versionStatus: "DRAFT",
        }),
      ),
    ).toEqual({ kind: "BACKFILL_REQUIRED", parent: "INVALID" });
  });

  it("recognizes an already configured version without changing its value", () => {
    expect(classifyExerciseTemplateVersionConfig(row({ versionConfig: validConfig }))).toEqual({
      kind: "CONFIGURED",
      valid: true,
    });
  });

  it("marks a non-null but invalid version config for review", () => {
    expect(
      classifyExerciseTemplateVersionConfig(row({ versionConfig: { unsupported: true } })),
    ).toEqual({ kind: "CONFIGURED", valid: false });
  });

  it("reports bounded Zod categories without exposing config values", () => {
    const sensitive = "student@example.com secret-token";
    const issues = sanitizedTrainingConfigIssues({
      ...validConfig,
      instructions: 42,
      "student@example.com": sensitive,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_type", path: ["instructions"] }),
        expect.objectContaining({ code: "unrecognized_keys", path: [] }),
      ]),
    );
    expect(JSON.stringify(issues)).not.toContain(sensitive);
    expect(JSON.stringify(issues)).not.toContain("student@example.com");
  });
});
