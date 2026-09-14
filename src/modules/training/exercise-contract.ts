import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Training Engine Phase 0/1 contract.
 *
 * This module is deliberately persistence-agnostic.  Published runtime
 * behavior is resolved from ExerciseTemplateVersion.config; the parent
 * ExerciseTemplate.config is catalog metadata and is never a runtime
 * fallback.
 */

export const TRAINING_EXERCISE_FAMILIES = [
  "ATTENTION_BURST",
  "RAPID_RECOGNITION",
  "PHRASE_CHUNKING",
  "MAIN_IDEA",
  "DETAIL_EVIDENCE",
  "INFERENCE",
] as const;

export const TRAINING_DIFFICULTIES = ["FOUNDATION", "DEVELOPING", "CHALLENGING"] as const;

export const TRAINING_FEEDBACK_TYPES = [
  "POSITIVE",
  "CORRECTIVE",
  "HINT",
  "ENCOURAGEMENT",
  "SKILL_TIP",
  "RETRY_PROMPT",
] as const;

export const TRAINING_COMPETENCIES = [
  "FAST_ATTENTION",
  "FAST_RECOGNITION",
  "FAST_CHUNKING",
  "RC_MAIN_IDEA",
  "RC_DETAIL",
  "RC_INFERENCE",
] as const;

/**
 * Fast-reading V1 deliberately reuses the published Content/Question graph
 * and deterministic MULTIPLE_CHOICE scoring path.  The renderer key keeps the
 * family-specific mobile presentation explicit without changing the answer
 * storage contract.
 */
export const FAST_READING_RENDERERS = {
  ATTENTION_BURST: "QUESTION_ATTENTION_BURST",
  RAPID_RECOGNITION: "QUESTION_RAPID_RECOGNITION",
  PHRASE_CHUNKING: "QUESTION_PHRASE_CHUNKING",
} as const;

export const FAST_READING_FAMILIES = [
  "ATTENTION_BURST",
  "RAPID_RECOGNITION",
  "PHRASE_CHUNKING",
] as const;

export const TRAINING_INTERACTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "CONFIGURED"] as const;

const stableKeySchema = z
  .string()
  .trim()
  .min(1, "Exercise stable key gerekli")
  .max(120, "Exercise stable key en fazla 120 karakter olabilir")
  .regex(
    /^[A-Z0-9][A-Z0-9_.-]*$/,
    "Exercise stable key yalnızca büyük harf, sayı ve ayraç içerebilir",
  );

const competencySchema = z.enum(TRAINING_COMPETENCIES);
const familySchema = z.enum(TRAINING_EXERCISE_FAMILIES);
const difficultySchema = z.enum(TRAINING_DIFFICULTIES);
const interactionTypeSchema = z.enum(TRAINING_INTERACTION_TYPES);

const scoringPolicySchema = z
  .object({
    mode: z.literal("DETERMINISTIC"),
    primarySignal: z.literal("ACCURACY"),
    timeRole: z.enum(["NONE", "SECONDARY"]),
    maxScore: z.literal(1),
    openEnded: z.literal(false),
  })
  .strict();

const feedbackPolicySchema = z
  .object({
    types: z.array(z.enum(TRAINING_FEEDBACK_TYPES)).min(1).max(6),
    showExplanation: z.boolean(),
    retryEnabled: z.boolean(),
    maxMessageLength: z.number().int().min(40).max(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.types).size !== value.types.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["types"],
        message: "Feedback tipleri benzersiz olmalı",
      });
    }
  });

const xpPolicySchema = z
  .object({
    completionPoints: z.number().int().min(0).max(100),
    correctAnswerBonus: z.number().int().min(0).max(25),
    dailyCap: z.number().int().min(0).max(500),
  })
  .strict();

const eligibilitySchema = z
  .object({
    usage: z.literal("TRAINING_ONLY"),
    requiresPublishedContent: z.boolean(),
    requiresPublishedQuestions: z.boolean(),
    minimumDifficulty: difficultySchema,
    maximumDifficulty: difficultySchema,
  })
  .strict();

const versionConfigSchema = z
  .object({
    rendererKey: z
      .string()
      .trim()
      .min(1, "Renderer key gerekli")
      .max(120, "Renderer key en fazla 120 karakter olabilir")
      .regex(/^[A-Z0-9][A-Z0-9_.-]*$/, "Renderer key geçersiz"),
    settings: z.record(z.unknown()),
  })
  .strict();

