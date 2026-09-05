import { z } from "zod";
import { CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST } from "./canonical-placement-item-bank.js";
import {
  PLACEMENT_SCORING_CONTRACT_V1,
  type PlacementScoringContract,
} from "../modules/assessments/placement-scoring.js";
import {
  PROFICIENCY_LEVEL_CODES,
  PROFICIENCY_SKILL_CODES,
  canonicalProficiencyLevelManifestSchema,
  CANONICAL_PROFICIENCY_LEVEL_MANIFEST,
  proficiencyLevelCodeSchema,
  proficiencySkillCodeSchema,
  type CanonicalProficiencyLevelManifest,
  type ProficiencyLevelCode,
  type ProficiencySkillCode,
} from "./proficiency-levels.js";

const skillDistributionSchema = z.object({
  skillCode: proficiencySkillCodeSchema,
  questionCount: z.number().int().positive(),
});

export const canonicalPlacementAssessmentManifestSchema = z
  .object({
    manifestId: z.literal("OKU-READING-PLACEMENT-V1"),
    manifestVersion: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/u),
    lifecycle: z.literal("DESIGN_ONLY"),
    calibrationStatus: z.literal("NOT_CALIBRATED"),
    assessment: z
      .object({
        stableAssessmentId: z.literal("canonical-assessment-oku-reading-placement-v1-1-0"),
        assessmentKey: z.literal("OKU-READING-PLACEMENT-V1"),
        title: z.string().trim().min(1).max(200),
        type: z.literal("PLACEMENT"),
        tenantScope: z.literal("GLOBAL"),
        status: z.literal("PUBLISHED"),
        visibility: z
          .object({
            scope: z.literal("GLOBAL"),
            tenantId: z.null(),
            deletedAt: z.null(),
          })
          .strict(),
        templateId: z.literal("canonical-template-oku-reading-placement-v1-1-0"),
        templateVersionId: z.literal("canonical-template-version-oku-reading-placement-v1-1-0-v1"),
        levelMappingPolicy: z
          .object({
            declaredGradeIndependent: z.literal(true),
            birthDateUsed: z.literal(false),
            resultLevelId: z.null(),
            reviewRequired: z.literal(true),
          })
          .strict(),
        targetLevelCodes: z
          .array(proficiencyLevelCodeSchema)
          .length(PROFICIENCY_LEVEL_CODES.length),
      })
      .strict(),
    template: z
      .object({
        templateKey: z.literal("OKU-READING-PLACEMENT-V1-TEMPLATE"),
        stableTemplateId: z.literal("canonical-template-oku-reading-placement-v1-1-0"),
        stableTemplateVersionId: z.literal(
          "canonical-template-version-oku-reading-placement-v1-1-0-v1",
        ),
        templateVersion: z.literal(1),
        type: z.literal("MIXED"),
        status: z.literal("PUBLISHED"),
        sourceStrategy: z.literal("DEDICATED_PLACEMENT_ITEM_BANK"),
        firstRealPackReuse: z.literal("EXPLICIT_REVIEW_ONLY"),
      })
      .strict(),
    itemBank: z
      .object({
        manifestId: z.literal("OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1"),
        manifestVersion: z
          .string()
          .trim()
          .regex(/^\d+\.\d+\.\d+$/u),
      })
      .strict(),
    questionPlan: z
      .object({
        totalQuestionCount: z.number().int().positive(),
        minScoredCount: z.number().int().positive(),
        excludedQuestionTypes: z.array(z.literal("OPEN_ENDED")).length(1),
        skillDistribution: z.array(skillDistributionSchema).length(PROFICIENCY_SKILL_CODES.length),
        difficultyDistribution: z
          .object({
            EASY: z.number().int().positive(),
            MEDIUM: z.number().int().positive(),
            HARD: z.number().int().positive(),
          })
          .strict(),
        questionTypeDistribution: z
          .object({
            MULTIPLE_CHOICE: z.literal(24),
            TRUE_FALSE: z.literal(6),
            MATCHING: z.literal(6),
          })
          .strict(),
        questionOrder: z.array(z.string().regex(/^PLV1-Q\d{3}$/u)).length(36),
      })
      .strict(),
    scoring: z
      .object({
        contractVersion: z.literal(1),
        scale: z.object({ min: z.literal(0), max: z.literal(1) }).strict(),
        minScoredCount: z.number().int().positive(),
        excludedQuestionTypes: z.array(z.literal("OPEN_ENDED")).length(1),
        calibrationStatus: z.literal("NOT_CALIBRATED"),
        productionAssignmentEnabled: z.literal(false),
      })
      .strict(),
    graph: z
      .object({
        assessmentId: z.literal("canonical-assessment-oku-reading-placement-v1-1-0"),
        templateId: z.literal("canonical-template-oku-reading-placement-v1-1-0"),
        templateVersionId: z.literal("canonical-template-version-oku-reading-placement-v1-1-0-v1"),
        contentIds: z
          .array(z.string().regex(/^canonical-placement-content-v1-1-0-PLV1-C\d{3}$/u))
          .length(12),
        contentVersionIds: z
          .array(z.string().regex(/^canonical-placement-content-version-v1-1-0-PLV1-C\d{3}-v1$/u))
          .length(12),
        questionIds: z
          .array(z.string().regex(/^canonical-placement-question-v1-1-0-PLV1-Q\d{3}$/u))
          .length(36),
        questionVersionIds: z
          .array(z.string().regex(/^canonical-placement-question-version-v1-1-0-PLV1-Q\d{3}-v1$/u))
          .length(36),
      })
      .strict(),
    scoringContractVersion: z.literal(1),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const distribution = manifest.questionPlan.skillDistribution;
    const skillCodes = distribution.map((entry) => entry.skillCode);
    const questionCount = distribution.reduce((sum, entry) => sum + entry.questionCount, 0);
    const targetLevelCodes = manifest.assessment.targetLevelCodes;
    const expectedQuestionIds = CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map(
      (question) => question.stableQuestionId,
    );
    const expectedContentIds = CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.passages.map(
      (passage) => passage.contentId,
    );
    const expectedContentGraphIds = expectedContentIds.map(
      (contentId) => `canonical-placement-content-v1-1-0-${contentId}`,
    );
    const expectedContentVersionGraphIds = expectedContentIds.map(
      (contentId) => `canonical-placement-content-version-v1-1-0-${contentId}-v1`,
    );
    const expectedQuestionGraphIds = expectedQuestionIds.map(
      (questionId) => `canonical-placement-question-v1-1-0-${questionId}`,
    );
    const expectedQuestionVersionGraphIds = expectedQuestionIds.map(
      (questionId) => `canonical-placement-question-version-v1-1-0-${questionId}-v1`,
    );
    const expectedSkillDistribution = PROFICIENCY_SKILL_CODES.map((skillCode) => ({
      skillCode,
      questionCount: 12,
    }));
    const expectedDifficultyDistribution = { EASY: 12, MEDIUM: 12, HARD: 12 };
    const expectedQuestionTypeDistribution = { MULTIPLE_CHOICE: 24, TRUE_FALSE: 6, MATCHING: 6 };

    if (new Set(skillCodes).size !== skillCodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "skillDistribution"],
        message: "placement Skill dağılımı unique olmalı",
      });
    }
    if (
      new Set(targetLevelCodes).size !== targetLevelCodes.length ||
      JSON.stringify(targetLevelCodes) !== JSON.stringify(PROFICIENCY_LEVEL_CODES)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assessment", "targetLevelCodes"],
        message: "placement target Level code değerleri unique ve tam olmalı",
      });
    }
    if (questionCount !== manifest.questionPlan.totalQuestionCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "totalQuestionCount"],
        message: "Skill dağılımı toplamı totalQuestionCount ile eşleşmiyor",
      });
    }
    if (JSON.stringify(distribution) !== JSON.stringify(expectedSkillDistribution)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "skillDistribution"],
        message: "canonical placement Skill dağılımı 12/12/12 olmalı",
      });
    }
    if (
      JSON.stringify(manifest.questionPlan.difficultyDistribution) !==
      JSON.stringify(expectedDifficultyDistribution)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "difficultyDistribution"],
        message: "canonical placement difficulty dağılımı 12/12/12 olmalı",
      });
    }
    if (
      JSON.stringify(manifest.questionPlan.questionTypeDistribution) !==
      JSON.stringify(expectedQuestionTypeDistribution)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "questionTypeDistribution"],
        message: "canonical placement question type dağılımı 24/6/6 olmalı",
      });
    }
    if (
      manifest.itemBank.manifestVersion !== CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestVersion
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemBank", "manifestVersion"],
        message: "assessment item bank sürümü mevcut canonical item bank ile eşleşmiyor",
      });
    }
    if (manifest.questionPlan.minScoredCount > manifest.questionPlan.totalQuestionCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "minScoredCount"],
        message: "minScoredCount totalQuestionCount değerini aşamaz",
      });
    }
    if (manifest.questionPlan.totalQuestionCount !== 36) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "totalQuestionCount"],
        message: "canonical placement totalQuestionCount 36 olmalı",
      });
    }
    if (
      JSON.stringify(manifest.questionPlan.questionOrder) !== JSON.stringify(expectedQuestionIds)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "questionOrder"],
        message: "questionOrder item bank sırasıyla eşleşmiyor",
      });
    }
    if (
      JSON.stringify(
        manifest.graph.contentIds.map((id) =>
          id.replace("canonical-placement-content-v1-1-0-", ""),
        ),
      ) !== JSON.stringify(expectedContentIds)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graph", "contentIds"],
        message: "graph content identity item bank passage sırasıyla eşleşmiyor",
      });
    }
    if (JSON.stringify(manifest.graph.contentIds) !== JSON.stringify(expectedContentGraphIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graph", "contentIds"],
        message: "graph Content ID sırası canonical passage kimlikleriyle eşleşmiyor",
      });
    }
    if (
      JSON.stringify(manifest.graph.contentVersionIds) !==
      JSON.stringify(expectedContentVersionGraphIds)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graph", "contentVersionIds"],
        message: "graph ContentVersion ID sırası canonical passage kimlikleriyle eşleşmiyor",
      });
    }
    if (JSON.stringify(manifest.graph.questionIds) !== JSON.stringify(expectedQuestionGraphIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graph", "questionIds"],
        message: "graph Question ID sırası canonical item bank sırasıyla eşleşmiyor",
      });
    }
    if (
      JSON.stringify(manifest.graph.questionVersionIds) !==
      JSON.stringify(expectedQuestionVersionGraphIds)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graph", "questionVersionIds"],
        message: "graph QuestionVersion ID sırası canonical item bank sırasıyla eşleşmiyor",
      });
    }
    if (
      manifest.graph.assessmentId !== manifest.assessment.stableAssessmentId ||
      manifest.graph.templateId !== manifest.assessment.templateId ||
      manifest.graph.templateVersionId !== manifest.assessment.templateVersionId ||
      manifest.template.stableTemplateId !== manifest.assessment.templateId ||
      manifest.template.stableTemplateVersionId !== manifest.assessment.templateVersionId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graph"],
        message: "assessment/template graph kimlikleri stable kimliklerle eşleşmiyor",
      });
    }
    if (
      manifest.questionPlan.minScoredCount !== manifest.scoring.minScoredCount ||
      manifest.scoringContractVersion !== manifest.scoring.contractVersion ||
      manifest.scoring.calibrationStatus !== manifest.calibrationStatus
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scoring"],
        message: "assessment scoring alanları contract ile eşleşmiyor",
      });
    }
    if (manifest.questionPlan.excludedQuestionTypes[0] !== "OPEN_ENDED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionPlan", "excludedQuestionTypes"],
        message: "placement v1 OPEN_ENDED soruları dışlamalı",
      });
    }
  });

