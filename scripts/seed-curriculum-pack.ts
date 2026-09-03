import "dotenv/config";
import { isDeepStrictEqual } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  FIRST_REAL_CURRICULUM_PACK,
  curriculumPackContentCount,
  curriculumPackQuestionCount,
} from "../src/curriculum/first-real-pack.js";
import {
  catalogFixtureReason,
  type CatalogRecordIdentity,
} from "../src/curriculum/catalog-validation.js";

const WRITE_CONFIRMATION = "I_HAVE_VERIFIED_8G8_TARGET";
const TEST_WRITE_CONFIRMATION = "I_HAVE_VERIFIED_8G8_TEST_TARGET";
const TEST_CANDIDATE_CONFIRMATION = "I_HAVE_APPROVED_8G8_TEST_CANDIDATE";
const EDITORIAL_APPROVAL = "I_HAVE_REVIEWED_8G8";
const PACK_TITLE_PREFIX = "OKU+ 8G8 · ";
const PACK_ID = FIRST_REAL_CURRICULUM_PACK.packId;
const EXPECTED_ENVIRONMENTS = ["TEST", "STAGING", "PRODUCTION"] as const;
const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const simulateFailure = args.has("--simulate-failure");

type PromotionEnvironment = (typeof EXPECTED_ENVIRONMENTS)[number];

type TargetSummary = {
  url: string;
  host: string;
  port: string;
  database: string;
};

type Target = {
  summary: TargetSummary;
  environment: PromotionEnvironment;
  levelCode: string;
  skillCodes: string[];
};

type DbIdentity = {
  database: string;
  db_user: string;
  host: string | null;
  port: number | null;
};

type Counts = {
  content: number;
  contentVersion: number;
  question: number;
  questionVersion: number;
  exerciseTemplate: number;
  exerciseTemplateVersion: number;
  contentSkill: number;
  templateContentRelation: number;
  templateQuestionRelation: number;
};

type ContentItem = (typeof FIRST_REAL_CURRICULUM_PACK.contents)[number];

type PlannedQuestion = {
  question: ContentItem["questions"][number];
  position: number;
  questionId: string;
  questionVersionId: string;
};

type Plan = {
  item: ContentItem;
  skill: { id: string; code: string; name: string };
  contentId: string;
  contentVersionId: string;
  templateId: string;
  templateVersionId: string;
  questions: PlannedQuestion[];
  templateConfig: Prisma.InputJsonValue;
};

type Inspection = {
  mode: "CREATE" | "NOOP" | "CONFLICT";
  conflicts: string[];
  packCounts: Counts;
};