const trainingExerciseContractSchema = z
  .object({
    stableKey: stableKeySchema,
    version: z.number().int().min(1),
    family: familySchema,
    competency: competencySchema,
    difficulty: difficultySchema,
    estimatedDurationSeconds: z.number().int().min(1).max(3600),
    instructions: z.string().trim().min(1).max(2000),
    interactionType: interactionTypeSchema,
    contentRequirement: z.enum(["NONE", "REQUIRED"]),
    questionRequirement: z.enum(["NONE", "REQUIRED"]),
    scoring: scoringPolicySchema,
    feedback: feedbackPolicySchema,
    xp: xpPolicySchema,
    eligibility: eligibilitySchema,
    versionConfig: versionConfigSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = FAMILY_RULES[value.family];
    if (expected.competency !== value.competency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["competency"],
        message: `${value.family} için competency ${expected.competency} olmalı`,
      });
    }
    if (expected.interactionType !== value.interactionType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interactionType"],
        message: `${value.family} için interactionType ${expected.interactionType} olmalı`,
      });
    }
    if (expected.contentRequirement !== value.contentRequirement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentRequirement"],
        message: `${value.family} için contentRequirement ${expected.contentRequirement} olmalı`,
      });
    }
    if (expected.questionRequirement !== value.questionRequirement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionRequirement"],
        message: `${value.family} için questionRequirement ${expected.questionRequirement} olmalı`,
      });
    }
    if (
      value.family === "DETAIL_EVIDENCE" ||
      value.family === "INFERENCE" ||
      FAST_READING_FAMILIES.includes(value.family as (typeof FAST_READING_FAMILIES)[number])
    ) {
      const expectedRenderer = FAST_READING_FAMILIES.includes(
        value.family as (typeof FAST_READING_FAMILIES)[number],
      )
        ? FAST_READING_RENDERERS[value.family as keyof typeof FAST_READING_RENDERERS]
        : "QUESTION_MULTIPLE_CHOICE";
      if (value.versionConfig.rendererKey !== expectedRenderer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["versionConfig", "rendererKey"],
          message: `${value.family} renderer sözleşmesi geçersiz`,
        });
      }
      if (value.versionConfig.settings.optionCount !== 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["versionConfig", "settings", "optionCount"],
          message: `${value.family} tam dört seçenek gerektirir`,
        });
      }
    }
    if (
      DIFFICULTY_ORDER[value.eligibility.minimumDifficulty] >
      DIFFICULTY_ORDER[value.eligibility.maximumDifficulty]
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eligibility"],
        message: "Minimum difficulty maximum difficulty değerini aşamaz",
      });
    }
  });

type FamilyRule = {
  competency: (typeof TRAINING_COMPETENCIES)[number];
  interactionType: (typeof TRAINING_INTERACTION_TYPES)[number];
  contentRequirement: "NONE" | "REQUIRED";
  questionRequirement: "NONE" | "REQUIRED";
};

const FAMILY_RULES: Record<(typeof TRAINING_EXERCISE_FAMILIES)[number], FamilyRule> = {
  ATTENTION_BURST: {
    competency: "FAST_ATTENTION",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
  },
  RAPID_RECOGNITION: {
    competency: "FAST_RECOGNITION",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
  },
  PHRASE_CHUNKING: {
    competency: "FAST_CHUNKING",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
  },
  MAIN_IDEA: {
    competency: "RC_MAIN_IDEA",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
  },
  DETAIL_EVIDENCE: {
    competency: "RC_DETAIL",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
  },
  INFERENCE: {
    competency: "RC_INFERENCE",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
  },
};

const DIFFICULTY_ORDER: Record<(typeof TRAINING_DIFFICULTIES)[number], number> = {
  FOUNDATION: 0,
  DEVELOPING: 1,
  CHALLENGING: 2,
};

export type TrainingExerciseContract = z.infer<typeof trainingExerciseContractSchema>;
export type TrainingExerciseFamily = TrainingExerciseContract["family"];

export type TrainingExerciseVersionPayload = Pick<
  TrainingExerciseContract,
  | "instructions"
  | "versionConfig"
  | "scoring"
  | "feedback"
  | "xp"
  | "eligibility"
  | "estimatedDurationSeconds"
>;

const trainingExerciseVersionConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    family: familySchema,
    competency: competencySchema,
    difficulty: difficultySchema,
    estimatedDurationSeconds: z.number().int().min(1).max(3600),
    instructions: z.string().trim().min(1).max(2000),
    interactionType: interactionTypeSchema,
    contentRequirement: z.enum(["NONE", "REQUIRED"]),
    questionRequirement: z.enum(["NONE", "REQUIRED"]),
    scoring: scoringPolicySchema,
    feedback: feedbackPolicySchema,
    xp: xpPolicySchema,
    eligibility: eligibilitySchema,
    rendererKey: z.string().trim().min(1).max(120),
    settings: z.record(z.unknown()),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = FAMILY_RULES[value.family];
    if (expected.competency !== value.competency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["competency"],
        message: `${value.family} için competency ${expected.competency} olmalı`,
      });
    }
    if (expected.interactionType !== value.interactionType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interactionType"],
        message: `${value.family} için interactionType ${expected.interactionType} olmalı`,
      });
    }
    if (expected.contentRequirement !== value.contentRequirement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentRequirement"],
        message: `${value.family} için contentRequirement ${expected.contentRequirement} olmalı`,
      });
    }
    if (expected.questionRequirement !== value.questionRequirement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionRequirement"],
        message: `${value.family} için questionRequirement ${expected.questionRequirement} olmalı`,
      });
    }
    const isFastReading = FAST_READING_FAMILIES.includes(
      value.family as (typeof FAST_READING_FAMILIES)[number],
    );
    const isComprehension = value.family === "DETAIL_EVIDENCE" || value.family === "INFERENCE";
    if (!isFastReading && !isComprehension) return;
    const expectedRenderer = isFastReading
      ? FAST_READING_RENDERERS[value.family as keyof typeof FAST_READING_RENDERERS]
      : "QUESTION_MULTIPLE_CHOICE";
    if (value.rendererKey !== expectedRenderer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rendererKey"],
        message: `${value.family} renderer sözleşmesi geçersiz`,
      });
    }
    if (value.settings.optionCount !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["settings", "optionCount"],
        message: `${value.family} tam dört seçenek gerektirir`,
      });
    }
  });

export type TrainingExerciseVersionConfig = z.infer<typeof trainingExerciseVersionConfigSchema>;

export type ExerciseGraphValidation = {
  ok: boolean;
  errors: string[];
};

type NullableDate = Date | string | null | undefined;

export type PublishedExerciseGraph = {
  template: {
    id: string;
    tenantId: string | null;
    status: string;
    deletedAt?: NullableDate;
  };
  version: {
    id: string;
    templateId: string;
    version: number;
    status: string;
    deletedAt?: NullableDate;
    config?: unknown;
  };
  contents: Array<{
    position: number;
    contentVersion: {
      id: string;
      contentId: string;
      status: string;
      content: {
        id: string;
        tenantId: string | null;
        status: string;
        deletedAt?: NullableDate;
      };
    };
  }>;
  questions: Array<{
    position: number;
    questionVersion: {
      id: string;
      questionId: string;
      status: string;
      question: {
        id: string;
        contentId: string;
        type: string;
        status: string;
        deletedAt?: NullableDate;
      };
    };
  }>;
};