export type CanonicalPlacementAssessmentManifest = z.infer<
  typeof canonicalPlacementAssessmentManifestSchema
>;

const CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST_DRAFT = {
  manifestId: "OKU-READING-PLACEMENT-V1",
  manifestVersion: "1.1.0",
  lifecycle: "DESIGN_ONLY",
  calibrationStatus: "NOT_CALIBRATED",
  assessment: {
    stableAssessmentId: "canonical-assessment-oku-reading-placement-v1-1-0",
    assessmentKey: "OKU-READING-PLACEMENT-V1",
    title: "Okuma Seviye Belirleme v1",
    type: "PLACEMENT",
    tenantScope: "GLOBAL",
    status: "PUBLISHED",
    visibility: { scope: "GLOBAL", tenantId: null, deletedAt: null },
    templateId: "canonical-template-oku-reading-placement-v1-1-0",
    templateVersionId: "canonical-template-version-oku-reading-placement-v1-1-0-v1",
    levelMappingPolicy: {
      declaredGradeIndependent: true,
      birthDateUsed: false,
      resultLevelId: null,
      reviewRequired: true,
    },
    targetLevelCodes: PROFICIENCY_LEVEL_CODES,
  },
  template: {
    templateKey: "OKU-READING-PLACEMENT-V1-TEMPLATE",
    stableTemplateId: "canonical-template-oku-reading-placement-v1-1-0",
    stableTemplateVersionId: "canonical-template-version-oku-reading-placement-v1-1-0-v1",
    templateVersion: 1,
    type: "MIXED",
    status: "PUBLISHED",
    sourceStrategy: "DEDICATED_PLACEMENT_ITEM_BANK",
    firstRealPackReuse: "EXPLICIT_REVIEW_ONLY",
  },
  itemBank: {
    manifestId: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestId,
    manifestVersion: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestVersion,
  },
  questionPlan: {
    totalQuestionCount: 36,
    minScoredCount: PLACEMENT_SCORING_CONTRACT_V1.minScoredCount,
    excludedQuestionTypes: ["OPEN_ENDED"],
    skillDistribution: PROFICIENCY_SKILL_CODES.map((skillCode) => ({
      skillCode,
      questionCount: 12,
    })),
    difficultyDistribution: { EASY: 12, MEDIUM: 12, HARD: 12 },
    questionTypeDistribution: { MULTIPLE_CHOICE: 24, TRUE_FALSE: 6, MATCHING: 6 },
    questionOrder: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map(
      (question) => question.stableQuestionId,
    ),
  },
  scoring: {
    contractVersion: PLACEMENT_SCORING_CONTRACT_V1.version,
    scale: PLACEMENT_SCORING_CONTRACT_V1.scale,
    minScoredCount: PLACEMENT_SCORING_CONTRACT_V1.minScoredCount,
    excludedQuestionTypes: PLACEMENT_SCORING_CONTRACT_V1.questionPolicy.excludedQuestionTypes,
    calibrationStatus: PLACEMENT_SCORING_CONTRACT_V1.calibrationStatus,
    productionAssignmentEnabled: PLACEMENT_SCORING_CONTRACT_V1.productionAssignmentEnabled,
  },
  graph: {
    assessmentId: "canonical-assessment-oku-reading-placement-v1-1-0",
    templateId: "canonical-template-oku-reading-placement-v1-1-0",
    templateVersionId: "canonical-template-version-oku-reading-placement-v1-1-0-v1",
    contentIds: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.passages.map(
      (passage) => `canonical-placement-content-v1-1-0-${passage.contentId}`,
    ),
    contentVersionIds: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.passages.map(
      (passage) => `canonical-placement-content-version-v1-1-0-${passage.contentId}-v1`,
    ),
    questionIds: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map(
      (question) => `canonical-placement-question-v1-1-0-${question.stableQuestionId}`,
    ),
    questionVersionIds: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map(
      (question) => `canonical-placement-question-version-v1-1-0-${question.stableQuestionId}-v1`,
    ),
  },
  scoringContractVersion: PLACEMENT_SCORING_CONTRACT_V1.version,
} as const;

