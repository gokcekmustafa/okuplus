import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  EDUCATION_V2_P0_PROGRAM,
  EDUCATION_V2_P0_PROGRAM_ID,
  EDUCATION_V2_P0_SKILL_MANIFEST,
  contentId,
  contentVersionId,
  getProgramExercise,
  getProgramIds,
  lessonMetadataFor,
  questionId,
  questionVersionId,
  templateId,
  templateVersionId,
  type ProgramAssessment,
  type ProgramContent,
  type ProgramExercise,
  type ProgramQuestion,
} from "../src/curriculum/education-v2-p0-program.js";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") || args.has("--dry-run");
const DATABASE_ENV = "EDUCATION_V2_P0_DATABASE_URL";
const PRODUCTION_DATABASE_ENV = "EDUCATION_V2_P0_PRODUCTION_DATABASE_URL";
const PRODUCTION_DATABASE_NAME_ENV = "EDUCATION_V2_P0_PRODUCTION_DATABASE_NAME";
const PRODUCTION_DATABASE_HOST_ENV = "EDUCATION_V2_P0_PRODUCTION_DATABASE_HOST";
const PRODUCTION_RELEASE_ID_ENV = "EDUCATION_V2_P0_PRODUCTION_RELEASE_ID";
const PRODUCTION_APPROVAL_ENV = "EDUCATION_V2_P0_PRODUCTION_APPROVAL";
const TARGET_ENV = "EDUCATION_V2_P0_ENVIRONMENT";
const LEVEL_ENV = "EDUCATION_V2_P0_LEVEL_CODE";
const SKILLS_ENV = "EDUCATION_V2_P0_SKILL_CODES";
const WRITE_CONFIRMATION = "I_HAVE_REVIEWED_EDUCATION_V2_P0";
const PRODUCTION_WRITE_CONFIRMATION =
  "I_HAVE_REVIEWED_EDUCATION_V2_P0_PRODUCTION_EDITORIAL_RELEASE";

type TargetEnvironment = "TEST" | "STAGING" | "PRODUCTION";
type Target = {
  url: string;
  environment: TargetEnvironment;
  database: string;
  host: string;
  port: string;
};

type Plan = {
  content: ProgramContent;
  contentId: string;
  contentVersionId: string;
  skillId: string;
  exercise?: ProgramExercise;
  exerciseTemplateId?: string;
  exerciseTemplateVersionId?: string;
  questions: Array<{
    id: string;
    versionId: string;
    question: ProgramQuestion;
    position: number;
  }>;
};

type DbIdentity = {
  database: string;
  db_user: string;
  host: string | null;
  port: number | null;
};

type SkillRow = {
  id: string;
  code: string;
  category: (typeof EDUCATION_V2_P0_SKILL_MANIFEST)[number]["category"];
};

type SkillPlan = {
  existing: SkillRow[];
  missing: (typeof EDUCATION_V2_P0_SKILL_MANIFEST)[number][];
};

