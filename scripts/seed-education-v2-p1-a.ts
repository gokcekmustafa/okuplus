import "dotenv/config";
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
  EDUCATION_V2_P1_A_PATH_VERSION,
  EDUCATION_V2_P1_A_PROGRAM,
  EDUCATION_V2_P1_A_PROGRAM_ID,
  p1AAssessmentId,
  p1AContentVersionId,
  p1AId,
  p1AQuestionId,
  p1AQuestionVersionId,
  p1AStepId,
  p1ATemplateId,
  p1ATemplateVersionId,
  p1AUnitId,
} from "../src/curriculum/education-v2-p1-a-program.js";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") || args.has("--dry-run");
const TARGET_ENV = "EDUCATION_V2_P1_A_ENVIRONMENT";
const DATABASE_ENV = "EDUCATION_V2_P1_A_DATABASE_URL";
const PRODUCTION_DATABASE_ENV = "EDUCATION_V2_P1_A_PRODUCTION_DATABASE_URL";
const PRODUCTION_DATABASE_NAME_ENV = "EDUCATION_V2_P1_A_PRODUCTION_DATABASE_NAME";
const PRODUCTION_DATABASE_HOST_ENV = "EDUCATION_V2_P1_A_PRODUCTION_DATABASE_HOST";
const PRODUCTION_RELEASE_ID_ENV = "EDUCATION_V2_P1_A_PRODUCTION_RELEASE_ID";
const PRODUCTION_APPROVAL_ENV = "EDUCATION_V2_P1_A_PRODUCTION_APPROVAL";
const APPROVED_FINGERPRINT_ENV = "EDUCATION_V2_P1_A_APPROVED_TARGET_FINGERPRINT";
const PRODUCTION_CONFIRMATION = "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_PRODUCTION_EDITORIAL_RELEASE";

type TargetEnvironment = "TEST" | "PRODUCTION";
type Target = CatalogTarget & { approvedTarget: CatalogTarget; approvedFingerprint: string };

type Plan = {
  content: (typeof EDUCATION_V2_P1_A_PROGRAM.content)[number];
  contentId: string;
  contentVersionId: string;
  skillId: string;
  exercise?: (typeof EDUCATION_V2_P1_A_PROGRAM.exercises)[number];
  exerciseTemplateId?: string;
  exerciseTemplateVersionId?: string;
  questions: Array<{
    id: string;
    versionId: string;
    question: (typeof EDUCATION_V2_P1_A_PROGRAM.exercises)[number]["questions"][number];
    position: number;
  }>;
};

type Identity = {
  database: string;
  db_user: string;
  host: string | null;
  port: number | null;
};