export function validateCanonicalPlacementAssessmentManifest(
  input: unknown,
): CanonicalPlacementAssessmentManifest {
  return canonicalPlacementAssessmentManifestSchema.parse(input);
}

export const CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST = validateCanonicalPlacementAssessmentManifest(
  CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST_DRAFT,
);

export const CANONICAL_PLACEMENT_APPLY_POLICY = Object.freeze({
  missing: "CREATE",
  exactIdentityAndMetadataMatch: "NOOP",
  identityOrMetadataMismatch: "CONFLICT",
  deletedMatch: "CONFLICT",
  publishedMatch: "CONFLICT",
  writesAllowedByThisPhase: false,
} as const);

export type CanonicalPlacementAssessmentConfig = {
  canonicalManifestId: string;
  canonicalManifestVersion: string;
  canonicalActive: boolean;
  assessmentKey: string;
  stableAssessmentId: string;
  templateKey: string;
  templateId: string;
  templateVersionId: string;
  templateVersion: number;
  itemBankManifestId: string;
  itemBankManifestVersion: string;
  questionCount: number;
  minScoredCount: number;
  scoringContractVersion: number;
  calibrationStatus: "NOT_CALIBRATED";
  productionAssignmentEnabled: false;
  targetLevelCodes: readonly ProficiencyLevelCode[];
  skillCodes: readonly ProficiencySkillCode[];
  skillDistribution: readonly { skillCode: ProficiencySkillCode; questionCount: number }[];
  difficultyDistribution: { EASY: number; MEDIUM: number; HARD: number };
  questionOrder: readonly string[];
  excludedQuestionTypes: readonly ["OPEN_ENDED"];
};

