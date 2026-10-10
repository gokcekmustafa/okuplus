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
  EDUCATION_V2_P1_BCD_PROGRAMS,
  p1BCDContentVersionId,
  p1BCDId,
  p1BCDTemplateId,
  p1BCDTemplateVersionId,
  type P1BCDProgram,
} from "../src/curriculum/education-v2-p1-bcd-program.js";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") || args.has("--dry-run");
const TARGET_ENV = "EDUCATION_V2_P1_BCD_ENVIRONMENT";
const DATABASE_ENV = "EDUCATION_V2_P1_BCD_DATABASE_URL";
const PRODUCTION_DATABASE_ENV = "EDUCATION_V2_P1_BCD_PRODUCTION_DATABASE_URL";
const PRODUCTION_DATABASE_NAME_ENV = "EDUCATION_V2_P1_BCD_PRODUCTION_DATABASE_NAME";
const PRODUCTION_DATABASE_HOST_ENV = "EDUCATION_V2_P1_BCD_PRODUCTION_DATABASE_HOST";
const PRODUCTION_RELEASE_ID_ENV = "EDUCATION_V2_P1_BCD_PRODUCTION_RELEASE_ID";
const PRODUCTION_APPROVAL_ENV = "EDUCATION_V2_P1_BCD_PRODUCTION_APPROVAL";
const APPROVED_FINGERPRINT_ENV = "EDUCATION_V2_P1_BCD_APPROVED_TARGET_FINGERPRINT";
const PRODUCTION_CONFIRMATION = "I_HAVE_REVIEWED_EDUCATION_V2_P1_BCD_PRODUCTION_EDITORIAL_RELEASE";

type TargetEnvironment = "TEST" | "PRODUCTION";
type Target = CatalogTarget & { approvedTarget: CatalogTarget; approvedFingerprint: string };
type Plan = {
  program: P1BCDProgram;
  content: P1BCDProgram["content"][number];
  contentId: string;
  contentVersionId: string;
  skillId: string;
  exercise?: P1BCDProgram["exercises"][number];
  exerciseTemplateId?: string;
  exerciseTemplateVersionId?: string;
  questions: Array<{
    id: string;
    versionId: string;
    question: P1BCDProgram["exercises"][number]["questions"][number];
    position: number;
  }>;
};
type Identity = { database: string; db_user: string; host: string | null; port: number | null };

