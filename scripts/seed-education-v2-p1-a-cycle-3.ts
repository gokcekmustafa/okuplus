import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  parseTrainingExerciseVersionConfig,
  type TrainingExerciseVersionConfig,
} from "../src/modules/training/exercise-contract.js";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  assertSameCatalogDatabaseTarget,
  parseCatalogTargetUrl,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";
import {
  CYCLE_3_LEARNING_OUTCOMES,
  EDUCATION_V2_P1_A_CYCLE_3_ID,
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_VERSION,
  p1ACycle3Id,
  p1ACycle3QuestionId,
  p1ACycle3QuestionVersionId,
  p1ACycle3TemplateId,
  p1ACycle3TemplateVersionId,
  p1ACycle3ContentVersionId,
  p1ACycle3AssessmentId,
} from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import { buildSeedLearningSkillContext } from "../src/curriculum/learning-step-skill-link.js";
import {
  compareContentSkillLinks,
  ensureContentSkillLinks,
  expectedContentSkillLinks,
  inspectContentSkillLinks,
} from "../src/curriculum/content-skill-link-repair.js";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") || args.has("--dry-run");
if ([...args].some((arg) => arg !== "--apply" && arg !== "--dry-run")) {
  throw new Error("yalnızca --dry-run veya --apply kullanılabilir");
}
if (args.has("--apply") && args.has("--dry-run")) {
  throw new Error("--apply ve --dry-run birlikte kullanılamaz");
}
const TARGET_ENV = "EDUCATION_V2_P1_A_CYCLE_3_ENVIRONMENT";
const DATABASE_ENV = "EDUCATION_V2_P1_A_CYCLE_3_DATABASE_URL";
const PRODUCTION_DATABASE_ENV = "EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_DATABASE_URL";
const PRODUCTION_DATABASE_NAME_ENV = "EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_DATABASE_NAME";
const PRODUCTION_DATABASE_HOST_ENV = "EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_DATABASE_HOST";
const PRODUCTION_RELEASE_ID_ENV = "EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_RELEASE_ID";
const PRODUCTION_RELEASE_COMMIT_ENV = "EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_RELEASE_COMMIT";
const PRODUCTION_APPROVAL_ENV = "EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_APPROVAL";
const APPROVED_FINGERPRINT_ENV = "EDUCATION_V2_P1_A_CYCLE_3_APPROVED_TARGET_FINGERPRINT";
const PRODUCTION_BACKUP_CONFIRMATION_ENV = "EDUCATION_V2_P1_A_CYCLE_3_BACKUP_CONFIRMATION";
const APPROVED_CONTENT_RELEASE_COMMIT = "d171073d1418cf835fc074ff337368d99884400a";
const APPROVED_RELEASE_ID = `${EDUCATION_V2_P1_A_CYCLE_3_ID}@v${EDUCATION_V2_P1_A_CYCLE_3_VERSION}:${APPROVED_CONTENT_RELEASE_COMMIT}`;
const PRODUCTION_CONFIRMATION =
  "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_EDITORIAL_RELEASE_D171073D1418CF835FC074FF337368D99884400A";
const BACKUP_CONFIRMATION = "I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK";

type TargetEnvironment = "TEST" | "PRODUCTION";
type Target = CatalogTarget & { approvedTarget: CatalogTarget; approvedFingerprint: string };
type Program = typeof EDUCATION_V2_P1_A_CYCLE_3_PROGRAM;
type Plan = {
  content: Program["content"][number];
  contentId: string;
  contentVersionId: string;
  skillId: string;
  curriculumSkills: Array<{ code: string; id: string }>;
  exercise?: Program["exercises"][number];
  exerciseTemplateId?: string;
  exerciseTemplateVersionId?: string;
  questions: Array<{
    id: string;
    versionId: string;
    question: Program["exercises"][number]["questions"][number];
    position: number;
  }>;
};
type Identity = { database: string; db_user: string; host: string | null; port: number | null };