export function canonicalPlacementAssessmentConfig(
  manifest: CanonicalPlacementAssessmentManifest = CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST,
): CanonicalPlacementAssessmentConfig {
  return {
    canonicalManifestId: manifest.manifestId,
    canonicalManifestVersion: manifest.manifestVersion,
    canonicalActive: false,
    assessmentKey: manifest.assessment.assessmentKey,
    stableAssessmentId: manifest.assessment.stableAssessmentId,
    templateKey: manifest.template.templateKey,
    templateId: manifest.assessment.templateId,
    templateVersionId: manifest.assessment.templateVersionId,
    templateVersion: manifest.template.templateVersion,
    itemBankManifestId: manifest.itemBank.manifestId,
    itemBankManifestVersion: manifest.itemBank.manifestVersion,
    questionCount: manifest.questionPlan.totalQuestionCount,
    minScoredCount: manifest.questionPlan.minScoredCount,
    scoringContractVersion: manifest.scoringContractVersion,
    calibrationStatus: manifest.calibrationStatus,
    productionAssignmentEnabled: manifest.scoring.productionAssignmentEnabled,
    targetLevelCodes: manifest.assessment.targetLevelCodes,
    skillCodes: PROFICIENCY_SKILL_CODES,
    skillDistribution: manifest.questionPlan.skillDistribution,
    difficultyDistribution: manifest.questionPlan.difficultyDistribution,
    questionOrder: manifest.questionPlan.questionOrder,
    excludedQuestionTypes: ["OPEN_ENDED"],
  };
}