function fail(message: string): never {
  throw new Error(`Education V2 P1-A seed reddedildi: ${message}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function wordCount(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

function readTarget(): Target | null {
  const environment = process.env[TARGET_ENV]?.trim().toUpperCase();
  const rawUrl =
    process.env[environment === "PRODUCTION" ? PRODUCTION_DATABASE_ENV : DATABASE_ENV]?.trim();
  if (dryRun && !rawUrl && environment !== "PRODUCTION") return null;
  if (environment !== "TEST" && environment !== "PRODUCTION") {
    fail(`${TARGET_ENV}=TEST veya açıkça korunan PRODUCTION olmalı`);
  }
  if (!rawUrl)
    fail(`${environment === "PRODUCTION" ? PRODUCTION_DATABASE_ENV : DATABASE_ENV} gerekli`);

  const target = parseCatalogTargetUrl(rawUrl, environment as TargetEnvironment);
  const approvedUrl = required("DB_FINGERPRINT_DATABASE_URL");
  const approvedFingerprint = required(APPROVED_FINGERPRINT_ENV);
  const approvedTarget = parseCatalogTargetUrl(approvedUrl, environment as TargetEnvironment);
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  assertCatalogEnvironmentSafety(approvedTarget, { rejectTestDatabase: true });
  assertSameCatalogDatabaseTarget(approvedTarget, target);

  if (environment === "TEST" && target.database !== "oku_plus_test") {
    fail(`TEST hedefi oku_plus_test olmalı: ${target.database}`);
  }
  if (environment === "PRODUCTION") {
    const expectedDatabase = required(PRODUCTION_DATABASE_NAME_ENV);
    const expectedHost = required(PRODUCTION_DATABASE_HOST_ENV).toLowerCase().replace(/\.$/u, "");
    required(PRODUCTION_RELEASE_ID_ENV);
    if (target.database !== expectedDatabase || target.host !== expectedHost) {
      fail("production database kimliği beklenen hedefle eşleşmiyor");
    }
    if (!dryRun && process.env[PRODUCTION_APPROVAL_ENV] !== PRODUCTION_CONFIRMATION) {
      fail(`production editorial approval=${PRODUCTION_CONFIRMATION} gerekli`);
    }
  }
  if (!dryRun && !args.has("--apply")) fail("--apply veya --dry-run seçilmeli");
  return { ...target, approvedTarget, approvedFingerprint };
}

async function readIdentity(prisma: PrismaClient): Promise<Identity> {
  const rows = await prisma.$queryRaw<Identity[]>`
    SELECT current_database() AS database,
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
  target: Target,
  identity: Identity,
): Promise<void> {
  assertLiveCatalogTargetIdentity(target, identity);
  const approvedPrisma = new PrismaClient({
    datasources: { db: { url: target.approvedTarget.url } },
  });
  try {
    await approvedPrisma.$connect();
    const approvedIdentity = await readIdentity(approvedPrisma);
    assertLiveCatalogTargetIdentity(target.approvedTarget, approvedIdentity);
    assertApprovedTargetFingerprint(
      target.approvedTarget,
      approvedIdentity,
      target.approvedFingerprint,
    );
  } finally {
    await approvedPrisma.$disconnect();
  }
}

function planRecords(skills: Array<{ id: string; code: string }>): Plan[] {
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill.id]));
  return EDUCATION_V2_P1_A_PROGRAM.content.map((content) => {
    const skillId = skillByCode.get(content.skillCode);
    if (!skillId) fail(`gerekli mevcut skill bulunamadı: ${content.skillCode}`);
    const exercise = EDUCATION_V2_P1_A_PROGRAM.exercises.find(
      (candidate) => candidate.contentKey === content.key,
    );
    const questions = exercise
      ? exercise.questions.map((candidate, position) => ({
          id: p1AQuestionId(exercise.key, candidate.key),
          versionId: p1AQuestionVersionId(exercise.key, candidate.key),
          question: candidate,
          position,
        }))
      : [];
    return {
      content,
      contentId: p1AId("content", content.key),
      contentVersionId: p1AContentVersionId(content.key),
      skillId,
      exercise,
      exerciseTemplateId: exercise ? p1ATemplateId(exercise.key) : undefined,
      exerciseTemplateVersionId: exercise ? p1ATemplateVersionId(exercise.key) : undefined,
      questions,
    };
  });
}

function answerFor(question: Plan["questions"][number]["question"]): Prisma.InputJsonValue {
  return {
    type: "MULTIPLE_CHOICE",
    correctOptionIds: [question.correctOptionId],
    allowMultiple: false,
    partialCredit: false,
  };
}

function templateConfig(exercise: NonNullable<Plan["exercise"]>): Prisma.InputJsonValue {
  return {
    programId: EDUCATION_V2_P1_A_PROGRAM_ID,
    stableKey: `EDU-V2-P1-A-${exercise.key.toUpperCase().replaceAll("-", "_")}`,
    version: 1,
    competency: exercise.contract.competency,
    rendererKey: exercise.contract.rendererKey,
    contentKey: exercise.contentKey,
  };
}

