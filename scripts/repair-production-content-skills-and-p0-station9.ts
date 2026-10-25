import { appendFile, writeFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  compareContentSkillLinks,
  ensureContentSkillLinks,
  type ContentSkillLink,
} from "../src/curriculum/content-skill-link-repair.js";
import {
  learningRouteCycle,
  sourceContentSkillTargetsForRouteStep,
} from "../src/curriculum/learning-route-catalog.js";
import {
  assertCatalogEnvironmentSafety,
  assertApprovedTargetFingerprint,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
} from "../src/curriculum/catalog-target-verification.js";
import {
  EDUCATION_V2_P0_PATH_SCOPE_CODE,
  getProgramExercise,
  questionId as p0QuestionId,
  questionVersionId as p0QuestionVersionId,
} from "../src/curriculum/education-v2-p0-program.js";
import {
  P0_STATION9_V3_RELEASE,
  p0Station9OwnerApprovalToken,
  p0Station9V3ReleaseFingerprint,
} from "../src/curriculum/p0-station9-question-release.js";

const APPROVED_P1_ROUTE_COUNT = 19;
const APPROVED_P1_ACTIVE_STEP_COUNT = 105;
const APPROVED_CONTENT_SKILL_EXPECTED_COUNT = 213;
const APPROVED_CONTENT_SKILL_MISSING_COUNT = 108;
const APPROVED_MISSING_BY_ROUTE = { A: 93, B: 10, C: 5, D: 0 } as const;
const OPERATION_CONFIRMATION = "APPLY_OKUPRATIK_SKILL_REPAIR_AND_P0_STATION9_V3";