function fail(message: string): never {
  throw new Error(`Education V2 P1-B/C/D seed reddedildi: ${message}`);
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

function programs(): readonly P1BCDProgram[] {
  return EDUCATION_V2_P1_BCD_PROGRAMS;
}

function planRecords(program: P1BCDProgram, skillByCode: ReadonlyMap<string, string>): Plan[] {
  return program.content.map((content) => {
    const skillId = skillByCode.get(content.skillCode);
    if (!skillId) fail(`${program.routeFamily} için skill bulunamadı: ${content.skillCode}`);
    const exercise = program.exercises.find((candidate) => candidate.contentKey === content.key);
    const questions = exercise
      ? exercise.questions.map((candidate, position) => ({
          id: p1BCDId(program, "question", `${exercise.key}-${candidate.key}`),
          versionId: p1BCDId(program, "questionVersion", `${exercise.key}-${candidate.key}-v1`),
          question: candidate,
          position,
        }))
      : [];
    return {
      program,
      content,
      contentId: p1BCDId(program, "content", content.key),
      contentVersionId: p1BCDContentVersionId(program, content.key),
      skillId,
      exercise,
      exerciseTemplateId: exercise ? p1BCDTemplateId(program, exercise.key) : undefined,
      exerciseTemplateVersionId: exercise
        ? p1BCDTemplateVersionId(program, exercise.key)
        : undefined,
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

function templateConfig(plan: Plan): Prisma.InputJsonValue {
  if (!plan.exercise) fail(`exercise config eksik: ${plan.content.key}`);
  return {
    programId: plan.program.programId,
    stableKey: `EDU-V2-P1-${plan.program.routeFamily}-${plan.exercise.key.toUpperCase().replaceAll("-", "_")}`,
    version: 1,
    competency: plan.exercise.contract.competency,
    rendererKey: plan.exercise.contract.rendererKey,
    contentKey: plan.exercise.contentKey,
    routeFamily: plan.program.routeFamily,
  };
}

function assessmentConfig(
  program: P1BCDProgram,
  assessment: P1BCDProgram["assessments"][number],
): Prisma.InputJsonValue {
  const exercise = program.exercises.find(
    (candidate) => candidate.key === assessment.templateExerciseKey,
  );
  if (!exercise) fail(`assessment template bulunamadı: ${assessment.key}`);
  return {
    programId: program.programId,
    templateId: p1BCDTemplateId(program, exercise.key),
    templateVersionId: p1BCDTemplateVersionId(program, exercise.key),
    questionCount: assessment.config.questionCount,
    minimumScorableCount: assessment.config.minimumScorableCount,
    minimumAnsweredCount: assessment.config.minimumAnsweredCount,
  };
}

function expectedIds(plans: readonly Plan[]): string[] {
  const ids: string[] = [];
  for (const plan of plans) {
    ids.push(plan.contentId, plan.contentVersionId);
    if (plan.exerciseTemplateId) ids.push(plan.exerciseTemplateId);
    if (plan.exerciseTemplateVersionId) ids.push(plan.exerciseTemplateVersionId);
    for (const question of plan.questions) ids.push(question.id, question.versionId);
  }
  for (const program of programs()) {
    ids.push(
      ...program.assessments.map((assessment) => p1BCDId(program, "assessment", assessment.key)),
    );
    ids.push(p1BCDId(program, "path", program.path.code));
    for (const unit of program.path.units) {
      ids.push(p1BCDId(program, "unit", unit.code));
      ids.push(...unit.steps.map((step) => p1BCDId(program, "step", step.key)));
    }
  }
  return ids;
}

async function graphState(
  tx: Prisma.TransactionClient,
  plans: readonly Plan[],
): Promise<"MISSING" | "EXISTING" | "CONFLICT"> {
  const ids = expectedIds(plans);
  const counts = await Promise.all([
    tx.content.count({ where: { id: { in: plans.map((plan) => plan.contentId) } } }),
    tx.contentVersion.count({ where: { id: { in: plans.map((plan) => plan.contentVersionId) } } }),
    tx.exerciseTemplate.count({
      where: { id: { in: plans.flatMap((plan) => plan.exerciseTemplateId ?? []) } },
    }),
    tx.exerciseTemplateVersion.count({
      where: { id: { in: plans.flatMap((plan) => plan.exerciseTemplateVersionId ?? []) } },
    }),
    tx.question.count({
      where: { id: { in: plans.flatMap((plan) => plan.questions.map((question) => question.id)) } },
    }),
    tx.questionVersion.count({
      where: {
        id: { in: plans.flatMap((plan) => plan.questions.map((question) => question.versionId)) },
      },
    }),
    tx.assessment.count({
      where: {
        id: {
          in: programs().flatMap((program) =>
            program.assessments.map((assessment) => p1BCDId(program, "assessment", assessment.key)),
          ),
        },
      },
    }),
    tx.learningPath.count({
      where: {
        id: { in: programs().map((program) => p1BCDId(program, "path", program.path.code)) },
      },
    }),
    tx.learningUnit.count({
      where: {
        id: {
          in: programs().flatMap((program) =>
            program.path.units.map((unit) => p1BCDId(program, "unit", unit.code)),
          ),
        },
      },
    }),
    tx.learningStep.count({
      where: {
        id: {
          in: programs().flatMap((program) =>
            program.path.units.flatMap((unit) =>
              unit.steps.map((step) => p1BCDId(program, "step", step.key)),
            ),
          ),
        },
      },
    }),
  ]);
  const existing = counts.reduce((sum, count) => sum + count, 0);
  if (existing === 0) return "MISSING";
  const expected = ids.length;
  if (existing === expected) return "EXISTING";
  return "CONFLICT";
}

async function createContentGraph(
  tx: Prisma.TransactionClient,
  plans: readonly Plan[],
): Promise<void> {
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
        metadata: asJson({
          programId: plan.program.programId,
          contentKey: plan.content.key,
          routeFamily: plan.program.routeFamily,
        }),
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
        changelog: `${plan.program.programId}; contentKey=${plan.content.key}; yaş=${plan.program.ageBand}`,
        metadata: asJson({
          programId: plan.program.programId,
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
          routeFamily: `P1-${plan.program.routeFamily}`,
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
          metadata: asJson({
            programId: plan.program.programId,
            routeFamily: plan.program.routeFamily,
          }),
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
          generationMetadata: asJson({
            programId: plan.program.programId,
            routeFamily: plan.program.routeFamily,
          }),
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
          config: templateConfig(plan),
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
  for (const program of programs()) {
    for (const assessment of program.assessments) {
      await tx.assessment.create({
        data: {
          id: p1BCDId(program, "assessment", assessment.key),
          tenantId: null,
          title: assessment.title,
          type: "DIAGNOSTIC",
          config: assessmentConfig(program, assessment),
          status: "PUBLISHED",
        },
      });
    }
  }
}

async function createLearningPaths(tx: Prisma.TransactionClient): Promise<void> {
  for (const program of programs()) {
    const pathId = p1BCDId(program, "path", program.path.code);
    await tx.learningPath.create({
      data: {
        id: pathId,
        tenantId: null,
        code: program.path.code,
        title: program.path.title,
        area: program.path.area,
        levelId: null,
        version: 1,
        status: "PUBLISHED",
      },
    });
    const contentVersionByKey = new Map(
      program.content.map((content) => [content.key, p1BCDContentVersionId(program, content.key)]),
    );
    const templateVersionByKey = new Map(
      program.exercises.map((exercise) => [
        exercise.key,
        p1BCDTemplateVersionId(program, exercise.key),
      ]),
    );
    const assessmentByKey = new Map(
      program.assessments.map((assessment) => [
        assessment.key,
        p1BCDId(program, "assessment", assessment.key),
      ]),
    );
    for (const unit of program.path.units) {
      const unitId = p1BCDId(program, "unit", unit.code);
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
        const assessmentId = step.assessmentKey
          ? assessmentByKey.get(step.assessmentKey)
          : undefined;
        const prerequisiteStepIds = (step.prerequisiteStepKeys ?? []).map((key) => {
          const prerequisiteId = p1BCDId(program, "step", key);
          if (!unit.steps.some((candidate) => candidate.key === key))
            fail(`prerequisite bulunamadı: ${step.key} -> ${key}`);
          return prerequisiteId;
        });
        if (step.type === "TEACHING" && !contentVersionId)
          fail(`teaching content eksik: ${step.key}`);
        if (
          step.type !== "TEACHING" &&
          step.type !== "ASSESSMENT" &&
          (!contentVersionId || !templateVersionId)
        )
          fail(`exercise graph eksik: ${step.key}`);
        if (step.type === "ASSESSMENT" && !assessmentId) fail(`assessment eksik: ${step.key}`);
        await tx.learningStep.create({
          data: {
            id: p1BCDId(program, "step", step.key),
            tenantId: null,
            unitId,
            stableKey: `${program.programId}:${step.key}`,
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
            completionRule: asJson(prerequisiteStepIds.length > 0 ? { prerequisiteStepIds } : {}),
            metadata: asJson({
              programId: program.programId,
              routeFamily: `P1-${program.routeFamily}`,
              area: program.path.area,
              unitCode: unit.code,
              stepType: step.type,
            }),
          },
        });
        previousStepId = p1BCDId(program, "step", step.key);
      }
    }
  }
}

function summary(target: Target | null, identity: Identity | null): Record<string, unknown> {
  return {
    environment: target?.environment ?? "MANIFEST_ONLY",
    database: identity?.database ?? target?.database ?? "NOT_CONNECTED",
    routes: programs().map((program) => ({
      routeFamily: program.routeFamily,
      programId: program.programId,
      pathCode: program.path.code,
      unitCount: program.path.units.length,
      stepCount: program.path.units.reduce((sum, unit) => sum + unit.steps.length, 0),
      contentCount: program.content.length,
      exerciseCount: program.exercises.length,
      questionCount: program.exercises.reduce(
        (sum, exercise) => sum + exercise.questions.length,
        0,
      ),
      assessmentCount: program.assessments.length,
    })),
  };
}

async function main(): Promise<void> {
  const target = readTarget();
  if (!target) {
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "MANIFEST_ONLY_DRY_RUN",
          ...summary(null, null),
          databaseAction: "NOT_RUN",
          publicationState: "NOT_VERIFIED",
          ready: false,
          dbChanged: false,
        },
        null,
        2,
      ),
    );
    return;
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: target.url } },
    transactionOptions: { maxWait: 20_000, timeout: 180_000 },
  });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    await verifyTarget(prisma, target, identity);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p1-bcd-provisioner', true)`;
      const skillCodes = [
        ...new Set(
          programs().flatMap((program) => program.content.map((content) => content.skillCode)),
        ),
      ];
      const skills = await tx.skill.findMany({
        where: { code: { in: skillCodes } },
        select: { id: true, code: true },
      });
      const skillByCode = new Map(skills.map((skill) => [skill.code, skill.id]));
      if (skills.length !== skillCodes.length)
        fail(
          `gerekli skill kataloğu eksik: ${skillCodes.filter((code) => !skillByCode.has(code)).join(", ")}`,
        );
      const plans = programs().flatMap((program) => planRecords(program, skillByCode));
      const state = await graphState(tx, plans);
      if (state === "CONFLICT")
        fail("P1-B/C/D stable graph kısmi veya uyumsuz; overwrite yapılmayacak");
      if (dryRun || state === "EXISTING") return { state, dbChanged: false };
      await createContentGraph(tx, plans);
      await createLearningPaths(tx);
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
    `Education V2 P1-B/C/D seed FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