function assessmentConfig(
  assessment: (typeof EDUCATION_V2_P1_A_PROGRAM.assessments)[number],
): Prisma.InputJsonValue {
  const exercise = EDUCATION_V2_P1_A_PROGRAM.exercises.find(
    (candidate) => candidate.key === assessment.templateExerciseKey,
  );
  if (!exercise) fail(`assessment template bulunamadı: ${assessment.key}`);
  return {
    programId: EDUCATION_V2_P1_A_PROGRAM_ID,
    templateId: p1ATemplateId(exercise.key),
    templateVersionId: p1ATemplateVersionId(exercise.key),
    questionCount: assessment.config.questionCount,
    minimumScorableCount: assessment.config.minimumScorableCount,
    minimumAnsweredCount: assessment.config.minimumAnsweredCount,
    completionMinimumScore: assessment.config.completionMinimumScore,
  };
}

async function graphState(
  tx: Prisma.TransactionClient,
  plans: Plan[],
): Promise<"MISSING" | "EXISTING" | "CONFLICT"> {
  const states = await Promise.all(
    plans.map(async (plan) => {
      const counts = await Promise.all([
        tx.content.count({ where: { id: plan.contentId } }),
        tx.contentVersion.count({ where: { id: plan.contentVersionId } }),
        plan.exerciseTemplateId
          ? tx.exerciseTemplate.count({ where: { id: plan.exerciseTemplateId } })
          : Promise.resolve(0),
        plan.exerciseTemplateVersionId
          ? tx.exerciseTemplateVersion.count({ where: { id: plan.exerciseTemplateVersionId } })
          : Promise.resolve(0),
        tx.question.count({ where: { id: { in: plan.questions.map((item) => item.id) } } }),
        tx.questionVersion.count({
          where: { id: { in: plan.questions.map((item) => item.versionId) } },
        }),
      ]);
      const expected = [
        1,
        1,
        plan.exerciseTemplateId ? 1 : 0,
        plan.exerciseTemplateVersionId ? 1 : 0,
        plan.questions.length,
        plan.questions.length,
      ];
      if (counts.every((count) => count === 0)) return "MISSING" as const;
      if (counts.every((count, index) => count === expected[index])) return "EXISTING" as const;
      return "CONFLICT" as const;
    }),
  );
  if (states.includes("CONFLICT")) return "CONFLICT";

  const assessmentStates = await Promise.all(
    EDUCATION_V2_P1_A_PROGRAM.assessments.map(async (assessment) =>
      (await tx.assessment.count({ where: { id: p1AAssessmentId(assessment.key) } })) === 0
        ? "MISSING"
        : "EXISTING",
    ),
  );
  if (assessmentStates.includes("MISSING") && assessmentStates.includes("EXISTING"))
    return "CONFLICT";

  const expectedPathIds = [
    p1AId("path", EDUCATION_V2_P1_A_PROGRAM.path.code),
    ...EDUCATION_V2_P1_A_PROGRAM.path.units.flatMap((unit) => [
      p1AUnitId(unit.code),
      ...unit.steps.map((step) => p1AStepId(step.key)),
    ]),
  ];
  const existingPathCount = await Promise.all([
    tx.learningPath.count({ where: { id: expectedPathIds[0] } }),
    tx.learningUnit.count({
      where: { id: { in: expectedPathIds.slice(1).filter((id) => id.includes("-unit-")) } },
    }),
    tx.learningStep.count({
      where: { id: { in: expectedPathIds.filter((id) => id.includes("-step-")) } },
    }),
  ]);
  const expectedPathCount =
    1 +
    EDUCATION_V2_P1_A_PROGRAM.path.units.length +
    EDUCATION_V2_P1_A_PROGRAM.path.units.reduce((sum, unit) => sum + unit.steps.length, 0);
  const actualPathCount = existingPathCount.reduce((sum, count) => sum + count, 0);
  if (actualPathCount > 0 && actualPathCount !== expectedPathCount) return "CONFLICT";
  if (states.includes("EXISTING") || assessmentStates.includes("EXISTING") || actualPathCount > 0) {
    if (states.includes("MISSING") || assessmentStates.includes("MISSING") || actualPathCount === 0)
      return "CONFLICT";
    return "EXISTING";
  }
  return "MISSING";
}