function fail(message: string): never {
  throw new Error(`Education V2 P0 seed reddedildi: ${message}`);
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function wordCount(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

function parseTargetUrl(raw: string): Omit<Target, "environment"> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`${DATABASE_ENV} geçerli bir PostgreSQL URL'i değil`);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail(`${DATABASE_ENV} PostgreSQL olmalı`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  if (!database) fail("hedef veritabanı adı boş");
  return {
    url: raw,
    database,
    host: parsed.hostname,
    port: parsed.port || "5432",
  };
}

function readTarget(): Target | null {
  const environment = process.env[TARGET_ENV]?.trim().toUpperCase();
  const databaseEnv = environment === "PRODUCTION" ? PRODUCTION_DATABASE_ENV : DATABASE_ENV;
  const rawUrl = process.env[databaseEnv]?.trim();
  if (dryRun && !rawUrl && environment !== "PRODUCTION") return null;
  if (!rawUrl) fail(`${databaseEnv} verilmedi; DATABASE_URL fallback'i yok`);

  if (environment !== "TEST" && environment !== "STAGING" && environment !== "PRODUCTION") {
    fail(`${TARGET_ENV} yalnızca TEST, STAGING veya açıkça korunan PRODUCTION olabilir`);
  }
  const target = parseTargetUrl(rawUrl);
  if (environment === "TEST" && target.database !== "oku_plus_test") {
    fail(`TEST yalnızca oku_plus_test hedefleyebilir (${target.database})`);
  }
  if (environment === "STAGING" && /test/i.test(target.database)) {
    fail(`STAGING test veritabanına yazamaz (${target.database})`);
  }
  if (environment === "PRODUCTION") {
    const expectedDatabase = process.env[PRODUCTION_DATABASE_NAME_ENV]?.trim();
    const expectedHost = process.env[PRODUCTION_DATABASE_HOST_ENV]?.trim();
    const releaseId = process.env[PRODUCTION_RELEASE_ID_ENV]?.trim();
    if (!expectedDatabase || !expectedHost || !releaseId) {
      fail(
        `${PRODUCTION_DATABASE_NAME_ENV}, ${PRODUCTION_DATABASE_HOST_ENV} ve ${PRODUCTION_RELEASE_ID_ENV} zorunlu`,
      );
    }
    if (target.database !== expectedDatabase) {
      fail(
        `production database adı beklenen kimlikle eşleşmiyor: beklenen=${expectedDatabase}, URL=${target.database}`,
      );
    }
    if (normalizeHost(target.host) !== normalizeHost(expectedHost)) {
      fail(`production database host beklenen kimlikle eşleşmiyor`);
    }
    if (!dryRun && process.env[PRODUCTION_APPROVAL_ENV] !== PRODUCTION_WRITE_CONFIRMATION) {
      fail(
        `production yayın onayı için ${PRODUCTION_APPROVAL_ENV}=${PRODUCTION_WRITE_CONFIRMATION} gerekli`,
      );
    }
  } else if (!dryRun && process.env.EDUCATION_V2_P0_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    fail(`yazma onayı için EDUCATION_V2_P0_ALLOW_WRITE=${WRITE_CONFIRMATION} gerekli`);
  }
  return { ...target, environment: environment as TargetEnvironment };
}

function readRequiredCodes(): { levelCode: string; skillCodes: string[] } {
  const levelCode = process.env[LEVEL_ENV]?.trim();
  if (!levelCode) fail(`${LEVEL_ENV} verilmedi; mevcut Level kaydı seçilmeyecek`);
  const expected = EDUCATION_V2_P0_SKILL_MANIFEST.map((skill) => skill.code);
  const configured = process.env[SKILLS_ENV]?.trim();
  const skillCodes = configured
    ? configured
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : expected;
  if (
    skillCodes.length !== expected.length ||
    new Set(skillCodes).size !== expected.length ||
    expected.some((skillCode) => !skillCodes.includes(skillCode))
  ) {
    fail(`${SKILLS_ENV} Eğitim V2 P0 manifestindeki altı skill code'u içermeli`);
  }
  return { levelCode, skillCodes };
}

function buildSkillPlan(
  rows: Array<{ id: string; code: string; category: string }>,
  skillCodes: string[],
): SkillPlan {
  const definitionByCode = new Map(
    EDUCATION_V2_P0_SKILL_MANIFEST.map((skill) => [skill.code, skill]),
  );
  const rowByCode = new Map(rows.map((row) => [row.code, row]));
  const existing: SkillRow[] = [];
  const missing: SkillPlan["missing"] = [];
  for (const code of skillCodes) {
    const definition = definitionByCode.get(code);
    if (!definition) fail(`skill manifestinde tanımsız code: ${code}`);
    const row = rowByCode.get(code);
    if (!row) {
      missing.push(definition);
      continue;
    }
    if (row.category !== definition.category) {
      fail(
        `mevcut Skill category uyumsuz: ${code}; mevcut=${row.category}, beklenen=${definition.category}`,
      );
    }
    existing.push({ id: row.id, code: row.code, category: definition.category });
  }
  return { existing, missing };
}

async function ensureProgramSkills(
  tx: Prisma.TransactionClient,
  skillCodes: string[],
): Promise<SkillRow[]> {
  const definitions = new Map(EDUCATION_V2_P0_SKILL_MANIFEST.map((skill) => [skill.code, skill]));
  const rows = await tx.skill.findMany({
    where: { code: { in: skillCodes } },
    select: { id: true, code: true, category: true },
  });
  const result: SkillRow[] = [];
  for (const code of skillCodes) {
    const definition = definitions.get(code);
    if (!definition) fail(`skill manifestinde tanımsız code: ${code}`);
    const existing = rows.find((row) => row.code === code);
    if (existing) {
      if (existing.category !== definition.category) {
        fail(`Skill category transaction öncesi değişti: ${code}`);
      }
      result.push({ id: existing.id, code: existing.code, category: definition.category });
      continue;
    }
    const created = await tx.skill.create({
      data: {
        code: definition.code,
        name: definition.name,
        category: definition.category,
        description: definition.description,
        displayOrder: definition.displayOrder,
      },
      select: { id: true, code: true, category: true },
    });
    result.push({ id: created.id, code: created.code, category: definition.category });
  }
  return result;
}

function normalizeHost(value: string | null): string {
  return (value ?? "").replace(/:\d+$/, "").toLowerCase();
}

async function readIdentity(prisma: PrismaClient): Promise<DbIdentity> {
  const rows = await prisma.$queryRawUnsafe<DbIdentity[]>(
    "select current_database() as database, current_user as db_user, inet_server_addr()::text as host, inet_server_port() as port",
  );
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  return identity;
}

/**
 * Education V2 seed'i global editorial katalog satırları oluşturur. Global
 * katalog RLS politikaları yalnızca platform rolüne izin verir; bu context
 * transaction-local tutulur ve seed'in explicit target/approval guard'larının
 * yerine geçmez.
 */
async function applySeedPlatformContext(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`
    SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)
  `;
}

function assertIdentity(target: Target, identity: DbIdentity): void {
  if (identity.database !== target.database) {
    fail(`database kimliği eşleşmiyor: URL=${target.database}, connection=${identity.database}`);
  }
  if (String(identity.port ?? "") !== target.port) {
    fail(`port eşleşmiyor: URL=${target.port}, connection=${identity.port}`);
  }
  const expectedHost = normalizeHost(target.host);
  const actualHost = normalizeHost(identity.host);
  const local = new Set(["127.0.0.1", "::1", "localhost"]);
  if (expectedHost !== actualHost && !(local.has(expectedHost) && local.has(actualHost))) {
    fail(`host eşleşmiyor: URL=${target.host}, connection=${identity.host}`);
  }
}

function planRecords(skills: Array<{ id: string; code: string }>): Plan[] {
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill.id]));
  return EDUCATION_V2_P0_PROGRAM.content.map((content) => {
    const skillId = skillByCode.get(content.skillCode);
    if (!skillId) fail(`gerekli mevcut skill bulunamadı: ${content.skillCode}`);
    const exercise = EDUCATION_V2_P0_PROGRAM.exercises.find(
      (candidate) => candidate.contentKey === content.key,
    );
    const questions = exercise
      ? exercise.questions.map((candidate, position) => ({
          id: questionId(exercise.key, candidate.key),
          versionId: questionVersionId(exercise.key, candidate.key),
          question: candidate,
          position,
        }))
      : [];
    return {
      content,
      contentId: contentId(content.key),
      contentVersionId: contentVersionId(content.key),
      skillId,
      exercise,
      exerciseTemplateId: exercise ? templateId(exercise.key) : undefined,
      exerciseTemplateVersionId: exercise ? templateVersionId(exercise.key) : undefined,
      questions,
    };
  });
}