function fail(message: string): never {
  throw new Error(`8G8 promotion reddedildi: ${message}`);
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function wordCount(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

function targetSummary(rawUrl: string): TargetSummary {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("CURRICULUM_PACK_DATABASE_URL geçerli bir PostgreSQL URL'i değil");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail("hedef URL PostgreSQL olmalı");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  if (!database) fail("hedef veritabanı adı boş");
  return { url: rawUrl, host: parsed.hostname, port: parsed.port || "5432", database };
}

function readTarget(): Target {
  if (args.has("--simulate-failure") && args.has("--dry-run"))
    fail("--simulate-failure ile --dry-run birlikte kullanılamaz");

  const rawUrl = process.env.CURRICULUM_PACK_DATABASE_URL?.trim();
  if (!rawUrl) fail("CURRICULUM_PACK_DATABASE_URL verilmedi; DATABASE_URL fallback'i yok");

  const environment = process.env.CURRICULUM_PACK_ENVIRONMENT?.trim().toUpperCase();
  if (!environment || !EXPECTED_ENVIRONMENTS.includes(environment as PromotionEnvironment)) {
    fail("CURRICULUM_PACK_ENVIRONMENT TEST, STAGING veya PRODUCTION olmalı");
  }

  const summary = targetSummary(rawUrl);
  const typedEnvironment = environment as PromotionEnvironment;
  const isLocalTest = typedEnvironment === "TEST";

  if (isLocalTest && summary.database !== "oku_plus_test") {
    fail(`TEST environment yalnızca oku_plus_test hedefleyebilir (${summary.database})`);
  }
  if (!isLocalTest && /test/i.test(summary.database)) {
    fail(`non-TEST environment test veritabanına yazamaz (${summary.database})`);
  }

  if (!isDryRun) {
    if (isLocalTest) {
      if (process.env.CURRICULUM_PACK_ALLOW_TEST_WRITE !== TEST_WRITE_CONFIRMATION) {
        fail(
          `test yazma onayı için CURRICULUM_PACK_ALLOW_TEST_WRITE=${TEST_WRITE_CONFIRMATION} gerekli`,
        );
      }
      if (process.env.CURRICULUM_PACK_TEST_CANDIDATE_APPROVAL !== TEST_CANDIDATE_CONFIRMATION) {
        fail(
          `test candidate onayı için CURRICULUM_PACK_TEST_CANDIDATE_APPROVAL=${TEST_CANDIDATE_CONFIRMATION} gerekli`,
        );
      }
    } else {
      if (process.env.CURRICULUM_PACK_ALLOW_WRITE !== WRITE_CONFIRMATION) {
        fail(`yazma onayı için CURRICULUM_PACK_ALLOW_WRITE=${WRITE_CONFIRMATION} gerekli`);
      }
      if (process.env.CURRICULUM_PACK_EDITORIAL_APPROVAL !== EDITORIAL_APPROVAL) {
        fail(
          `editorial onay için CURRICULUM_PACK_EDITORIAL_APPROVAL=${EDITORIAL_APPROVAL} gerekli`,
        );
      }
    }
  }

  if (simulateFailure && !isLocalTest) {
    fail("--simulate-failure yalnızca explicit TEST environment'ında çalışabilir");
  }

  const levelCode = process.env.CURRICULUM_PACK_LEVEL_CODE?.trim();
  if (!levelCode) fail("CURRICULUM_PACK_LEVEL_CODE verilmedi");
  const skillCodes = (process.env.CURRICULUM_PACK_SKILL_CODES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (skillCodes.length !== 3 || new Set(skillCodes).size !== 3) {
    fail("CURRICULUM_PACK_SKILL_CODES tam olarak üç farklı mevcut skill code içermeli");
  }

  return {
    summary,
    environment: typedEnvironment,
    levelCode,
    skillCodes,
  };
}

function assertProductionCandidateCatalog(label: string, record: CatalogRecordIdentity): void {
  const reason = catalogFixtureReason(record);
  if (reason) fail(`${label} production candidate olamaz; ${reason}`);
}

function normalizeHost(value: string | null): string {
  return (value ?? "").replace(/\/\d+$/, "").toLowerCase();
}

async function readIdentity(prisma: PrismaClient): Promise<DbIdentity> {
  const rows = await prisma.$queryRawUnsafe<DbIdentity[]>(
    "select current_database() as database, current_user as db_user, inet_server_addr()::text as host, inet_server_port() as port",
  );
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  return identity;
}

function assertIdentity(target: Target, identity: DbIdentity): void {
  if (identity.database !== target.summary.database) {
    fail(
      `hedef database doğrulaması başarısız: URL=${target.summary.database}, connection=${identity.database}`,
    );
  }
  if (String(identity.port ?? "") !== target.summary.port) {
    fail(
      `hedef port doğrulaması başarısız: URL=${target.summary.port}, connection=${identity.port}`,
    );
  }
  const expectedHost = normalizeHost(target.summary.host);
  const actualHost = normalizeHost(identity.host);
  const localHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  const hostsMatch =
    expectedHost === actualHost || (localHosts.has(expectedHost) && localHosts.has(actualHost));
  if (!hostsMatch) {
    fail(
      `hedef host doğrulaması başarısız: URL=${target.summary.host}, connection=${identity.host}`,
    );
  }
  if (target.environment === "TEST" && identity.database !== "oku_plus_test") {
    fail("TEST environment connection oku_plus_test değil");
  }
}

function stableId(kind: string, slug: string, suffix = ""): string {
  return `8g8-${kind}-${slug}${suffix ? `-${suffix}` : ""}`;
}

function buildPlans(
  level: { id: string; code: string; name: string },
  skills: Array<{ id: string; code: string; name: string }>,
  target: Target,
): Plan[] {
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill]));
  const skillsInRequestedOrder = target.skillCodes.map((code) => skillByCode.get(code)!);
  const trackSkillById = new Map(
    FIRST_REAL_CURRICULUM_PACK.tracks.map((track, index) => [
      track.id,
      skillsInRequestedOrder[index]!.id,
    ]),
  );

  return FIRST_REAL_CURRICULUM_PACK.contents.map((item) => {
    const skill = skills.find((candidate) => candidate.id === trackSkillById.get(item.trackId));
    if (!skill) fail(`track için skill eşleşmesi yok: ${item.trackId}`);
    const contentId = stableId("content", item.slug);
    const contentVersionId = stableId("content-version", item.slug, "v1");
    const templateId = stableId("template", item.slug);
    const templateVersionId = stableId("template-version", item.slug, "v1");
    const questions = item.questions.map((question, position) => ({
      question,
      position,
      questionId: stableId("question", item.slug, String(position + 1)),
      questionVersionId: stableId("question-version", item.slug, `${position + 1}-v1`),
    }));
    const templateConfig = asJson({
      packId: PACK_ID,
      stableIdentity: { contentId, contentVersionId, templateId, templateVersionId },
      levelCode: target.levelCode,
      ageBand: FIRST_REAL_CURRICULUM_PACK.ageBand,
      domain: item.domain,
      topic: item.topic,
      objective: item.objective,
      primarySkill: { role: item.trackId, skillCode: skill.code, skillName: skill.name },
      sourceRefs: item.sourceIds,
      editorialStatus: FIRST_REAL_CURRICULUM_PACK.editorialStatus,
      versionPolicy: "Published versions immutable; update with a new version.",
    });

    return {
      item,
      skill,
      contentId,
      contentVersionId,
      templateId,
      templateVersionId,
      questions,
      templateConfig,
    };
  });
}