type DbIdentity = { database: string; db_user: string; server_port: number | null };
type LinkSource = {
  contentId: string;
  skillId: string;
  skillCode: string;
  routeFamily: "A" | "B" | "C" | "D";
};
let executionStage = "workflow_gate";
let productionTransactionCommitted = false;
type SafeReport = {
  status: "PASS";
  operationId: string;
  sourceCommit: string;
  productionTarget: "VERIFIED";
  p1ContentSkills: {
    publishedRoutes: number;
    activePublishedSteps: number;
    expectedUniquePairs: number;
    alreadyPresentBefore: number;
    inserted: number;
    remainingMissing: number;
    unexpectedRelations: number;
    missingBeforeByRoute: Record<string, number>;
  };
  p0Station9: {
    stableStepKey: string;
    previousTemplateVersionId: string;
    activeTemplateVersionId: string;
    questionVersionId: string;
    questionVersionCreated: boolean;
    templateVersionCreated: boolean;
    stepPointerUpdated: boolean;
  };
  studentProgressChanged: false;
  answersChanged: false;
  migrationsRun: false;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing:${name}`);
  return value;
}

function assertRuntimeGate(): void {
  if (
    process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    process.env.GITHUB_REF !== "refs/heads/master" ||
    process.env.APP_ENV !== "production" ||
    process.env.NODE_ENV !== "production" ||
    process.env.DB_FINGERPRINT_ENVIRONMENT !== "PRODUCTION"
  ) {
    throw new Error("workflow_identity_mismatch");
  }
  if (required("PRODUCTION_CURRICULUM_REPAIR_CONFIRMATION") !== OPERATION_CONFIRMATION) {
    throw new Error("operation_confirmation_mismatch");
  }
  const commit = required("PRODUCTION_CURRICULUM_REPAIR_COMMIT").toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(commit) || commit !== required("GITHUB_SHA").toLowerCase()) {
    throw new Error("source_commit_mismatch");
  }
  if (required("PRODUCTION_CURRICULUM_REPAIR_RELEASE_ID") !== p0Station9V3ReleaseFingerprint()) {
    throw new Error("release_id_mismatch");
  }
  if (
    required("PRODUCTION_CURRICULUM_REPAIR_OWNER_APPROVAL") !== p0Station9OwnerApprovalToken(commit)
  ) {
    throw new Error("owner_approval_mismatch");
  }
  if (!P0_STATION9_V3_RELEASE.publicationApproved) {
    throw new Error("station9_release_not_approved");
  }
}

function readTarget() {
  const target = parseCatalogTargetUrl(required("PRODUCTION_DATABASE_URL"), "PRODUCTION");
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  if (
    target.provider !== required("PRODUCTION_DB_APPROVED_PROVIDER").toUpperCase() ||
    target.host !== required("PRODUCTION_DB_APPROVED_HOST").toLowerCase().replace(/\.$/u, "") ||
    target.port !== required("PRODUCTION_DB_APPROVED_PORT") ||
    target.database !== required("PRODUCTION_DB_APPROVED_DATABASE") ||
    target.user !== required("PRODUCTION_DB_APPROVED_USER")
  ) {
    throw new Error("approved_target_configuration_mismatch");
  }
  return target;
}

async function verifyTarget(prisma: PrismaClient, target: ReturnType<typeof readTarget>) {
  const rows = await prisma.$queryRaw<DbIdentity[]>`
    SELECT current_database() AS database,
           current_user AS db_user,
           inet_server_port() AS server_port
  `;
  const identity = rows[0];
  if (!identity) throw new Error("target_identity_missing");
  assertLiveCatalogTargetIdentity(target, identity);
  if (String(identity.server_port ?? target.port) !== target.port) {
    throw new Error("target_port_mismatch");
  }
  assertApprovedTargetFingerprint(
    target,
    identity,
    required("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT"),
  );
  return identity;
}

function composite(link: Pick<ContentSkillLink, "contentId" | "skillId">): string {
  return `${link.contentId}\u0000${link.skillId}`;
}

async function readExpectedP1Links(tx: Prisma.TransactionClient): Promise<{
  links: ContentSkillLink[];
  sources: LinkSource[];
  publishedRoutes: number;
  activePublishedSteps: number;
}> {
  const paths = await tx.learningPath.findMany({
    where: {
      code: { startsWith: "EDUCATION_V2_P1_" },
      status: "PUBLISHED",
      deletedAt: null,
    },
    select: {
      code: true,
      units: {
        select: {
          steps: {
            where: { status: "PUBLISHED", isActive: true },
            select: {
              stableKey: true,
              contentVersionId: true,
              exerciseTemplateVersionId: true,
              assessment: { select: { config: true } },
            },
          },
        },
      },
    },
  });
  if (paths.length !== APPROVED_P1_ROUTE_COUNT) throw new Error("published_p1_route_count_changed");

  const sources: Array<{
    pathCode: string;
    sourceStationKey: string;
    contentKey: string;
    contentVersionId: string;
    skillCode: string;
    routeFamily: "A" | "B" | "C" | "D";
  }> = [];
  let activePublishedSteps = 0;
  for (const path of paths) {
    const cycle = learningRouteCycle(path.code);
    if (!cycle) throw new Error("published_p1_route_missing_source_catalog");
    const expectedStableKeys = new Set(
      cycle.manifest.steps.map((step) => `${cycle.programId}:${step.stableKey}`),
    );
    for (const step of path.units.flatMap((unit) => unit.steps)) {
      if (!expectedStableKeys.has(step.stableKey)) continue;
      activePublishedSteps += 1;
      for (const source of sourceContentSkillTargetsForRouteStep(path.code, step.stableKey)) {
        const contentVersion = cycle.manifest.resourceCatalog.contentVersions.find(
          (item) => item.key === source.contentKey,
        );
        if (!contentVersion) throw new Error("source_content_version_unresolved");
        sources.push({
          ...source,
          contentVersionId: contentVersion.versionId,
          routeFamily: cycle.routeFamily,
        });
      }
    }
  }
  if (activePublishedSteps !== APPROVED_P1_ACTIVE_STEP_COUNT) {
    throw new Error("active_p1_step_count_changed");
  }

  const templateVersionIds = new Set<string>();
  for (const path of paths) {
    for (const step of path.units.flatMap((unit) => unit.steps)) {
      if (step.exerciseTemplateVersionId) templateVersionIds.add(step.exerciseTemplateVersionId);
      const config = step.assessment?.config;
      if (config && typeof config === "object" && !Array.isArray(config)) {
        const configuredId = (config as Record<string, unknown>).templateVersionId;
        if (typeof configuredId === "string" && configuredId) templateVersionIds.add(configuredId);
      }
    }
  }
  const templates = templateVersionIds.size
    ? await tx.exerciseTemplateVersion.findMany({
        where: { id: { in: [...templateVersionIds] }, status: "PUBLISHED" },
        select: {
          id: true,
          template: { select: { status: true, deletedAt: true } },
          contents: { select: { contentVersionId: true } },
        },
      })
    : [];
  const linkedContentByTemplate = new Map(
    templates
      .filter(
        (template) =>
          template.template.status === "PUBLISHED" && template.template.deletedAt === null,
      )
      .map((template) => [
        template.id,
        template.contents.map((content) => content.contentVersionId),
      ]),
  );
  const linkedContentVersionsByStep = new Map<string, Set<string>>();
  for (const path of paths) {
    const cycle = learningRouteCycle(path.code);
    if (!cycle) throw new Error("published_p1_route_missing_source_catalog");
    const expectedStableKeys = new Set(
      cycle.manifest.steps.map((step) => `${cycle.programId}:${step.stableKey}`),
    );
    for (const step of path.units.flatMap((unit) => unit.steps)) {
      if (!expectedStableKeys.has(step.stableKey)) continue;
      const localStepKey = step.stableKey.slice(cycle.programId.length + 1);
      const linked = new Set<string>();
      if (step.contentVersionId) linked.add(step.contentVersionId);
      if (step.exerciseTemplateVersionId) {
        for (const id of linkedContentByTemplate.get(step.exerciseTemplateVersionId) ?? []) {
          linked.add(id);
        }
      }
      const config = step.assessment?.config;
      if (config && typeof config === "object" && !Array.isArray(config)) {
        const configuredId = (config as Record<string, unknown>).templateVersionId;
        if (typeof configuredId === "string") {
          for (const id of linkedContentByTemplate.get(configuredId) ?? []) linked.add(id);
        }
      }
      linkedContentVersionsByStep.set(`${path.code}\u0000${localStepKey}`, linked);
    }
  }
  for (const source of sources) {
    if (
      !linkedContentVersionsByStep
        .get(`${source.pathCode}\u0000${source.sourceStationKey}`)
        ?.has(source.contentVersionId)
    ) {
      throw new Error("source_content_not_linked_to_live_step");
    }
  }

  const versionIds = [...new Set(sources.map((source) => source.contentVersionId))];
  const skillCodes = [...new Set(sources.map((source) => source.skillCode))];
  const [contentVersions, skills] = await Promise.all([
    tx.contentVersion.findMany({
      where: { id: { in: versionIds }, status: "PUBLISHED" },
      select: { id: true, contentId: true, content: { select: { status: true, deletedAt: true } } },
    }),
    tx.skill.findMany({ where: { code: { in: skillCodes } }, select: { id: true, code: true } }),
  ]);
  const contentByVersion = new Map(
    contentVersions
      .filter((item) => item.content.status === "PUBLISHED" && item.content.deletedAt === null)
      .map((item) => [item.id, item.contentId]),
  );
  const skillByCode = new Map(skills.map((item) => [item.code, item.id]));
  const resolved: LinkSource[] = sources.map((source) => {
    const contentId = contentByVersion.get(source.contentVersionId);
    const skillId = skillByCode.get(source.skillCode);
    if (!contentId || !skillId) throw new Error("source_content_or_skill_missing");
    return { contentId, skillId, skillCode: source.skillCode, routeFamily: source.routeFamily };
  });
  const uniqueSources = new Map(resolved.map((source) => [composite(source), source]));
  const links = [...uniqueSources.values()].map(({ contentId, skillId }) => ({
    contentId,
    skillId,
  }));
  if (links.length !== APPROVED_CONTENT_SKILL_EXPECTED_COUNT) {
    throw new Error("expected_content_skill_pair_count_changed");
  }
  return {
    links,
    sources: [...uniqueSources.values()],
    publishedRoutes: paths.length,
    activePublishedSteps,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function optionsForRelease() {
  return P0_STATION9_V3_RELEASE.question.options.map((option) => ({
    id: option.id,
    text: option.text,
    position: option.position,
  }));
}

function answerForRelease(): Prisma.InputJsonValue {
  return {
    type: "MULTIPLE_CHOICE",
    correctOptionIds: [P0_STATION9_V3_RELEASE.question.correctOptionId],
    allowMultiple: false,
    partialCredit: false,
  };
}

async function publishP0Station9V3(
  tx: Prisma.TransactionClient,
): Promise<SafeReport["p0Station9"]> {
  const release = P0_STATION9_V3_RELEASE;
  const exercise = getProgramExercise(release.exerciseKey);
  const stepRows = await tx.learningStep.findMany({
    where: {
      stableKey: release.stableStepKey,
      status: "PUBLISHED",
      isActive: true,
      unit: {
        path: {
          code: `EDUCATION_V2_P0_FAST_READING_${EDUCATION_V2_P0_PATH_SCOPE_CODE}`,
          status: "PUBLISHED",
          deletedAt: null,
        },
      },
    },
    select: { id: true, stableKey: true, exerciseTemplateVersionId: true },
  });
  if (stepRows.length !== 1) throw new Error("station9_live_step_not_unique");
  const step = stepRows[0]!;
  if (
    step.stableKey !== release.stableStepKey ||
    (step.exerciseTemplateVersionId !== release.baseTemplateVersionId &&
      step.exerciseTemplateVersionId !== release.templateVersionId)
  ) {
    throw new Error("station9_live_step_pointer_conflict");
  }

  const [
    contentVersion,
    baseQuestionVersion,
    baseTemplateVersion,
    currentQuestionV3,
    currentTemplateV3,
    questionV3Number,
    templateV3Number,
  ] = await Promise.all([
    tx.contentVersion.findUnique({
      where: { id: release.contentVersionId },
      select: {
        id: true,
        status: true,
        contentId: true,
        content: { select: { status: true, deletedAt: true } },
      },
    }),
    tx.questionVersion.findUnique({
      where: { id: release.baseQuestionVersionId },
      select: {
        id: true,
        questionId: true,
        contentVersionId: true,
        version: true,
        status: true,
        partialCreditEnabled: true,
        question: { select: { status: true, deletedAt: true } },
      },
    }),
    tx.exerciseTemplateVersion.findUnique({
      where: { id: release.baseTemplateVersionId },
      select: {
        id: true,
        templateId: true,
        version: true,
        config: true,
        status: true,
        template: { select: { status: true, deletedAt: true } },
        contents: {
          orderBy: { position: "asc" },
          select: { contentVersionId: true, position: true },
        },
        questions: {
          orderBy: { position: "asc" },
          select: { questionVersionId: true, questionId: true, position: true },
        },
      },
    }),
    tx.questionVersion.findUnique({
      where: { id: release.questionVersionId },
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
        status: true,
        partialCreditEnabled: true,
      },
    }),
    tx.exerciseTemplateVersion.findUnique({
      where: { id: release.templateVersionId },
      select: {
        id: true,
        templateId: true,
        version: true,
        config: true,
        status: true,
        contents: {
          orderBy: { position: "asc" },
          select: { contentVersionId: true, position: true },
        },
        questions: {
          orderBy: { position: "asc" },
          select: { questionVersionId: true, questionId: true, position: true },
        },
      },
    }),
    tx.questionVersion.findFirst({
      where: { questionId: release.questionId, version: 3 },
      select: { id: true },
    }),
    tx.exerciseTemplateVersion.findFirst({
      where: { templateId: release.templateId, version: 3 },
      select: { id: true },
    }),
  ]);

  if (
    !contentVersion ||
    contentVersion.status !== "PUBLISHED" ||
    contentVersion.content.status !== "PUBLISHED" ||
    contentVersion.content.deletedAt !== null ||
    !baseQuestionVersion ||
    baseQuestionVersion.questionId !== release.questionId ||
    baseQuestionVersion.version !== 1 ||
    baseQuestionVersion.status !== "PUBLISHED" ||
    baseQuestionVersion.question.status !== "PUBLISHED" ||
    baseQuestionVersion.question.deletedAt !== null ||
    baseQuestionVersion.contentVersionId !== release.contentVersionId ||
    !baseTemplateVersion ||
    baseTemplateVersion.templateId !== release.templateId ||
    baseTemplateVersion.version !== 2 ||
    baseTemplateVersion.status !== "PUBLISHED" ||
    baseTemplateVersion.template.status !== "PUBLISHED" ||
    baseTemplateVersion.template.deletedAt !== null ||
    baseTemplateVersion.config === null ||
    baseTemplateVersion.contents.length === 0
  ) {
    throw new Error("station9_published_base_graph_invalid");
  }

  const sourceQuestionVersions = exercise.questions.map((question) =>
    question.key === release.questionKey
      ? release.questionVersionId
      : p0QuestionVersionId(release.exerciseKey, question.key),
  );
  if (canonical(sourceQuestionVersions) !== canonical(release.templateQuestionVersionIds)) {
    throw new Error("station9_release_template_question_contract_invalid");
  }
  const expectedBaseQuestionVersions = sourceQuestionVersions.map((id) =>
    id === release.questionVersionId ? release.baseQuestionVersionId : id,
  );
  if (
    baseTemplateVersion.questions.length !== expectedBaseQuestionVersions.length ||
    baseTemplateVersion.questions.some(
      (item, index) =>
        item.questionVersionId !== expectedBaseQuestionVersions[index] ||
        item.questionId !== p0QuestionId(release.exerciseKey, exercise.questions[index]!.key),
    )
  ) {
    throw new Error("station9_base_template_question_graph_mismatch");
  }

  if (questionV3Number && questionV3Number.id !== release.questionVersionId) {
    throw new Error("station9_question_version_number_conflict");
  }
  if (templateV3Number && templateV3Number.id !== release.templateVersionId) {
    throw new Error("station9_template_version_number_conflict");
  }

  const questionExpected = {
    questionId: release.questionId,
    contentVersionId: baseQuestionVersion.contentVersionId,
    version: release.questionVersionNumber,
    prompt: release.question.prompt,
    options: optionsForRelease(),
    correctAnswer: answerForRelease(),
    explanation: release.question.explanation,
    hint: release.question.hint,
    difficulty: release.question.difficulty,
    partialCreditEnabled: baseQuestionVersion.partialCreditEnabled,
  };
  const existingQuestionMatches = (row: NonNullable<typeof currentQuestionV3>) =>
    row.questionId === questionExpected.questionId &&
    row.contentVersionId === questionExpected.contentVersionId &&
    row.version === questionExpected.version &&
    row.prompt === questionExpected.prompt &&
    canonical(row.options) === canonical(questionExpected.options) &&
    canonical(row.correctAnswer) === canonical(questionExpected.correctAnswer) &&
    row.explanation === questionExpected.explanation &&
    row.hint === questionExpected.hint &&
    row.difficulty === questionExpected.difficulty &&
    row.partialCreditEnabled === questionExpected.partialCreditEnabled &&
    (row.status === "DRAFT" || row.status === "PUBLISHED");
  if (currentQuestionV3 && !existingQuestionMatches(currentQuestionV3)) {
    throw new Error("station9_question_v3_conflict");
  }

  const expectedContents = baseTemplateVersion.contents.map((row) => ({
    contentVersionId: row.contentVersionId,
    position: row.position,
  }));
  const expectedQuestions = sourceQuestionVersions.map((questionVersionId, position) => ({
    questionVersionId,
    questionId: p0QuestionId(release.exerciseKey, exercise.questions[position]!.key),
    position,
  }));
  const templateMatches = (row: NonNullable<typeof currentTemplateV3>) =>
    row.templateId === release.templateId &&
    row.version === release.templateVersionNumber &&
    row.status === "PUBLISHED" &&
    canonical(row.config) === canonical(baseTemplateVersion.config) &&
    canonical(row.contents) === canonical(expectedContents) &&
    canonical(row.questions) === canonical(expectedQuestions);
  if (
    currentTemplateV3 &&
    (currentTemplateV3.templateId !== release.templateId ||
      currentTemplateV3.version !== release.templateVersionNumber ||
      !["DRAFT", "PUBLISHED"].includes(currentTemplateV3.status) ||
      canonical(currentTemplateV3.config) !== canonical(baseTemplateVersion.config) ||
      canonical(currentTemplateV3.contents) !== canonical(expectedContents) ||
      canonical(currentTemplateV3.questions) !== canonical(expectedQuestions))
  ) {
    throw new Error("station9_template_v3_conflict");
  }

  const now = new Date();
  let questionVersionCreated = false;
  if (!currentQuestionV3) {
    await tx.questionVersion.create({
      data: {
        id: release.questionVersionId,
        questionId: release.questionId,
        contentVersionId: questionExpected.contentVersionId,
        version: release.questionVersionNumber,
        prompt: questionExpected.prompt,
        options: questionExpected.options,
        correctAnswer: questionExpected.correctAnswer,
        explanation: questionExpected.explanation,
        hint: questionExpected.hint,
        difficulty: questionExpected.difficulty,
        partialCreditEnabled: questionExpected.partialCreditEnabled,
        generationMetadata: { source: "P0_STATION_9_OWNER_APPROVED_V3" },
        status: "DRAFT",
      },
    });
    questionVersionCreated = true;
  }
  if (!currentQuestionV3 || currentQuestionV3.status === "DRAFT") {
    await tx.questionVersion.update({
      where: { id: release.questionVersionId },
      data: { status: "PUBLISHED", publishedAt: now },
    });
  }

  let templateVersionCreated = false;
  if (!currentTemplateV3) {
    await tx.exerciseTemplateVersion.create({
      data: {
        id: release.templateVersionId,
        templateId: release.templateId,
        version: release.templateVersionNumber,
        config: baseTemplateVersion.config,
        status: "DRAFT",
      },
    });
    await tx.exerciseTemplateVersionContent.createMany({
      data: expectedContents.map((row) => ({
        ...row,
        templateVersionId: release.templateVersionId,
      })),
    });
    await tx.exerciseTemplateVersionQuestion.createMany({
      data: expectedQuestions.map((row) => ({
        ...row,
        templateVersionId: release.templateVersionId,
      })),
    });
    templateVersionCreated = true;
  }
  if (!currentTemplateV3 || currentTemplateV3.status === "DRAFT") {
    await tx.exerciseTemplateVersion.update({
      where: { id: release.templateVersionId },
      data: { status: "PUBLISHED", publishedAt: now },
    });
  }

  let stepPointerUpdated = false;
  if (step.exerciseTemplateVersionId === release.baseTemplateVersionId) {
    const updated = await tx.learningStep.updateMany({
      where: { id: step.id, exerciseTemplateVersionId: release.baseTemplateVersionId },
      data: { exerciseTemplateVersionId: release.templateVersionId },
    });
    if (updated.count !== 1) throw new Error("station9_step_pointer_concurrent_change");
    stepPointerUpdated = true;
  }

  const [publishedQuestion, publishedTemplate, updatedStep] = await Promise.all([
    tx.questionVersion.findUnique({
      where: { id: release.questionVersionId },
      select: { status: true },
    }),
    tx.exerciseTemplateVersion.findUnique({
      where: { id: release.templateVersionId },
      select: {
        id: true,
        status: true,
        templateId: true,
        version: true,
        config: true,
        contents: {
          orderBy: { position: "asc" },
          select: { contentVersionId: true, position: true },
        },
        questions: {
          orderBy: { position: "asc" },
          select: { questionVersionId: true, questionId: true, position: true },
        },
      },
    }),
    tx.learningStep.findUnique({
      where: { id: step.id },
      select: { exerciseTemplateVersionId: true },
    }),
  ]);
  if (
    publishedQuestion?.status !== "PUBLISHED" ||
    !publishedTemplate ||
    !templateMatches(publishedTemplate) ||
    updatedStep?.exerciseTemplateVersionId !== release.templateVersionId
  ) {
    throw new Error("station9_release_postcondition_failed");
  }

  return {
    stableStepKey: release.stableStepKey,
    previousTemplateVersionId: release.baseTemplateVersionId,
    activeTemplateVersionId: release.templateVersionId,
    questionVersionId: release.questionVersionId,
    questionVersionCreated,
    templateVersionCreated,
    stepPointerUpdated,
  };
}

async function main(): Promise<void> {
  executionStage = "workflow_gate";
  assertRuntimeGate();
  executionStage = "target_configuration";
  const target = readTarget();
  const prisma = new PrismaClient({
    datasources: { db: { url: target.url } },
    transactionOptions: { maxWait: 20_000, timeout: 120_000 },
  });
  try {
    executionStage = "database_connect";
    await prisma.$connect();
    executionStage = "target_identity";
    await verifyTarget(prisma, target);
    const operationId = `${required("GITHUB_RUN_ID")}.${process.env.GITHUB_RUN_ATTEMPT?.trim() || "1"}`;
    const sourceCommit = required("GITHUB_SHA").toLowerCase();
    executionStage = "atomic_production_transaction";
    const report = await prisma.$transaction(
      async (tx): Promise<SafeReport> => {
        await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
        await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p0-provisioner', true)`;

        const p1 = await readExpectedP1Links(tx);
        const contentIds = [...new Set(p1.links.map((link) => link.contentId))];
        const existing = contentIds.length
          ? await tx.contentSkill.findMany({
              where: { contentId: { in: contentIds } },
              select: { contentId: true, skillId: true },
            })
          : [];
        const comparison = compareContentSkillLinks(p1.links, existing);
        if (comparison.state === "CONFLICT") throw new Error("content_skill_unexpected_relation");
        if (comparison.missingLinks.length !== APPROVED_CONTENT_SKILL_MISSING_COUNT) {
          throw new Error("content_skill_missing_count_changed");
        }
        const missingByRoute = Object.fromEntries(
          Object.keys(APPROVED_MISSING_BY_ROUTE).map((family) => [family, 0]),
        ) as Record<string, number>;
        const sourceByPair = new Map(p1.sources.map((source) => [composite(source), source]));
        for (const pair of comparison.missingLinks) {
          const source = sourceByPair.get(composite(pair));
          if (!source) throw new Error("content_skill_source_not_resolved");
          missingByRoute[source.routeFamily] = (missingByRoute[source.routeFamily] ?? 0) + 1;
        }
        if (
          Object.entries(APPROVED_MISSING_BY_ROUTE).some(
            ([family, count]) => missingByRoute[family] !== count,
          )
        ) {
          throw new Error("content_skill_route_distribution_changed");
        }

        const p0Station9 = await publishP0Station9V3(tx);
        const skillResult = await ensureContentSkillLinks(tx.contentSkill, p1.links);
        if (skillResult.state !== "COMPLETE") throw new Error("content_skill_postcondition_failed");
        const post = await tx.contentSkill.findMany({
          where: { contentId: { in: contentIds } },
          select: { contentId: true, skillId: true },
        });
        const postComparison = compareContentSkillLinks(p1.links, post);
        if (postComparison.state !== "COMPLETE")
          throw new Error("content_skill_postcondition_failed");

        return {
          status: "PASS",
          operationId,
          sourceCommit,
          productionTarget: "VERIFIED",
          p1ContentSkills: {
            publishedRoutes: p1.publishedRoutes,
            activePublishedSteps: p1.activePublishedSteps,
            expectedUniquePairs: p1.links.length,
            alreadyPresentBefore: p1.links.length - comparison.missingLinks.length,
            inserted: skillResult.insertedCount,
            remainingMissing: postComparison.missingLinks.length,
            unexpectedRelations: postComparison.unexpectedLinks.length,
            missingBeforeByRoute: missingByRoute,
          },
          p0Station9,
          studentProgressChanged: false,
          answersChanged: false,
          migrationsRun: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    productionTransactionCommitted = true;

    executionStage = "write_sanitized_evidence";
    const reportPath = required("PRODUCTION_CURRICULUM_REPAIR_REPORT_PATH");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      await appendFile(
        summaryPath,
        [
          "## OkuPratik dar kapsamlı üretim onarımı",
          `- P1 beceri çiftleri: ${report.p1ContentSkills.inserted} eklendi; ${report.p1ContentSkills.alreadyPresentBefore} zaten vardı; ${report.p1ContentSkills.remainingMissing} eksik kaldı.`,
          `- P0 istasyon 9: ${report.p0Station9.questionVersionId} / ${report.p0Station9.activeTemplateVersionId} etkin.`,
          "- Öğrenci ilerlemesi/cevapları değişmedi; migration çalışmadı.",
          "",
        ].join("\n"),
      );
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

function safeErrorDetails(error: unknown): { errorClass: string; errorCode: string } {
  const errorClass =
    error instanceof Error && /^[A-Za-z0-9]+$/u.test(error.name) ? error.name : "UnknownError";
  if (error instanceof Error && /^[a-z0-9_:-]{1,80}$/u.test(error.message)) {
    return { errorClass, errorCode: error.message.toUpperCase() };
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{1,32}$/u.test(code)) {
      return { errorClass, errorCode: code };
    }
  }
  return { errorClass, errorCode: "UNCLASSIFIED" };
}

main().catch(async (error: unknown) => {
  const report = {
    status: "FAIL",
    stage: executionStage,
    ...safeErrorDetails(error),
    productionTransactionCommitted,
    studentProgressChanged: false,
    answersChanged: false,
    migrationsRun: false,
  };
  const reportPath = process.env.PRODUCTION_CURRICULUM_REPAIR_REPORT_PATH;
  if (reportPath) {
    try {
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    } catch {
      // The bounded diagnostic is also written to stderr below.
    }
  }
  process.stderr.write(`${JSON.stringify(report)}\n`);
  process.exitCode = 1;
});
