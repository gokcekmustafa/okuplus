import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  ACADEMIC_P0_LESSONS,
  type AcademicLesson,
  type AcademicLessonStage,
} from "../src/curriculum/academic-reading-p0.js";
import {
  EDUCATION_V2_P0_PROGRAM,
  EDUCATION_V2_P0_PROGRAM_ID,
  getProgramIds,
  templateVersionId,
  type ProgramExercise,
} from "../src/curriculum/education-v2-p0-program.js";
import { lessonMetadataSchema } from "../src/modules/lessons/contract.js";
import { resolveTrainingRuntimeConfig } from "../src/modules/training/exercise-contract.js";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") || args.has("--dry-run");
const ENVIRONMENT = "EDUCATION_V2_P0_ENVIRONMENT";
const DATABASE_URL = "EDUCATION_V2_P0_DATABASE_URL";
const PRODUCTION_DATABASE_URL = "EDUCATION_V2_P0_PRODUCTION_DATABASE_URL";
const PRODUCTION_DATABASE_NAME = "EDUCATION_V2_P0_PRODUCTION_DATABASE_NAME";
const PRODUCTION_DATABASE_HOST = "EDUCATION_V2_P0_PRODUCTION_DATABASE_HOST";
const PRODUCTION_RELEASE_ID = "EDUCATION_V2_P0_PRODUCTION_RELEASE_ID";
const PRODUCTION_APPROVAL = "EDUCATION_V2_P0_PRODUCTION_APPROVAL";
const LEVEL_CODE = "EDUCATION_V2_P0_LEVEL_CODE";
const APPROVED_DATABASE_URL = "DB_FINGERPRINT_DATABASE_URL";
const APPROVED_FINGERPRINT = "EDUCATION_V2_P0_APPROVED_TARGET_FINGERPRINT";
const WRITE_CONFIRMATION = "I_HAVE_REVIEWED_EDUCATION_V2_P0";
const PRODUCTION_WRITE_CONFIRMATION =
  "I_HAVE_REVIEWED_EDUCATION_V2_P0_PRODUCTION_EDITORIAL_RELEASE";

type TargetEnvironment = "STAGING" | "PRODUCTION";

type Target = CatalogTarget;

type DbIdentity = {
  database: string;
  db_user: string;
  host: string | null;
  port: number | null;
};

type LessonPlan = {
  lesson: AcademicLesson;
  stage: AcademicLessonStage;
  exercise: ProgramExercise;
  templateVersionId: string;
  contentId: string;
  contentVersionId: string;
  title: string;
  body: string;
  difficulty: number;
  metadata: Prisma.InputJsonValue;
};

type BaseTemplateGraph = {
  templateId: string;
  config: Prisma.JsonValue | null;
  contents: Array<{ contentVersionId: string; position: number }>;
  questions: Array<{ questionVersionId: string; questionId: string; position: number }>;
};

