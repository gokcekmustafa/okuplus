import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  catalogFixtureReason,
  classifyCatalogRecord,
} from "../src/curriculum/catalog-validation.js";
import { FIRST_REAL_CURRICULUM_PACK } from "../src/curriculum/first-real-pack.js";
import { runFirstRealPackQa } from "../src/curriculum/first-real-pack-qa.js";

const QA_ENVIRONMENT = "TEST";
const QA_DATABASE = "oku_plus_test";
const QA_HOST = "127.0.0.1";
const QA_PORT = "5432";
const STABLE_PREFIX = "8g8-";

type Identity = {
  database: string;
  db_user: string;
  host: string | null;
  port: number | null;
};

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`8G-9B catalog QA reddedildi: ${message}`);
}

type CheckStatus = "PASS" | "BLOCKED" | "FAIL";

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} object değil`);
  return value as JsonRecord;
}

function normalizeHost(value: string | null): string {
  return (value ?? "").replace(/\/\d+$/u, "").toLowerCase();
}

function stableId(kind: string, slug: string, suffix = ""): string {
  return `${STABLE_PREFIX}${kind}-${slug}${suffix ? `-${suffix}` : ""}`;
}

function parseTarget(): string {
  if (process.env.CURRICULUM_CATALOG_QA_ENVIRONMENT?.trim().toUpperCase() !== QA_ENVIRONMENT) {
    fail("CURRICULUM_CATALOG_QA_ENVIRONMENT=TEST açıkça verilmelidir");
  }
  const rawUrl = process.env.CURRICULUM_CATALOG_QA_DATABASE_URL?.trim();
  if (!rawUrl) fail("CURRICULUM_CATALOG_QA_DATABASE_URL verilmedi; fallback yok");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("catalog QA database URL'i geçerli değil");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== QA_HOST ||
    (parsed.port || QA_PORT) !== QA_PORT ||
    database !== QA_DATABASE
  ) {
    fail(`catalog QA yalnızca ${QA_HOST}:${QA_PORT}/${QA_DATABASE} hedefini okuyabilir`);
  }
  return rawUrl;
}

async function readIdentity(prisma: PrismaClient): Promise<Identity> {
  const rows = await prisma.$queryRawUnsafe<Identity[]>(
    "select current_database() as database, current_user as db_user, inet_server_addr()::text as host, inet_server_port() as port",
  );
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  if (
    identity.database !== QA_DATABASE ||
    normalizeHost(identity.host) !== QA_HOST ||
    String(identity.port) !== QA_PORT
  ) {
    fail(`connection identity TEST hedefi değil: ${JSON.stringify(identity)}`);
  }
  return identity;
}

function expectedStableIds(): Set<string> {
  const ids: string[] = [];
  for (const content of FIRST_REAL_CURRICULUM_PACK.contents) {
    ids.push(stableId("content", content.slug));
    ids.push(stableId("content-version", content.slug, "v1"));
    ids.push(stableId("template", content.slug));
    ids.push(stableId("template-version", content.slug, "v1"));
    ids.push(stableId("template-version", content.slug, "v2"));
    for (const [index, question] of content.questions.entries()) {
      ids.push(stableId("question", content.slug, String(index + 1)));
      ids.push(stableId("question-version", content.slug, `${index + 1}-v1`));
      if (question.type === "MULTIPLE_CHOICE") {
        ids.push(stableId("question-version", content.slug, `${index + 1}-v2`));
      }
    }
  }
  if (new Set(ids).size !== ids.length) fail("manifest stable ID'leri duplicate");
  return new Set(ids);
}

function latestPublished<T extends { version: number; status: string }>(
  versions: T[],
): T | undefined {
  return versions
    .filter((version) => version.status === "PUBLISHED")
    .sort((left, right) => right.version - left.version)[0];
}

async function main(): Promise<void> {
  const url = parseTarget();
  const manifestQa = runFirstRealPackQa();
  if (manifestQa.errors.length > 0) fail(manifestQa.errors.join("; "));
  if (
    FIRST_REAL_CURRICULUM_PACK.catalog.kind !== "PRODUCTION_CANDIDATE" ||
    !FIRST_REAL_CURRICULUM_PACK.catalog.requireNonFixtureRecords
  ) {
    fail("first-real pack production-candidate policy taşımıyor");
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const identity = await (async () => {
      await prisma.$connect();
      return readIdentity(prisma);
    })();
    const expectedIds = expectedStableIds();
    const templateIds = FIRST_REAL_CURRICULUM_PACK.contents.map((content) =>
      stableId("template", content.slug),
    );
    const templates = await prisma.exerciseTemplate.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true,
        contentId: true,
        skillId: true,
        status: true,
        config: true,
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            status: true,
            publishedAt: true,
            contents: {
              select: {
                contentVersionId: true,
                position: true,
                contentVersion: { select: { contentId: true, status: true } },
              },
            },
            questions: {
              orderBy: { position: "asc" },
              select: {
                questionId: true,
                questionVersionId: true,
                position: true,
                questionVersion: {
                  select: {
                    questionId: true,
                    version: true,
                    status: true,
                    publishedAt: true,
                    question: {
                      select: {
                        id: true,
                        contentId: true,
                        skillId: true,
                        type: true,
                        status: true,
                        versions: {
                          where: { status: "PUBLISHED" },
                          orderBy: { version: "desc" },
                          take: 1,
                          select: { id: true, version: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const contents = await prisma.content.findMany({
      where: { id: { in: templates.map((template) => template.contentId).filter(Boolean) } },
      select: {
        id: true,
        tenantId: true,
        type: true,
        title: true,
        currentVersionId: true,
        status: true,
        currentVersion: { select: { id: true, contentId: true, status: true, publishedAt: true } },
        contentSkills: { select: { skillId: true } },
      },
    });
    const levels = await prisma.level.findMany({ select: { id: true, code: true, name: true } });
    const skills = await prisma.skill.findMany({
      select: { id: true, code: true, name: true, category: true },
    });
    const [
      stableContent,
      stableVersions,
      stableQuestions,
      stableQuestionVersions,
      stableTemplates,
      stableTemplateVersions,
    ] = await Promise.all([
      prisma.content.findMany({
        where: { id: { startsWith: STABLE_PREFIX } },
        select: { id: true },
      }),
      prisma.contentVersion.findMany({
        where: { id: { startsWith: STABLE_PREFIX } },
        select: { id: true },
      }),
      prisma.question.findMany({
        where: { id: { startsWith: STABLE_PREFIX } },
        select: { id: true },
      }),
      prisma.questionVersion.findMany({
        where: { id: { startsWith: STABLE_PREFIX } },
        select: { id: true },
      }),
      prisma.exerciseTemplate.findMany({
        where: { id: { startsWith: STABLE_PREFIX } },
        select: { id: true },
      }),
      prisma.exerciseTemplateVersion.findMany({
        where: { id: { startsWith: STABLE_PREFIX } },
        select: { id: true },
      }),
    ]);
    const actualStableIds = [
      ...stableContent,
      ...stableVersions,
      ...stableQuestions,
      ...stableQuestionVersions,
      ...stableTemplates,
      ...stableTemplateVersions,
    ].map((row) => row.id);
    const orphanStableIds = actualStableIds.filter((id) => !expectedIds.has(id));
    const errors: string[] = [];
    const blockers: string[] = [];
    const contentValidation: Array<Record<string, unknown>> = [];
    const questionValidation: Array<Record<string, unknown>> = [];
    let contentSkillStatus: CheckStatus = "PASS";
    let questionContentStatus: CheckStatus = "PASS";
    let questionContentVersionStatus: CheckStatus = "PASS";
    let questionSkillStatus: CheckStatus = "PASS";
    let contentEligibilityStatus: CheckStatus = "PASS";
    if (orphanStableIds.length > 0)
      errors.push(`orphan/unknown stable ID: ${orphanStableIds.join(", ")}`);
    if (new Set(actualStableIds).size !== actualStableIds.length)
      errors.push("DB stable ID duplicate");
    if (templates.length !== FIRST_REAL_CURRICULUM_PACK.contents.length)
      errors.push(`template count ${templates.length}/9`);

    const contentById = new Map(contents.map((content) => [content.id, content]));
    const levelCodes = new Set<string>();
    const skillCodes = new Set<string>();
    const templateById = new Map(templates.map((template) => [template.id, template]));
    for (const manifestContent of FIRST_REAL_CURRICULUM_PACK.contents) {
      const contentErrorStart = errors.length;
      const template = templateById.get(stableId("template", manifestContent.slug));
      const content = contentById.get(template?.contentId ?? "");
      if (!template || !content) {
        errors.push(`content/template missing: ${manifestContent.slug}`);
        contentEligibilityStatus = "FAIL";
        contentValidation.push({
          slug: manifestContent.slug,
          status: "FAIL",
          reason: "content/template missing",
        });
        continue;
      }
      if (
        classifyCatalogRecord({ id: content.id, code: content.id, name: content.title }) ===
        "TEST_FIXTURE"
      ) {
        contentEligibilityStatus = "FAIL";
        errors.push(`fixture content production candidate olamaz: ${manifestContent.slug}`);
      }
      const config = record(template.config, `${manifestContent.slug}.template.config`);
      if (typeof config.levelCode !== "string" || !config.levelCode.trim()) {
        blockers.push(`${manifestContent.slug}: explicit Level binding missing`);
      } else {
        levelCodes.add(config.levelCode);
      }
      const primarySkill = record(config.primarySkill, `${manifestContent.slug}.primarySkill`);
      if (typeof primarySkill.skillCode !== "string" || !primarySkill.skillCode.trim()) {
        blockers.push(`${manifestContent.slug}: explicit Skill binding missing`);
      } else {
        skillCodes.add(primarySkill.skillCode);
      }
      if (
        template.status !== "PUBLISHED" ||
        template.contentId !== content.id ||
        content.tenantId !== null ||
        content.type !== "PASSAGE" ||
        content.status !== "PUBLISHED" ||
        content.currentVersionId !== stableId("content-version", manifestContent.slug, "v1") ||
        content.currentVersion?.id !== content.currentVersionId ||
        content.currentVersion?.contentId !== content.id ||
        content.currentVersion?.status !== "PUBLISHED" ||
        !content.currentVersion?.publishedAt
      ) {
        errors.push(`published content identity mismatch: ${manifestContent.slug}`);
        contentEligibilityStatus = "FAIL";
      }
      const current = latestPublished(template.versions);
      if (!current || current.version !== 2 || !current.publishedAt) {
        errors.push(`latest published template v2 missing: ${manifestContent.slug}`);
        continue;
      }
      if (
        current.contents.length !== 1 ||
        current.contents[0]?.position !== 0 ||
        current.contents[0].contentVersionId !== content.currentVersionId ||
        current.contents[0].contentVersion.contentId !== content.id ||
        current.contents[0].contentVersion.status !== "PUBLISHED"
      ) {
        errors.push(`ContentVersion relation mismatch: ${manifestContent.slug}`);
      }
      if (current.questions.length !== manifestContent.questions.length) {
        errors.push(`Question relation count mismatch: ${manifestContent.slug}`);
      }
      if (
        content.contentSkills.length !== 1 ||
        content.contentSkills[0]?.skillId !== template.skillId
      ) {
        errors.push(`ContentSkill/template skill mismatch: ${manifestContent.slug}`);
        contentSkillStatus = "FAIL";
      }
      for (const [questionIndex, manifestQuestion] of manifestContent.questions.entries()) {
        const questionErrorStart = errors.length;
        const relation = current.questions[questionIndex];
        const expectedQuestionId = stableId(
          "question",
          manifestContent.slug,
          String(questionIndex + 1),
        );
        if (
          !relation ||
          relation.position !== questionIndex ||
          relation.questionId !== expectedQuestionId ||
          relation.questionVersion.questionId !== expectedQuestionId ||
          relation.questionVersion.question.id !== expectedQuestionId ||
          relation.questionVersion.question.contentId !== content.id ||
          relation.questionVersion.question.type !== manifestQuestion.type ||
          relation.questionVersion.question.status !== "PUBLISHED" ||
          relation.questionVersion.status !== "PUBLISHED"
        ) {
          errors.push(
            `Question→ContentVersion relation mismatch: ${manifestContent.slug}/Q${questionIndex + 1}`,
          );
          questionContentStatus = "FAIL";
          questionContentVersionStatus = "FAIL";
        }
        if (
          !relation?.questionVersion.publishedAt ||
          relation?.questionVersion.question.skillId !== template.skillId ||
          relation?.questionVersion.question.skillId !== content.contentSkills[0]?.skillId
        ) {
          errors.push(
            `Question→Skill alignment mismatch: ${manifestContent.slug}/Q${questionIndex + 1}`,
          );
          questionSkillStatus = "FAIL";
        }
        if (
          manifestQuestion.type === "MULTIPLE_CHOICE" &&
          relation?.questionVersion.version !== 2
        ) {
          errors.push(
            `MC QuestionVersion v2 missing: ${manifestContent.slug}/Q${questionIndex + 1}`,
          );
          questionContentVersionStatus = "FAIL";
        }
        if (
          manifestQuestion.type !== "MULTIPLE_CHOICE" &&
          relation?.questionVersion.version !== 1
        ) {
          errors.push(
            `non-MC QuestionVersion changed: ${manifestContent.slug}/Q${questionIndex + 1}`,
          );
          questionContentVersionStatus = "FAIL";
        }
        if (
          relation?.questionVersion.version !==
          relation?.questionVersion.question.versions[0]?.version
        ) {
          errors.push(
            `current published QuestionVersion relation mismatch: ${manifestContent.slug}/Q${questionIndex + 1}`,
          );
          questionContentVersionStatus = "FAIL";
        }
        questionValidation.push({
          contentSlug: manifestContent.slug,
          position: questionIndex,
          questionId: expectedQuestionId,
          questionVersionId: relation?.questionVersionId ?? null,
          type: manifestQuestion.type,
          status: errors.length === questionErrorStart ? "PASS" : "FAIL",
        });
      }
      if (template.skillId) {
        const skill = skills.find((candidate) => candidate.id === template.skillId);
        if (skill) skillCodes.add(skill.code);
      }
      contentValidation.push({
        slug: manifestContent.slug,
        contentId: content.id,
        contentVersionId: content.currentVersionId,
        templateId: template.id,
        templateVersionId: current.id,
        levelCode: typeof config.levelCode === "string" ? config.levelCode : null,
        skillCode: typeof primarySkill.skillCode === "string" ? primarySkill.skillCode : null,
        status: errors.length === contentErrorStart ? "PASS" : "FAIL",
      });
    }

    const levelByCode = new Map(levels.map((level) => [level.code, level]));
    const skillByCode = new Map(skills.map((skill) => [skill.code, skill]));
    let levelCatalogStatus: CheckStatus = "PASS";
    let skillCatalogStatus: CheckStatus = "PASS";
    for (const code of levelCodes) {
      const level = levelByCode.get(code);
      if (!level) {
        blockers.push(`Level bulunamadı: ${code}`);
        levelCatalogStatus = "BLOCKED";
      } else if (classifyCatalogRecord(level) === "TEST_FIXTURE") {
        blockers.push(`Level production catalog değil; ${catalogFixtureReason(level)}`);
        levelCatalogStatus = "BLOCKED";
      }
    }
    for (const code of skillCodes) {
      const skill = skillByCode.get(code);
      if (!skill) {
        blockers.push(`Skill bulunamadı: ${code}`);
        skillCatalogStatus = "BLOCKED";
      } else if (classifyCatalogRecord(skill) === "TEST_FIXTURE") {
        blockers.push(`Skill production catalog değil; ${catalogFixtureReason(skill)}`);
        skillCatalogStatus = "BLOCKED";
      }
    }
    if (levelCodes.size !== 1)
      blockers.push(`tek Level binding doğrulanamadı: ${JSON.stringify([...levelCodes])}`);
    if (skillCodes.size !== 3)
      blockers.push(`üç Skill binding doğrulanamadı: ${JSON.stringify([...skillCodes])}`);
    blockers.push("Level→Skill doğrudan relation'ı Prisma schema'da yok; relation doğrulanamıyor");
    blockers.push(
      "Content üzerinde levelId yok; content-level bağı yalnızca template config metadata'sında",
    );

    const levelSkillStatus: CheckStatus = "BLOCKED";
    const contentLevelStatus: CheckStatus = "BLOCKED";
    const fixtureSeparationStatus: CheckStatus =
      contentEligibilityStatus === "FAIL" ? "FAIL" : "PASS";

    const status = errors.length > 0 ? "FAIL" : blockers.length > 0 ? "BLOCKED" : "PASS";
    console.log(
      JSON.stringify(
        {
          status,
          scope: "TEST_READ_ONLY",
          target: { environment: QA_ENVIRONMENT, ...identity },
          packId: FIRST_REAL_CURRICULUM_PACK.packId,
          candidateKind: FIRST_REAL_CURRICULUM_PACK.catalog.kind,
          catalog: {
            levelCodes: [...levelCodes],
            skillCodes: [...skillCodes],
            levelCount: levelCodes.size,
            skillCount: skillCodes.size,
            directLevelSkillRelation: "NOT_AVAILABLE_IN_SCHEMA",
            contentLevelRelation: "NOT_AVAILABLE_IN_SCHEMA",
          },
          stableIds: {
            expected: expectedIds.size,
            actual: actualStableIds.length,
            orphan: orphanStableIds,
          },
          checks: {
            levelCatalog: levelCatalogStatus,
            skillCatalog: skillCatalogStatus,
            levelSkill: levelSkillStatus,
            contentLevel: contentLevelStatus,
            contentSkill: contentSkillStatus,
            contentEligibility: contentEligibilityStatus,
            questionContent: questionContentStatus,
            questionContentVersion: questionContentVersionStatus,
            questionSkillAlignment: questionSkillStatus,
            fixtureSeparation: fixtureSeparationStatus,
            noDuplicateStableIds: !errors.includes("DB stable ID duplicate"),
          },
          packValidation: {
            contentExpected: FIRST_REAL_CURRICULUM_PACK.contents.length,
            contentActual: contentValidation.length,
            questionExpected: FIRST_REAL_CURRICULUM_PACK.contents.reduce(
              (total, content) => total + content.questions.length,
              0,
            ),
            questionActual: questionValidation.length,
            content: contentValidation,
            questions: questionValidation,
          },
          errors,
          blockers,
          productionWrite: "NO",
        },
        null,
        2,
      ),
    );
    if (status === "BLOCKED") process.exitCode = 2;
    if (status === "FAIL") process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`8G-9B catalog QA FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
