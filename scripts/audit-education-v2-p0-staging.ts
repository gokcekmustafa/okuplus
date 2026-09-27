import "dotenv/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  assertSameCatalogDatabaseTarget,
  parseCatalogTargetUrl,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";
import {
  ACADEMIC_P0_COMMON_FLOW,
  ACADEMIC_P0_LESSONS,
  type AcademicLesson,
} from "../src/curriculum/academic-reading-p0.js";
import { getProgramExercise } from "../src/curriculum/education-v2-p0-program.js";
import { parseLessonMetadata } from "../src/modules/lessons/contract.js";
import { resolveTrainingRuntimeConfig } from "../src/modules/training/exercise-contract.js";

export const EDUCATION_V2_LEVEL_CODE = "G8_12" as const;
export const EDUCATION_V2_MIGRATION = "20260927100000_add_persistent_learning_path" as const;
export const EDUCATION_V2_COMMON_REINFORCEMENT_ENV =
  "EDUCATION_V2_COMMON_REINFORCEMENT_TEMPLATE_VERSION_ID" as const;
export const EDUCATION_V2_COMMON_ASSESSMENT_ENV = "EDUCATION_V2_COMMON_ASSESSMENT_ID" as const;
export const EDUCATION_V2_APPROVED_FINGERPRINT_ENV =
  "EDUCATION_V2_P0_APPROVED_TARGET_FINGERPRINT" as const;

const REQUIRED_ENVIRONMENT = "STAGING" as const;
const REQUIRED_SKILLS = [...ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes];

export type AuditStatus = "READY" | "BLOCKED" | "UNVERIFIED";

export type AuditConfig = {
  target: CatalogTarget;
  approvedTarget: CatalogTarget;
  approvedFingerprint: string;
  commonReinforcementTemplateVersionId: string;
  commonAssessmentId: string;
};

export type AuditConfigurationResult =
  { status: "READY"; config: AuditConfig } | { status: "UNVERIFIED"; reasons: string[] };

type JsonRecord = Record<string, unknown>;

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
};

type IdentityRow = { database: string; db_user: string };

type ContentRow = {
  id: string;
  contentId: string;
  metadata: Prisma.JsonValue | null;
  contentStatus: string;
  deletedAt: Date | null;
  skillCodes: string[] | null;
};

type TemplateRow = {
  id: string;
  templateId: string;
  config: Prisma.JsonValue | null;
  versionStatus: string;
  templateStatus: string;
  deletedAt: Date | null;
  skillCode: string | null;
};

type TemplateContentRow = {
  templateVersionId: string;
  contentVersionId: string;
  contentVersionStatus: string;
  contentStatus: string;
  deletedAt: Date | null;
};

type TemplateQuestionRow = {
  templateVersionId: string;
  questionVersionId: string;
  questionVersionStatus: string;
  questionId: string;
  questionStatus: string;
  questionDeletedAt: Date | null;
  questionType: string;
  questionSkillCode: string | null;
  contentVersionId: string | null;
};

type AssessmentRow = {
  id: string;
  status: string;
  deletedAt: Date | null;
  config: Prisma.JsonValue | null;
};

type LearningPathRow = {
  pathCode: string;
  pathStatus: string;
  pathArea: string;
  levelId: string;
  unitCode: string | null;
  stepCode: string | null;
  stepType: string | null;
  stepId: string | null;
  contentVersionId: string | null;
  templateVersionId: string | null;
  assessmentId: string | null;
  completionRule: Prisma.JsonValue | null;
};

type GraphInput = {
  template: TemplateRow | null;
  contents: TemplateContentRow[];
  questions: TemplateQuestionRow[];
  expectedSkillCode?: string;
  expectedFamily?: string;
  expectedRendererKey?: string;
  expectedDifficulty?: string;
};

export type SkillAudit = {
  skillCode: string;
  level: "READY" | "UNVERIFIED";
  contentVersions: { status: AuditStatus; expected: number; found: number; reason?: string };
  exerciseGraph: { status: AuditStatus; candidates: number; reason?: string };
  learningPath: { status: AuditStatus; expectedSteps: number; foundSteps: number; reason?: string };
};

function requiredValue(environment: NodeJS.ProcessEnv, name: string): string | null {
  const value = environment[name]?.trim();
  return value || null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /postgres(?:ql)?:\/\/|password|host|database|current_user|connection|fingerprint/iu.test(
      message,
    )
  ) {
    return "staging hedefi veya bağlantısı doğrulanamadı";
  }
  return message;
}

