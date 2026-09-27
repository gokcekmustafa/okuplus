import "dotenv/config";
import { isDeepStrictEqual } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  ACADEMIC_P0_COMMON_FLOW,
  ACADEMIC_P0_LESSONS,
  type AcademicLesson,
} from "../src/curriculum/academic-reading-p0.js";
import { getProgramExercise } from "../src/curriculum/education-v2-p0-program.js";
import { parseLessonMetadata } from "../src/modules/lessons/contract.js";
import {
  resolveTrainingRuntimeConfig,
  type TrainingExerciseVersionConfig,
} from "../src/modules/training/exercise-contract.js";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  assertSameCatalogDatabaseTarget,
  parseCatalogTargetUrl,
} from "../src/curriculum/catalog-target-verification.js";

const REQUIRED_ENVIRONMENT = "STAGING";
const REQUIRED_CONFIRMATION = "I_HAVE_REVIEWED_EDUCATION_V2_P0";
const PATH_VERSION = 1;
const ASSESSMENT_MINIMUM_SCORE = 0.75;

type ProvisionStep = {
  code: string;
  title: string;
  type:
    | "TEACHING"
    | "SMALL_STUDY"
    | "PRACTICE"
    | "REINFORCEMENT"
    | "ASSESSMENT"
    | "MEASUREMENT"
    | "NEXT_LEARNING";
  displayOrder: number;
  skillId?: string;
  contentVersionId?: string;
  templateVersionId?: string;
  assessmentId?: string;
  prerequisiteStepIds: string[];
  completionRule?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

function fail(message: string): never {
  throw new Error(`Eğitim V2 P0 provisioning reddedildi: ${message}`);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function objectValue(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function assertTarget(): {
  url: string;
  levelCode: string;
  approvedFingerprint: string;
  apply: boolean;
} {
  const environment = requiredEnv("EDUCATION_V2_P0_ENVIRONMENT").toUpperCase();
  if (environment !== REQUIRED_ENVIRONMENT) {
    fail("bu provisioning komutu yalnızca STAGING ortamında çalıştırılabilir");
  }
  const url = requiredEnv("EDUCATION_V2_P0_DATABASE_URL");
  const levelCode = requiredEnv("EDUCATION_V2_P0_LEVEL_CODE");
  const approvedFingerprint = requiredEnv("EDUCATION_V2_P0_APPROVED_TARGET_FINGERPRINT");
  const confirmation = process.env.I_HAVE_REVIEWED_EDUCATION_V2_P0?.trim();
  const apply = process.argv.includes("--apply");
  if (apply && confirmation !== REQUIRED_CONFIRMATION) {
    fail(`--apply için I_HAVE_REVIEWED_EDUCATION_V2_P0=${REQUIRED_CONFIRMATION} gerekli`);
  }
  if (!apply && !process.argv.includes("--dry-run")) {
    fail("tam olarak --dry-run veya --apply seçilmeli");
  }
  return { url, levelCode, approvedFingerprint, apply };
}

async function assertProvisioningTarget(
  client: PrismaClient,
  url: string,
  approvedFingerprint: string,
): Promise<void> {
  const target = parseCatalogTargetUrl(url, REQUIRED_ENVIRONMENT);
  const approvedTargetUrl = requiredEnv("DB_FINGERPRINT_DATABASE_URL");
  const approvedTarget = parseCatalogTargetUrl(approvedTargetUrl, REQUIRED_ENVIRONMENT);
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  assertCatalogEnvironmentSafety(approvedTarget, { rejectTestDatabase: true });
  if (target.provider !== "NEON" || approvedTarget.provider !== "NEON") {
    fail("staging ve onaylı kontrol hedefleri Neon olmalı");
  }
  const rows = await client.$queryRaw<Array<{ database: string; db_user: string }>>`
    SELECT current_database() AS database, current_user AS db_user
  `;
  const identity = rows[0];
  if (!identity) fail("provisioning hedef database kimliği okunamadı");
  assertLiveCatalogTargetIdentity(target, identity);
  assertSameCatalogDatabaseTarget(approvedTarget, target);

  const approvedClient = new PrismaClient({
    datasources: { db: { url: approvedTargetUrl } },
  });
  try {
    const approvedRows = await approvedClient.$queryRaw<
      Array<{ database: string; db_user: string }>
    >`
      SELECT current_database() AS database, current_user AS db_user
    `;
    const approvedIdentity = approvedRows[0];
    if (!approvedIdentity) fail("onaylı staging database kimliği okunamadı");
    assertLiveCatalogTargetIdentity(approvedTarget, approvedIdentity);
    assertApprovedTargetFingerprint(approvedTarget, approvedIdentity, approvedFingerprint);
  } finally {
    await approvedClient.$disconnect();
  }
}

async function withPlatformContext<T>(
  client: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p0-provisioner', true)`;
    return callback(tx);
  });
}

async function findPublishedLessonContent(
  tx: Prisma.TransactionClient,
  lesson: AcademicLesson,
  stage: AcademicLesson["stages"][number]["stage"],
): Promise<{ id: string; exerciseTemplateVersionId: string }> {
  const candidates = await tx.contentVersion.findMany({
    where: {
      status: "PUBLISHED",
      content: { status: "PUBLISHED", deletedAt: null },
    },
    select: {
      id: true,
      metadata: true,
      content: { select: { contentSkills: { select: { skill: { select: { code: true } } } } } },
    },
  });
  const matches = candidates.filter((candidate) => {
    const metadata = parseLessonMetadata(candidate.metadata);
    return (
      metadata?.skillCode === lesson.skillCode &&
      metadata.area === lesson.area &&
      metadata.stage === stage &&
      candidate.content.contentSkills.some((entry) => entry.skill.code === lesson.skillCode)
    );
  });
  if (matches.length !== 1) {
    fail(
      `${lesson.skillCode}/${stage} için tam bir yayınlanmış LEARNING_LESSON sürümü gerekli (bulunan: ${matches.length})`,
    );
  }
  const metadata = parseLessonMetadata(matches[0]!.metadata);
  if (!metadata) fail(`${lesson.skillCode}/${stage} metadata okunamadı`);
  return { id: matches[0]!.id, exerciseTemplateVersionId: metadata.exerciseTemplateVersionId };
}

type PublishedTemplate = {
  id: string;
  config: Prisma.JsonValue;
};

async function findPublishedTemplate(
  tx: Prisma.TransactionClient,
  lesson: AcademicLesson,
): Promise<PublishedTemplate> {
  const candidates = await tx.exerciseTemplateVersion.findMany({
    where: {
      status: "PUBLISHED",
      template: {
        status: "PUBLISHED",
        deletedAt: null,
        skill: { code: lesson.skillCode },
      },
    },
    select: {
      id: true,
      config: true,
      contents: {
        select: {
          contentVersion: {
            select: {
              id: true,
              status: true,
              content: { select: { status: true, deletedAt: true } },
              metadata: true,
            },
          },
        },
      },
      questions: {
        select: {
          questionVersion: {
            select: {
              id: true,
              status: true,
              contentVersionId: true,
              question: {
                select: {
                  status: true,
                  deletedAt: true,
                  type: true,
                  skill: { select: { code: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const matches = candidates.filter((candidate) => {
    const resolved = resolveTrainingRuntimeConfig("TRAINING", candidate.config);
    if (resolved.status !== "READY") return false;
    const config = resolved.config;
    if (
      config.family !== lesson.practiceBinding.family ||
      config.competency !== lesson.skillCode ||
      config.interactionType !== "MULTIPLE_CHOICE" ||
      config.rendererKey !== lesson.practiceBinding.rendererKey ||
      !["FOUNDATION", "DEVELOPING"].includes(config.difficulty) ||
      config.contentRequirement !== "REQUIRED" ||
      config.questionRequirement !== "REQUIRED"
    ) {
      return false;
    }
    const contentIds = new Set(
      candidate.contents
        .filter(
          (entry) =>
            entry.contentVersion.status === "PUBLISHED" &&
            entry.contentVersion.content.status === "PUBLISHED" &&
            entry.contentVersion.content.deletedAt === null,
        )
        .map((entry) => entry.contentVersion.id),
    );
    const hasSkillLessonContent = candidate.contents.some((entry) => {
      const metadata = parseLessonMetadata(entry.contentVersion.metadata);
      return metadata?.skillCode === lesson.skillCode;
    });
    const academicStages = new Set(
      candidate.contents.flatMap((entry) => {
        const metadata = parseLessonMetadata(entry.contentVersion.metadata);
        return metadata?.contractVersion === 2 &&
          metadata.skillCode === lesson.skillCode &&
          metadata.area === lesson.area &&
          metadata.stage
          ? [metadata.stage]
          : [];
      }),
    );
    const hasCompleteAcademicLessonContent = lesson.stages.every((stage) =>
      academicStages.has(stage.stage),
    );
    return (
      contentIds.size > 0 &&
      hasSkillLessonContent &&
      hasCompleteAcademicLessonContent &&
      candidate.questions.length > 0 &&
      candidate.questions.every(
        (entry) =>
          entry.questionVersion.status === "PUBLISHED" &&
          entry.questionVersion.question.status === "PUBLISHED" &&
          entry.questionVersion.question.deletedAt === null &&
          entry.questionVersion.question.type === "MULTIPLE_CHOICE" &&
          entry.questionVersion.question.skill?.code === lesson.skillCode &&
          (entry.questionVersion.contentVersionId === null ||
            contentIds.has(entry.questionVersion.contentVersionId)),
      )
    );
  });
  if (matches.length !== 1) {
    fail(
      `${lesson.skillCode} için tam bir yayınlanmış exercise graph gerekli (bulunan: ${matches.length})`,
    );
  }
  return { id: matches[0]!.id, config: matches[0]!.config };
}

async function assertPublishedTemplateGraph(
  tx: Prisma.TransactionClient,
  id: string,
  expectedConfig?: Pick<TrainingExerciseVersionConfig, "family" | "competency" | "difficulty">,
): Promise<void> {
  const version = await tx.exerciseTemplateVersion.findUnique({
    where: { id },
    select: {
      status: true,
      config: true,
      template: { select: { status: true, deletedAt: true } },
      contents: {
        select: {
          contentVersion: {
            select: { status: true, content: { select: { status: true, deletedAt: true } } },
          },
        },
      },
      questions: {
        select: {
          questionVersion: {
            select: { status: true, question: { select: { status: true, deletedAt: true } } },
          },
        },
      },
    },
  });
  if (
    !version ||
    version.status !== "PUBLISHED" ||
    version.template.status !== "PUBLISHED" ||
    version.template.deletedAt !== null ||
    version.contents.length === 0 ||
    version.questions.length === 0 ||
    version.contents.some(
      (entry) =>
        entry.contentVersion.status !== "PUBLISHED" ||
        entry.contentVersion.content.status !== "PUBLISHED" ||
        entry.contentVersion.content.deletedAt !== null,
    ) ||
    version.questions.some(
      (entry) =>
        entry.questionVersion.status !== "PUBLISHED" ||
        entry.questionVersion.question.status !== "PUBLISHED" ||
        entry.questionVersion.question.deletedAt !== null,
    )
  ) {
    fail(`yayınlanmış exercise graph doğrulanamadı: ${id}`);
  }
  if (expectedConfig) {
    const resolved = resolveTrainingRuntimeConfig("TRAINING", version.config);
    if (
      resolved.status !== "READY" ||
      resolved.config.family !== expectedConfig.family ||
      resolved.config.competency !== expectedConfig.competency ||
      resolved.config.difficulty !== expectedConfig.difficulty
    ) {
      fail(`exercise graph beklenen Eğitim V2 sözleşmesiyle eşleşmiyor: ${id}`);
    }
  }
}

async function ensurePath(
  tx: Prisma.TransactionClient,
  spec: {
    code: string;
    title: string;
    area: "FAST_READING" | "READING_COMPREHENSION" | "COMMON";
    levelId: string;
  },
  apply: boolean,
): Promise<string> {
  const existing = await tx.learningPath.findUnique({
    where: { code_version: { code: spec.code, version: PATH_VERSION } },
  });
  if (existing) {
    if (
      existing.title !== spec.title ||
      existing.area !== spec.area ||
      existing.levelId !== spec.levelId ||
      existing.status !== "PUBLISHED"
    ) {
      fail(`mevcut LearningPath çakışıyor: ${spec.code}`);
    }
    return existing.id;
  }
  if (!apply) return `dry-run:path:${spec.code}`;
  const created = await tx.learningPath.create({
    data: {
      code: spec.code,
      title: spec.title,
      area: spec.area,
      levelId: spec.levelId,
      version: PATH_VERSION,
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  return created.id;
}

async function ensureUnit(
  tx: Prisma.TransactionClient,
  pathId: string,
  code: string,
  title: string,
  displayOrder: number,
  apply: boolean,
): Promise<string> {
  const existing = await tx.learningUnit.findUnique({
    where: { pathId_code: { pathId, code } },
  });
  if (existing) {
    if (existing.title !== title || existing.position !== displayOrder)
      fail(`mevcut LearningUnit çakışıyor: ${code}`);
    return existing.id;
  }
  if (!apply) return `dry-run:unit:${pathId}:${code}`;
  const created = await tx.learningUnit.create({
    data: { pathId, code, title, position: displayOrder, status: "PUBLISHED" },
    select: { id: true },
  });
  return created.id;
}

async function ensureStep(
  tx: Prisma.TransactionClient,
  unitId: string,
  step: ProvisionStep,
  apply: boolean,
): Promise<string> {
  const existing = await tx.learningStep.findUnique({
    where: { unitId_stableKey: { unitId, stableKey: step.code } },
    select: {
      id: true,
      title: true,
      type: true,
      position: true,
      skillId: true,
      contentVersionId: true,
      exerciseTemplateVersionId: true,
      assessmentId: true,
      completionRule: true,
      metadata: true,
    },
  });
  const immutable = {
    title: step.title,
    type: step.type,
    position: step.displayOrder,
    skillId: step.skillId ?? null,
    contentVersionId: step.contentVersionId ?? null,
    exerciseTemplateVersionId: step.templateVersionId ?? null,
    assessmentId: step.assessmentId ?? null,
    completionRule: {
      ...(step.completionRule &&
      typeof step.completionRule === "object" &&
      !Array.isArray(step.completionRule)
        ? step.completionRule
        : {}),
      prerequisiteStepIds: step.prerequisiteStepIds,
    },
    metadata: step.metadata ?? null,
  };
  if (existing) {
    const { id, ...existingValues } = existing;
    if (!isDeepStrictEqual(existingValues, immutable))
      fail(`mevcut LearningStep çakışıyor: ${step.code}`);
    return id;
  }
  if (!apply) return `dry-run:step:${unitId}:${step.code}`;
  const created = await tx.learningStep.create({
    data: { unitId, stableKey: step.code, ...immutable },
    select: { id: true },
  });
  return created.id;
}

async function main(): Promise<void> {
  const target = assertTarget();
  const prisma = new PrismaClient({
    datasources: { db: { url: target.url } },
    transactionOptions: { maxWait: 20_000, timeout: 120_000 },
  });
  try {
    await assertProvisioningTarget(prisma, target.url, target.approvedFingerprint);
    const result = await withPlatformContext(prisma, async (tx) => {
      const level = await tx.level.findUnique({
        where: { code: target.levelCode },
        select: { id: true, code: true },
      });
      if (!level) fail(`Level bulunamadı: ${target.levelCode}`);
      const skills = await tx.skill.findMany({
        where: {
          code: { in: ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes as unknown as string[] },
        },
        select: { id: true, code: true },
      });
      const skillByCode = new Map(skills.map((skill) => [skill.code, skill.id]));
      for (const code of ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes) {
        if (!skillByCode.has(code)) fail(`Skill bulunamadı: ${code}`);
      }

      const contentBySkillStage = new Map<
        string,
        { id: string; exerciseTemplateVersionId: string }
      >();
      const templateBySkill = new Map<string, string>();
      for (const lesson of ACADEMIC_P0_LESSONS) {
        for (const stage of lesson.stages) {
          contentBySkillStage.set(
            `${lesson.skillCode}:${stage.stage}`,
            await findPublishedLessonContent(tx, lesson, stage.stage),
          );
        }
        const template = await findPublishedTemplate(tx, lesson);
        templateBySkill.set(lesson.skillCode, template.id);
        for (const stage of lesson.stages) {
          const content = contentBySkillStage.get(`${lesson.skillCode}:${stage.stage}`)!;
          if (content.exerciseTemplateVersionId !== template.id) {
            fail(
              `${lesson.skillCode}/${stage.stage} içerik sürümü gerçek published template version ile bağlı değil`,
            );
          }
        }
      }

      const reinforcementTemplateId = requiredEnv(
        "EDUCATION_V2_COMMON_REINFORCEMENT_TEMPLATE_VERSION_ID",
      );
      const assessmentId = requiredEnv("EDUCATION_V2_COMMON_ASSESSMENT_ID");
      await assertPublishedTemplateGraph(
        tx,
        reinforcementTemplateId,
        getProgramExercise("common-reinforcement").contract,
      );
      const assessment = await tx.assessment.findUnique({
        where: { id: assessmentId },
        select: { status: true, deletedAt: true, config: true },
      });
      if (!assessment || assessment.status !== "PUBLISHED" || assessment.deletedAt !== null)
        fail("ortak değerlendirme yayınlanmış değil");
      const assessmentConfig = objectValue(assessment.config);
      const assessmentTemplateId =
        typeof assessmentConfig?.templateVersionId === "string"
          ? assessmentConfig.templateVersionId
          : null;
      if (!assessmentTemplateId) fail("ortak değerlendirme templateVersionId içermiyor");
      await assertPublishedTemplateGraph(
        tx,
        assessmentTemplateId,
        getProgramExercise("common-test").contract,
      );

      const paths = [
        {
          code: `EDUCATION_V2_P0_FAST_READING_${level.code}`,
          title: "Eğitim V2 P0 · Hızlı Okuma",
          area: "FAST_READING" as const,
        },
        {
          code: `EDUCATION_V2_P0_READING_COMPREHENSION_${level.code}`,
          title: "Eğitim V2 P0 · Okuduğunu Anlama",
          area: "READING_COMPREHENSION" as const,
        },
        {
          code: `EDUCATION_V2_P0_COMMON_${level.code}`,
          title: "Eğitim V2 P0 · Ortak Öğrenme",
          area: "COMMON" as const,
        },
      ];
      const pathIds = new Map(paths.map((path) => [path.area, path.code]));
      const ids = new Map<string, string>();
      const created = { paths: 0, units: 0, steps: 0 };

      for (const path of paths) {
        const before = await tx.learningPath.findUnique({
          where: { code_version: { code: path.code, version: PATH_VERSION } },
          select: { id: true },
        });
        const pathId = await ensurePath(tx, { ...path, levelId: level.id }, target.apply);
        if (!before) created.paths += 1;
        pathIds.set(path.area, pathId);
        const unitCode = path.area === "COMMON" ? "COMMON_FOUNDATION" : `${path.area}_FOUNDATION`;
        const unitTitle =
          path.area === "COMMON"
            ? "Pekiştirme ve değerlendirme"
            : path.area === "FAST_READING"
              ? "Hızlı okuma temeli"
              : "Okuduğunu anlama temeli";
        const beforeUnit = await tx.learningUnit.findUnique({
          where: { pathId_code: { pathId, code: unitCode } },
          select: { id: true },
        });
        const unitId = await ensureUnit(tx, pathId, unitCode, unitTitle, 1, target.apply);
        if (!beforeUnit) created.units += 1;
        ids.set(`${path.area}:unit`, unitId);
      }

      for (const lesson of ACADEMIC_P0_LESSONS) {
        const unitId = ids.get(`${lesson.area}:unit`)!;
        const stageIds: string[] = [];
        const lessonIndex = ACADEMIC_P0_LESSONS.filter(
          (candidate) => candidate.area === lesson.area,
        ).findIndex((candidate) => candidate.lessonKey === lesson.lessonKey);
        for (const [displayOrder, stage] of lesson.stages.entries()) {
          const step: ProvisionStep = {
            code: `${lesson.skillCode}_${stage.stage}`,
            title: stage.title,
            type: stage.stage,
            displayOrder: lessonIndex * lesson.stages.length + displayOrder + 1,
            skillId: skillByCode.get(lesson.skillCode),
            contentVersionId:
              stage.stage === "PRACTICE"
                ? undefined
                : contentBySkillStage.get(`${lesson.skillCode}:${stage.stage}`)?.id,
            templateVersionId:
              stage.stage === "PRACTICE" ? templateBySkill.get(lesson.skillCode) : undefined,
            prerequisiteStepIds: stageIds.slice(-1),
            metadata: {
              source: "ACADEMIC_READING_P0",
              area: lesson.area,
              skillCode: lesson.skillCode,
              stage: stage.stage,
            },
          };
          const before = await tx.learningStep.findUnique({
            where: { unitId_stableKey: { unitId, stableKey: step.code } },
            select: { id: true },
          });
          const id = await ensureStep(tx, unitId, step, target.apply);
          if (!before) created.steps += 1;
          stageIds.push(id);
          ids.set(`${lesson.area}:${lesson.skillCode}_${stage.stage}`, id);
        }
      }

      const commonUnitId = ids.get("COMMON:unit")!;
      const practiceStepIds = ACADEMIC_P0_LESSONS.map((lesson) =>
        ids.get(`${lesson.area}:${lesson.skillCode}_PRACTICE`),
      );
      if (practiceStepIds.some((id) => !id))
        fail("ortak pekiştirme için 6 uygulama adımı hazırlanamadı");
      const reinforcement = await ensureStep(
        tx,
        commonUnitId,
        {
          code: "COMMON_REINFORCEMENT",
          title: "Ortak pekiştirme",
          type: "REINFORCEMENT",
          displayOrder: 1,
          templateVersionId: reinforcementTemplateId,
          prerequisiteStepIds: practiceStepIds as string[],
          metadata: { source: "ACADEMIC_READING_P0", area: "COMMON", stage: "REINFORCEMENT" },
        },
        target.apply,
      );
      const assessmentStep = await ensureStep(
        tx,
        commonUnitId,
        {
          code: "COMMON_ASSESSMENT",
          title: "Ortak değerlendirme",
          type: "ASSESSMENT",
          displayOrder: 2,
          assessmentId,
          prerequisiteStepIds: [reinforcement],
          completionRule: { kind: "ASSESSMENT_RESULT", minimumScore: ASSESSMENT_MINIMUM_SCORE },
          metadata: { source: "ACADEMIC_READING_P0", area: "COMMON", stage: "ASSESSMENT" },
        },
        target.apply,
      );
      const measurement = await ensureStep(
        tx,
        commonUnitId,
        {
          code: "COMMON_MEASUREMENT",
          title: "Başarı ölçümü",
          type: "MEASUREMENT",
          displayOrder: 3,
          prerequisiteStepIds: [assessmentStep],
          completionRule: { kind: "ASSESSMENT_RESULT", minimumScore: ASSESSMENT_MINIMUM_SCORE },
          metadata: { source: "ACADEMIC_READING_P0", area: "COMMON", stage: "MEASUREMENT" },
        },
        target.apply,
      );
      await ensureStep(
        tx,
        commonUnitId,
        {
          code: "COMMON_NEXT_LEARNING",
          title: "Sonraki öğrenme",
          type: "NEXT_LEARNING",
          displayOrder: 4,
          prerequisiteStepIds: [measurement],
          metadata: { source: "ACADEMIC_READING_P0", area: "COMMON", stage: "NEXT_LEARNING" },
        },
        target.apply,
      );
      return { levelCode: level.code, created, mode: target.apply ? "APPLY" : "DRY_RUN" };
    });
    console.log(JSON.stringify({ status: "PASS", ...result, dbChanged: target.apply }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    `education-v2-p0 provisioning FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