function allStableIds(plans: Plan[]): string[] {
  const ids = plans.flatMap((plan) => [
    plan.contentId,
    plan.contentVersionId,
    ...(plan.exerciseTemplateId ? [plan.exerciseTemplateId] : []),
    ...(plan.exerciseTemplateVersionId ? [plan.exerciseTemplateVersionId] : []),
    ...plan.questions.flatMap((question) => [question.id, question.versionId]),
  ]);
  for (const path of EDUCATION_V2_P0_PROGRAM.paths) {
    ids.push(getProgramIds("path", path.key), getProgramIds("unit", path.unitCode));
    ids.push(...path.steps.map((step) => getProgramIds("step", `${path.key}-${step.key}`)));
  }
  ids.push(
    ...EDUCATION_V2_P0_PROGRAM.assessments.map((assessment) =>
      getProgramIds("assessment", assessment.key),
    ),
  );
  return ids;
}

async function inspectStableRows(
  prisma: Prisma.TransactionClient,
  plans: Plan[],
): Promise<"CREATE" | "NOOP" | "CONFLICT"> {
  const ids = allStableIds(plans);
  const [
    contents,
    contentVersions,
    templates,
    templateVersions,
    questions,
    questionVersions,
    paths,
    units,
    steps,
    assessments,
  ] = await Promise.all([
    prisma.content.count({ where: { id: { in: ids } } }),
    prisma.contentVersion.count({ where: { id: { in: ids } } }),
    prisma.exerciseTemplate.count({ where: { id: { in: ids } } }),
    prisma.exerciseTemplateVersion.count({ where: { id: { in: ids } } }),
    prisma.question.count({ where: { id: { in: ids } } }),
    prisma.questionVersion.count({ where: { id: { in: ids } } }),
    prisma.learningPath.count({ where: { id: { in: ids } } }),
    prisma.learningUnit.count({ where: { id: { in: ids } } }),
    prisma.learningStep.count({ where: { id: { in: ids } } }),
    prisma.assessment.count({ where: { id: { in: ids } } }),
  ]);
  const counts = [
    contents,
    contentVersions,
    templates,
    templateVersions,
    questions,
    questionVersions,
    paths,
    units,
    steps,
    assessments,
  ];
  if (counts.every((count) => count === 0)) return "CREATE";
  if (counts.every((count) => count > 0)) return "NOOP";
  return "CONFLICT";
}