export function readAuditConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): AuditConfigurationResult {
  const reasons: string[] = [];
  const environmentName = requiredValue(environment, "EDUCATION_V2_P0_ENVIRONMENT");
  if (environmentName?.toUpperCase() !== REQUIRED_ENVIRONMENT) {
    reasons.push("EDUCATION_V2_P0_ENVIRONMENT=STAGING gerekli");
  }

  const rawUrl = requiredValue(environment, "EDUCATION_V2_P0_DATABASE_URL");
  const approvedTargetUrl = requiredValue(environment, "DB_FINGERPRINT_DATABASE_URL");
  const approvedFingerprint = requiredValue(environment, EDUCATION_V2_APPROVED_FINGERPRINT_ENV);
  const commonReinforcementTemplateVersionId = requiredValue(
    environment,
    EDUCATION_V2_COMMON_REINFORCEMENT_ENV,
  );
  const commonAssessmentId = requiredValue(environment, EDUCATION_V2_COMMON_ASSESSMENT_ENV);
  let target: CatalogTarget | null = null;
  let approvedTarget: CatalogTarget | null = null;

  if (!rawUrl) {
    reasons.push("EDUCATION_V2_P0_DATABASE_URL eksik");
  } else {
    try {
      target = parseCatalogTargetUrl(rawUrl, REQUIRED_ENVIRONMENT);
      assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
      if (target.provider !== "NEON") {
        reasons.push("staging denetimi için Neon PostgreSQL hedefi gerekli");
      }
    } catch (error) {
      reasons.push(`staging hedefi reddedildi: ${safeError(error)}`);
    }
  }

  if (!approvedTargetUrl) {
    reasons.push("DB_FINGERPRINT_DATABASE_URL eksik");
  } else {
    try {
      approvedTarget = parseCatalogTargetUrl(approvedTargetUrl, REQUIRED_ENVIRONMENT);
      assertCatalogEnvironmentSafety(approvedTarget, { rejectTestDatabase: true });
      if (approvedTarget.provider !== "NEON") {
        reasons.push("onaylı staging kontrolü için Neon PostgreSQL hedefi gerekli");
      }
    } catch (error) {
      reasons.push(`onaylı staging kontrol hedefi reddedildi: ${safeError(error)}`);
    }
  }

  if (!approvedFingerprint) {
    reasons.push(`${EDUCATION_V2_APPROVED_FINGERPRINT_ENV} eksik`);
  } else if (!/^[a-f0-9]{64}$/iu.test(approvedFingerprint)) {
    reasons.push(`${EDUCATION_V2_APPROVED_FINGERPRINT_ENV} geçerli SHA-256 değil`);
  }
  if (!commonReinforcementTemplateVersionId) {
    reasons.push(`${EDUCATION_V2_COMMON_REINFORCEMENT_ENV} eksik`);
  }
  if (!commonAssessmentId) {
    reasons.push(`${EDUCATION_V2_COMMON_ASSESSMENT_ENV} eksik`);
  }

  if (
    !target ||
    !approvedTarget ||
    reasons.length > 0 ||
    !approvedFingerprint ||
    !commonReinforcementTemplateVersionId ||
    !commonAssessmentId
  ) {
    return { status: "UNVERIFIED", reasons };
  }

  return {
    status: "READY",
    config: {
      target,
      approvedTarget,
      approvedFingerprint,
      commonReinforcementTemplateVersionId,
      commonAssessmentId,
    },
  };
}

export function verifyTargetIdentity(
  target: CatalogTarget,
  identity: IdentityRow,
  approvedFingerprint: string,
  approvedTarget: CatalogTarget = target,
): string[] {
  const reasons: string[] = [];
  try {
    assertLiveCatalogTargetIdentity(target, identity);
  } catch (error) {
    void error;
    reasons.push("staging database identity beklenen hedefle eşleşmiyor");
  }
  try {
    assertSameCatalogDatabaseTarget(approvedTarget, target);
  } catch (error) {
    void error;
    reasons.push("staging hedefi onaylı veritabanıyla eşleşmiyor");
  }
  if (target === approvedTarget) {
    try {
      assertApprovedTargetFingerprint(target, identity, approvedFingerprint);
    } catch (error) {
      void error;
      reasons.push("staging target fingerprint eşleşmiyor");
    }
  }
  return reasons;
}

