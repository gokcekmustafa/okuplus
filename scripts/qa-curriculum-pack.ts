import "dotenv/config";
import { isDeepStrictEqual } from "node:util";
import { PrismaClient } from "@prisma/client";
import { FIRST_REAL_CURRICULUM_PACK } from "../src/curriculum/first-real-pack.js";
import { runFirstRealPackQa } from "../src/curriculum/first-real-pack-qa.js";

const QA_ENVIRONMENT = "TEST";
const QA_DATABASE = "oku_plus_test";
const QA_HOST = "127.0.0.1";
const QA_PORT = "5432";

type Identity = {
  database: string;
  db_user: string;
  host: string | null;
  port: number | null;
};

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`8G-9 içerik QA reddedildi: ${message}`);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} string değil`);
  return value;
}

function recordValue(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} object değil`);
  return value as JsonRecord;
}

function normalizeHost(value: string | null): string {
  return (value ?? "").replace(/\/\d+$/u, "").toLowerCase();
}

function parseQaTarget(): string {
  if (process.env.CURRICULUM_PACK_QA_ENVIRONMENT?.trim().toUpperCase() !== QA_ENVIRONMENT) {
    fail("CURRICULUM_PACK_QA_ENVIRONMENT=TEST açıkça verilmelidir");
  }
  const rawUrl = process.env.CURRICULUM_PACK_QA_DATABASE_URL?.trim();
  if (!rawUrl) fail("CURRICULUM_PACK_QA_DATABASE_URL verilmedi; başka URL fallback'i yok");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("QA database URL'i geçerli değil");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== QA_HOST ||
    (parsed.port || QA_PORT) !== QA_PORT ||
    database !== QA_DATABASE
  ) {
    fail(`QA yalnızca ${QA_HOST}:${QA_PORT}/${QA_DATABASE} hedefini okuyabilir`);
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
    fail(`connection identity beklenen TEST hedefi değil: ${JSON.stringify(identity)}`);
  }
  return identity;
}

function stableId(kind: string, slug: string, suffix = ""): string {
  return `8g8-${kind}-${slug}${suffix ? `-${suffix}` : ""}`;
}

function expectedOption(
  value: unknown,
  label: string,
): { id: string; text: string; position: number } {
  const option = recordValue(value, label);
  return {
    id: stringValue(option.id, `${label}.id`),
    text: stringValue(option.text, `${label}.text`),
    position:
      typeof option.position === "number" ? option.position : fail(`${label}.position sayı değil`),
  };
}