function expectedCounts(plans: Plan[]): Counts {
  const questionCount = plans.reduce((total, plan) => total + plan.questions.length, 0);
  return {
    content: plans.length,
    contentVersion: plans.length,
    question: questionCount,
    questionVersion: questionCount,
    exerciseTemplate: plans.length,
    exerciseTemplateVersion: plans.length,
    contentSkill: plans.length,
    templateContentRelation: plans.length,
    templateQuestionRelation: questionCount,
  };
}

function zeroCounts(): Counts {
  return {
    content: 0,
    contentVersion: 0,
    question: 0,
    questionVersion: 0,
    exerciseTemplate: 0,
    exerciseTemplateVersion: 0,
    contentSkill: 0,
    templateContentRelation: 0,
    templateQuestionRelation: 0,
  };
}

async function readAllCounts(client: PrismaClient | Prisma.TransactionClient): Promise<Counts> {
  const [
    content,
    contentVersion,
    question,
    questionVersion,
    exerciseTemplate,
    exerciseTemplateVersion,
    contentSkill,
    templateContentRelation,
    templateQuestionRelation,
  ] = await Promise.all([
    client.content.count(),
    client.contentVersion.count(),
    client.question.count(),
    client.questionVersion.count(),
    client.exerciseTemplate.count(),
    client.exerciseTemplateVersion.count(),
    client.contentSkill.count(),
    client.exerciseTemplateVersionContent.count(),
    client.exerciseTemplateVersionQuestion.count(),
  ]);
  return {
    content,
    contentVersion,
    question,
    questionVersion,
    exerciseTemplate,
    exerciseTemplateVersion,
    contentSkill,
    templateContentRelation,
    templateQuestionRelation,
  };
}