async function createContentGraph(tx: Prisma.TransactionClient, plans: Plan[]): Promise<void> {
  const publishedAt = new Date();

  for (const plan of plans) {
    const content = await tx.content.create({
      data: {
        id: plan.contentId,
        tenantId: null,
        type: "PASSAGE",
        title: plan.content.title,
        difficulty: plan.content.difficulty,
        status: "DRAFT",
        metadata: asJson({ programId: EDUCATION_V2_P1_A_PROGRAM_ID, contentKey: plan.content.key }),
      },
    });
    const version = await tx.contentVersion.create({
      data: {
        id: plan.contentVersionId,
        contentId: content.id,
        version: 1,
        title: plan.content.title,
        body: plan.content.body,
        wordCount: wordCount(plan.content.body),
        license: "Özgün OkuPratik eğitim içeriği.",
        changelog: `${EDUCATION_V2_P1_A_PROGRAM_ID}; contentKey=${plan.content.key}; yaş=${EDUCATION_V2_P1_A_PROGRAM.ageBand}`,
        metadata: asJson({
          programId: EDUCATION_V2_P1_A_PROGRAM_ID,
          lessonType: plan.content.lesson ? "LEARNING_LESSON" : "LEARNING_EXERCISE",
          skillCode: plan.content.skillCode,
          objective: plan.content.lesson?.objective ?? plan.content.body,
          explanation: plan.content.lesson?.explanation ?? plan.content.body,
          workedExample: plan.content.lesson?.workedExample ?? "Metindeki kanıtı soruyla eşleştir.",
          guidedPractice:
            plan.content.lesson?.guidedPractice ?? "Soruyu oku, metne dön ve kanıtı seç.",
          exerciseTemplateVersionId: plan.exerciseTemplateVersionId ?? null,
          completionLabel: "Dersi tamamladım",
          area: "READING_COMPREHENSION",
          routeFamily: "P1-A",
        }),
        status: "DRAFT",
      },
    });
    await tx.contentSkill.create({ data: { contentId: content.id, skillId: plan.skillId } });

    const questionVersionByKey = new Map<string, { id: string; questionId: string }>();
    for (const planned of plan.questions) {
      const question = await tx.question.create({
        data: {
          id: planned.id,
          contentId: content.id,
          position: planned.position,
          type: "MULTIPLE_CHOICE",
          skillId: plan.skillId,
          status: "DRAFT",
          metadata: asJson({ programId: EDUCATION_V2_P1_A_PROGRAM_ID }),
        },
      });
      const questionVersion = await tx.questionVersion.create({
        data: {
          id: planned.versionId,
          questionId: question.id,
          contentVersionId: version.id,
          version: 1,
          prompt: planned.question.prompt,
          options: asJson(planned.question.options),
          correctAnswer: answerFor(planned.question),
          explanation: planned.question.explanation,
          hint: planned.question.hint,
          difficulty: planned.question.difficulty,
          status: "DRAFT",
          generationMetadata: asJson({ programId: EDUCATION_V2_P1_A_PROGRAM_ID }),
        },
      });
      questionVersionByKey.set(planned.question.key, {
        id: questionVersion.id,
        questionId: question.id,
      });
    }

    if (plan.exercise && plan.exerciseTemplateId && plan.exerciseTemplateVersionId) {
      const template = await tx.exerciseTemplate.create({
        data: {
          id: plan.exerciseTemplateId,
          tenantId: null,
          title: plan.exercise.title,
          type: plan.exercise.templateType,
          skillId: plan.skillId,
          contentId: content.id,
          config: templateConfig(plan.exercise),
          status: "DRAFT",
        },
      });
      const templateVersion = await tx.exerciseTemplateVersion.create({
        data: {
          id: plan.exerciseTemplateVersionId,
          templateId: template.id,
          version: 1,
          config: asJson(plan.exercise.contract),
          status: "DRAFT",
        },
      });
      await tx.exerciseTemplateVersionContent.create({
        data: { templateVersionId: templateVersion.id, contentVersionId: version.id, position: 0 },
      });
      await tx.exerciseTemplateVersionQuestion.createMany({
        data: plan.questions.map((planned) => {
          const questionVersion = questionVersionByKey.get(planned.question.key);
          if (!questionVersion) fail(`question version bulunamadı: ${planned.question.key}`);
          return {
            templateVersionId: templateVersion.id,
            questionVersionId: questionVersion.id,
            questionId: questionVersion.questionId,
            position: planned.position,
          };
        }),
      });
    }

    await tx.contentVersion.update({
      where: { id: version.id },
      data: { status: "PUBLISHED", publishedAt },
    });
    await tx.content.update({
      where: { id: content.id },
      data: { currentVersionId: version.id, status: "PUBLISHED" },
    });
    await tx.questionVersion.updateMany({
      where: { questionId: { in: plan.questions.map((question) => question.id) } },
      data: { status: "PUBLISHED", publishedAt },
    });
    await tx.question.updateMany({
      where: { id: { in: plan.questions.map((question) => question.id) } },
      data: { status: "PUBLISHED" },
    });
    if (plan.exerciseTemplateId && plan.exerciseTemplateVersionId) {
      await tx.exerciseTemplateVersion.update({
        where: { id: plan.exerciseTemplateVersionId },
        data: { status: "PUBLISHED", publishedAt },
      });
      await tx.exerciseTemplate.update({
        where: { id: plan.exerciseTemplateId },
        data: { status: "PUBLISHED" },
      });
    }
  }

  for (const assessment of EDUCATION_V2_P1_A_PROGRAM.assessments) {
    await tx.assessment.create({
      data: {
        id: p1AAssessmentId(assessment.key),
        tenantId: null,
        title: assessment.title,
        type: "DIAGNOSTIC",
        config: assessmentConfig(assessment),
        status: "PUBLISHED",
      },
    });
  }
}