async function main(): Promise<void> {
  const url = parseQaTarget();
  const manifestQa = runFirstRealPackQa();
  if (manifestQa.errors.length > 0) fail(manifestQa.errors.join("; "));

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    const contentIds = FIRST_REAL_CURRICULUM_PACK.contents.map((content) =>
      stableId("content", content.slug),
    );
    const templateIds = FIRST_REAL_CURRICULUM_PACK.contents.map((content) =>
      stableId("template", content.slug),
    );
    const questionIds = FIRST_REAL_CURRICULUM_PACK.contents.flatMap((content) =>
      content.questions.map((_, index) => stableId("question", content.slug, String(index + 1))),
    );
    const [contents, questions, templates, levels, skills, counts] = await Promise.all([
      prisma.content.findMany({
        where: { id: { in: contentIds } },
        select: {
          id: true,
          title: true,
          difficulty: true,
          status: true,
          tenantId: true,
          currentVersionId: true,
          versions: {
            select: {
              id: true,
              version: true,
              title: true,
              body: true,
              wordCount: true,
              status: true,
            },
          },
          contentSkills: { select: { skillId: true, skill: { select: { code: true } } } },
          questions: {
            select: {
              id: true,
              contentId: true,
              position: true,
              type: true,
              skillId: true,
              status: true,
              versions: {
                select: {
                  id: true,
                  questionId: true,
                  version: true,
                  prompt: true,
                  options: true,
                  correctAnswer: true,
                  explanation: true,
                  hint: true,
                  difficulty: true,
                  status: true,
                  publishedAt: true,
                  generationMetadata: true,
                },
              },
            },
            orderBy: { position: "asc" },
          },
        },
      }),
      prisma.question.count({ where: { id: { in: questionIds } } }),
      prisma.exerciseTemplate.findMany({
        where: { id: { in: templateIds } },
        select: {
          id: true,
          skillId: true,
          contentId: true,
          config: true,
          status: true,
          tenantId: true,
          versions: {
            select: {
              id: true,
              version: true,
              status: true,
              publishedAt: true,
              contents: { select: { contentVersionId: true, position: true } },
              questions: {
                select: { questionVersionId: true, questionId: true, position: true },
                orderBy: { position: "asc" },
              },
            },
          },
        },
      }),
      prisma.level.findMany({ select: { code: true, name: true } }),
      prisma.skill.findMany({ select: { id: true, code: true, name: true, category: true } }),
      Promise.all([
        prisma.content.count(),
        prisma.contentVersion.count(),
        prisma.question.count(),
        prisma.questionVersion.count(),
        prisma.exerciseTemplate.count(),
        prisma.exerciseTemplateVersion.count(),
        prisma.contentSkill.count(),
        prisma.exerciseTemplateVersionContent.count(),
        prisma.exerciseTemplateVersionQuestion.count(),
      ]).then(
        ([
          content,
          contentVersion,
          question,
          questionVersion,
          exerciseTemplate,
          exerciseTemplateVersion,
          contentSkill,
          templateContentRelation,
          templateQuestionRelation,
        ]) => ({
          content,
          contentVersion,
          question,
          questionVersion,
          exerciseTemplate,
          exerciseTemplateVersion,
          contentSkill,
          templateContentRelation,
          templateQuestionRelation,
        }),
      ),
    ]);

    if (contents.length !== FIRST_REAL_CURRICULUM_PACK.contents.length)
      fail(`TEST content sayısı eksik: ${contents.length}/9`);
    if (questions !== 36) fail(`TEST question sayısı eksik: ${questions}/36`);
    if (templates.length !== FIRST_REAL_CURRICULUM_PACK.contents.length)
      fail(`TEST template sayısı eksik: ${templates.length}/9`);

    const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
    const configuredLevelCodes = new Set<string>();
    const templateById = new Map(templates.map((template) => [template.id, template]));
    const contentById = new Map(contents.map((content) => [content.id, content]));
    for (const [contentIndex, manifestContent] of FIRST_REAL_CURRICULUM_PACK.contents.entries()) {
      const contentId = contentIds[contentIndex]!;
      const templateId = templateIds[contentIndex]!;
      const content = contentById.get(contentId);
      const template = templateById.get(templateId);
      if (!content || !template) fail(`TEST stable kayıt eksik: ${manifestContent.slug}`);
      if (
        content.tenantId !== null ||
        content.status !== "PUBLISHED" ||
        content.title !== manifestContent.title
      )
        fail(`TEST content yayın/identity uyuşmazlığı: ${manifestContent.slug}`);
      const contentVersion = content.versions.find(
        (version) => version.id === content.currentVersionId,
      );
      if (
        !contentVersion ||
        contentVersion.version !== 1 ||
        contentVersion.status !== "PUBLISHED" ||
        contentVersion.title !== manifestContent.title ||
        contentVersion.body !== manifestContent.body ||
        contentVersion.wordCount !== manifestQa.metrics.contentWordCounts[manifestContent.slug]
      )
        fail(`TEST ContentVersion uyuşmazlığı: ${manifestContent.slug}`);
      if (
        content.contentSkills.length !== 1 ||
        content.contentSkills[0]?.skillId !== content.questions[0]?.skillId
      )
        fail(`TEST content-skill eşleşmesi yok: ${manifestContent.slug}`);
      if (
        template.tenantId !== null ||
        template.status !== "PUBLISHED" ||
        template.contentId !== contentId
      )
        fail(`TEST template uyuşmazlığı: ${manifestContent.slug}`);
      const config = recordValue(template.config, `${manifestContent.slug}.template.config`);
      if (
        config.packId !== FIRST_REAL_CURRICULUM_PACK.packId ||
        config.ageBand !== FIRST_REAL_CURRICULUM_PACK.ageBand ||
        typeof config.levelCode !== "string" ||
        !levels.some((level) => level.code === config.levelCode)
      )
        fail(`TEST template config hizası yok: ${manifestContent.slug}`);
      configuredLevelCodes.add(config.levelCode);
      const primarySkill = recordValue(config.primarySkill, `${manifestContent.slug}.primarySkill`);
      if (
        primarySkill.role !== manifestContent.trackId ||
        primarySkill.skillCode !== skillsById.get(template.skillId ?? "")?.code
      )
        fail(`TEST primary skill hizası yok: ${manifestContent.slug}`);
      const templateVersion = template.versions
        .filter((version) => version.status === "PUBLISHED")
        .sort((left, right) => right.version - left.version)[0];
      if (
        !templateVersion ||
        templateVersion.status !== "PUBLISHED" ||
        templateVersion.contents.length !== 1 ||
        templateVersion.contents[0]?.contentVersionId !== contentVersion.id
      )
        fail(`TEST template content version hizası yok: ${manifestContent.slug}`);
      if (templateVersion.questions.length !== manifestContent.questions.length)
        fail(`TEST template soru ilişkisi eksik: ${manifestContent.slug}`);
      for (const [questionIndex, manifestQuestion] of manifestContent.questions.entries()) {
        const question = content.questions[questionIndex];
        const relation = templateVersion.questions[questionIndex];
        const questionVersion = question?.versions.find(
          (version) => version.id === relation?.questionVersionId,
        );
        if (!question || !questionVersion || !relation)
          fail(`TEST soru/version eksik: ${manifestContent.slug}/${questionIndex + 1}`);
        if (
          question.status !== "PUBLISHED" ||
          question.contentId !== contentId ||
          question.position !== questionIndex ||
          question.type !== manifestQuestion.type ||
          question.skillId !== content.questions[0]?.skillId
        )
          fail(
            `TEST soru identity/skill uyuşmazlığı: ${manifestContent.slug}/${questionIndex + 1}`,
          );
        if (
          questionVersion.status !== "PUBLISHED" ||
          questionVersion.questionId !== question.id ||
          questionVersion.prompt !== manifestQuestion.prompt ||
          questionVersion.difficulty !== manifestQuestion.difficulty ||
          questionVersion.hint !== manifestQuestion.hint ||
          questionVersion.explanation !== manifestQuestion.explanation ||
          !questionVersion.publishedAt
        )
          fail(
            `TEST QuestionVersion editorial alan uyuşmazlığı: ${manifestContent.slug}/${questionIndex + 1}`,
          );
        if (
          !isDeepStrictEqual(questionVersion.options, manifestQuestion.options) ||
          !isDeepStrictEqual(questionVersion.correctAnswer, manifestQuestion.correctAnswer)
        )
          fail(
            `TEST QuestionVersion cevap uyuşmazlığı: ${manifestContent.slug}/${questionIndex + 1}`,
          );
        const metadata = recordValue(
          questionVersion.generationMetadata,
          `${manifestContent.slug}/${questionIndex + 1}.generationMetadata`,
        );
        if (
          metadata.packId !== FIRST_REAL_CURRICULUM_PACK.packId ||
          metadata.primarySkillRole !== manifestContent.trackId
        )
          fail(`TEST question metadata hizası yok: ${manifestContent.slug}/${questionIndex + 1}`);
        if (!relation || relation.questionId !== question.id || relation.position !== questionIndex)
          fail(`TEST template-question ilişkisi yok: ${manifestContent.slug}/${questionIndex + 1}`);
        if (manifestQuestion.type === "MULTIPLE_CHOICE") {
          if (!Array.isArray(questionVersion.options) || questionVersion.options.length !== 4)
            fail(`TEST MC seçenek sayısı hatalı: ${manifestContent.slug}/${questionIndex + 1}`);
          questionVersion.options.forEach((option, optionIndex) => {
            const actual = expectedOption(
              option,
              `${manifestContent.slug}/${questionIndex + 1}.option`,
            );
            if (actual.position !== optionIndex)
              fail(`TEST MC option position hatalı: ${manifestContent.slug}/${questionIndex + 1}`);
          });
        }
      }
    }
    if (configuredLevelCodes.size !== 1)
      fail("TEST pack tek ve geçerli bir level config taşımıyor");
    if (skills.length !== 7 || skills.some((skill) => skill.category !== "COMPREHENSION"))
      fail("TEST pack skill kataloğu beklenen QA fixture'ı değil");

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          scope: "TEST_READ_ONLY",
          target: {
            environment: QA_ENVIRONMENT,
            database: identity.database,
            host: identity.host,
            port: identity.port,
            user: identity.db_user,
          },
          packId: FIRST_REAL_CURRICULUM_PACK.packId,
          manifest: manifestQa.metrics,
          testDbCounts: counts,
          warnings: manifestQa.warnings,
          level: [...configuredLevelCodes][0],
          skillCount: skills.length,
          productionWrite: "NO",
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
  console.error(`8G-9 QA FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