function graphErrors(input: GraphInput): string[] {
  const errors: string[] = [];
  const template = input.template;
  if (!template) return ["published template version bulunamadı"];
  if (template.versionStatus !== "PUBLISHED") errors.push("template version yayınlı değil");
  if (template.templateStatus !== "PUBLISHED" || template.deletedAt !== null) {
    errors.push("parent template yayınlı değil veya silinmiş");
  }
  if (input.contents.length === 0) errors.push("published content bağlantısı yok");
  if (
    input.contents.some(
      (content) =>
        content.contentVersionStatus !== "PUBLISHED" ||
        content.contentStatus !== "PUBLISHED" ||
        content.deletedAt !== null,
    )
  ) {
    errors.push("content graph içinde yayınlanmamış veya silinmiş kayıt var");
  }
  if (input.questions.length === 0) errors.push("question bağlantısı yok");
  if (
    input.questions.some(
      (question) =>
        question.questionVersionStatus !== "PUBLISHED" ||
        question.questionStatus !== "PUBLISHED" ||
        question.questionDeletedAt !== null ||
        question.questionType !== "MULTIPLE_CHOICE" ||
        (input.expectedSkillCode && question.questionSkillCode !== input.expectedSkillCode) ||
        (question.contentVersionId !== null &&
          !input.contents.some(
            (content) => content.contentVersionId === question.contentVersionId,
          )),
    )
  ) {
    errors.push("question graph yayınlı/scorable veya beceri bağlantısı açısından geçersiz");
  }
  if (input.expectedSkillCode || input.expectedFamily || input.expectedRendererKey) {
    const runtime = resolveTrainingRuntimeConfig("TRAINING", template.config);
    if (runtime.status !== "READY") {
      errors.push("template version runtime config sözleşmesine uymuyor");
    } else {
      if (input.expectedSkillCode && runtime.config.competency !== input.expectedSkillCode) {
        errors.push("runtime competency beklenen beceriyle eşleşmiyor");
      }
      if (input.expectedFamily && runtime.config.family !== input.expectedFamily) {
        errors.push("runtime family beklenen exercise ailesiyle eşleşmiyor");
      }
      if (input.expectedRendererKey && runtime.config.rendererKey !== input.expectedRendererKey) {
        errors.push("runtime rendererKey beklenen renderer ile eşleşmiyor");
      }
      if (
        input.expectedDifficulty
          ? runtime.config.difficulty !== input.expectedDifficulty
          : !["FOUNDATION", "DEVELOPING"].includes(runtime.config.difficulty)
      ) {
        errors.push(
          input.expectedDifficulty
            ? `runtime difficulty beklenen ${input.expectedDifficulty} değil`
            : "runtime difficulty FOUNDATION veya DEVELOPING değil",
        );
      }
      if (
        runtime.config.contentRequirement !== "REQUIRED" ||
        runtime.config.questionRequirement !== "REQUIRED"
      ) {
        errors.push("runtime content/question requirement gerekli değil");
      }
    }
  }
  return errors;
}

function pathCode(area: "FAST_READING" | "READING_COMPREHENSION" | "COMMON"): string {
  return `EDUCATION_V2_P0_${area === "FAST_READING" ? "FAST_READING" : area === "READING_COMPREHENSION" ? "READING_COMPREHENSION" : "COMMON"}_${EDUCATION_V2_LEVEL_CODE}`;
}

function templateContainsAcademicLesson(
  templateVersionId: string,
  contentRows: ContentRow[],
  contentBindings: TemplateContentRow[],
  lesson: AcademicLesson,
): boolean {
  const boundContentVersionIds = new Set(
    contentBindings
      .filter((binding) => binding.templateVersionId === templateVersionId)
      .map((binding) => binding.contentVersionId),
  );
  const stages = new Set(
    contentRows.flatMap((content) => {
      if (!boundContentVersionIds.has(content.id)) return [];
      const metadata = parseLessonMetadata(content.metadata);
      return metadata?.contractVersion === 2 &&
        metadata.skillCode === lesson.skillCode &&
        metadata.area === lesson.area &&
        typeof metadata.stage === "string"
        ? [metadata.stage]
        : [];
    }),
  );
  return lesson.stages.every((stage) => stages.has(stage.stage));
}

function skillTemplateCandidates(
  rows: TemplateRow[],
  contentRows: ContentRow[],
  contentBindings: TemplateContentRow[],
  lesson: AcademicLesson,
): TemplateRow[] {
  return rows.filter((row) => {
    if (row.skillCode !== lesson.skillCode) return false;
    if (!templateContainsAcademicLesson(row.id, contentRows, contentBindings, lesson)) {
      return false;
    }
    const runtime = resolveTrainingRuntimeConfig("TRAINING", row.config);
    if (runtime.status !== "READY") return false;
    return (
      runtime.config.family === lesson.practiceBinding.family &&
      runtime.config.competency === lesson.skillCode &&
      runtime.config.interactionType === "MULTIPLE_CHOICE" &&
      runtime.config.rendererKey === lesson.practiceBinding.rendererKey &&
      ["FOUNDATION", "DEVELOPING"].includes(runtime.config.difficulty) &&
      runtime.config.contentRequirement === "REQUIRED" &&
      runtime.config.questionRequirement === "REQUIRED"
    );
  });
}