function flattenedSteps() {
  return EDUCATION_V2_P1_A_PROGRAM.path.units.flatMap((unit) => unit.steps);
}

async function createLearningPath(tx: Prisma.TransactionClient): Promise<void> {
  const path = EDUCATION_V2_P1_A_PROGRAM.path;
  const pathId = p1AId("path", path.code);
  await tx.learningPath.create({
    data: {
      id: pathId,
      tenantId: null,
      code: path.code,
      title: path.title,
      area: path.area,
      levelId,
      version: EDUCATION_V2_P1_A_PATH_VERSION,
      status: "PUBLISHED",
    },
  });

  const stepIdByKey = new Map(flattenedSteps().map((step) => [step.key, p1AStepId(step.key)]));
  const contentVersionByKey = new Map(
    EDUCATION_V2_P1_A_PROGRAM.content.map((content) => [
      content.key,
      p1AContentVersionId(content.key),
    ]),
  );
  const templateVersionByKey = new Map(
    EDUCATION_V2_P1_A_PROGRAM.exercises.map((exercise) => [
      exercise.key,
      p1ATemplateVersionId(exercise.key),
    ]),
  );
  const assessmentByKey = new Map(
    EDUCATION_V2_P1_A_PROGRAM.assessments.map((assessment) => [
      assessment.key,
      p1AAssessmentId(assessment.key),
    ]),
  );

  for (const unit of path.units) {
    const unitId = p1AUnitId(unit.code);
    await tx.learningUnit.create({
      data: {
        id: unitId,
        tenantId: null,
        pathId,
        code: unit.code,
        title: unit.title,
        position: unit.position,
        status: "PUBLISHED",
      },
    });
    let previousStepId: string | undefined;
    for (const [index, step] of unit.steps.entries()) {
      const contentVersionId = step.contentKey
        ? contentVersionByKey.get(step.contentKey)
        : undefined;
      const templateVersionId = step.exerciseKey
        ? templateVersionByKey.get(step.exerciseKey)
        : undefined;
      const assessmentId = step.assessmentKey ? assessmentByKey.get(step.assessmentKey) : undefined;
      const prerequisites = step.prerequisiteStepKeys ?? [];
      const prerequisiteStepIds = prerequisites.map((key) => {
        const id = stepIdByKey.get(key);
        if (!id) fail(`P1-A prerequisite step bulunamadı: ${step.key} -> ${key}`);
        return id;
      });
      if (step.type === "TEACHING" && !contentVersionId)
        fail(`P1-A teaching content eksik: ${step.key}`);
      if (step.type !== "TEACHING" && step.type !== "ASSESSMENT" && !templateVersionId)
        fail(`P1-A exercise version eksik: ${step.key}`);
      if (step.type === "ASSESSMENT" && !assessmentId) fail(`P1-A assessment eksik: ${step.key}`);
      const completionRule = {
        ...(step.completionRule ?? {}),
        ...(prerequisiteStepIds.length > 0 ? { prerequisiteStepIds } : {}),
      };
      const content = step.contentKey
        ? EDUCATION_V2_P1_A_PROGRAM.content.find((item) => item.key === step.contentKey)
        : undefined;
      await tx.learningStep.create({
        data: {
          id: p1AStepId(step.key),
          tenantId: null,
          unitId,
          stableKey: `${EDUCATION_V2_P1_A_PROGRAM_ID}:${step.key}`,
          title: step.title,
          position: index + 1,
          type: step.type,
          source: "SYSTEM_DRIVEN",
          status: "PUBLISHED",
          isActive: true,
          prerequisiteStepId: previousStepId,
          minimumLevelId: null,
          contentVersionId,
          exerciseTemplateVersionId: templateVersionId,
          assessmentId,
          completionRule: asJson(completionRule),
          metadata: asJson({
            programId: EDUCATION_V2_P1_A_PROGRAM_ID,
            routeFamily: "P1-A",
            area: path.area,
            unitCode: unit.code,
            stepType: step.type,
            skillCode: content?.skillCode ?? null,
          }),
        },
      });
      previousStepId = p1AStepId(step.key);
    }
  }
}