function answerFor(question: ProgramQuestion): Prisma.InputJsonValue {
  return {
    type: "MULTIPLE_CHOICE",
    correctOptionIds: [question.correctOptionId],
    allowMultiple: false,
    partialCredit: false,
  };
}

function templateConfig(exercise: ProgramExercise): Prisma.InputJsonValue {
  return {
    programId: EDUCATION_V2_P0_PROGRAM_ID,
    stableKey: `EDU-V2-P0-${exercise.key.toUpperCase().replaceAll("-", "_")}`,
    version: 1,
    competency: exercise.contract.competency,
    rendererKey: exercise.contract.rendererKey,
    contentKey: exercise.contentKey,
  };
}

function assessmentConfig(assessment: ProgramAssessment): Prisma.InputJsonValue {
  const exercise = getProgramExercise(assessment.templateExerciseKey);
  return {
    programId: EDUCATION_V2_P0_PROGRAM_ID,
    templateId: templateId(exercise.key),
    templateVersionId: templateVersionId(exercise.key),
    questionCount: assessment.config.questionCount,
    minimumScorableCount: assessment.config.minimumScorableCount,
    minimumAnsweredCount: assessment.config.minimumAnsweredCount,
    completionMinimumScore: assessment.config.completionMinimumScore,
  };
}