function contentMatchesLesson(row: ContentRow, lesson: AcademicLesson, stage: string): boolean {
  const metadata = parseLessonMetadata(row.metadata);
  return (
    metadata?.skillCode === lesson.skillCode &&
    metadata.area === lesson.area &&
    metadata.stage === stage &&
    row.skillCodes?.includes(lesson.skillCode) === true
  );
}

async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ relation: string | null }>>(
    Prisma.sql`SELECT to_regclass(${Prisma.raw(`'public."${table}"'`)})::text AS relation`,
  );
  return rows[0]?.relation !== null;
}

async function readMigration(
  prisma: PrismaClient,
): Promise<{ status: AuditStatus; row: MigrationRow | null; reason?: string }> {
  const exists = await tableExists(prisma, "_prisma_migrations");
  if (!exists) return { status: "BLOCKED", row: null, reason: "_prisma_migrations tablosu yok" };
  const rows = await prisma.$queryRaw<MigrationRow[]>(Prisma.sql`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations"
    WHERE migration_name = ${EDUCATION_V2_MIGRATION}
    ORDER BY started_at DESC
  `);
  const row =
    rows.find((candidate) => candidate.finished_at !== null && candidate.rolled_back_at === null) ??
    null;
  if (!row)
    return {
      status: "BLOCKED",
      row: rows[0] ?? null,
      reason: "Eğitim V2 migration uygulanmış görünmüyor",
    };
  if (row.applied_steps_count < 1) {
    return { status: "BLOCKED", row, reason: "Eğitim V2 migration applied_steps_count geçersiz" };
  }
  return { status: "READY", row };
}

async function readContent(prisma: PrismaClient): Promise<ContentRow[]> {
  return prisma.$queryRaw<ContentRow[]>(Prisma.sql`
    SELECT
      cv.id,
      cv."contentId",
      cv.metadata,
      c.status::text AS "contentStatus",
      c."deletedAt",
      COALESCE(
        ARRAY_AGG(DISTINCT s.code) FILTER (WHERE s.code IS NOT NULL),
        ARRAY[]::text[]
      ) AS "skillCodes"
    FROM "ContentVersion" cv
    JOIN "Content" c ON c.id = cv."contentId"
    LEFT JOIN "ContentSkill" cs ON cs."contentId" = c.id
    LEFT JOIN "Skill" s ON s.id = cs."skillId"
    WHERE cv.status::text = 'PUBLISHED'
      AND c.status::text = 'PUBLISHED'
      AND c."deletedAt" IS NULL
    GROUP BY cv.id, cv."contentId", cv.metadata, c.status, c."deletedAt"
  `);
}

async function readTemplates(prisma: PrismaClient): Promise<TemplateRow[]> {
  return prisma.$queryRaw<TemplateRow[]>(Prisma.sql`
    SELECT
      etv.id,
      etv."templateId",
      etv.config,
      etv.status::text AS "versionStatus",
      et.status::text AS "templateStatus",
      et."deletedAt",
      s.code AS "skillCode"
    FROM "ExerciseTemplateVersion" etv
    JOIN "ExerciseTemplate" et ON et.id = etv."templateId"
    LEFT JOIN "Skill" s ON s.id = et."skillId"
    WHERE etv.status::text = 'PUBLISHED'
      AND et.status::text = 'PUBLISHED'
      AND et."deletedAt" IS NULL
  `);
}

async function readTemplateContents(prisma: PrismaClient): Promise<TemplateContentRow[]> {
  return prisma.$queryRaw<TemplateContentRow[]>(Prisma.sql`
    SELECT
      b."templateVersionId",
      cv.id AS "contentVersionId",
      cv.status::text AS "contentVersionStatus",
      c.status::text AS "contentStatus",
      c."deletedAt"
    FROM "ExerciseTemplateVersionContent" b
    JOIN "ContentVersion" cv ON cv.id = b."contentVersionId"
    JOIN "Content" c ON c.id = cv."contentId"
  `);
}

async function readTemplateQuestions(prisma: PrismaClient): Promise<TemplateQuestionRow[]> {
  return prisma.$queryRaw<TemplateQuestionRow[]>(Prisma.sql`
    SELECT
      b."templateVersionId",
      qv.id AS "questionVersionId",
      qv.status::text AS "questionVersionStatus",
      q.id AS "questionId",
      q.status::text AS "questionStatus",
      q."deletedAt" AS "questionDeletedAt",
      q.type::text AS "questionType",
      s.code AS "questionSkillCode",
      qv."contentVersionId"
    FROM "ExerciseTemplateVersionQuestion" b
    JOIN "QuestionVersion" qv ON qv.id = b."questionVersionId"
    JOIN "Question" q ON q.id = qv."questionId"
    LEFT JOIN "Skill" s ON s.id = q."skillId"
  `);
}