export type ExistingCanonicalPlacementAssessment = {
  id: string;
  tenantId: string | null;
  title: string;
  type: string;
  status: string;
  deletedAt: Date | null;
  config: unknown;
};

export type CanonicalPlacementBootstrapAction = "CREATE" | "NOOP" | "CONFLICT";

export type CanonicalPlacementBootstrapPlan = {
  action: CanonicalPlacementBootstrapAction;
  conflicts: string[];
  idempotent: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configMatches(actual: unknown, expected: CanonicalPlacementAssessmentConfig): boolean {
  if (!isRecord(actual)) return false;
  const keys: Array<keyof CanonicalPlacementAssessmentConfig> = [
    "canonicalManifestId",
    "canonicalManifestVersion",
    "canonicalActive",
    "assessmentKey",
    "stableAssessmentId",
    "templateKey",
    "templateId",
    "templateVersionId",
    "templateVersion",
    "itemBankManifestId",
    "itemBankManifestVersion",
    "questionCount",
    "minScoredCount",
    "scoringContractVersion",
    "calibrationStatus",
    "productionAssignmentEnabled",
    "targetLevelCodes",
    "skillCodes",
    "skillDistribution",
    "difficultyDistribution",
    "questionOrder",
    "excludedQuestionTypes",
  ];
  return keys.every((key) => JSON.stringify(actual[key]) === JSON.stringify(expected[key]));
}

/**
 * DB snapshot'ı üzerinden yalnız plan üretir. Prisma çağrısı ve write içermez.
 * Exact canonical marker olmadan benzer bir Assessment duplicate üretmek yerine
 * CONFLICT döndürür; ikinci exact çalıştırma NOOP'tur.
 */
export function planCanonicalPlacementAssessment(
  manifest: CanonicalPlacementAssessmentManifest,
  existing: ExistingCanonicalPlacementAssessment | null,
  _levels: CanonicalProficiencyLevelManifest = CANONICAL_PROFICIENCY_LEVEL_MANIFEST,
  _contract: PlacementScoringContract = PLACEMENT_SCORING_CONTRACT_V1,
): CanonicalPlacementBootstrapPlan {
  if (!existing) return { action: "CREATE", conflicts: [], idempotent: false };

  const conflicts: string[] = [];
  if (existing.deletedAt !== null)
    conflicts.push("canonical placement Assessment deletedAt taşıyor");
  if (existing.tenantId !== null) conflicts.push("canonical placement Assessment global olmalı");
  if (existing.type !== manifest.assessment.type) conflicts.push("Assessment type mismatch");
  if (existing.title !== manifest.assessment.title) conflicts.push("Assessment title mismatch");
  if (existing.status !== manifest.assessment.status) conflicts.push("Assessment status mismatch");
  if (!configMatches(existing.config, canonicalPlacementAssessmentConfig(manifest))) {
    conflicts.push("canonical placement Assessment config mismatch veya identity marker eksik");
  }

  return {
    action: conflicts.length > 0 ? "CONFLICT" : "NOOP",
    conflicts,
    idempotent: conflicts.length === 0,
  };
}

export { canonicalProficiencyLevelManifestSchema };