async function readPackCounts(
  client: PrismaClient | Prisma.TransactionClient,
  plans: Plan[],
): Promise<Counts> {
  const contentIds = plans.map((plan) => plan.contentId);
  const contentVersionIds = plans.map((plan) => plan.contentVersionId);
  const questionIds = plans.flatMap((plan) =>
    plan.questions.map((question) => question.questionId),
  );
  const questionVersionIds = plans.flatMap((plan) =>
    plan.questions.map((question) => question.questionVersionId),
  );
  const templateIds = plans.map((plan) => plan.templateId);
  const templateVersionIds = plans.map((plan) => plan.templateVersionId);
  const [
    content,
    contentVersion,
    question,
    questionVersion,
    exerciseTemplate,
    exerciseTemplateVersion,
    contentSkill,
    templateContentRelation,
    templateQuestionRelation,
  ] = await Promise.all([
    client.content.count({ where: { id: { in: contentIds } } }),
    client.contentVersion.count({ where: { id: { in: contentVersionIds } } }),
    client.question.count({ where: { id: { in: questionIds } } }),
    client.questionVersion.count({ where: { id: { in: questionVersionIds } } }),
    client.exerciseTemplate.count({ where: { id: { in: templateIds } } }),
    client.exerciseTemplateVersion.count({ where: { id: { in: templateVersionIds } } }),
    client.contentSkill.count({ where: { contentId: { in: contentIds } } }),
    client.exerciseTemplateVersionContent.count({
      where: { templateVersionId: { in: templateVersionIds } },
    }),
    client.exerciseTemplateVersionQuestion.count({
      where: { templateVersionId: { in: templateVersionIds } },
    }),
  ]);
  return {
    content,
    contentVersion,
    question,
    questionVersion,
    exerciseTemplate,
    exerciseTemplateVersion,
    contentSkill,
    templateContentRelation,
    templateQuestionRelation,
  };
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

function addConflict(conflicts: string[], message: string): void {
  if (!conflicts.includes(message)) conflicts.push(message);
}

async function inspectExisting(client: PrismaClient, plans: Plan[]): Promise<Inspection> {
  const contentIds = plans.map((plan) => plan.contentId);
  const contentVersionIds = plans.map((plan) => plan.contentVersionId);
  const questionIds = plans.flatMap((plan) =>
    plan.questions.map((question) => question.questionId),
  );
  const questionVersionIds = plans.flatMap((plan) =>
    plan.questions.map((question) => question.questionVersionId),
  );
  const templateIds = plans.map((plan) => plan.templateId);
  const templateVersionIds = plans.map((plan) => plan.templateVersionId);

  const [
    contents,
    contentVersions,
    questions,
    questionVersions,
    templates,
    templateVersions,
    contentSkills,
    templateContents,
    templateQuestions,
    markerTemplates,
    markerContentVersions,
    markerQuestionVersions,
  ] = await Promise.all([
    client.content.findMany({ where: { id: { in: contentIds } } }),
    client.contentVersion.findMany({ where: { id: { in: contentVersionIds } } }),
    client.question.findMany({ where: { id: { in: questionIds } } }),
    client.questionVersion.findMany({ where: { id: { in: questionVersionIds } } }),
    client.exerciseTemplate.findMany({ where: { id: { in: templateIds } } }),
    client.exerciseTemplateVersion.findMany({ where: { id: { in: templateVersionIds } } }),
    client.contentSkill.findMany({ where: { contentId: { in: contentIds } } }),
    client.exerciseTemplateVersionContent.findMany({
      where: { templateVersionId: { in: templateVersionIds } },
    }),
    client.exerciseTemplateVersionQuestion.findMany({
      where: { templateVersionId: { in: templateVersionIds } },
    }),
    client.exerciseTemplate.findMany({
      where: {
        OR: [
          { title: { startsWith: PACK_TITLE_PREFIX } },
          { config: { path: ["packId"], equals: PACK_ID } },
        ],
      },
      select: { id: true, title: true },
    }),
    client.contentVersion.findMany({
      where: { changelog: { contains: PACK_ID } },
      select: { id: true, contentId: true, changelog: true },
    }),
    client.questionVersion.findMany({
      where: { generationMetadata: { path: ["packId"], equals: PACK_ID } },
      select: { id: true, questionId: true },
    }),
  ]);

  const contentById = new Map(contents.map((row) => [row.id, row]));
  const contentVersionById = new Map(contentVersions.map((row) => [row.id, row]));
  const questionById = new Map(questions.map((row) => [row.id, row]));
  const questionVersionById = new Map(questionVersions.map((row) => [row.id, row]));
  const templateById = new Map(templates.map((row) => [row.id, row]));
  const templateVersionById = new Map(templateVersions.map((row) => [row.id, row]));
  const expectedTemplateIds = new Set(templateIds);
  const expectedContentVersionIds = new Set(contentVersionIds);
  const expectedQuestionVersionIds = new Set(questionVersionIds);
  const conflicts: string[] = [];

  for (const marker of markerTemplates) {
    if (!expectedTemplateIds.has(marker.id)) {
      addConflict(conflicts, `existing pack template marker: ${marker.id}`);
    }
  }
  for (const marker of markerContentVersions) {
    if (!expectedContentVersionIds.has(marker.id)) {
      addConflict(conflicts, `existing pack content version marker: ${marker.id}`);
    }
  }
  for (const marker of markerQuestionVersions) {
    if (!expectedQuestionVersionIds.has(marker.id)) {
      addConflict(conflicts, `existing pack question version marker: ${marker.id}`);
    }
  }

  for (const plan of plans) {
    const content = contentById.get(plan.contentId);
    const contentVersion = contentVersionById.get(plan.contentVersionId);
    const template = templateById.get(plan.templateId);
    const templateVersion = templateVersionById.get(plan.templateVersionId);

    if (
      content &&
      (content.tenantId !== null ||
        content.type !== "PASSAGE" ||
        content.title !== plan.item.title ||
        content.difficulty !== plan.item.difficulty ||
        content.status !== "PUBLISHED" ||
        content.currentVersionId !== plan.contentVersionId)
    ) {
      addConflict(conflicts, `content identity/content mismatch: ${plan.contentId}`);
    }
    if (
      contentVersion &&
      (!contentVersion.contentId ||
        contentVersion.contentId !== plan.contentId ||
        contentVersion.version !== 1 ||
        contentVersion.title !== plan.item.title ||
        contentVersion.body !== plan.item.body ||
        contentVersion.wordCount !== wordCount(plan.item.body) ||
        contentVersion.status !== "PUBLISHED" ||
        !contentVersion.publishedAt)
    ) {
      addConflict(conflicts, `content version identity/content mismatch: ${plan.contentVersionId}`);
    }
    if (
      template &&
      (template.tenantId !== null ||
        template.title !== `${PACK_TITLE_PREFIX}${plan.item.title}` ||
        template.type !== "COMPREHENSION" ||
        template.skillId !== plan.skill.id ||
        template.contentId !== plan.contentId ||
        template.status !== "PUBLISHED" ||
        !jsonEqual(template.config, plan.templateConfig))
    ) {
      addConflict(conflicts, `template identity/content mismatch: ${plan.templateId}`);
    }
    if (
      templateVersion &&
      (templateVersion.templateId !== plan.templateId ||
        templateVersion.version !== 1 ||
        templateVersion.status !== "PUBLISHED" ||
        !templateVersion.publishedAt)
    ) {
      addConflict(
        conflicts,
        `template version identity/status mismatch: ${plan.templateVersionId}`,
      );
    }

    const contentSkillRows = contentSkills.filter((row) => row.contentId === plan.contentId);
    if (
      contentSkillRows.length > 0 &&
      (contentSkillRows.length !== 1 || contentSkillRows[0]!.skillId !== plan.skill.id)
    ) {
      addConflict(conflicts, `content skill relation mismatch: ${plan.contentId}`);
    }
    const templateContentRows = templateContents.filter(
      (row) => row.templateVersionId === plan.templateVersionId,
    );
    if (
      templateContentRows.length > 0 &&
      (templateContentRows.length !== 1 ||
        templateContentRows[0]!.contentVersionId !== plan.contentVersionId ||
        templateContentRows[0]!.position !== 0)
    ) {
      addConflict(conflicts, `template content relation mismatch: ${plan.templateVersionId}`);
    }

    for (const plannedQuestion of plan.questions) {
      const question = questionById.get(plannedQuestion.questionId);
      const questionVersion = questionVersionById.get(plannedQuestion.questionVersionId);
      if (
        question &&
        (question.contentId !== plan.contentId ||
          question.position !== plannedQuestion.position ||
          question.type !== plannedQuestion.question.type ||
          question.skillId !== plan.skill.id ||
          question.status !== "PUBLISHED")
      ) {
        addConflict(conflicts, `question identity/content mismatch: ${plannedQuestion.questionId}`);
      }
      if (
        questionVersion &&
        (questionVersion.questionId !== plannedQuestion.questionId ||
          questionVersion.version !== 1 ||
          questionVersion.prompt !== plannedQuestion.question.prompt ||
          !jsonEqual(questionVersion.options, plannedQuestion.question.options) ||
          !jsonEqual(questionVersion.correctAnswer, plannedQuestion.question.correctAnswer) ||
          questionVersion.explanation !== plannedQuestion.question.explanation ||
          questionVersion.hint !== plannedQuestion.question.hint ||
          questionVersion.difficulty !== plannedQuestion.question.difficulty ||
          questionVersion.status !== "PUBLISHED" ||
          !questionVersion.publishedAt)
      ) {
        addConflict(
          conflicts,
          `question version identity/content mismatch: ${plannedQuestion.questionVersionId}`,
        );
      }
      const relationRows = templateQuestions.filter(
        (row) =>
          row.templateVersionId === plan.templateVersionId &&
          row.questionVersionId === plannedQuestion.questionVersionId,
      );
      if (
        relationRows.length > 0 &&
        (relationRows.length !== 1 ||
          relationRows[0]!.position !== plannedQuestion.position ||
          relationRows[0]!.questionId !== plannedQuestion.questionId)
      ) {
        addConflict(
          conflicts,
          `template question relation mismatch: ${plannedQuestion.questionVersionId}`,
        );
      }
    }
  }

  const packCounts = await readPackCounts(client, plans);
  const expected = expectedCounts(plans);
  const hasAnyStableRecord = Object.values(packCounts).some((count) => count > 0);
  const isComplete = (Object.keys(expected) as Array<keyof Counts>).every(
    (key) => packCounts[key] === expected[key],
  );
  if (isComplete && conflicts.length === 0) return { mode: "NOOP", conflicts, packCounts };
  if (
    hasAnyStableRecord ||
    markerTemplates.length > 0 ||
    markerContentVersions.length > 0 ||
    markerQuestionVersions.length > 0
  ) {
    addConflict(conflicts, "pack kısmi veya non-canonical kayıt içeriyor; overwrite yapılmayacak");
  }
  return { mode: conflicts.length > 0 ? "CONFLICT" : "CREATE", conflicts, packCounts };
}

function expectedLicense(): string {
  return "Özgün OKU+ metni; source listesi pack manifestinde.";
}

function expectedChangelog(plan: Plan): string {
  return `${PACK_ID}; ${plan.item.domain}; ${plan.item.topic}; hedef yaş ${FIRST_REAL_CURRICULUM_PACK.ageBand}; stableContentId=${plan.contentId}; stableTemplateId=${plan.templateId}.`;
}

async function createPack(
  tx: Prisma.TransactionClient,
  plans: Plan[],
): Promise<
  Array<{
    title: string;
    contentId: string;
    contentVersionId: string;
    templateVersionId: string;
    questionVersionIds: string[];
  }>
> {
  const created: Array<{
    title: string;
    contentId: string;
    contentVersionId: string;
    templateVersionId: string;
    questionVersionIds: string[];
  }> = [];
  for (const plan of plans) {
    const content = await tx.content.create({
      data: {
        id: plan.contentId,
        tenantId: null,
        type: "PASSAGE",
        title: plan.item.title,
        difficulty: plan.item.difficulty,
        status: "DRAFT",
      },
      select: { id: true },
    });
    const contentVersion = await tx.contentVersion.create({
      data: {
        id: plan.contentVersionId,
        contentId: content.id,
        version: 1,
        title: plan.item.title,
        body: plan.item.body,
        wordCount: wordCount(plan.item.body),
        license: expectedLicense(),
        changelog: expectedChangelog(plan),
        status: "DRAFT",
      },
      select: { id: true },
    });
    await tx.contentSkill.create({ data: { contentId: content.id, skillId: plan.skill.id } });

    const questionVersionIds: string[] = [];
    for (const plannedQuestion of plan.questions) {
      await tx.question.create({
        data: {
          id: plannedQuestion.questionId,
          contentId: content.id,
          position: plannedQuestion.position,
          type: plannedQuestion.question.type,
          skillId: plan.skill.id,
          status: "DRAFT",
        },
        select: { id: true },
      });
      const questionVersion = await tx.questionVersion.create({
        data: {
          id: plannedQuestion.questionVersionId,
          questionId: plannedQuestion.questionId,
          version: 1,
          prompt: plannedQuestion.question.prompt,
          options: asJson(plannedQuestion.question.options),
          correctAnswer: asJson(plannedQuestion.question.correctAnswer),
          explanation: plannedQuestion.question.explanation,
          hint: plannedQuestion.question.hint,
          difficulty: plannedQuestion.question.difficulty,
          status: "DRAFT",
          generationMetadata: asJson({
            packId: PACK_ID,
            stableIdentity: {
              questionId: plannedQuestion.questionId,
              questionVersionId: plannedQuestion.questionVersionId,
            },
            objective: plan.item.objective,
            primarySkillRole: plan.item.trackId,
            cognitiveDemand: plannedQuestion.question.cognitiveDemand,
            sourceRefs: plan.item.sourceIds,
            editorialStatus: FIRST_REAL_CURRICULUM_PACK.editorialStatus,
          }),
        },
        select: { id: true },
      });
      questionVersionIds.push(questionVersion.id);
    }

    const template = await tx.exerciseTemplate.create({
      data: {
        id: plan.templateId,
        tenantId: null,
        title: `${PACK_TITLE_PREFIX}${plan.item.title}`,
        type: "COMPREHENSION",
        skillId: plan.skill.id,
        contentId: content.id,
        config: plan.templateConfig,
        status: "DRAFT",
      },
      select: { id: true },
    });
    const templateVersion = await tx.exerciseTemplateVersion.create({
      data: { id: plan.templateVersionId, templateId: template.id, version: 1, status: "DRAFT" },
      select: { id: true },
    });
    await tx.exerciseTemplateVersionContent.create({
      data: {
        templateVersionId: templateVersion.id,
        contentVersionId: contentVersion.id,
        position: 0,
      },
    });
    await tx.exerciseTemplateVersionQuestion.createMany({
      data: plan.questions.map((question) => ({
        templateVersionId: templateVersion.id,
        questionVersionId: question.questionVersionId,
        questionId: question.questionId,
        position: question.position,
      })),
    });

    const publishedAt = new Date();
    await tx.contentVersion.update({
      where: { id: contentVersion.id },
      data: { status: "PUBLISHED", publishedAt },
    });
    await tx.content.update({
      where: { id: content.id },
      data: { currentVersionId: contentVersion.id, status: "PUBLISHED" },
    });
    await tx.questionVersion.updateMany({
      where: { id: { in: questionVersionIds } },
      data: { status: "PUBLISHED", publishedAt },
    });
    await tx.question.updateMany({
      where: { contentId: content.id },
      data: { status: "PUBLISHED" },
    });
    await tx.exerciseTemplateVersion.update({
      where: { id: templateVersion.id },
      data: { status: "PUBLISHED", publishedAt },
    });
    await tx.exerciseTemplate.update({
      where: { id: template.id },
      data: { status: "PUBLISHED" },
    });
    created.push({
      title: plan.item.title,
      contentId: content.id,
      contentVersionId: contentVersion.id,
      templateVersionId: templateVersion.id,
      questionVersionIds,
    });
  }
  return created;
}

function delta(before: Counts, after: Counts): Counts {
  return {
    content: after.content - before.content,
    contentVersion: after.contentVersion - before.contentVersion,
    question: after.question - before.question,
    questionVersion: after.questionVersion - before.questionVersion,
    exerciseTemplate: after.exerciseTemplate - before.exerciseTemplate,
    exerciseTemplateVersion: after.exerciseTemplateVersion - before.exerciseTemplateVersion,
    contentSkill: after.contentSkill - before.contentSkill,
    templateContentRelation: after.templateContentRelation - before.templateContentRelation,
    templateQuestionRelation: after.templateQuestionRelation - before.templateQuestionRelation,
  };
}

function safeTarget(target: Target, identity: DbIdentity): Record<string, unknown> {
  return {
    environment: target.environment,
    host: identity.host,
    port: identity.port,
    database: identity.database,
    user: identity.db_user,
  };
}

async function main(): Promise<void> {
  const target = readTarget();
  const prisma = new PrismaClient({ datasources: { db: { url: target.summary.url } } });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    assertIdentity(target, identity);
    const [level, skills] = await Promise.all([
      prisma.level.findUnique({
        where: { code: target.levelCode },
        select: { id: true, code: true, name: true },
      }),
      prisma.skill.findMany({
        where: { code: { in: target.skillCodes } },
        select: { id: true, code: true, name: true },
      }),
    ]);
    if (!level) fail(`Level bulunamadı: ${target.levelCode}`);
    assertProductionCandidateCatalog("Level", { id: level.id, code: level.code, name: level.name });
    if (skills.length !== target.skillCodes.length) {
      fail("üç skill code'un tamamı hedef DB'de bulunamadı");
    }
    for (const skill of skills) {
      assertProductionCandidateCatalog("Skill", {
        id: skill.id,
        code: skill.code,
        name: skill.name,
      });
    }
    if (
      FIRST_REAL_CURRICULUM_PACK.catalog.kind !== "PRODUCTION_CANDIDATE" ||
      !FIRST_REAL_CURRICULUM_PACK.catalog.requireNonFixtureRecords
    ) {
      fail("pack catalog policy production candidate olarak tanımlı değil");
    }
    if (curriculumPackContentCount !== 9 || curriculumPackQuestionCount !== 36) {
      fail(
        `manifest sayıları beklenenden farklı: content=${curriculumPackContentCount}, question=${curriculumPackQuestionCount}`,
      );
    }
    for (const source of FIRST_REAL_CURRICULUM_PACK.sources) {
      if (!source.id.trim() || !source.url.trim() || !source.checkedClaim.trim()) {
        fail(`source metadata eksik: ${source.id}`);
      }
    }

    const plans = buildPlans(level, skills, target);
    const before = await readAllCounts(prisma);
    const inspection = await inspectExisting(prisma, plans);
    const expected = expectedCounts(plans);
    const planSummary = {
      content: plans.map((plan) => ({
        slug: plan.item.slug,
        title: plan.item.title,
        contentId: plan.contentId,
        contentVersionId: plan.contentVersionId,
        questionIds: plan.questions.map((question) => question.questionId),
        questionVersionIds: plan.questions.map((question) => question.questionVersionId),
        templateId: plan.templateId,
        templateVersionId: plan.templateVersionId,
      })),
      expectedNewRecords: inspection.mode === "CREATE" ? expected : zeroCounts(),
      expectedConflicts: inspection.conflicts,
    };

    if (inspection.mode === "CONFLICT") {
      console.error(
        JSON.stringify(
          {
            status: "FAIL",
            phase: "conflict-check",
            target: safeTarget(target, identity),
            before,
            packCounts: inspection.packCounts,
            ...planSummary,
          },
          null,
          2,
        ),
      );
      fail(inspection.conflicts.join("; "));
    }

    if (isDryRun) {
      console.log(
        JSON.stringify(
          {
            status: "PASS",
            mode: "DRY_RUN",
            target: safeTarget(target, identity),
            packId: PACK_ID,
            level,
            skills,
            before,
            existingPack: inspection.packCounts,
            ...planSummary,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (inspection.mode === "NOOP") {
      console.log(
        JSON.stringify(
          {
            status: "PASS",
            mode: "NOOP",
            target: safeTarget(target, identity),
            packId: PACK_ID,
            level,
            skills,
            before,
            after: before,
            delta: zeroCounts(),
            existingPack: inspection.packCounts,
            ...planSummary,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(
      JSON.stringify(
        {
          status: "START",
          mode: "WRITE",
          target: safeTarget(target, identity),
          packId: PACK_ID,
          expectedNewRecords: expected,
        },
        null,
        2,
      ),
    );
    const created = await prisma.$transaction(async (tx) => {
      const result = await createPack(tx, plans);
      const inTransaction = await readPackCounts(tx, plans);
      const expectedKeys = Object.keys(expected) as Array<keyof Counts>;
      if (!expectedKeys.every((key) => inTransaction[key] === expected[key])) {
        fail(`transaction pack count mismatch: ${JSON.stringify({ inTransaction, expected })}`);
      }
      if (simulateFailure) fail("simulated failure; transaction must rollback");
      return result;
    });
    const after = await readAllCounts(prisma);
    const afterPack = await readPackCounts(prisma, plans);
    const actualDelta = delta(before, after);
    const expectedDeltaKeys = Object.keys(expected) as Array<keyof Counts>;
    if (!expectedDeltaKeys.every((key) => actualDelta[key] === expected[key])) {
      fail(`promotion count mismatch: ${JSON.stringify({ before, after, actualDelta, expected })}`);
    }
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "WRITE",
          target: safeTarget(target, identity),
          packId: PACK_ID,
          level,
          skills,
          before,
          after,
          delta: actualDelta,
          packCounts: afterPack,
          created,
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
  console.error(`8G8 promotion FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