function fail(message: string): never {
  throw new Error(`Eğitim V2 P0 ders seed'i reddedildi: ${message}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function wordCount(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

function readTarget(): { target: Target; approvedTarget: Target; fingerprint: string } | null {
  const environment = process.env[ENVIRONMENT]?.trim().toUpperCase();
  if (dryRun && !process.env[DATABASE_URL]?.trim() && environment !== "PRODUCTION") return null;
  if (environment !== "STAGING" && environment !== "PRODUCTION") {
    fail(`${ENVIRONMENT}=STAGING veya PRODUCTION gerekli`);
  }
  required(LEVEL_CODE);

  const target = parseCatalogTargetUrl(
    required(environment === "PRODUCTION" ? PRODUCTION_DATABASE_URL : DATABASE_URL),
    environment as TargetEnvironment,
  );
  const approvedTarget = parseCatalogTargetUrl(
    required(APPROVED_DATABASE_URL),
    environment as TargetEnvironment,
  );
  const fingerprint = required(APPROVED_FINGERPRINT);
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  assertCatalogEnvironmentSafety(approvedTarget, { rejectTestDatabase: true });
  if (
    environment === "STAGING" &&
    (target.provider !== "NEON" || approvedTarget.provider !== "NEON")
  )
    fail("staging hedefi Neon olmalı");
  if (target.provider !== approvedTarget.provider) {
    fail("hedef ve kontrol bağlantıları aynı sağlayıcıya ait olmalı");
  }
  if (environment === "PRODUCTION") {
    const expectedDatabase = required(PRODUCTION_DATABASE_NAME);
    const expectedHost = required(PRODUCTION_DATABASE_HOST).toLowerCase().replace(/\.$/u, "");
    required(PRODUCTION_RELEASE_ID);
    if (target.database !== expectedDatabase)
      fail("production database beklenen kimlikle eşleşmiyor");
    if (target.host !== expectedHost) fail("production database host beklenen kimlikle eşleşmiyor");
    if (!dryRun && process.env[PRODUCTION_APPROVAL] !== PRODUCTION_WRITE_CONFIRMATION) {
      fail(
        `production yayın onayı için ${PRODUCTION_APPROVAL}=${PRODUCTION_WRITE_CONFIRMATION} gerekli`,
      );
    }
  } else if (!dryRun && process.env.EDUCATION_V2_P0_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    fail(`yazma onayı için EDUCATION_V2_P0_ALLOW_WRITE=${WRITE_CONFIRMATION} gerekli`);
  }
  return { target, approvedTarget, fingerprint };
}

async function readIdentity(prisma: PrismaClient): Promise<DbIdentity> {
  const rows = await prisma.$queryRaw<DbIdentity[]>`
    SELECT
      current_database() AS database,
      current_user AS db_user,
      inet_server_addr()::text AS host,
      inet_server_port() AS port
  `;
  const identity = rows[0];
  if (!identity) fail("database kimliği okunamadı");
  return identity;
}

async function verifyTarget(
  prisma: PrismaClient,
  approvedPrisma: PrismaClient,
  target: Target,
  approvedTarget: Target,
  fingerprint: string,
): Promise<DbIdentity> {
  const identity = await readIdentity(prisma);
  assertLiveCatalogTargetIdentity(target, identity);
  const approvedIdentity = await readIdentity(approvedPrisma);
  assertLiveCatalogTargetIdentity(approvedTarget, approvedIdentity);
  assertApprovedTargetFingerprint(approvedTarget, approvedIdentity, fingerprint);
  if (target.host !== approvedTarget.host || target.database !== approvedTarget.database) {
    fail("staging hedefi onaylı fingerprint hedefiyle eşleşmiyor");
  }
  return identity;
}

function exerciseForLesson(lesson: AcademicLesson): ProgramExercise {
  const candidates = EDUCATION_V2_P0_PROGRAM.exercises.filter(
    (exercise) => exercise.skillCode === lesson.skillCode && !exercise.key.startsWith("common-"),
  );
  if (candidates.length !== 1) {
    fail(`${lesson.skillCode} için tekil P0 practice exercise bulunamadı`);
  }
  return candidates[0]!;
}

function lessonPlans(): LessonPlan[] {
  return ACADEMIC_P0_LESSONS.flatMap((lesson) => {
    const exercise = exerciseForLesson(lesson);
    const practiceTemplateVersionId = getProgramIds(
      "templateVersion",
      `${exercise.key}-academic-v2`,
    );
    return lesson.stages.map((stage, stageIndex) => {
      const stageKey = `${lesson.lessonKey}-${stage.stage.toLowerCase()}`;
      const title = `${lesson.title} · ${stage.title}`;
      const body = [
        stage.title,
        stage.instruction,
        `Gözlemlenebilir çalışma: ${stage.observableAction}`,
        `Geri bildirim: ${stage.feedback}`,
        `Yeniden öğretim ipucu: ${lesson.reteach}`,
      ].join("\n\n");
      const metadata = lessonMetadataSchema.parse({
        lessonType: "LEARNING_LESSON",
        contractVersion: 2,
        skillCode: lesson.skillCode,
        objective: lesson.objective,
        explanation: stage.instruction,
        workedExample: stage.observableAction,
        guidedPractice: stage.feedback,
        exerciseTemplateVersionId: practiceTemplateVersionId,
        completionLabel: "Dersi tamamladım",
        area: lesson.area,
        stage: stage.stage,
        observableOutcome: stage.observableAction,
        modeledThinking: stage.instruction,
        misconception: lesson.misconception,
        correctFeedback: lesson.correctFeedback,
        incorrectFeedback: lesson.incorrectFeedback,
        independentApplication: lesson.transferTask,
        feedback: stage.feedback,
        reteach: lesson.reteach,
        transferTask: lesson.transferTask,
        completionCondition: lesson.completionCondition,
        measurementSignals: lesson.measurementSignals,
        successIndicators: lesson.successIndicators,
        academicSources: lesson.sources,
      });
      return {
        lesson,
        stage,
        exercise,
        templateVersionId: practiceTemplateVersionId,
        contentId: getProgramIds("content", `academic-${stageKey}`),
        contentVersionId: getProgramIds("contentVersion", `academic-${stageKey}-v1`),
        title,
        body,
        difficulty: stageIndex === 0 ? 1 : stageIndex === 1 ? 1.5 : 2,
        metadata: metadata as Prisma.InputJsonValue,
      };
    });
  });
}

async function applyPlatformContext(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
  await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p0-lesson-seed', true)`;
}

function graphContractMatches(lesson: AcademicLesson, config: Prisma.JsonValue | null): boolean {
  const resolved = resolveTrainingRuntimeConfig("TRAINING", config);
  if (resolved.status !== "READY") return false;
  return (
    resolved.config.family === lesson.practiceBinding.family &&
    resolved.config.competency === lesson.skillCode &&
    resolved.config.interactionType === "MULTIPLE_CHOICE" &&
    resolved.config.rendererKey === lesson.practiceBinding.rendererKey &&
    ["FOUNDATION", "DEVELOPING"].includes(resolved.config.difficulty) &&
    resolved.config.contentRequirement === "REQUIRED" &&
    resolved.config.questionRequirement === "REQUIRED"
  );
}

async function readBaseGraph(
  tx: Prisma.TransactionClient,
  plan: LessonPlan,
): Promise<BaseTemplateGraph> {
  const version = await tx.exerciseTemplateVersion.findUnique({
    where: { id: templateVersionId(plan.exercise.key) },
    select: {
      templateId: true,
      config: true,
      status: true,
      template: { select: { status: true, deletedAt: true } },
      contents: { select: { contentVersionId: true, position: true } },
      questions: { select: { questionVersionId: true, questionId: true, position: true } },
    },
  });
  if (
    !version ||
    version.status !== "PUBLISHED" ||
    version.template.status !== "PUBLISHED" ||
    version.template.deletedAt !== null ||
    !graphContractMatches(plan.lesson, version.config) ||
    version.contents.length === 0 ||
    version.questions.length === 0
  ) {
    fail(`gerçek published practice graph bulunamadı: ${plan.lesson.skillCode}`);
  }
  return version;
}

async function ensureLessonContent(
  tx: Prisma.TransactionClient,
  plan: LessonPlan,
  skillId: string,
  publishedAt: Date,
): Promise<"CREATED" | "EXISTING"> {
  const existing = await tx.contentVersion.findUnique({
    where: { id: plan.contentVersionId },
    select: {
      status: true,
      publishedAt: true,
      metadata: true,
      content: { select: { status: true } },
    },
  });
  if (existing) {
    const metadata = lessonMetadataSchema.safeParse(existing.metadata);
    if (
      existing.status !== "PUBLISHED" ||
      existing.content.status !== "PUBLISHED" ||
      !metadata.success ||
      metadata.data.skillCode !== plan.lesson.skillCode ||
      metadata.data.stage !== plan.stage.stage ||
      metadata.data.exerciseTemplateVersionId !== plan.templateVersionId
    ) {
      fail(
        `mevcut ders sürümü beklenen yayımlanmış sözleşmeyle eşleşmiyor: ${plan.contentVersionId}`,
      );
    }
    return "EXISTING";
  }

  await tx.content.create({
    data: {
      id: plan.contentId,
      tenantId: null,
      type: "PASSAGE",
      title: plan.title,
      difficulty: plan.difficulty,
      status: "DRAFT",
      metadata: {
        programId: EDUCATION_V2_P0_PROGRAM_ID,
        contentKey: plan.contentId,
        lessonType: "LEARNING_LESSON",
        area: plan.lesson.area,
        stage: plan.stage.stage,
      },
    },
  });
  await tx.contentVersion.create({
    data: {
      id: plan.contentVersionId,
      contentId: plan.contentId,
      version: 1,
      title: plan.title,
      body: plan.body,
      wordCount: wordCount(plan.body),
      license: "Özgün OKU+ eğitim içeriği; akademik katalogla eşleştirilmiştir.",
      changelog: `${EDUCATION_V2_P0_PROGRAM_ID}; academic lesson=${plan.lesson.lessonKey}; stage=${plan.stage.stage}`,
      metadata: plan.metadata,
      status: "DRAFT",
    },
  });
  await tx.contentSkill.create({ data: { contentId: plan.contentId, skillId } });
  await tx.contentVersion.update({
    where: { id: plan.contentVersionId },
    data: { status: "PUBLISHED", publishedAt },
  });
  await tx.content.update({
    where: { id: plan.contentId },
    data: { currentVersionId: plan.contentVersionId, status: "PUBLISHED" },
  });
  return "CREATED";
}

async function ensureAcademicTemplateVersion(
  tx: Prisma.TransactionClient,
  plan: LessonPlan,
  base: BaseTemplateGraph,
  lessonContentVersions: LessonPlan[],
  publishedAt: Date,
): Promise<"CREATED" | "EXISTING"> {
  const existing = await tx.exerciseTemplateVersion.findUnique({
    where: { id: plan.templateVersionId },
    select: {
      status: true,
      templateId: true,
      contents: { select: { contentVersionId: true } },
      questions: { select: { questionVersionId: true } },
    },
  });
  const expectedContentIds = new Set([
    ...base.contents.map((entry) => entry.contentVersionId),
    ...lessonContentVersions.map((entry) => entry.contentVersionId),
  ]);
  const expectedQuestionIds = new Set(base.questions.map((entry) => entry.questionVersionId));
  if (existing) {
    const contentIds = new Set(existing.contents.map((entry) => entry.contentVersionId));
    const questionIds = new Set(existing.questions.map((entry) => entry.questionVersionId));
    if (
      existing.status !== "PUBLISHED" ||
      existing.templateId !== base.templateId ||
      expectedContentIds.size !== contentIds.size ||
      [...expectedContentIds].some((id) => !contentIds.has(id)) ||
      expectedQuestionIds.size !== questionIds.size ||
      [...expectedQuestionIds].some((id) => !questionIds.has(id))
    ) {
      fail(`mevcut academic practice template version uyumsuz: ${plan.templateVersionId}`);
    }
    return "EXISTING";
  }

  const latest = await tx.exerciseTemplateVersion.findFirst({
    where: { templateId: base.templateId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await tx.exerciseTemplateVersion.create({
    data: {
      id: plan.templateVersionId,
      templateId: base.templateId,
      version: (latest?.version ?? 0) + 1,
      config: base.config ?? undefined,
      status: "DRAFT",
    },
  });
  await tx.exerciseTemplateVersionContent.createMany({
    data: [
      ...base.contents,
      ...lessonContentVersions.map((entry, index) => ({
        contentVersionId: entry.contentVersionId,
        position: base.contents.length + index,
      })),
    ].map((entry) => ({ ...entry, templateVersionId: plan.templateVersionId })),
  });
  await tx.exerciseTemplateVersionQuestion.createMany({
    data: base.questions.map((entry) => ({
      templateVersionId: plan.templateVersionId,
      questionVersionId: entry.questionVersionId,
      questionId: entry.questionId,
      position: entry.position,
    })),
  });
  await tx.exerciseTemplateVersion.update({
    where: { id: plan.templateVersionId },
    data: { status: "PUBLISHED", publishedAt },
  });
  return "CREATED";
}

function safeSummary(
  identity: DbIdentity | null,
  environment: TargetEnvironment = "STAGING",
): Record<string, string> {
  return identity
    ? { environment, database: identity.database, user: identity.db_user }
    : { environment: "MANIFEST_ONLY", database: "NOT_CONNECTED", user: "NOT_CONNECTED" };
}

async function main(): Promise<void> {
  const plans = lessonPlans();
  const targetInfo = readTarget();
  if (!targetInfo) {
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "MANIFEST_ONLY_DRY_RUN",
          lessonContentCount: plans.length,
          skills: [...new Set(plans.map((plan) => plan.lesson.skillCode))],
          databaseAction: "NOT_RUN",
          target: safeSummary(null),
        },
        null,
        2,
      ),
    );
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: targetInfo.target.url } },
    transactionOptions: { maxWait: 20_000, timeout: 120_000 },
  });
  const approvedPrisma = new PrismaClient({
    datasources: { db: { url: targetInfo.approvedTarget.url } },
  });
  try {
    await prisma.$connect();
    await approvedPrisma.$connect();
    const identity = await verifyTarget(
      prisma,
      approvedPrisma,
      targetInfo.target,
      targetInfo.approvedTarget,
      targetInfo.fingerprint,
    );
    const result = await prisma.$transaction(async (tx) => {
      await applyPlatformContext(tx);
      const skills = await tx.skill.findMany({
        where: { code: { in: [...new Set(plans.map((plan) => plan.lesson.skillCode))] } },
        select: { id: true, code: true },
      });
      const skillIds = new Map(skills.map((skill) => [skill.code, skill.id]));
      for (const plan of plans) {
        if (!skillIds.has(plan.lesson.skillCode))
          fail(`Skill bulunamadı: ${plan.lesson.skillCode}`);
      }

      const plansBySkill = new Map<string, LessonPlan[]>();
      for (const plan of plans) {
        const list = plansBySkill.get(plan.lesson.skillCode) ?? [];
        list.push(plan);
        plansBySkill.set(plan.lesson.skillCode, list);
      }
      const counts = {
        contentCreated: 0,
        contentExisting: 0,
        templatesCreated: 0,
        templatesExisting: 0,
      };
      const publishedAt = new Date();
      if (dryRun) {
        for (const skillPlans of plansBySkill.values()) await readBaseGraph(tx, skillPlans[0]!);
        return {
          ...counts,
          mode: "DRY_RUN" as const,
          expectedLessonContentCount: plans.length,
          expectedTemplateVersionCount: plansBySkill.size,
        };
      }
      for (const skillPlans of plansBySkill.values()) {
        const representative = skillPlans[0]!;
        const base = await readBaseGraph(tx, representative);
        for (const plan of skillPlans) {
          const state = await ensureLessonContent(
            tx,
            plan,
            skillIds.get(plan.lesson.skillCode)!,
            publishedAt,
          );
          if (state === "CREATED") counts.contentCreated += 1;
          else counts.contentExisting += 1;
        }
        const templateState = await ensureAcademicTemplateVersion(
          tx,
          representative,
          base,
          skillPlans,
          publishedAt,
        );
        if (templateState === "CREATED") counts.templatesCreated += 1;
        else counts.templatesExisting += 1;
      }
      return { ...counts, mode: "APPLY" as const };
    });
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          ...result,
          lessonContentCount: plans.length,
          target: safeSummary(identity, targetInfo.target.environment),
          dbChanged: !dryRun,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await approvedPrisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    `Education V2 P0 lesson seed FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