async function readAssessments(
  prisma: PrismaClient,
  assessmentId: string,
): Promise<AssessmentRow[]> {
  return prisma.$queryRaw<AssessmentRow[]>(Prisma.sql`
    SELECT id, status::text AS status, "deletedAt", config
    FROM "Assessment"
    WHERE id = ${assessmentId}
  `);
}

async function readLearningPath(prisma: PrismaClient): Promise<LearningPathRow[]> {
  return prisma.$queryRaw<LearningPathRow[]>(Prisma.sql`
    SELECT
      lp.code AS "pathCode",
      lp.status::text AS "pathStatus",
      lp.area::text AS "pathArea",
      lp."levelId",
      lu.code AS "unitCode",
      ls."stableKey" AS "stepCode",
      ls.type::text AS "stepType",
      ls.id AS "stepId",
      ls."contentVersionId",
      ls."exerciseTemplateVersionId" AS "templateVersionId",
      ls."assessmentId",
      ls."completionRule"
    FROM "LearningPath" lp
    LEFT JOIN "LearningUnit" lu ON lu."pathId" = lp.id
    LEFT JOIN "LearningStep" ls ON ls."unitId" = lu.id
    WHERE lp.version = 1
      AND lp.code IN (${Prisma.join([
        Prisma.sql`${pathCode("FAST_READING")}`,
        Prisma.sql`${pathCode("READING_COMPREHENSION")}`,
        Prisma.sql`${pathCode("COMMON")}`,
      ])})
    ORDER BY lp.code, lu."position", ls."position"
  `);
}

function templateGraph(
  template: TemplateRow | null,
  contentBindings: TemplateContentRow[],
  questionBindings: TemplateQuestionRow[],
  expectedSkillCode?: string,
  expectedFamily?: string,
  expectedRendererKey?: string,
  expectedDifficulty?: string,
): { status: AuditStatus; reason?: string } {
  const errors = graphErrors({
    template,
    contents: template
      ? contentBindings.filter((row) => row.templateVersionId === template.id)
      : [],
    questions: template
      ? questionBindings.filter((row) => row.templateVersionId === template.id)
      : [],
    expectedSkillCode,
    expectedFamily,
    expectedRendererKey,
    expectedDifficulty,
  });
  return errors.length === 0
    ? { status: "READY" }
    : { status: "BLOCKED", reason: errors.join("; ") };
}

function pathStepStatus(
  rows: LearningPathRow[],
  area: "FAST_READING" | "READING_COMPREHENSION",
): { status: AuditStatus; expectedSteps: number; foundSteps: number; reason?: string } {
  const pathRows = rows.filter((row) => row.pathCode === pathCode(area));
  const expectedLessons = ACADEMIC_P0_LESSONS.filter((lesson) => lesson.area === area);
  const expectedStepCodes = new Set(
    expectedLessons.flatMap((lesson) =>
      lesson.stages.map((stage) => `${lesson.skillCode}_${stage.stage}`),
    ),
  );
  const expectedSteps = expectedStepCodes.size;
  const foundSteps = new Set(pathRows.map((row) => row.stepId).filter(Boolean)).size;
  if (pathRows.length === 0) {
    return {
      status: "BLOCKED",
      expectedSteps,
      foundSteps,
      reason: "öğrenme yolu veya adımları yok",
    };
  }
  if (
    foundSteps !== expectedSteps ||
    new Set(pathRows.map((row) => row.stepCode).filter(Boolean)).size !== expectedStepCodes.size ||
    pathRows.some((row) => row.stepCode !== null && !expectedStepCodes.has(row.stepCode))
  ) {
    return {
      status: "BLOCKED",
      expectedSteps,
      foundSteps,
      reason: "öğrenme yolu adım sayısı eksik",
    };
  }
  if (pathRows.some((row) => row.pathStatus !== "PUBLISHED" || row.stepCode === null)) {
    return {
      status: "BLOCKED",
      expectedSteps,
      foundSteps,
      reason: "öğrenme yolu yayınlı veya bağlantılı değil",
    };
  }
  for (const lesson of expectedLessons) {
    for (const stage of lesson.stages) {
      const step = pathRows.find((row) => row.stepCode === `${lesson.skillCode}_${stage.stage}`);
      if (!step) continue;
      if (stage.stage === "PRACTICE" && step.templateVersionId === null) {
        return {
          status: "BLOCKED",
          expectedSteps,
          foundSteps,
          reason: "uygulama adımı exercise graph'a bağlı değil",
        };
      }
      if (stage.stage !== "PRACTICE" && step.contentVersionId === null) {
        return {
          status: "BLOCKED",
          expectedSteps,
          foundSteps,
          reason: "öğretim adımı published içeriğe bağlı değil",
        };
      }
    }
  }
  return { status: "READY", expectedSteps, foundSteps };
}