function fail(message: string): never {
  throw new Error(`Education V2 P1-A Cycle 3 seed reddedildi: ${message}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value)) ?? "undefined";
}

function contentVersionMetadata(plan: Plan): Prisma.InputJsonValue {
  return {
    programId: EDUCATION_V2_P1_A_CYCLE_3_ID,
    contractVersion: EDUCATION_V2_P1_A_CYCLE_3_VERSION,
    lessonType: plan.content.lesson ? "LEARNING_LESSON" : "LEARNING_EXERCISE",
    skillCode: plan.content.skillCode,
    objective: plan.content.lesson?.objective ?? plan.content.body,
    explanation: plan.content.lesson?.explanation ?? plan.content.body,
    workedExample: plan.content.lesson?.workedExample ?? "Metindeki kanıtı soruyla eşleştir.",
    guidedPractice: plan.content.lesson?.guidedPractice ?? "Soruyu oku, metne dön ve kanıtı seç.",
    exerciseTemplateVersionId: plan.exerciseTemplateVersionId ?? null,
    completionLabel: "Dersi tamamladım",
    area: "READING_COMPREHENSION",
    routeFamily: "P1-A-CYCLE-3",
  };
}

function wordCount(body: string): number {
  return body.trim().split(/\s+/u).filter(Boolean).length;
}

function readTarget(): Target | null {
  const environment = process.env[TARGET_ENV]?.trim().toUpperCase();
  const rawUrl =
    process.env[environment === "PRODUCTION" ? PRODUCTION_DATABASE_ENV : DATABASE_ENV]?.trim();
  if (dryRun && !rawUrl && environment !== "PRODUCTION") return null;
  if (environment !== "TEST" && environment !== "PRODUCTION") {
    fail(`${TARGET_ENV}=TEST veya açıkça korunan PRODUCTION olmalı`);
  }
  if (!rawUrl) {
    fail(`${environment === "PRODUCTION" ? PRODUCTION_DATABASE_ENV : DATABASE_ENV} gerekli`);
  }

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
    const releaseId = required(PRODUCTION_RELEASE_ID_ENV);
    const releaseCommit = required(PRODUCTION_RELEASE_COMMIT_ENV).toLowerCase();
    if (releaseId !== APPROVED_RELEASE_ID || releaseCommit !== APPROVED_CONTENT_RELEASE_COMMIT) {
      fail("production release id/commit approved Cycle 3 source ile eşleşmiyor");
    }
    if (target.database !== expectedDatabase || target.host !== expectedHost) {
      fail("production database kimliği beklenen Cycle 3 hedefiyle eşleşmiyor");
    }
    if (!dryRun && process.env[PRODUCTION_APPROVAL_ENV] !== PRODUCTION_CONFIRMATION) {
      fail(`production editorial approval=${PRODUCTION_CONFIRMATION} gerekli`);
    }
    if (!dryRun && process.env[PRODUCTION_BACKUP_CONFIRMATION_ENV] !== BACKUP_CONFIRMATION) {
      fail(`production backup/rollback confirmation=${BACKUP_CONFIRMATION} gerekli`);
    }
    if (
      !dryRun &&
      (process.env.GITHUB_ACTIONS !== "true" ||
        process.env.GITHUB_REF !== "refs/heads/master" ||
        process.env.GITHUB_WORKFLOW !== "Manual Education V2 P1-A Cycle 3 production provision")
    ) {
      fail("production APPLY yalnızca korumalı master workflow üzerinden çalıştırılabilir");
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

function planRecords(skills: Array<{ id: string; code: string }>): Plan[] {
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill.id]));
  const skillCodeById = new Map(skills.map((skill) => [skill.id, skill.code]));
  const skillContext = buildSeedLearningSkillContext({
    outcomes: CYCLE_3_LEARNING_OUTCOMES,
    steps: flattenedSteps(),
    skillIdByCode: skillByCode,
    exerciseContentKeyByKey: new Map(
      EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.map((exercise) => [
        exercise.key,
        exercise.contentKey,
      ]),
    ),
    assessmentExerciseKeyByKey: new Map(
      EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.assessments.map((assessment) => [
        assessment.key,
        assessment.templateExerciseKey,
      ]),
    ),
  });
  return EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content.map((content) => {
    const skillId = skillByCode.get(content.skillCode);
    if (!skillId) fail(`gerekli mevcut skill bulunamadı: ${content.skillCode}`);
    const exercise = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.find(
      (candidate) => candidate.contentKey === content.key,
    );
    const questions = exercise
      ? exercise.questions.map((candidate, position) => ({
          id: p1ACycle3QuestionId(exercise.key, candidate.key),
          versionId: p1ACycle3QuestionVersionId(exercise.key, candidate.key),
          question: candidate,
          position,
        }))
      : [];
    const linkedSkillIds = skillContext.skillIdsByContentKey.get(content.key) ?? [];
    const curriculumSkills = [
      ...new Map(
        [
          { code: content.skillCode, id: skillId },
          ...linkedSkillIds.map((id) => ({ code: skillCodeById.get(id) ?? "", id })),
        ].map((skill) => [skill.id, skill]),
      ).values(),
    ];
    if (curriculumSkills.some((skill) => !skill.code))
      fail(`Cycle 3 kazanım becerisi içerikle eşlenemiyor: ${content.key}`);
    return {
      content,
      contentId: p1ACycle3Id("content", content.key),
      contentVersionId: p1ACycle3ContentVersionId(content.key),
      skillId,
      curriculumSkills,
      exercise,
      exerciseTemplateId: exercise ? p1ACycle3TemplateId(exercise.key) : undefined,
      exerciseTemplateVersionId: exercise ? p1ACycle3TemplateVersionId(exercise.key) : undefined,
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

function runtimeVersionConfig(
  exercise: NonNullable<Plan["exercise"]>,
): TrainingExerciseVersionConfig {
  try {
    return parseTrainingExerciseVersionConfig(exercise.contract);
  } catch {
    fail(`Cycle 3 exercise version config geçersiz veya renderer tanımı eksik: ${exercise.key}`);
  }
}

function templateConfig(exercise: NonNullable<Plan["exercise"]>): Prisma.InputJsonValue {
  const config = runtimeVersionConfig(exercise);
  return {
    programId: EDUCATION_V2_P1_A_CYCLE_3_ID,
    stableKey: `EDU-V2-P1-A-CYCLE-3-${exercise.key.toUpperCase().replaceAll("-", "_")}`,
    version: EDUCATION_V2_P1_A_CYCLE_3_VERSION,
    competency: config.competency,
    rendererKey: config.rendererKey,
    contentKey: exercise.contentKey,
  };
}

function assessmentConfig(assessment: Program["assessments"][number]): Prisma.InputJsonValue {
  const exercise = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.find(
    (candidate) => candidate.key === assessment.templateExerciseKey,
  );
  if (!exercise) fail(`assessment template bulunamadı: ${assessment.key}`);
  return {
    programId: EDUCATION_V2_P1_A_CYCLE_3_ID,
    templateId: p1ACycle3TemplateId(exercise.key),
    templateVersionId: p1ACycle3TemplateVersionId(exercise.key),
    questionCount: assessment.config.questionCount,
    minimumScorableCount: assessment.config.minimumScorableCount,
    minimumAnsweredCount: assessment.config.minimumAnsweredCount,
    completionMinimumScore: assessment.config.completionMinimumScore,
  };
}

function flattenedSteps() {
  return EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.flatMap((unit) => unit.steps);
}

async function graphState(
  tx: Prisma.TransactionClient,
  plans: Plan[],
): Promise<"MISSING" | "EXISTING" | "SKILL_LINKS_MISSING" | "CONFLICT"> {
  const contentIds = plans.map((plan) => plan.contentId);
  const contentVersionIds = plans.map((plan) => plan.contentVersionId);
  const templateIds = plans.flatMap((plan) =>
    plan.exerciseTemplateId ? [plan.exerciseTemplateId] : [],
  );
  const templateVersionIds = plans.flatMap((plan) =>
    plan.exerciseTemplateVersionId ? [plan.exerciseTemplateVersionId] : [],
  );
  const questionIds = plans.flatMap((plan) => plan.questions.map((question) => question.id));
  const questionVersionIds = plans.flatMap((plan) =>
    plan.questions.map((question) => question.versionId),
  );
  const assessmentIds = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.assessments.map((assessment) =>
    p1ACycle3AssessmentId(assessment.key),
  );
  const pathId = p1ACycle3Id("path", EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code);
  const unitIds = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.map((unit) =>
    p1ACycle3Id("unit", unit.code),
  );
  const stepIds = flattenedSteps().map((step) => p1ACycle3Id("step", step.key));

  const [
    contents,
    versions,
    contentSkills,
    templates,
    templateVersions,
    templateContents,
    templateQuestions,
    questions,
    questionVersions,
    assessments,
    paths,
    units,
    steps,
  ] = await Promise.all([
    tx.content.findMany({
      where: { id: { in: contentIds } },
      select: {
        id: true,
        tenantId: true,
        status: true,
        currentVersionId: true,
        type: true,
        title: true,
        difficulty: true,
        metadata: true,
      },
    }),
    tx.contentVersion.findMany({
      where: { id: { in: contentVersionIds } },
      select: {
        id: true,
        contentId: true,
        version: true,
        title: true,
        body: true,
        wordCount: true,
        license: true,
        changelog: true,
        metadata: true,
        status: true,
        publishedAt: true,
      },
    }),
    tx.contentSkill.findMany({
      where: { contentId: { in: contentIds } },
      select: { contentId: true, skillId: true },
    }),
    tx.exerciseTemplate.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true,
        tenantId: true,
        title: true,
        type: true,
        skillId: true,
        contentId: true,
        config: true,
        status: true,
      },
    }),
    tx.exerciseTemplateVersion.findMany({
      where: { id: { in: templateVersionIds } },
      select: {
        id: true,
        templateId: true,
        version: true,
        config: true,
        status: true,
        publishedAt: true,
      },
    }),
    tx.exerciseTemplateVersionContent.findMany({
      where: { templateVersionId: { in: templateVersionIds } },
      select: { templateVersionId: true, contentVersionId: true, position: true },
    }),
    tx.exerciseTemplateVersionQuestion.findMany({
      where: { templateVersionId: { in: templateVersionIds } },
      select: {
        templateVersionId: true,
        questionVersionId: true,
        questionId: true,
        position: true,
      },
    }),
    tx.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        contentId: true,
        position: true,
        type: true,
        skillId: true,
        status: true,
        metadata: true,
      },
    }),
    tx.questionVersion.findMany({
      where: { id: { in: questionVersionIds } },
      select: {
        id: true,
        questionId: true,
        contentVersionId: true,
        version: true,
        prompt: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        hint: true,
        difficulty: true,
        generationMetadata: true,
        status: true,
        publishedAt: true,
      },
    }),
    tx.assessment.findMany({
      where: { id: { in: assessmentIds } },
      select: { id: true, tenantId: true, title: true, type: true, config: true, status: true },
    }),
    tx.learningPath.findMany({
      where: { id: pathId },
      select: {
        id: true,
        tenantId: true,
        code: true,
        title: true,
        area: true,
        levelId: true,
        status: true,
        version: true,
      },
    }),
    tx.learningUnit.findMany({
      where: { id: { in: unitIds } },
      select: {
        id: true,
        tenantId: true,
        pathId: true,
        code: true,
        title: true,
        position: true,
        status: true,
      },
    }),
    tx.learningStep.findMany({
      where: { id: { in: stepIds } },
      select: {
        id: true,
        tenantId: true,
        unitId: true,
        stableKey: true,
        title: true,
        position: true,
        type: true,
        source: true,
        status: true,
        isActive: true,
        contentVersionId: true,
        exerciseTemplateVersionId: true,
        assessmentId: true,
        prerequisiteStepId: true,
        completionRule: true,
        metadata: true,
      },
    }),
  ]);
  const existingCount =
    contents.length +
    versions.length +
    templates.length +
    templateVersions.length +
    questions.length +
    questionVersions.length +
    assessments.length +
    paths.length +
    units.length +
    steps.length;
  if (existingCount === 0) return "MISSING";

  const expectedCount =
    contentIds.length +
    contentVersionIds.length +
    templateIds.length +
    templateVersionIds.length +
    questionIds.length +
    questionVersionIds.length +
    assessmentIds.length +
    1 +
    unitIds.length +
    stepIds.length;
  if (existingCount !== expectedCount) return "CONFLICT";

  const skillLinkComparison = compareContentSkillLinks(
    expectedContentSkillLinks(plans),
    contentSkills,
  );
  if (skillLinkComparison.state === "CONFLICT") return "CONFLICT";

  const contentById = new Map(contents.map((item) => [item.id, item]));
  const versionById = new Map(versions.map((item) => [item.id, item]));
  const templateById = new Map(templates.map((item) => [item.id, item]));
  const templateVersionById = new Map(templateVersions.map((item) => [item.id, item]));
  const questionById = new Map(questions.map((item) => [item.id, item]));
  const questionVersionById = new Map(questionVersions.map((item) => [item.id, item]));
  const unitById = new Map(units.map((item) => [item.id, item]));
  const stepByKey = new Map(steps.map((item) => [item.stableKey, item]));
  const expectedStepByKey = new Map(flattenedSteps().map((step) => [step.key, step]));
  const path = paths[0];
  const graphIsPublished =
    path?.version === EDUCATION_V2_P1_A_CYCLE_3_VERSION &&
    path.tenantId === null &&
    path.code === EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code &&
    path.title === EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.title &&
    path.area === "READING_COMPREHENSION" &&
    path.levelId === null &&
    path.status === "PUBLISHED" &&
    contents.every((item) => {
      const plan = plans.find((candidate) => candidate.contentId === item.id);
      return (
        plan !== undefined &&
        item.tenantId === null &&
        item.type === "PASSAGE" &&
        item.title === plan.content.title &&
        item.difficulty === plan.content.difficulty &&
        item.status === "PUBLISHED" &&
        item.currentVersionId === plan.contentVersionId &&
        canonicalJson(item.metadata) ===
          canonicalJson({ programId: EDUCATION_V2_P1_A_CYCLE_3_ID, contentKey: plan.content.key })
      );
    }) &&
    versions.every((item) => {
      const plan = plans.find((candidate) => candidate.contentVersionId === item.id);
      return (
        plan !== undefined &&
        item.contentId === plan.contentId &&
        item.version === 1 &&
        item.title === plan.content.title &&
        item.body === plan.content.body &&
        item.wordCount === wordCount(plan.content.body) &&
        item.license === "Özgün OkuPratik eğitim içeriği." &&
        item.changelog === `${EDUCATION_V2_P1_A_CYCLE_3_ID}; contentKey=${plan.content.key}` &&
        canonicalJson(item.metadata) === canonicalJson(contentVersionMetadata(plan)) &&
        item.status === "PUBLISHED" &&
        item.publishedAt !== null
      );
    }) &&
    templates.every((item) => {
      const plan = plans.find((candidate) => candidate.exerciseTemplateId === item.id);
      return (
        plan?.exercise !== undefined &&
        item.tenantId === null &&
        item.title === plan.exercise.title &&
        item.type === plan.exercise.templateType &&
        item.skillId === plan.skillId &&
        item.contentId === plan.contentId &&
        canonicalJson(item.config) === canonicalJson(templateConfig(plan.exercise)) &&
        item.status === "PUBLISHED"
      );
    }) &&
    templateVersions.every((item) => {
      const plan = plans.find((candidate) => candidate.exerciseTemplateVersionId === item.id);
      return (
        plan?.exercise !== undefined &&
        item.templateId === plan.exerciseTemplateId &&
        item.version === 1 &&
        canonicalJson(item.config) === canonicalJson(runtimeVersionConfig(plan.exercise)) &&
        item.status === "PUBLISHED" &&
        item.publishedAt !== null
      );
    }) &&
    questions.every((item) => {
      const plan = plans.find((candidate) => candidate.contentId === item.contentId);
      const expected = plan?.questions.find((candidate) => candidate.id === item.id);
      return (
        plan !== undefined &&
        expected !== undefined &&
        item.position === expected.position &&
        item.type === "MULTIPLE_CHOICE" &&
        item.skillId === plan.skillId &&
        item.status === "PUBLISHED" &&
        canonicalJson(item.metadata) === canonicalJson({ programId: EDUCATION_V2_P1_A_CYCLE_3_ID })
      );
    }) &&
    questionVersions.every((item) => {
      const plan = plans.find((candidate) =>
        candidate.questions.some((question) => question.versionId === item.id),
      );
      const expected = plan?.questions.find((question) => question.versionId === item.id);
      return (
        plan !== undefined &&
        expected !== undefined &&
        item.questionId === expected.id &&
        item.contentVersionId === plan.contentVersionId &&
        item.version === 1 &&
        item.prompt === expected.question.prompt &&
        canonicalJson(item.options) === canonicalJson(expected.question.options) &&
        canonicalJson(item.correctAnswer) === canonicalJson(answerFor(expected.question)) &&
        item.explanation === expected.question.explanation &&
        item.hint === expected.question.hint &&
        item.difficulty === expected.question.difficulty &&
        canonicalJson(item.generationMetadata) ===
          canonicalJson({ programId: EDUCATION_V2_P1_A_CYCLE_3_ID }) &&
        item.status === "PUBLISHED" &&
        item.publishedAt !== null
      );
    }) &&
    assessments.every((item) => {
      const plan = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.assessments.find(
        (assessment) => p1ACycle3AssessmentId(assessment.key) === item.id,
      );
      return (
        plan !== undefined &&
        item.tenantId === null &&
        item.title === plan.title &&
        item.type === "DIAGNOSTIC" &&
        canonicalJson(item.config) === canonicalJson(assessmentConfig(plan)) &&
        item.status === "PUBLISHED"
      );
    }) &&
    units.every((item) => {
      const expected = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.find(
        (unit) => p1ACycle3Id("unit", unit.code) === item.id,
      );
      return (
        expected !== undefined &&
        item.tenantId === null &&
        item.pathId === pathId &&
        item.code === expected.code &&
        item.title === expected.title &&
        item.position === expected.position &&
        item.status === "PUBLISHED"
      );
    }) &&
    steps.every((item) => {
      const expected = expectedStepByKey.get(
        item.stableKey.replace(`${EDUCATION_V2_P1_A_CYCLE_3_ID}:`, ""),
      );
      const expectedUnit = expected
        ? EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.find((unit) =>
            unit.steps.some((step) => step.key === expected.key),
          )
        : undefined;
      const expectedPreviousKey = expected?.prerequisiteStepKeys?.[0];
      const expectedPreviousId = expectedPreviousKey
        ? stepByKey.get(`${EDUCATION_V2_P1_A_CYCLE_3_ID}:${expectedPreviousKey}`)?.id
        : null;
      return (
        expected !== undefined &&
        item.tenantId === null &&
        unitById.get(item.unitId)?.code === expectedUnit?.code &&
        item.stableKey === `${EDUCATION_V2_P1_A_CYCLE_3_ID}:${expected.key}` &&
        item.type === expected.type &&
        item.title === expected.title &&
        expectedUnit !== undefined &&
        item.position === expectedUnit.steps.findIndex((step) => step.key === expected.key) + 1 &&
        item.source === "SYSTEM_DRIVEN" &&
        item.status === "PUBLISHED" &&
        item.isActive &&
        item.contentVersionId ===
          (expected.contentKey ? p1ACycle3ContentVersionId(expected.contentKey) : null) &&
        item.exerciseTemplateVersionId ===
          (expected.exerciseKey ? p1ACycle3TemplateVersionId(expected.exerciseKey) : null) &&
        item.assessmentId ===
          (expected.assessmentKey ? p1ACycle3AssessmentId(expected.assessmentKey) : null) &&
        item.prerequisiteStepId === expectedPreviousId &&
        canonicalJson(item.completionRule) ===
          canonicalJson({
            ...(expected.completionRule ?? {}),
            ...(expected.prerequisiteStepKeys?.length
              ? {
                  prerequisiteStepIds: expected.prerequisiteStepKeys.map(
                    (key) => stepByKey.get(`${EDUCATION_V2_P1_A_CYCLE_3_ID}:${key}`)?.id,
                  ),
                }
              : {}),
          }) &&
        canonicalJson(item.metadata) ===
          canonicalJson({
            programId: EDUCATION_V2_P1_A_CYCLE_3_ID,
            cycleVersion: EDUCATION_V2_P1_A_CYCLE_3_VERSION,
            routeFamily: "P1-A",
            area: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.area,
            unitCode: expectedUnit?.code,
            stepType: expected.type,
            skillCode:
              (expected.contentKey &&
                EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content.find(
                  (content) => content.key === expected.contentKey,
                )?.skillCode) ??
              (expected.exerciseKey &&
                (() => {
                  const exercise = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.find(
                    (item) => item.key === expected.exerciseKey,
                  );
                  return EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content.find(
                    (content) => content.key === exercise?.contentKey,
                  )?.skillCode;
                })()) ??
              null,
          })
      );
    }) &&
    templateContents.length === templateVersionIds.length &&
    templateContents.every((item) => {
      const plan = plans.find(
        (candidate) => candidate.exerciseTemplateVersionId === item.templateVersionId,
      );
      return plan?.contentVersionId === item.contentVersionId && item.position === 0;
    }) &&
    templateQuestions.length === questionVersionIds.length &&
    templateQuestions.every((item) => {
      const plan = plans.find(
        (candidate) => candidate.exerciseTemplateVersionId === item.templateVersionId,
      );
      const question = plan?.questions.find(
        (candidate) => candidate.versionId === item.questionVersionId,
      );
      return (
        question !== undefined &&
        question.id === item.questionId &&
        question.position === item.position
      );
    }) &&
    plans.every((plan) => {
      const content = contentById.get(plan.contentId);
      const version = versionById.get(plan.contentVersionId);
      const template = plan.exerciseTemplateId
        ? templateById.get(plan.exerciseTemplateId)
        : undefined;
      const templateVersion = plan.exerciseTemplateVersionId
        ? templateVersionById.get(plan.exerciseTemplateVersionId)
        : undefined;
      return (
        content?.currentVersionId === plan.contentVersionId &&
        version?.contentId === plan.contentId &&
        (!plan.exerciseTemplateId || template?.status === "PUBLISHED") &&
        (!plan.exerciseTemplateVersionId ||
          templateVersion?.templateId === plan.exerciseTemplateId) &&
        plan.questions.every((question) => {
          const row = questionById.get(question.id);
          const rowVersion = questionVersionById.get(question.versionId);
          return (
            row?.contentId === plan.contentId &&
            rowVersion?.questionId === question.id &&
            rowVersion.contentVersionId === plan.contentVersionId
          );
        })
      );
    });
  return graphIsPublished
    ? skillLinkComparison.state === "MISSING"
      ? "SKILL_LINKS_MISSING"
      : "EXISTING"
    : "CONFLICT";
}

async function repairMissingContentSkillLinks(
  tx: Prisma.TransactionClient,
  plans: readonly Plan[],
): Promise<number> {
  const result = await ensureContentSkillLinks(tx.contentSkill, expectedContentSkillLinks(plans));
  if (result.state === "CONFLICT")
    fail("mevcut ContentSkill ilişkileri kaynak planıyla çelişiyor; otomatik değişiklik yapılmadı");
  return result.insertedCount;
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
        metadata: asJson({
          programId: EDUCATION_V2_P1_A_CYCLE_3_ID,
          contentKey: plan.content.key,
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
        changelog: `${EDUCATION_V2_P1_A_CYCLE_3_ID}; contentKey=${plan.content.key}`,
        metadata: asJson(contentVersionMetadata(plan)),
        status: "DRAFT",
      },
    });
    for (const skill of plan.curriculumSkills) {
      await tx.contentSkill.create({ data: { contentId: content.id, skillId: skill.id } });
    }

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
          metadata: asJson({ programId: EDUCATION_V2_P1_A_CYCLE_3_ID }),
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
          generationMetadata: asJson({ programId: EDUCATION_V2_P1_A_CYCLE_3_ID }),
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
          config: asJson(runtimeVersionConfig(plan.exercise)),
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

  for (const assessment of EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.assessments) {
    await tx.assessment.create({
      data: {
        id: p1ACycle3AssessmentId(assessment.key),
        tenantId: null,
        title: assessment.title,
        type: "DIAGNOSTIC",
        config: assessmentConfig(assessment),
        status: "PUBLISHED",
      },
    });
  }
}

async function createLearningPath(tx: Prisma.TransactionClient): Promise<void> {
  const path = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path;
  const pathId = p1ACycle3Id("path", path.code);
  await tx.learningPath.create({
    data: {
      id: pathId,
      tenantId: null,
      code: path.code,
      title: path.title,
      area: path.area,
      levelId: null,
      version: EDUCATION_V2_P1_A_CYCLE_3_VERSION,
      status: "PUBLISHED",
    },
  });
  const steps = flattenedSteps();
  const stepIdByKey = new Map(steps.map((step) => [step.key, p1ACycle3Id("step", step.key)]));
  const contentVersionByKey = new Map(
    EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content.map((content) => [
      content.key,
      p1ACycle3ContentVersionId(content.key),
    ]),
  );
  const templateVersionByKey = new Map(
    EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.map((exercise) => [
      exercise.key,
      p1ACycle3TemplateVersionId(exercise.key),
    ]),
  );
  const assessmentByKey = new Map(
    EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.assessments.map((assessment) => [
      assessment.key,
      p1ACycle3AssessmentId(assessment.key),
    ]),
  );
  const skillByContentKey = new Map(
    EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content.map((content) => [content.key, content.skillCode]),
  );
  const skills = await tx.skill.findMany({
    where: { code: { in: [...new Set(skillByContentKey.values())] } },
    select: { id: true, code: true },
  });
  const skillIdByCode = new Map(skills.map((skill) => [skill.code, skill.id]));

  for (const unit of path.units) {
    const unitId = p1ACycle3Id("unit", unit.code);
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
        if (!id) fail(`Cycle 3 prerequisite step bulunamadı: ${step.key} -> ${key}`);
        return id;
      });
      if (step.type === "TEACHING" && !contentVersionId) {
        fail(`Cycle 3 teaching content eksik: ${step.key}`);
      }
      if (["SMALL_STUDY", "PRACTICE", "REINFORCEMENT"].includes(step.type) && !templateVersionId) {
        fail(`Cycle 3 exercise version eksik: ${step.key}`);
      }
      if (step.type === "ASSESSMENT" && !assessmentId)
        fail(`Cycle 3 assessment eksik: ${step.key}`);
      const exercise = step.exerciseKey
        ? EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.find((item) => item.key === step.exerciseKey)
        : undefined;
      const skillCode =
        (step.contentKey && skillByContentKey.get(step.contentKey)) ||
        (exercise && skillByContentKey.get(exercise.contentKey));
      const skillId = skillCode ? skillIdByCode.get(skillCode) : undefined;
      if (skillCode && !skillId) fail(`Cycle 3 için mevcut skill bulunamadı: ${skillCode}`);
      await tx.learningStep.create({
        data: {
          id: p1ACycle3Id("step", step.key),
          tenantId: null,
          unitId,
          stableKey: `${EDUCATION_V2_P1_A_CYCLE_3_ID}:${step.key}`,
          title: step.title,
          position: index + 1,
          type: step.type,
          source: "SYSTEM_DRIVEN",
          status: "PUBLISHED",
          isActive: true,
          contentVersionId,
          exerciseTemplateVersionId: templateVersionId,
          assessmentId,
          skillId,
          prerequisiteStepId: prerequisiteStepIds[0] ?? null,
          completionRule: asJson({
            ...(step.completionRule ?? {}),
            ...(prerequisiteStepIds.length ? { prerequisiteStepIds } : {}),
          }),
          metadata: asJson({
            programId: EDUCATION_V2_P1_A_CYCLE_3_ID,
            cycleVersion: EDUCATION_V2_P1_A_CYCLE_3_VERSION,
            routeFamily: "P1-A",
            area: path.area,
            unitCode: unit.code,
            stepType: step.type,
            skillCode: skillCode ?? null,
          }),
        },
      });
    }
  }
}

function summary(target: Target | null, identity: Identity | null): Record<string, unknown> {
  return {
    environment: target?.environment ?? "MANIFEST_ONLY",
    database: identity?.database ?? target?.database ?? "NOT_CONNECTED",
    productionReleaseId:
      target?.environment === "PRODUCTION"
        ? (process.env[PRODUCTION_RELEASE_ID_ENV] ?? "NOT_PROVIDED")
        : "NOT_APPLICABLE",
    productionReleaseCommit:
      target?.environment === "PRODUCTION"
        ? (process.env[PRODUCTION_RELEASE_COMMIT_ENV] ?? "NOT_PROVIDED")
        : "NOT_APPLICABLE",
    programId: EDUCATION_V2_P1_A_CYCLE_3_ID,
    pathCode: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code,
    cycleVersion: EDUCATION_V2_P1_A_CYCLE_3_VERSION,
    unitCount: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.length,
    stepCount: flattenedSteps().length,
    contentCount: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content.length,
    exerciseCount: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.length,
    questionCount: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.reduce(
      (sum, exercise) => sum + exercise.questions.length,
      0,
    ),
    assessmentCount: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.assessments.length,
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
    transactionOptions: { maxWait: 20_000, timeout: 120_000 },
  });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    await verifyTarget(prisma, target, identity);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p1-a-cycle-3-provisioner', true)`;
      const skills = await tx.skill.findMany({
        where: { code: { in: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"] } },
        select: { id: true, code: true },
      });
      if (skills.length !== 3) fail("Cycle 3 için mevcut RC skill kataloğu eksik");
      const plans = planRecords(skills);
      let state = await graphState(tx, plans);
      if (state === "CONFLICT")
        fail("Cycle 3 stable graph kısmi veya uyumsuz; overwrite yapılmayacak");
      let missingSkillLinkCount = 0;
      if (state === "SKILL_LINKS_MISSING") {
        const comparison = await inspectContentSkillLinks(
          tx.contentSkill,
          expectedContentSkillLinks(plans),
        );
        if (comparison.state === "CONFLICT")
          fail("Cycle 3 içerik-beceri bağlantıları kaynak planıyla çelişiyor");
        missingSkillLinkCount = comparison.missingLinks.length;
        if (comparison.state === "COMPLETE") state = "EXISTING";
      }
      if (dryRun) return { state, dbChanged: false, missingSkillLinkCount };
      if (state === "SKILL_LINKS_MISSING") {
        const insertedSkillLinkCount = await repairMissingContentSkillLinks(tx, plans);
        return {
          state: "SKILL_LINKS_REPAIRED",
          dbChanged: insertedSkillLinkCount > 0,
          missingSkillLinkCount,
          insertedSkillLinkCount,
        };
      }
      if (state === "EXISTING") return { state, dbChanged: false };
      await createContentGraph(tx, plans);
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
    `Education V2 P1-A Cycle 3 seed FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