function summary(target: Target | null, identity: Identity | null): Record<string, unknown> {
  return {
    environment: target?.environment ?? "MANIFEST_ONLY",
    database: identity?.database ?? target?.database ?? "NOT_CONNECTED",
    programId: EDUCATION_V2_P1_A_PROGRAM_ID,
    pathCode: EDUCATION_V2_P1_A_PROGRAM.path.code,
    unitCount: EDUCATION_V2_P1_A_PROGRAM.path.units.length,
    stepCount: flattenedSteps().length,
    contentCount: EDUCATION_V2_P1_A_PROGRAM.content.length,
    exerciseCount: EDUCATION_V2_P1_A_PROGRAM.exercises.length,
    questionCount: EDUCATION_V2_P1_A_PROGRAM.exercises.reduce(
      (sum, exercise) => sum + exercise.questions.length,
      0,
    ),
    assessmentCount: EDUCATION_V2_P1_A_PROGRAM.assessments.length,
  };
}

async function main(): Promise<void> {
  const target = readTarget();
  if (!target) {
    console.log(
      JSON.stringify(
        { status: "PASS", mode: "MANIFEST_ONLY_DRY_RUN", ...summary(null, null), dbChanged: false },
        null,
        2,
      ),
    );
    return;
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: target.url } },
    transactionOptions: { maxWait: 20_000, timeout: 120_000 },
  });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    await verifyTarget(prisma, target, identity);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p1-a-provisioner', true)`;
      const skills = await tx.skill.findMany({
        where: { code: { in: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"] } },
        select: { id: true, code: true },
      });
      const plans = planRecords(skills);
      if (skills.length !== 3) fail("P1-A için mevcut RC skill kataloğu eksik");
      const state = await graphState(tx, plans);
      if (state === "CONFLICT")
        fail("P1-A stable graph kısmi veya uyumsuz; overwrite yapılmayacak");
      if (dryRun || state === "EXISTING") return { state, dbChanged: false };
      await createContentGraph(tx, plans);
      // P0/P1 pilot paths are intentionally unscoped to a Level row. The
      // G8_12 suffix is part of the canonical path code, not a production
      // Level record, and production already uses the path's tenant-safe
      // publication scope for candidate matching.
      await createLearningPath(tx);
      return { state, dbChanged: true };
    });
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: dryRun ? "DRY_RUN" : "APPLY",
          ...summary(target, identity),
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    `Education V2 P1-A seed FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