function jsonRecord(value: Prisma.JsonValue | null): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function commonPathStatus(rows: LearningPathRow[]): {
  status: AuditStatus;
  commonStepCount: number;
  commonPrerequisitesReady: boolean;
  reason?: string;
} {
  const commonRows = rows.filter((row) => row.pathCode === pathCode("COMMON"));
  const commonStepCount = new Set(commonRows.map((row) => row.stepId).filter(Boolean)).size;
  const expectedCodes = [
    "COMMON_REINFORCEMENT",
    "COMMON_ASSESSMENT",
    "COMMON_MEASUREMENT",
    "COMMON_NEXT_LEARNING",
  ];
  const practiceIds = new Set(
    rows.filter((row) => row.stepType === "PRACTICE" && row.stepId).map((row) => row.stepId!),
  );
  const reinforcement = commonRows.find((row) => row.stepCode === "COMMON_REINFORCEMENT");
  const assessment = commonRows.find((row) => row.stepCode === "COMMON_ASSESSMENT");
  const measurement = commonRows.find((row) => row.stepCode === "COMMON_MEASUREMENT");
  const nextLearning = commonRows.find((row) => row.stepCode === "COMMON_NEXT_LEARNING");
  const prerequisites = (row: LearningPathRow | undefined): string[] => {
    const value = jsonRecord(row?.completionRule ?? null)?.prerequisiteStepIds;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  };
  const reinforcementPrerequisites = prerequisites(reinforcement);
  const assessmentPrerequisites = prerequisites(assessment);
  const measurementPrerequisites = prerequisites(measurement);
  const nextLearningPrerequisites = prerequisites(nextLearning);
  const commonPrerequisitesReady =
    reinforcementPrerequisites.length === practiceIds.size &&
    reinforcementPrerequisites.every((id) => practiceIds.has(id));
  const assessmentRule = jsonRecord(assessment?.completionRule ?? null);
  const measurementRule = jsonRecord(measurement?.completionRule ?? null);
  const scoreRule = (value: JsonRecord | null): boolean =>
    value?.kind === "ASSESSMENT_RESULT" && value.minimumScore === 0.75;
  const prerequisitesReady =
    assessmentPrerequisites.length === 1 &&
    assessmentPrerequisites[0] === reinforcement?.stepId &&
    measurementPrerequisites.length === 1 &&
    measurementPrerequisites[0] === assessment?.stepId &&
    nextLearningPrerequisites.length === 1 &&
    nextLearningPrerequisites[0] === measurement?.stepId;
  const codesReady = expectedCodes.every((code) => commonRows.some((row) => row.stepCode === code));
  const ready =
    commonRows.length > 0 &&
    commonStepCount === 4 &&
    codesReady &&
    commonRows.every((row) => row.pathStatus === "PUBLISHED") &&
    commonPrerequisitesReady &&
    prerequisitesReady &&
    scoreRule(assessmentRule) &&
    scoreRule(measurementRule);
  return {
    status: ready ? "READY" : "BLOCKED",
    commonStepCount,
    commonPrerequisitesReady,
    ...(ready ? {} : { reason: "ortak adımların ön koşul veya completion rule bağlantısı eksik" }),
  };
}

export function evaluateAuditStatuses(statuses: AuditStatus[]): AuditStatus {
  if (statuses.includes("UNVERIFIED")) return "UNVERIFIED";
  if (statuses.includes("BLOCKED")) return "BLOCKED";
  return "READY";
}

