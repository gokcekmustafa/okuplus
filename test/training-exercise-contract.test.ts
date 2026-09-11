import { describe, expect, it } from "vitest";
import {
  exerciseContractFingerprint,
  nextExerciseVersion,
  parseTrainingExerciseContract,
  parseTrainingExerciseVersionConfig,
  resolveTrainingRuntimeConfig,
  safeParseTrainingExerciseContract,
  snapshotLegacyParentConfig,
  toTrainingExerciseVersionConfig,
  validatePublishedExerciseGraph,
  validatePublishedVersionChange,
  validateExpectedRevision,
  validateVersionEdit,
  validateUniqueStableKeys,
  versionConfigFingerprint,
  type PublishedExerciseGraph,
  type TrainingExerciseContract,
} from "../src/modules/training/exercise-contract.js";
import {
  assertTemplateVersionConfigMutable,
  parseTemplateVersionConfig,
} from "../src/modules/templates/service.js";

const validContract = (): TrainingExerciseContract => ({
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
    types: ["POSITIVE", "CORRECTIVE", "SKILL_TIP", "RETRY_PROMPT"],
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
});

const validGraph = (): PublishedExerciseGraph => ({
  template: { id: "template-1", tenantId: null, status: "PUBLISHED", deletedAt: null },
  version: {
    id: "template-version-1",
    templateId: "template-1",
    version: 1,
    status: "PUBLISHED",
    deletedAt: null,
    config: toTrainingExerciseVersionConfig(validContract()),
  },
  contents: [
    {
      position: 0,
      contentVersion: {
        id: "content-version-1",
        contentId: "content-1",
        status: "PUBLISHED",
        content: { id: "content-1", tenantId: null, status: "PUBLISHED", deletedAt: null },
      },
    },
  ],
  questions: [
    {
      position: 0,
      questionVersion: {
        id: "question-version-1",
        questionId: "question-1",
        status: "PUBLISHED",
        question: {
          id: "question-1",
          contentId: "content-1",
          type: "MULTIPLE_CHOICE",
          status: "PUBLISHED",
          deletedAt: null,
        },
      },
    },
  ],
});

