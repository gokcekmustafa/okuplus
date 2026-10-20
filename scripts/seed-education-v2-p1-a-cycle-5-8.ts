import "dotenv/config";
import { readFileSync } from "node:fs";
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
  EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import {
  educationV2P1ACycle5To8AnswerKey,
  getEducationV2P1ACycle5To8,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8Id,
  p1ACycle5To8QuestionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateId,
  p1ACycle5To8TemplateVersionId,
  type EducationV2P1ACycle5To8Sequence,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import type { P1AProgram } from "../src/curriculum/education-v2-p1-a-program.js";
import type { EducationV2P1ExpansionDraftCycle } from "../src/curriculum/education-v2-p1-800-draft-cycles.js";
import { educationV2P1ACycle5To8SeedAction } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import {
  isCycle5To8PitrEvidenceValid,
  type Cycle5To8PitrEvidenceExpectation,
} from "./production-cycle4-pitr-restore-evidence.js";

const ACTIVE_SEQUENCE = Number(process.env.CYCLE58_SEQUENCE ?? "5");
if (![5, 6, 7, 8].includes(ACTIVE_SEQUENCE)) {
  throw new Error("CYCLE58_SEQUENCE 5, 6, 7 veya 8 olmalı");
}
const ACTIVE_CYCLE = getEducationV2P1ACycle5To8(ACTIVE_SEQUENCE);
if (!ACTIVE_CYCLE) throw new Error(`Cycle ${ACTIVE_SEQUENCE} programı bulunamadı`);
const ACTIVE_SOURCE_CYCLE = ACTIVE_CYCLE.sourceCycle;
const ACTIVE_PROGRAM = ACTIVE_CYCLE.program;
const ACTIVE_PROGRAM_ID = ACTIVE_PROGRAM.programId;
const ACTIVE_VERSION = ACTIVE_CYCLE.manifest.cycleVersion;
const ACTIVE_SEQUENCE_TYPED = ACTIVE_SEQUENCE as EducationV2P1ACycle5To8Sequence;

function activeId(kind: Parameters<typeof p1ACycle5To8Id>[1], key: string): string {
  return p1ACycle5To8Id(ACTIVE_SEQUENCE_TYPED, kind, key);
}
const activeContentVersionId = (key: string) =>
  p1ACycle5To8ContentVersionId(ACTIVE_SEQUENCE_TYPED, key);
const activeTemplateId = (key: string) => p1ACycle5To8TemplateId(ACTIVE_SEQUENCE_TYPED, key);
const activeTemplateVersionId = (key: string) =>
  p1ACycle5To8TemplateVersionId(ACTIVE_SEQUENCE_TYPED, key);
const activeQuestionId = (exerciseKey: string, questionKey: string) =>
  p1ACycle5To8QuestionId(ACTIVE_SEQUENCE_TYPED, `${exerciseKey}-${questionKey}`);
const activeQuestionVersionId = (exerciseKey: string, questionKey: string) =>
  p1ACycle5To8QuestionVersionId(ACTIVE_SEQUENCE_TYPED, `${exerciseKey}-${questionKey}`);
const activeAssessmentId = (key: string) => p1ACycle5To8AssessmentId(ACTIVE_SEQUENCE_TYPED, key);

const ACTIVE_SOURCE_RELEASE_COMMIT = process.env.GITHUB_SHA?.trim().toLowerCase() ?? "";
const ACTIVE_PRODUCTION_CONFIRMATION = `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLE_5_8_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT.toUpperCase()}_AT_${ACTIVE_SOURCE_RELEASE_COMMIT.toUpperCase()}`;

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") || args.has("--dry-run");
if ([...args].some((arg) => arg !== "--apply" && arg !== "--dry-run")) {
  throw new Error("yalnızca --dry-run veya --apply kullanılabilir");
}
if (args.has("--apply") && args.has("--dry-run")) {
  throw new Error("--apply ve --dry-run birlikte kullanılamaz");
}
const TARGET_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_ENVIRONMENT";
const DATABASE_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_DATABASE_URL";
const PRODUCTION_DATABASE_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_PRODUCTION_DATABASE_URL";
const PRODUCTION_DATABASE_NAME_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_PRODUCTION_DATABASE_NAME";
const PRODUCTION_DATABASE_HOST_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_PRODUCTION_DATABASE_HOST";
const PRODUCTION_RELEASE_ID_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_PRODUCTION_RELEASE_ID";
const PRODUCTION_RELEASE_COMMIT_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_PRODUCTION_RELEASE_COMMIT";
const PRODUCTION_APPROVAL_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_PRODUCTION_APPROVAL";
const APPROVED_FINGERPRINT_ENV = "EDUCATION_V2_P1_A_CYCLE_5_8_APPROVED_TARGET_FINGERPRINT";
const PITR_EVIDENCE_PATH_ENV = "CYCLE58_PITR_EVIDENCE_PATH";
const APPROVED_RELEASE_ID = EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_ID;
const PRODUCTION_CONFIRMATION = ACTIVE_PRODUCTION_CONFIRMATION;
type TargetEnvironment = "TEST" | "PRODUCTION";
type Target = CatalogTarget & { approvedTarget: CatalogTarget; approvedFingerprint: string };
type Program = P1AProgram;
type Plan = {
  content: Program["content"][number];
  sourceStation: EducationV2P1ExpansionDraftCycle["sourceStations"][number];
  contentId: string;
  contentVersionId: string;
  skillId: string;
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
  throw new Error(`Education V2 P1-A Cycle ${ACTIVE_SEQUENCE}–8 seed reddedildi: ${message}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function assertPitrRestoreEvidence(): void {
  const evidencePath = required(PITR_EVIDENCE_PATH_ENV);
  let evidence: Record<string, unknown>;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as Record<string, unknown>;
  } catch {
    fail("aynı korumalı workflow çalışmasına ait PITR kanıt dosyası okunamadı");
  }
  const expected: Cycle5To8PitrEvidenceExpectation = {
    runId: process.env.GITHUB_RUN_ID ?? "",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || "1",
    sha: process.env.GITHUB_SHA?.toLowerCase() ?? "",
    database: required(PRODUCTION_DATABASE_NAME_ENV),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
    scope: "cycle5-8",
  };
  if (!isCycle5To8PitrEvidenceValid(evidence, expected)) {
    fail("geçerli, başarılı ve aynı çalışmaya bağlı PITR geri yükleme kanıtı gerekli");
  }
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
    programId: ACTIVE_PROGRAM_ID,
    contractVersion: ACTIVE_VERSION,
    lessonType: plan.content.lesson ? "LEARNING_LESSON" : "LEARNING_EXERCISE",
    skillCode: plan.content.skillCode,
    objective: plan.content.lesson?.objective ?? plan.content.body,
    explanation: plan.content.lesson?.explanation ?? plan.content.body,
    workedExample: plan.content.lesson?.workedExample ?? "Metindeki kanıtı soruyla eşleştir.",
    guidedPractice: plan.content.lesson?.guidedPractice ?? "Soruyu oku, metne dön ve kanıtı seç.",
    exerciseTemplateVersionId: plan.exerciseTemplateVersionId ?? null,
    completionLabel: "Dersi tamamladım",
    area: "READING_COMPREHENSION",
    routeFamily: `P1-A-CYCLE-${ACTIVE_SEQUENCE}`,
    contentOrigin: plan.sourceStation.contentOrigin,
    provenanceStatus: plan.sourceStation.provenanceStatus,
    sourceReference: plan.sourceStation.sourceReference,
    sourceEvidence: plan.sourceStation.sourceEvidence ?? null,
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
    if (
      releaseId !== APPROVED_RELEASE_ID ||
      process.env.CYCLE58_RELEASE_ID !== APPROVED_RELEASE_ID ||
      !/^[0-9a-f]{40}$/u.test(ACTIVE_SOURCE_RELEASE_COMMIT) ||
      releaseCommit !== ACTIVE_SOURCE_RELEASE_COMMIT ||
      process.env.CYCLE58_RELEASE_COMMIT?.trim().toLowerCase() !== ACTIVE_SOURCE_RELEASE_COMMIT
    ) {
      fail("production release id/commit güncel Cycle 5–8 kaynak içeriğiyle eşleşmiyor");
    }
    if (target.database !== expectedDatabase || target.host !== expectedHost) {
      fail("production database kimliği beklenen Cycle 5–8 hedefiyle eşleşmiyor");
    }
    if (!dryRun && process.env[PRODUCTION_APPROVAL_ENV] !== PRODUCTION_CONFIRMATION) {
      fail(`production editorial approval=${PRODUCTION_CONFIRMATION} gerekli`);
    }
    if (
      dryRun &&
      (process.env.CYCLE58_OPERATION !== "PLAN_ONLY" ||
        process.env.CYCLE58_CONFIRMATION !== "PLAN_EDUCATION_V2_P1_A_CYCLE_5_8")
    ) {
      fail("read-only PLAN_ONLY doğrulama girdileri gerekli");
    }
    if (
      !dryRun &&
      (process.env.CYCLE58_OPERATION !== "APPLY" ||
        process.env.CYCLE58_CONFIRMATION !== "APPLY_EDUCATION_V2_P1_A_CYCLE_5_8")
    ) {
      fail("Cycle 5–8 APPLY için açık işlem onayı gerekli");
    }
    if (
      !dryRun &&
      (process.env.GITHUB_ACTIONS !== "true" ||
        process.env.GITHUB_REF !== "refs/heads/master" ||
        process.env.GITHUB_WORKFLOW !== "Manual Education V2 P1-A Cycles 5–8 production provision")
    ) {
      fail("production APPLY yalnızca korumalı master workflow üzerinden çalıştırılabilir");
    }
    if (!dryRun) assertPitrRestoreEvidence();
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
  return ACTIVE_PROGRAM.content.map((content) => {
    const skillId = skillByCode.get(content.skillCode);
    if (!skillId) fail(`gerekli mevcut skill bulunamadı: ${content.skillCode}`);
    const sourceStation = ACTIVE_SOURCE_CYCLE.sourceStations.find(
      (candidate) => candidate.key === content.key,
    );
    if (!sourceStation) fail(`kaynak taslak istasyonu bulunamadı: ${content.key}`);
    const exercise = ACTIVE_PROGRAM.exercises.find(
      (candidate) => candidate.contentKey === content.key,
    );
    const questions = exercise
      ? exercise.questions.map((candidate, position) => ({
          id: activeQuestionId(exercise.key, candidate.key),
          versionId: activeQuestionVersionId(exercise.key, candidate.key),
          question: candidate,
          position,
        }))
      : [];
    return {
      content,
      sourceStation,
      contentId: activeId("content", content.key),
      contentVersionId: activeContentVersionId(content.key),
      skillId,
      exercise,
      exerciseTemplateId: exercise ? activeTemplateId(exercise.key) : undefined,
      exerciseTemplateVersionId: exercise ? activeTemplateVersionId(exercise.key) : undefined,
      questions,
    };
  });
}

function answerFor(question: Plan["questions"][number]["question"]): Prisma.InputJsonValue {
  return educationV2P1ACycle5To8AnswerKey(question) as Prisma.InputJsonValue;
}

function runtimeVersionConfig(
  exercise: NonNullable<Plan["exercise"]>,
): TrainingExerciseVersionConfig {
  try {
    return parseTrainingExerciseVersionConfig(exercise.contract);
  } catch {
    fail(
      `Cycle ${ACTIVE_SEQUENCE} exercise version config veya renderer tanımı geçersiz: ${exercise.key}`,
    );
  }
}

function templateConfig(exercise: NonNullable<Plan["exercise"]>): Prisma.InputJsonValue {
  const config = runtimeVersionConfig(exercise);
  return {
    programId: ACTIVE_PROGRAM_ID,
    stableKey: `EDU-V2-P1-A-CYCLE-${ACTIVE_SEQUENCE}-${exercise.key.toUpperCase().replaceAll("-", "_")}`,
    version: ACTIVE_VERSION,
    competency: config.competency,
    rendererKey: config.rendererKey,
    contentKey: exercise.contentKey,
  };
}

function assessmentConfig(assessment: Program["assessments"][number]): Prisma.InputJsonValue {
  const exercise = ACTIVE_PROGRAM.exercises.find(
    (candidate) => candidate.key === assessment.templateExerciseKey,
  );
  if (!exercise) fail(`assessment template bulunamadı: ${assessment.key}`);
  return {
    programId: ACTIVE_PROGRAM_ID,
    templateId: activeTemplateId(exercise.key),
    templateVersionId: activeTemplateVersionId(exercise.key),
    questionCount: assessment.config.questionCount,
    minimumScorableCount: assessment.config.minimumScorableCount,
    minimumAnsweredCount: assessment.config.minimumAnsweredCount,
    completionMinimumScore: assessment.config.completionMinimumScore,
  };
}

function flattenedSteps() {
  return ACTIVE_PROGRAM.path.units.flatMap((unit) => unit.steps);
}

async function graphState(
  tx: Prisma.TransactionClient,
  plans: Plan[],
): Promise<"MISSING" | "EXISTING" | "CONFLICT"> {
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
  const assessmentIds = ACTIVE_PROGRAM.assessments.map((assessment) =>
    activeAssessmentId(assessment.key),
  );
  const pathId = activeId("path", ACTIVE_PROGRAM.path.code);
  const unitIds = ACTIVE_PROGRAM.path.units.map((unit) => activeId("unit", unit.code));
  const stepIds = flattenedSteps().map((step) => activeId("step", step.key));

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
    contentSkills.length +
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
    contentIds.length +
    templateIds.length +
    templateVersionIds.length +
    questionIds.length +
    questionVersionIds.length +
    assessmentIds.length +
    1 +
    unitIds.length +
    stepIds.length;
  if (existingCount !== expectedCount) return "CONFLICT";

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
    path?.version === ACTIVE_VERSION &&
    path.tenantId === null &&
    path.code === ACTIVE_PROGRAM.path.code &&
    path.title === ACTIVE_PROGRAM.path.title &&
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
          canonicalJson({
            programId: ACTIVE_PROGRAM_ID,
            contentKey: plan.content.key,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
          })
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
        item.changelog === `${ACTIVE_PROGRAM_ID}; contentKey=${plan.content.key}` &&
        canonicalJson(item.metadata) === canonicalJson(contentVersionMetadata(plan)) &&
        item.status === "PUBLISHED" &&
        item.publishedAt !== null
      );
    }) &&
    contentSkills.length === contentIds.length &&
    contentSkills.every((item) =>
      plans.some((plan) => plan.contentId === item.contentId && plan.skillId === item.skillId),
    ) &&
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
        canonicalJson(item.metadata) ===
          canonicalJson({
            programId: ACTIVE_PROGRAM_ID,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
          })
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
          canonicalJson({
            programId: ACTIVE_PROGRAM_ID,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
          }) &&
        item.status === "PUBLISHED" &&
        item.publishedAt !== null
      );
    }) &&
    assessments.every((item) => {
      const plan = ACTIVE_PROGRAM.assessments.find(
        (assessment) => activeAssessmentId(assessment.key) === item.id,
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
      const expected = ACTIVE_PROGRAM.path.units.find(
        (unit) => activeId("unit", unit.code) === item.id,
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
      const expected = expectedStepByKey.get(item.stableKey.replace(`${ACTIVE_PROGRAM_ID}:`, ""));
      const expectedUnit = expected
        ? ACTIVE_PROGRAM.path.units.find((unit) =>
            unit.steps.some((step) => step.key === expected.key),
          )
        : undefined;
      const expectedPreviousKey = expected?.prerequisiteStepKeys?.[0];
      const expectedPreviousId = expectedPreviousKey
        ? stepByKey.get(`${ACTIVE_PROGRAM_ID}:${expectedPreviousKey}`)?.id
        : null;
      return (
        expected !== undefined &&
        item.tenantId === null &&
        unitById.get(item.unitId)?.code === expectedUnit?.code &&
        item.stableKey === `${ACTIVE_PROGRAM_ID}:${expected.key}` &&
        item.type === expected.type &&
        item.title === expected.title &&
        expectedUnit !== undefined &&
        item.position === expectedUnit.steps.findIndex((step) => step.key === expected.key) + 1 &&
        item.source === "SYSTEM_DRIVEN" &&
        item.status === "PUBLISHED" &&
        item.isActive &&
        item.contentVersionId ===
          (expected.contentKey ? activeContentVersionId(expected.contentKey) : null) &&
        item.exerciseTemplateVersionId ===
          (expected.exerciseKey ? activeTemplateVersionId(expected.exerciseKey) : null) &&
        item.assessmentId ===
          (expected.assessmentKey ? activeAssessmentId(expected.assessmentKey) : null) &&
        item.prerequisiteStepId === expectedPreviousId &&
        canonicalJson(item.completionRule) ===
          canonicalJson({
            ...(expected.completionRule ?? {}),
            ...(expected.prerequisiteStepKeys?.length
              ? {
                  prerequisiteStepIds: expected.prerequisiteStepKeys.map(
                    (key) => stepByKey.get(`${ACTIVE_PROGRAM_ID}:${key}`)?.id,
                  ),
                }
              : {}),
          }) &&
        canonicalJson(item.metadata) ===
          canonicalJson({
            programId: ACTIVE_PROGRAM_ID,
            cycleVersion: ACTIVE_VERSION,
            routeFamily: "P1-A",
            area: ACTIVE_PROGRAM.path.area,
            unitCode: expectedUnit?.code,
            stepType: expected.type,
            skillCode:
              (expected.contentKey &&
                ACTIVE_PROGRAM.content.find((content) => content.key === expected.contentKey)
                  ?.skillCode) ??
              (expected.exerciseKey &&
                (() => {
                  const exercise = ACTIVE_PROGRAM.exercises.find(
                    (item) => item.key === expected.exerciseKey,
                  );
                  return ACTIVE_PROGRAM.content.find(
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
  return graphIsPublished ? "EXISTING" : "CONFLICT";
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
          programId: ACTIVE_PROGRAM_ID,
          contentKey: plan.content.key,
          contentOrigin: plan.sourceStation.contentOrigin,
          provenanceStatus: plan.sourceStation.provenanceStatus,
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
        changelog: `${ACTIVE_PROGRAM_ID}; contentKey=${plan.content.key}`,
        metadata: asJson(contentVersionMetadata(plan)),
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
            programId: ACTIVE_PROGRAM_ID,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
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
            programId: ACTIVE_PROGRAM_ID,
            contentOrigin: plan.sourceStation.contentOrigin,
            provenanceStatus: plan.sourceStation.provenanceStatus,
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

  for (const assessment of ACTIVE_PROGRAM.assessments) {
    await tx.assessment.create({
      data: {
        id: activeAssessmentId(assessment.key),
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
  const path = ACTIVE_PROGRAM.path;
  const pathId = activeId("path", path.code);
  await tx.learningPath.create({
    data: {
      id: pathId,
      tenantId: null,
      code: path.code,
      title: path.title,
      area: path.area,
      levelId: null,
      version: ACTIVE_VERSION,
      status: "PUBLISHED",
    },
  });
  const steps = flattenedSteps();
  const stepIdByKey = new Map(steps.map((step) => [step.key, activeId("step", step.key)]));
  const contentVersionByKey = new Map(
    ACTIVE_PROGRAM.content.map((content) => [content.key, activeContentVersionId(content.key)]),
  );
  const templateVersionByKey = new Map(
    ACTIVE_PROGRAM.exercises.map((exercise) => [
      exercise.key,
      activeTemplateVersionId(exercise.key),
    ]),
  );
  const assessmentByKey = new Map(
    ACTIVE_PROGRAM.assessments.map((assessment) => [
      assessment.key,
      activeAssessmentId(assessment.key),
    ]),
  );
  const skillByContentKey = new Map(
    ACTIVE_PROGRAM.content.map((content) => [content.key, content.skillCode]),
  );
  const skills = await tx.skill.findMany({
    where: { code: { in: [...new Set(skillByContentKey.values())] } },
    select: { id: true, code: true },
  });
  const skillIdByCode = new Map(skills.map((skill) => [skill.code, skill.id]));

  for (const unit of path.units) {
    const unitId = activeId("unit", unit.code);
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
        if (!id) fail(`ön koşul step bulunamadı: ${step.key} -> ${key}`);
        return id;
      });
      if (step.type === "TEACHING" && !contentVersionId) {
        fail(`öğretim içeriği eksik: ${step.key}`);
      }
      if (["SMALL_STUDY", "PRACTICE", "REINFORCEMENT"].includes(step.type) && !templateVersionId) {
        fail(`alıştırma sürümü eksik: ${step.key}`);
      }
      if (step.type === "ASSESSMENT" && !assessmentId) fail(`değerlendirme eksik: ${step.key}`);
      const exercise = step.exerciseKey
        ? ACTIVE_PROGRAM.exercises.find((item) => item.key === step.exerciseKey)
        : undefined;
      const skillCode =
        (step.contentKey && skillByContentKey.get(step.contentKey)) ||
        (exercise && skillByContentKey.get(exercise.contentKey));
      const skillId = skillCode ? skillIdByCode.get(skillCode) : undefined;
      if (skillCode && !skillId) fail(`mevcut skill bulunamadı: ${skillCode}`);
      await tx.learningStep.create({
        data: {
          id: activeId("step", step.key),
          tenantId: null,
          unitId,
          stableKey: `${ACTIVE_PROGRAM_ID}:${step.key}`,
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
            programId: ACTIVE_PROGRAM_ID,
            cycleVersion: ACTIVE_VERSION,
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
    immutableReleaseId: APPROVED_RELEASE_ID,
    expectedSourceCommit: ACTIVE_SOURCE_RELEASE_COMMIT || "NOT_AVAILABLE_OUTSIDE_ACTIONS",
    sequence: ACTIVE_SEQUENCE,
    programId: ACTIVE_PROGRAM_ID,
    pathCode: ACTIVE_PROGRAM.path.code,
    cycleVersion: ACTIVE_VERSION,
    unitCount: ACTIVE_PROGRAM.path.units.length,
    stepCount: flattenedSteps().length,
    contentCount: ACTIVE_PROGRAM.content.length,
    exerciseCount: ACTIVE_PROGRAM.exercises.length,
    questionCount: ACTIVE_PROGRAM.exercises.reduce(
      (sum, exercise) => sum + exercise.questions.length,
      0,
    ),
    assessmentCount: ACTIVE_PROGRAM.assessments.length,
    contentOriginCounts: {
      originalAuthoring: ACTIVE_SOURCE_CYCLE.sourceStations.filter(
        (station) => station.contentOrigin === "ORIGINAL_AUTHORING",
      ).length,
      sourceAdapted: ACTIVE_SOURCE_CYCLE.sourceStations.filter(
        (station) => station.contentOrigin === "SOURCE_ADAPTED",
      ).length,
    },
    sourceVerifiedCount: ACTIVE_SOURCE_CYCLE.sourceVerifiedStationCount,
    sourceReviewRequiredCount: ACTIVE_SOURCE_CYCLE.sourceStations.filter(
      (station) => station.provenanceStatus === "REVIEW_REQUIRED",
    ).length,
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
      await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p1-a-cycle-5-8-provisioner', true)`;
      const requiredSkillCodes = [
        ...new Set(ACTIVE_PROGRAM.content.map((content) => content.skillCode)),
      ];
      const skills = await tx.skill.findMany({
        where: { code: { in: requiredSkillCodes } },
        select: { id: true, code: true },
      });
      if (skills.length !== requiredSkillCodes.length)
        fail("döngü için gerekli skill kataloğu eksik");
      const plans = planRecords(skills);
      const state = await graphState(tx, plans);
      const action = educationV2P1ACycle5To8SeedAction(state, dryRun);
      if (action === "STOP_CONFLICT")
        fail("stable graph kısmi veya uyumsuz; overwrite yapılmayacak");
      if (action !== "CREATE_MISSING") return { state, dbChanged: false };
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
    `Education V2 P1-A Cycle ${ACTIVE_SEQUENCE} seed FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