async function createProgram(
  tx: Prisma.TransactionClient,
  plans: Plan[],
  levelId: string,
): Promise<void> {
  const contentVersionByKey = new Map<string, string>();
  const templateVersionByKey = new Map<string, string>();
  const questionVersionByKey = new Map<string, { id: string; questionId: string }>();
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
        metadata: asJson({ programId: EDUCATION_V2_P0_PROGRAM_ID, contentKey: plan.content.key }),
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
        license: "Özgün OKU+ metni.",
        changelog: `${EDUCATION_V2_P0_PROGRAM_ID}; contentKey=${plan.content.key}; hedef yaş=${EDUCATION_V2_P0_PROGRAM.ageBand}`,
        metadata: asJson(
          lessonMetadataFor(plan.content) ?? { programId: EDUCATION_V2_P0_PROGRAM_ID },
        ),
        status: "DRAFT",
      },
    });
    await tx.contentSkill.create({ data: { contentId: content.id, skillId: plan.skillId } });
    contentVersionByKey.set(plan.content.key, version.id);

    for (const plannedQuestion of plan.questions) {
      const question = await tx.question.create({
        data: {
          id: plannedQuestion.id,
          contentId: content.id,
          position: plannedQuestion.position,
          type: "MULTIPLE_CHOICE",
          skillId: plan.skillId,
          status: "DRAFT",
          metadata: asJson({ programId: EDUCATION_V2_P0_PROGRAM_ID }),
        },
      });
      const questionVersion = await tx.questionVersion.create({
        data: {
          id: plannedQuestion.versionId,
          questionId: question.id,
          contentVersionId: version.id,
          version: 1,
          prompt: plannedQuestion.question.prompt,
          options: asJson(plannedQuestion.question.options),
          correctAnswer: answerFor(plannedQuestion.question),
          explanation: plannedQuestion.question.explanation,
          hint: plannedQuestion.question.hint,
          difficulty: plannedQuestion.question.difficulty,
          status: "DRAFT",
          generationMetadata: asJson({ programId: EDUCATION_V2_P0_PROGRAM_ID }),
        },
      });
      questionVersionByKey.set(plannedQuestion.question.key, {
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
      templateVersionByKey.set(plan.exercise.key, templateVersion.id);
      await tx.exerciseTemplateVersionContent.create({
        data: {
          templateVersionId: templateVersion.id,
          contentVersionId: version.id,
          position: 0,
        },
      });
      await tx.exerciseTemplateVersionQuestion.createMany({
        data: plan.questions.map((plannedQuestion) => {
          const questionVersion = questionVersionByKey.get(plannedQuestion.question.key);
          if (!questionVersion)
            fail(`question version planı bulunamadı: ${plannedQuestion.question.key}`);
          return {
            templateVersionId: templateVersion.id,
            questionVersionId: questionVersion.id,
            questionId: questionVersion.questionId,
            position: plannedQuestion.position,
          };
        }),
      });
    }
  }

  for (const plan of plans) {
    await tx.contentVersion.update({
      where: { id: plan.contentVersionId },
      data: { status: "PUBLISHED", publishedAt },
    });
    await tx.content.update({
      where: { id: plan.contentId },
      data: { currentVersionId: plan.contentVersionId, status: "PUBLISHED" },
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

  const assessmentIds = new Map<string, string>();
  for (const assessment of EDUCATION_V2_P0_PROGRAM.assessments) {
    const id = getProgramIds("assessment", assessment.key);
    await tx.assessment.create({
      data: {
        id,
        tenantId: null,
        title: assessment.title,
        type: "DIAGNOSTIC",
        config: assessmentConfig(assessment),
        status: "PUBLISHED",
      },
    });
    assessmentIds.set(assessment.key, id);
  }

  const stepIds = new Map<string, string>();
  for (const path of EDUCATION_V2_P0_PROGRAM.paths) {
    for (const step of path.steps) {
      stepIds.set(step.key, getProgramIds("step", `${path.key}-${step.key}`));
    }
  }
  for (const path of EDUCATION_V2_P0_PROGRAM.paths) {
    const pathId = getProgramIds("path", path.key);
    const unitId = getProgramIds("unit", path.unitCode);
    await tx.learningPath.create({
      data: {
        id: pathId,
        tenantId: null,
        code: path.code,
        title: path.title,
        area: path.area,
        status: "PUBLISHED",
      },
    });
    await tx.learningUnit.create({
      data: {
        id: unitId,
        tenantId: null,
        pathId,
        code: path.unitCode,
        title: path.unitTitle,
        position: 1,
        status: "PUBLISHED",
      },
    });
    let previousStepId: string | undefined;
    for (const [position, step] of path.steps.entries()) {
      const stepId = getProgramIds("step", `${path.key}-${step.key}`);
      const prerequisiteIds = (step.prerequisiteStepKeys ?? []).map((key) => {
        const referenced = stepIds.get(key);
        if (!referenced) fail(`prerequisite step henüz oluşturulmadı: ${key}`);
        return referenced;
      });
      const contentVersion = step.contentKey ? contentVersionByKey.get(step.contentKey) : undefined;
      const exercise = step.exerciseKey ? getProgramExercise(step.exerciseKey) : undefined;
      const exerciseVersion = exercise ? templateVersionByKey.get(exercise.key) : undefined;
      const assessmentId = step.assessmentKey ? assessmentIds.get(step.assessmentKey) : undefined;
      if (step.type === "TEACHING" && !contentVersion) fail(`teaching content eksik: ${step.key}`);
      if (step.type !== "TEACHING" && step.type !== "ASSESSMENT" && !exerciseVersion) {
        fail(`exercise version eksik: ${step.key}`);
      }
      if (step.type === "ASSESSMENT" && !assessmentId) fail(`assessment eksik: ${step.key}`);
      const completionRule: Record<string, unknown> = {
        ...(step.completionRule ?? {}),
        ...(prerequisiteIds.length > 0 ? { prerequisiteStepIds: prerequisiteIds } : {}),
      };
      await tx.learningStep.create({
        data: {
          id: stepId,
          tenantId: null,
          unitId,
          stableKey: `${EDUCATION_V2_P0_PROGRAM_ID}:${step.key}`,
          title: step.title,
          position: position + 1,
          type: step.type,
          source: "SYSTEM_DRIVEN",
          status: "PUBLISHED",
          isActive: true,
          prerequisiteStepId: previousStepId,
          minimumLevelId: levelId,
          contentVersionId: contentVersion,
          exerciseTemplateVersionId: exerciseVersion,
          assessmentId,
          completionRule: asJson(completionRule),
        },
      });
      previousStepId = stepId;
    }
  }

  // The shared reinforcement explicitly waits for both independent practice nodes.
  const sharedReinforcementId = stepIds.get("shared-reinforcement");
  const readingPracticeId = stepIds.get("reading-comprehension-practice");
  const fastPracticeId = stepIds.get("fast-practice");
  if (!sharedReinforcementId || !readingPracticeId || !fastPracticeId) {
    fail("iki alanın practice adımları veya ortak reinforcement oluşturulmadı");
  }
  await tx.learningStep.update({
    where: { id: sharedReinforcementId },
    data: {
      completionRule: asJson({ prerequisiteStepIds: [fastPracticeId, readingPracticeId] }),
    },
  });
}

function safeSummary(target: Target | null, identity?: DbIdentity): Record<string, unknown> {
  if (!target) return { environment: "MANIFEST_ONLY", database: "NOT_CONNECTED" };
  return {
    environment: target.environment,
    database: identity?.database ?? target.database,
    host: identity?.host ?? target.host,
    port: identity?.port ?? target.port,
    user: identity?.db_user ?? "NOT_CONNECTED",
  };
}

async function main(): Promise<void> {
  const target = readTarget();
  const { levelCode, skillCodes } = readRequiredCodes();
  const manifestSkills = [
    ...new Set(EDUCATION_V2_P0_PROGRAM.content.map((item) => item.skillCode)),
  ];
  if (!manifestSkills.every((code) => skillCodes.includes(code))) {
    fail("manifest skill kapsamı hedef skill listesiyle eşleşmiyor");
  }

  const parsedContracts = EDUCATION_V2_P0_PROGRAM.exercises.map((exercise) => exercise.contract);
  if (parsedContracts.length !== EDUCATION_V2_P0_PROGRAM.exercises.length) {
    fail("exercise contract doğrulaması eksik");
  }

  if (dryRun && !target) {
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "MANIFEST_ONLY_DRY_RUN",
          programId: EDUCATION_V2_P0_PROGRAM_ID,
          ageBand: EDUCATION_V2_P0_PROGRAM.ageBand,
          levelCode,
          skillCodes,
          skillProvisioning: {
            source: "EDUCATION_V2_P0_SKILL_MANIFEST",
            databaseAction: "NOT_RUN",
          },
          contentCount: EDUCATION_V2_P0_PROGRAM.content.length,
          exerciseCount: EDUCATION_V2_P0_PROGRAM.exercises.length,
          questionCount: EDUCATION_V2_P0_PROGRAM.exercises.reduce(
            (total, exercise) => total + exercise.questions.length,
            0,
          ),
          pathCount: EDUCATION_V2_P0_PROGRAM.paths.length,
          assessmentCount: EDUCATION_V2_P0_PROGRAM.assessments.length,
          target: safeSummary(null),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!target) fail("seed hedefi okunamadı");

  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    assertIdentity(target, identity);
    const inspection = await prisma.$transaction(async (tx) => {
      await applySeedPlatformContext(tx);
      const [level, skills] = await Promise.all([
        tx.level.findUnique({
          where: { code: levelCode },
          select: { id: true, code: true },
        }),
        tx.skill.findMany({
          where: { code: { in: skillCodes } },
          select: { id: true, code: true, category: true },
        }),
      ]);
      if (!level) fail(`mevcut Level bulunamadı: ${levelCode}`);
      const skillPlan = buildSkillPlan(skills, skillCodes);
      const skillRowsForPlan = skillCodes.map((code) => {
        const existing = skillPlan.existing.find((skill) => skill.code === code);
        if (existing) return existing;
        return { id: `pending-${code}`, code };
      });
      const plans = planRecords(skillRowsForPlan);
      const mode = await inspectStableRows(tx, plans);
      return { level, skillPlan, mode };
    });
    const { level, skillPlan, mode } = inspection;
    if (mode === "CONFLICT")
      fail("program stable kayıtlarının bir kısmı mevcut; overwrite yapılmayacak");
    if (target.environment === "PRODUCTION") {
      if (skillPlan.missing.length > 0) {
        fail(
          `PRODUCTION mevcut skill kataloğunda eksik kayıt var; otomatik skill oluşturma kapalı: ${skillPlan.missing.map((skill) => skill.code).join(", ")}`,
        );
      }
      if (mode !== "CREATE") {
        fail(
          "PRODUCTION yalnızca tamamen yeni Education V2 P0 stable graph'ını oluşturabilir; mevcut kayıtlar değiştirilmeyecek",
        );
      }
    }
    if (mode === "NOOP" && skillPlan.missing.length > 0) {
      fail(
        `program kayıtları var fakat skill kayıtları eksik; güvenli NOOP mümkün değil: ${skillPlan.missing.map((skill) => skill.code).join(", ")}`,
      );
    }
    if (dryRun || mode === "NOOP") {
      console.log(
        JSON.stringify(
          {
            status: "PASS",
            mode: dryRun ? "DRY_RUN" : "NOOP",
            programId: EDUCATION_V2_P0_PROGRAM_ID,
            target: safeSummary(target, identity),
            level,
            skills: {
              existing: skillPlan.existing.map((skill) => skill.code),
              missing: skillPlan.missing.map((skill) => skill.code),
              applyAction: skillPlan.missing.length > 0 ? "CREATE_MISSING_ONLY" : "NONE",
            },
            stableRecordState: mode,
            contentCount: EDUCATION_V2_P0_PROGRAM.content.length,
            exerciseCount: EDUCATION_V2_P0_PROGRAM.exercises.length,
            pathCount: EDUCATION_V2_P0_PROGRAM.paths.length,
            assessmentCount: EDUCATION_V2_P0_PROGRAM.assessments.length,
          },
          null,
          2,
        ),
      );
      return;
    }

    await prisma.$transaction(async (tx) => {
      await applySeedPlatformContext(tx);
      const ensuredSkills = await ensureProgramSkills(tx, skillCodes);
      await createProgram(tx, planRecords(ensuredSkills), level.id);
    });
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "WRITE",
          programId: EDUCATION_V2_P0_PROGRAM_ID,
          target: safeSummary(target, identity),
          skills: {
            created: skillPlan.missing.map((skill) => skill.code),
            preserved: skillPlan.existing.map((skill) => skill.code),
          },
          contentCount: EDUCATION_V2_P0_PROGRAM.content.length,
          exerciseCount: EDUCATION_V2_P0_PROGRAM.exercises.length,
          pathCount: EDUCATION_V2_P0_PROGRAM.paths.length,
          assessmentCount: EDUCATION_V2_P0_PROGRAM.assessments.length,
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
    `Education V2 P0 seed FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