describe("training exercise phase 0/1 contract", () => {
  it("accepts a valid exercise contract", () => {
    expect(parseTrainingExerciseContract(validContract()).stableKey).toBe(
      "TRAINING_MAIN_IDEA_FOUNDATION",
    );
  });

  it("rejects an invalid family competency or interaction", () => {
    const result = safeParseTrainingExerciseContract({
      ...validContract(),
      family: "INFERENCE",
      competency: "RC_MAIN_IDEA",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid duration", () => {
    const result = safeParseTrainingExerciseContract({
      ...validContract(),
      estimatedDurationSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it("requires a content graph for comprehension exercises", () => {
    const graph = validGraph();
    graph.contents = [];
    const result = validatePublishedExerciseGraph(validContract(), graph);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Published ContentVersion gerekli");
  });

  it("requires a question graph for comprehension exercises", () => {
    const graph = validGraph();
    graph.questions = [];
    const result = validatePublishedExerciseGraph(validContract(), graph);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Published QuestionVersion gerekli");
  });

  it("rejects unpublished content and questions", () => {
    const graph = validGraph();
    graph.contents[0]!.contentVersion.status = "DRAFT";
    graph.questions[0]!.questionVersion.status = "REVIEW";
    const result = validatePublishedExerciseGraph(validContract(), graph);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("ContentVersion content-version-1 published değil");
    expect(result.errors).toContain("QuestionVersion question-version-1 published değil");
  });

  it("rejects question-content mismatch without using contents[0] fallback", () => {
    const graph = validGraph();
    graph.contents[0]!.contentVersion.contentId = "different-content";
    const result = validatePublishedExerciseGraph(validContract(), graph);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Question question-1 için ContentVersion mapping bulunamadı");
  });

  it("rejects tenant mismatch", () => {
    const graph = validGraph();
    graph.template.tenantId = "tenant-a";
    graph.contents[0]!.contentVersion.content.tenantId = "tenant-b";
    const result = validatePublishedExerciseGraph(validContract(), graph);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Content content-1 tenant mismatch");
  });

  it("rejects missing version-specific config", () => {
    const graph = validGraph();
    graph.version.config = undefined;
    const result = validatePublishedExerciseGraph(validContract(), graph);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Version-specific exercise config mevcut değil");
  });

  it("uses the version snapshot even when parent metadata differs", () => {
    const versionConfig = toTrainingExerciseVersionConfig(validContract());
    const parentConfig = { rendererKey: "PARENT_METADATA_ONLY", settings: { source: "parent" } };
    const first = resolveTrainingRuntimeConfig("TRAINING", versionConfig);
    const second = resolveTrainingRuntimeConfig("TRAINING", versionConfig);

    expect(first).toMatchObject({ status: "READY", source: "VERSION_SNAPSHOT" });
    expect(first).toEqual(second);
    expect(parentConfig).not.toEqual(first.config);
  });

  it("fails closed for missing or invalid training version config", () => {
    expect(resolveTrainingRuntimeConfig("TRAINING", null)).toMatchObject({
      status: "FAIL_CLOSED",
      reason: "MISSING_VERSION_CONFIG",
    });
    expect(resolveTrainingRuntimeConfig("TRAINING", { rendererKey: "PARENT_ONLY" })).toMatchObject({
      status: "FAIL_CLOSED",
      reason: "INVALID_VERSION_CONFIG",
    });
  });

  it("keeps explicit legacy and placement paths separate from training config", () => {
    expect(resolveTrainingRuntimeConfig("LEGACY", { rendererKey: "LEGACY" })).toMatchObject({
      status: "LEGACY_COMPATIBILITY",
      parentConfigFallback: false,
    });
    expect(resolveTrainingRuntimeConfig("PLACEMENT", { canonicalActive: true })).toMatchObject({
      status: "PLACEMENT_UNCHANGED",
      parentConfigFallback: false,
    });
  });

  it("keeps published version changes immutable and requires a new version", () => {
    const current = validContract();
    const sameVersion = { ...current, instructions: "Yeni talimat" };
    const higherVersion = { ...sameVersion, version: 2 };
    expect(validatePublishedVersionChange(current, sameVersion).ok).toBe(false);
    expect(validatePublishedVersionChange(current, higherVersion).ok).toBe(true);
    expect(nextExerciseVersion([1, 2, 4])).toBe(5);
  });

  it("keeps training contracts separate from placement", () => {
    expect(validContract().eligibility.usage).toBe("TRAINING_ONLY");
    expect(
      safeParseTrainingExerciseContract({
        ...validContract(),
        eligibility: { ...validContract().eligibility, usage: "PLACEMENT" },
      }).success,
    ).toBe(false);
  });

  it("validates feedback and scoring contracts", () => {
    expect(
      safeParseTrainingExerciseContract({
        ...validContract(),
        feedback: { ...validContract().feedback, types: [] },
      }).success,
    ).toBe(false);
    expect(
      safeParseTrainingExerciseContract({
        ...validContract(),
        scoring: { ...validContract().scoring, openEnded: true },
      }).success,
    ).toBe(false);
  });

  it("detects duplicate stable keys", () => {
    const one = validContract();
    const two = { ...validContract(), version: 2 };
    const result = validateUniqueStableKeys([one, two]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("TRAINING_MAIN_IDEA_FOUNDATION");
  });

  it("creates deterministic fingerprints", () => {
    const contract = validContract();
    const reordered = {
      ...contract,
      versionConfig: { settings: {}, rendererKey: "QUESTION_MULTIPLE_CHOICE" },
    };
    expect(exerciseContractFingerprint(contract)).toBe(exerciseContractFingerprint(reordered));
  });

  it("creates and validates a complete immutable version config", () => {
    const config = toTrainingExerciseVersionConfig(validContract());
    expect(config.schemaVersion).toBe(1);
    expect(parseTrainingExerciseVersionConfig(config)).toEqual(config);
    expect(versionConfigFingerprint(config)).toHaveLength(64);
    expect(() => parseTrainingExerciseVersionConfig({})).toThrow();
  });

  it("snapshots legacy parent config instead of inheriting future parent changes", () => {
    const parent = { rendererKey: "LEGACY", settings: { difficulty: 0.5 } };
    const snapshot = snapshotLegacyParentConfig(parent) as { settings: { difficulty: number } };
    parent.settings.difficulty = 0.9;
    expect(snapshot.settings.difficulty).toBe(0.5);
    expect(versionConfigFingerprint(snapshot)).not.toBe(versionConfigFingerprint(parent));
  });

  it("allows draft edits but rejects published in-place edits", () => {
    const current = validContract();
    const proposed = { ...current, instructions: "Güncellenen taslak talimat" };
    expect(validateVersionEdit("DRAFT", current, proposed).ok).toBe(true);
    expect(validateVersionEdit("PUBLISHED", current, proposed).ok).toBe(false);
  });

  it("fails stale revisions closed", () => {
    expect(validateExpectedRevision(3, 3).ok).toBe(true);
    expect(validateExpectedRevision(4, 3).errors).toContain("Stale exercise version revision");
  });
});

describe("template version config authoring policy", () => {
  it("accepts a valid typed version config", () => {
    const config = toTrainingExerciseVersionConfig(validContract());
    expect(parseTemplateVersionConfig(config)).toEqual(config);
  });

  it("rejects an invalid version config", () => {
    expect(() => parseTemplateVersionConfig({ family: "MAIN_IDEA" })).toThrow(
      "ExerciseTemplateVersion.config geçersiz",
    );
  });

  it("allows config writes for DRAFT versions", () => {
    expect(() => assertTemplateVersionConfigMutable("DRAFT", true)).not.toThrow();
  });

  it("rejects config mutation for PUBLISHED versions", () => {
    expect(() => assertTemplateVersionConfigMutable("PUBLISHED", true)).toThrow(
      "Yayınlanmış şablon sürümünün config alanı değiştirilemez",
    );
  });
});