function isDeleted(value: NullableDate): boolean {
  return value !== null && value !== undefined;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function addDuplicateError(errors: string[], label: string, values: string[]): void {
  const duplicates = duplicateValues(values);
  if (duplicates.length > 0) errors.push(`${label} duplicate: ${duplicates.join(", ")}`);
}

export function parseTrainingExerciseContract(input: unknown): TrainingExerciseContract {
  return trainingExerciseContractSchema.parse(input);
}

export function safeParseTrainingExerciseContract(input: unknown) {
  return trainingExerciseContractSchema.safeParse(input);
}

export function toTrainingExerciseVersionPayload(
  contract: TrainingExerciseContract,
): TrainingExerciseVersionPayload {
  return {
    instructions: contract.instructions,
    versionConfig: contract.versionConfig,
    scoring: contract.scoring,
    feedback: contract.feedback,
    xp: contract.xp,
    eligibility: contract.eligibility,
    estimatedDurationSeconds: contract.estimatedDurationSeconds,
  };
}

export function toTrainingExerciseVersionConfig(
  contract: TrainingExerciseContract,
): TrainingExerciseVersionConfig {
  return trainingExerciseVersionConfigSchema.parse({
    schemaVersion: 1,
    family: contract.family,
    competency: contract.competency,
    difficulty: contract.difficulty,
    estimatedDurationSeconds: contract.estimatedDurationSeconds,
    instructions: contract.instructions,
    interactionType: contract.interactionType,
    contentRequirement: contract.contentRequirement,
    questionRequirement: contract.questionRequirement,
    scoring: contract.scoring,
    feedback: contract.feedback,
    xp: contract.xp,
    eligibility: contract.eligibility,
    rendererKey: contract.versionConfig.rendererKey,
    settings: contract.versionConfig.settings,
  });
}

export function parseTrainingExerciseVersionConfig(input: unknown): TrainingExerciseVersionConfig {
  return trainingExerciseVersionConfigSchema.parse(input);
}

export function safeParseTrainingExerciseVersionConfig(input: unknown) {
  return trainingExerciseVersionConfigSchema.safeParse(input);
}

export type TrainingRuntimeRoute = "TRAINING" | "LEGACY" | "PLACEMENT";

export type TrainingRuntimeConfigResolution =
  | {
      status: "READY";
      source: "VERSION_SNAPSHOT";
      config: TrainingExerciseVersionConfig;
    }
  | {
      status: "FAIL_CLOSED";
      source: "VERSION_SNAPSHOT";
      reason: "MISSING_VERSION_CONFIG" | "INVALID_VERSION_CONFIG";
      errors: string[];
      config: null;
    }
  | {
      status: "LEGACY_COMPATIBILITY";
      source: "LEGACY_PATH";
      parentConfigFallback: false;
      config: null;
    }
  | {
      status: "PLACEMENT_UNCHANGED";
      source: "PLACEMENT_PATH";
      parentConfigFallback: false;
      config: null;
    };

/**
 * Resolves the immutable runtime snapshot without accepting a parent-config
 * fallback. Legacy and placement callers must opt into their explicit
 * compatibility paths instead of silently interpreting catalog metadata as
 * training behavior.
 */
export function resolveTrainingRuntimeConfig(
  route: TrainingRuntimeRoute,
  versionConfig: unknown,
): TrainingRuntimeConfigResolution {
  if (route === "LEGACY") {
    return {
      status: "LEGACY_COMPATIBILITY",
      source: "LEGACY_PATH",
      parentConfigFallback: false,
      config: null,
    };
  }
  if (route === "PLACEMENT") {
    return {
      status: "PLACEMENT_UNCHANGED",
      source: "PLACEMENT_PATH",
      parentConfigFallback: false,
      config: null,
    };
  }

  if (versionConfig === null || versionConfig === undefined) {
    return {
      status: "FAIL_CLOSED",
      source: "VERSION_SNAPSHOT",
      reason: "MISSING_VERSION_CONFIG",
      errors: ["Version-specific exercise config mevcut değil"],
      config: null,
    };
  }

  const parsed = safeParseTrainingExerciseVersionConfig(versionConfig);
  if (!parsed.success) {
    return {
      status: "FAIL_CLOSED",
      source: "VERSION_SNAPSHOT",
      reason: "INVALID_VERSION_CONFIG",
      errors: parsed.error.issues.map((issue) => issue.message),
      config: null,
    };
  }

  return {
    status: "READY",
    source: "VERSION_SNAPSHOT",
    config: parsed.data,
  };
}

/**
 * Legacy parent config is copied as a snapshot during migration. It is not a
 * runtime fallback: after migration, changing the parent must not change an
 * existing version's behavior.
 */
export function snapshotLegacyParentConfig(parentConfig: unknown): unknown {
  return canonicalize(parentConfig ?? {});
}

export function versionConfigFingerprint(config: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(config)))
    .digest("hex");
}

export function validateVersionEdit(
  status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED",
  current: TrainingExerciseContract,
  proposed: TrainingExerciseContract,
): ExerciseGraphValidation {
  if (status === "PUBLISHED") return validatePublishedVersionChange(current, proposed);
  if (status === "REVIEW") {
    return { ok: false, errors: ["Review version doğrudan düzenlenemez"] };
  }
  if (status === "ARCHIVED") {
    return { ok: false, errors: ["Archived version düzenlenemez"] };
  }
  return { ok: true, errors: [] };
}

export function validateExpectedRevision(
  actualRevision: number,
  expectedRevision: number,
): ExerciseGraphValidation {
  if (!Number.isInteger(actualRevision) || !Number.isInteger(expectedRevision)) {
    return { ok: false, errors: ["Revision integer olmalı"] };
  }
  if (actualRevision !== expectedRevision) {
    return { ok: false, errors: ["Stale exercise version revision"] };
  }
  return { ok: true, errors: [] };
}

export function validateUniqueStableKeys(
  contracts: readonly TrainingExerciseContract[],
): ExerciseGraphValidation {
  const errors: string[] = [];
  addDuplicateError(
    errors,
    "stableKey",
    contracts.map((contract) => contract.stableKey),
  );
  return { ok: errors.length === 0, errors };
}

export function nextExerciseVersion(existingVersions: readonly number[]): number {
  const highest = existingVersions.reduce((max, value) => Math.max(max, value), 0);
  return highest + 1;
}