export async function runAudit(config: AuditConfig): Promise<Record<string, unknown>> {
  const prisma = new PrismaClient({ datasources: { db: { url: config.target.url } } });
  const approvedPrisma = new PrismaClient({
    datasources: { db: { url: config.approvedTarget.url } },
  });
  try {
    const identityRows = await prisma.$queryRaw<IdentityRow[]>(Prisma.sql`
      SELECT current_database() AS database, current_user AS db_user
    `);
    const identity = identityRows[0];
    if (!identity) {
      return { status: "UNVERIFIED", reason: "staging database identity okunamadı" };
    }
    const approvedIdentityRows = await approvedPrisma.$queryRaw<IdentityRow[]>(Prisma.sql`
      SELECT current_database() AS database, current_user AS db_user
    `);
    const approvedIdentity = approvedIdentityRows[0];
    const identityErrors = approvedIdentity
      ? verifyTargetIdentity(
          config.target,
          identity,
          config.approvedFingerprint,
          config.approvedTarget,
        )
      : ["onaylı staging database kimliği okunamadı"];
    if (approvedIdentity) {
      try {
        assertLiveCatalogTargetIdentity(config.approvedTarget, approvedIdentity);
        assertApprovedTargetFingerprint(
          config.approvedTarget,
          approvedIdentity,
          config.approvedFingerprint,
        );
      } catch (error) {
        void error;
        identityErrors.push("onaylı staging target fingerprint eşleşmiyor");
      }
    }
    if (identityErrors.length > 0) {
      return { status: "UNVERIFIED", reason: identityErrors.join("; ") };
    }

    const migration = await readMigration(prisma);
    const requiredTables = [
      "Level",
      "Skill",
      "Content",
      "ContentVersion",
      "ContentSkill",
      "ExerciseTemplate",
      "ExerciseTemplateVersion",
      "ExerciseTemplateVersionContent",
      "ExerciseTemplateVersionQuestion",
      "Question",
      "QuestionVersion",
      "Assessment",
      "LearningPath",
      "LearningUnit",
      "LearningStep",
    ];
    const missingTables: string[] = [];
    for (const table of requiredTables) {
      if (!(await tableExists(prisma, table))) missingTables.push(table);
    }
    if (missingTables.length > 0) {
      return {
        status: "BLOCKED",
        database: "STAGING_VERIFIED",
        migration,
        missingTables,
      };
    }

    const levelRows = await prisma.$queryRaw<Array<{ id: string; code: string }>>(Prisma.sql`
      SELECT id, code FROM "Level" WHERE code = ${EDUCATION_V2_LEVEL_CODE}
    `);
    const skillRows = await prisma.$queryRaw<Array<{ id: string; code: string }>>(Prisma.sql`
      SELECT id, code FROM "Skill" WHERE code IN (${Prisma.join(REQUIRED_SKILLS.map((code) => Prisma.sql`${code}`))})
    `);
    const contentRows = await readContent(prisma);
    const templateRows = await readTemplates(prisma);
    const contentBindings = await readTemplateContents(prisma);
    const questionBindings = await readTemplateQuestions(prisma);
    const learningRows = await readLearningPath(prisma);
    const levelReady = levelRows.length === 1;
    const skillCodes = new Set(skillRows.map((row) => row.code));
    const skillAudits: SkillAudit[] = [];

    for (const skillCode of REQUIRED_SKILLS) {
      const lesson = ACADEMIC_P0_LESSONS.find((candidate) => candidate.skillCode === skillCode)!;
      const stageMatches = lesson.stages.map((stage) =>
        contentRows.filter((candidate) => contentMatchesLesson(candidate, lesson, stage.stage)),
      );
      const stageCount = stageMatches.filter((matches) => matches.length === 1).length;
      const candidates = skillTemplateCandidates(
        templateRows,
        contentRows,
        contentBindings,
        lesson,
      );
      const template = candidates.length === 1 ? candidates[0]! : null;
      const contentTemplateLinksReady =
        template !== null &&
        stageMatches.every((matches) => {
          const metadata = matches.length === 1 ? parseLessonMetadata(matches[0]!.metadata) : null;
          return metadata?.exerciseTemplateVersionId === template.id;
        });
      const graph = templateGraph(
        template,
        contentBindings,
        questionBindings,
        lesson.skillCode,
        lesson.practiceBinding.family,
        lesson.practiceBinding.rendererKey,
      );
      const areaPath = pathStepStatus(learningRows, lesson.area);
      const skillStatus: AuditStatus =
        !levelReady || !skillCodes.has(skillCode) ? "BLOCKED" : "READY";
      skillAudits.push({
        skillCode,
        level: levelReady ? "READY" : "BLOCKED",
        contentVersions: {
          status:
            stageCount === lesson.stages.length && contentTemplateLinksReady ? "READY" : "BLOCKED",
          expected: lesson.stages.length,
          found: stageCount,
          ...(stageCount !== lesson.stages.length
            ? { reason: "bir veya daha fazla yayınlı ders aşaması eksik veya tekrarlı" }
            : !contentTemplateLinksReady
              ? { reason: "ders içeriği seçilen exercise graph sürümüne bağlı değil" }
              : {}),
        },
        exerciseGraph: {
          status: candidates.length === 1 && graph.status === "READY" ? "READY" : "BLOCKED",
          candidates: candidates.length,
          ...(graph.reason ? { reason: graph.reason } : {}),
        },
        learningPath: {
          ...areaPath,
          ...(skillStatus === "BLOCKED" && !areaPath.reason
            ? { reason: !levelReady ? "Level bulunamadı" : "Skill bulunamadı" }
            : {}),
          status: skillStatus === "BLOCKED" ? "BLOCKED" : areaPath.status,
        },
      });
    }

    const commonTemplateId = config.commonReinforcementTemplateVersionId;
    const commonAssessmentId = config.commonAssessmentId;
    const commonTemplate = commonTemplateId
      ? (templateRows.find((row) => row.id === commonTemplateId) ?? null)
      : null;
    const commonGraph = commonTemplateId
      ? templateGraph(
          commonTemplate,
          contentBindings,
          questionBindings,
          getProgramExercise("common-reinforcement").contract.competency,
          getProgramExercise("common-reinforcement").contract.family,
          getProgramExercise("common-reinforcement").contract.rendererKey,
          getProgramExercise("common-reinforcement").contract.difficulty,
        )
      : { status: "BLOCKED" as const, reason: `${EDUCATION_V2_COMMON_REINFORCEMENT_ENV} eksik` };
    const assessmentRows = commonAssessmentId
      ? await readAssessments(prisma, commonAssessmentId)
      : [];
    const assessment = assessmentRows[0] ?? null;
    const assessmentConfig = assessment && isRecord(assessment.config) ? assessment.config : null;
    const assessmentTemplateId =
      assessmentConfig && typeof assessmentConfig.templateVersionId === "string"
        ? assessmentConfig.templateVersionId
        : null;
    const assessmentTemplate = assessmentTemplateId
      ? (templateRows.find((row) => row.id === assessmentTemplateId) ?? null)
      : null;
    const assessmentGraph = assessmentTemplateId
      ? templateGraph(
          assessmentTemplate,
          contentBindings,
          questionBindings,
          getProgramExercise("common-test").contract.competency,
          getProgramExercise("common-test").contract.family,
          getProgramExercise("common-test").contract.rendererKey,
          getProgramExercise("common-test").contract.difficulty,
        )
      : {
          status: "BLOCKED" as const,
          reason: "assessment templateVersionId eksik veya bulunamadı",
        };
    const commonPath = commonPathStatus(learningRows);

    const componentStatuses: AuditStatus[] = [
      migration.status,
      ...skillAudits.flatMap((skill) => [
        skill.contentVersions.status,
        skill.exerciseGraph.status,
        skill.learningPath.status,
      ]),
      commonGraph.status,
      assessment?.status === "PUBLISHED" && assessment.deletedAt === null ? "READY" : "BLOCKED",
      assessmentGraph.status,
      commonPath.status,
    ];
    return {
      status: evaluateAuditStatuses(componentStatuses),
      database: "STAGING_VERIFIED",
      migration,
      level: { code: EDUCATION_V2_LEVEL_CODE, status: levelReady ? "READY" : "BLOCKED" },
      skills: skillAudits,
      commonReinforcement: {
        configured: Boolean(commonTemplateId),
        status: commonGraph.status,
        reason: commonGraph.reason,
      },
      assessment: {
        configured: Boolean(commonAssessmentId),
        status:
          assessment?.status === "PUBLISHED" && assessment.deletedAt === null
            ? assessmentGraph.status
            : "BLOCKED",
        reason:
          assessment?.status !== "PUBLISHED" || assessment.deletedAt !== null
            ? "assessment yayınlı değil veya bulunamadı"
            : assessmentGraph.reason,
      },
      learningPath: {
        status: commonPath.status,
        commonStepCount: commonPath.commonStepCount,
        expectedCommonStepCount: 4,
        commonPrerequisitesReady: commonPath.commonPrerequisitesReady,
        ...(commonPath.reason ? { reason: commonPath.reason } : {}),
      },
      configuration: {
        [EDUCATION_V2_COMMON_REINFORCEMENT_ENV]: Boolean(commonTemplateId),
        [EDUCATION_V2_COMMON_ASSESSMENT_ENV]: Boolean(commonAssessmentId),
      },
    };
  } catch (error) {
    return { status: "UNVERIFIED", reason: safeError(error) };
  } finally {
    await prisma.$disconnect();
    await approvedPrisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const configuration = readAuditConfiguration();
  if (configuration.status !== "READY") {
    console.log(
      JSON.stringify(
        {
          status: "UNVERIFIED",
          reason: "staging bağlantısı doğrulanamadı",
          missingOrInvalid: configuration.reasons,
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }
  const result = await runAudit(configuration.config);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "READY") process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main();
}