/**
 * Published contracts are immutable.  A change must create a higher version;
 * this helper intentionally does not persist anything.
 */
export function validatePublishedVersionChange(
  current: TrainingExerciseContract,
  proposed: TrainingExerciseContract,
): ExerciseGraphValidation {
  const errors: string[] = [];
  if (current.stableKey !== proposed.stableKey) errors.push("Published stableKey değiştirilemez");
  if (proposed.version <= current.version) {
    errors.push("Published değişiklik daha yüksek bir version oluşturmalı");
  }
  return { ok: errors.length === 0, errors };
}

export function exerciseContractFingerprint(contract: TrainingExerciseContract): string {
  const canonical = canonicalize(contract);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function validatePublishedExerciseGraph(
  contract: TrainingExerciseContract,
  graph: PublishedExerciseGraph,
): ExerciseGraphValidation {
  const errors: string[] = [];
  const rules = FAMILY_RULES[contract.family];

  if (graph.template.deletedAt !== null && graph.template.deletedAt !== undefined) {
    errors.push("ExerciseTemplate silinmiş");
  }
  if (graph.version.deletedAt !== null && graph.version.deletedAt !== undefined) {
    errors.push("ExerciseTemplateVersion silinmiş");
  }
  if (graph.template.status !== "PUBLISHED") errors.push("ExerciseTemplate published değil");
  if (graph.version.status !== "PUBLISHED") {
    errors.push("ExerciseTemplateVersion published değil");
  }
  if (graph.version.templateId !== graph.template.id) {
    errors.push("TemplateVersion template identity mismatch");
  }
  const runtimeConfig = resolveTrainingRuntimeConfig("TRAINING", graph.version.config);
  if (runtimeConfig.status === "FAIL_CLOSED") {
    errors.push(...runtimeConfig.errors);
  } else if (
    runtimeConfig.status === "READY" &&
    versionConfigFingerprint(runtimeConfig.config) !==
      versionConfigFingerprint(toTrainingExerciseVersionConfig(contract))
  ) {
    errors.push("Version-specific exercise config contract ile eşleşmiyor");
  }

  if (rules.contentRequirement === "REQUIRED" && graph.contents.length === 0) {
    errors.push("Published ContentVersion gerekli");
  }
  if (rules.questionRequirement === "REQUIRED" && graph.questions.length === 0) {
    errors.push("Published QuestionVersion gerekli");
  }

  addDuplicateError(
    errors,
    "content position",
    graph.contents.map((content) => String(content.position)),
  );
  addDuplicateError(
    errors,
    "question position",
    graph.questions.map((question) => String(question.position)),
  );

  const contentIds = graph.contents.map((entry) => entry.contentVersion.contentId);
  addDuplicateError(errors, "content identity", contentIds);

  for (const entry of graph.contents) {
    const contentVersion = entry.contentVersion;
    const content = contentVersion.content;
    if (contentVersion.status !== "PUBLISHED") {
      errors.push(`ContentVersion ${contentVersion.id} published değil`);
    }
    if (content.status !== "PUBLISHED") errors.push(`Content ${content.id} published değil`);
    if (isDeleted(content.deletedAt)) errors.push(`Content ${content.id} silinmiş`);
    if (
      graph.template.tenantId !== null &&
      content.tenantId !== null &&
      graph.template.tenantId !== content.tenantId
    ) {
      errors.push(`Content ${content.id} tenant mismatch`);
    }
  }

  for (const entry of graph.questions) {
    const questionVersion = entry.questionVersion;
    const question = questionVersion.question;
    if (questionVersion.status !== "PUBLISHED") {
      errors.push(`QuestionVersion ${questionVersion.id} published değil`);
    }
    if (question.status !== "PUBLISHED") errors.push(`Question ${question.id} published değil`);
    if (isDeleted(question.deletedAt)) errors.push(`Question ${question.id} silinmiş`);
    if (question.type !== contract.interactionType) {
      errors.push(`Question ${question.id} interaction type mismatch`);
    }
    if (!contentIds.includes(question.contentId)) {
      errors.push(`Question ${question.id} için ContentVersion mapping bulunamadı`);
    }
    const matchingContent = graph.contents.find(
      (content) => content.contentVersion.contentId === question.contentId,
    );
    if (
      matchingContent &&
      graph.template.tenantId !== null &&
      matchingContent.contentVersion.content.tenantId !== null &&
      graph.template.tenantId !== matchingContent.contentVersion.content.tenantId
    ) {
      errors.push(`Question ${question.id} tenant mismatch`);
    }
  }

  return { ok: errors.length === 0, errors };
}
