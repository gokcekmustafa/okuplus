import "dotenv/config";
import { isDeepStrictEqual } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  FIRST_REAL_CURRICULUM_PACK,
  curriculumPackContentCount,
  curriculumPackQuestionCount,
} from "../src/curriculum/first-real-pack.js";
import { runFirstRealPackQa } from "../src/curriculum/first-real-pack-qa.js";

const REBALANCE_ENVIRONMENT = "TEST";
const REBALANCE_DATABASE = "oku_plus_test";
const REBALANCE_HOST = "127.0.0.1";
const REBALANCE_PORT = "5432";
const WRITE_CONFIRMATION = "I_HAVE_APPROVED_8G9A_TEST_REBALANCE";
const PACK_ID = FIRST_REAL_CURRICULUM_PACK.packId;
const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");

type Identity = {
  database: string;
  db_user: string;
  host: string | null;
  port: number | null;
};

type JsonRecord = Record<string, unknown>;

type PlannedQuestion = {
  manifestQuestion: (typeof FIRST_REAL_CURRICULUM_PACK.contents)[number]["questions"][number];
  questionId: string;
  oldQuestionVersionId: string;
  newQuestionVersionId: string;
  newOptions: Prisma.InputJsonValue;
  needsNewVersion: boolean;
};

type Plan = {
  slug: string;
  templateId: string;
  currentTemplateVersionId: string;
  newTemplateVersionId: string;
  templateVersion: number;
  questions: PlannedQuestion[];
};

function fail(message: string): never {
  throw new Error(`8G-9A MC rebalance reddedildi: ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} object değil`);
  return value as JsonRecord;
}

function stableId(kind: string, slug: string, suffix = ""): string {
  return `8g8-${kind}-${slug}${suffix ? `-${suffix}` : ""}`;
}

function normalizeHost(value: string | null): string {
  return (value ?? "").replace(/\/\d+$/u, "").toLowerCase();
}

function parseTarget(): string {
  if (
    process.env.CURRICULUM_PACK_REBALANCE_ENVIRONMENT?.trim().toUpperCase() !==
    REBALANCE_ENVIRONMENT
  ) {
    fail("CURRICULUM_PACK_REBALANCE_ENVIRONMENT=TEST açıkça verilmelidir");
  }
  const rawUrl = process.env.CURRICULUM_PACK_REBALANCE_DATABASE_URL?.trim();
  if (!rawUrl) fail("CURRICULUM_PACK_REBALANCE_DATABASE_URL verilmedi; fallback yok");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("TEST database URL'i geçerli değil");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== REBALANCE_HOST ||
    (parsed.port || REBALANCE_PORT) !== REBALANCE_PORT ||
    database !== REBALANCE_DATABASE
  ) {
    fail(`yalnızca ${REBALANCE_HOST}:${REBALANCE_PORT}/${REBALANCE_DATABASE} hedeflenebilir`);
  }
  if (!isDryRun && process.env.CURRICULUM_PACK_REBALANCE_ALLOW_TEST_WRITE !== WRITE_CONFIRMATION) {
    fail(
      `TEST yazma onayı için CURRICULUM_PACK_REBALANCE_ALLOW_TEST_WRITE=${WRITE_CONFIRMATION} gerekli`,
    );
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
    identity.database !== REBALANCE_DATABASE ||
    normalizeHost(identity.host) !== REBALANCE_HOST ||
    String(identity.port) !== REBALANCE_PORT
  ) {
    fail(`connection identity TEST hedefi değil: ${JSON.stringify(identity)}`);
  }
  return identity;
}

function assertCatalogPolicy(): void {
  if (
    FIRST_REAL_CURRICULUM_PACK.catalog.kind !== "PRODUCTION_CANDIDATE" ||
    !FIRST_REAL_CURRICULUM_PACK.catalog.requireNonFixtureRecords
  ) {
    fail("pack production-candidate catalog policy taşımıyor");
  }
}

function optionKey(value: unknown): string {
  const item = record(value, "option");
  if (typeof item.id !== "string" || typeof item.text !== "string") fail("option id/text geçersiz");
  return `${item.id}\u0000${item.text}`;
}

function optionSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) fail("MC options array değil");
  return new Set(value.map(optionKey));
}

function assertSameOptionSet(
  oldOptions: unknown,
  newOptions: Prisma.InputJsonValue,
  label: string,
): void {
  const oldSet = optionSet(oldOptions);
  const newSet = optionSet(newOptions);
  if (oldSet.size !== 4 || newSet.size !== 4 || oldSet.size !== newSet.size) {
    fail(`${label} seçenek kümesi dört benzersiz seçenek olmalı`);
  }
  for (const option of newSet) {
    if (!oldSet.has(option)) fail(`${label} distractor/cevap metni değişmiş`);
  }
}

function validateManifestAnswer(
  question: PlannedQuestion["manifestQuestion"],
  label: string,
): void {
  const answer = record(question.correctAnswer, `${label}.correctAnswer`);
  if (
    answer.type !== "MULTIPLE_CHOICE" ||
    !Array.isArray(answer.correctOptionIds) ||
    answer.correctOptionIds.length !== 1 ||
    answer.allowMultiple !== false ||
    answer.partialCredit !== false
  ) {
    fail(`${label} tek doğru MC sözleşmesini karşılamıyor`);
  }
}

function manifestOptions(question: PlannedQuestion["manifestQuestion"]): Prisma.InputJsonValue {
  return question.options.map((option) => ({ ...option })) as Prisma.InputJsonValue;
}

async function main(): Promise<void> {
  const url = parseTarget();
  assertCatalogPolicy();
  const manifestQa = runFirstRealPackQa();
  if (manifestQa.errors.length > 0) fail(manifestQa.errors.join("; "));
  if (curriculumPackContentCount !== 9 || curriculumPackQuestionCount !== 36) {
    fail("manifest 9 content / 36 question sözleşmesinden saptı");
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    const templateIds = FIRST_REAL_CURRICULUM_PACK.contents.map((content) =>
      stableId("template", content.slug),
    );
    const templates = await prisma.exerciseTemplate.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true,
        status: true,
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            status: true,
            publishedAt: true,
            questions: {
              orderBy: { position: "asc" },
              select: {
                questionId: true,
                position: true,
                questionVersionId: true,
                questionVersion: {
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
                    generationMetadata: true,
                    partialCreditEnabled: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (templates.length !== FIRST_REAL_CURRICULUM_PACK.contents.length) {
      fail(`pack template sayısı eksik: ${templates.length}/9`);
    }
    const templateById = new Map(templates.map((template) => [template.id, template]));
    const plans: Plan[] = [];

    for (const content of FIRST_REAL_CURRICULUM_PACK.contents) {
      const templateId = stableId("template", content.slug);
      const template = templateById.get(templateId);
      if (!template || template.status !== "PUBLISHED")
        fail(`template eksik/yayınlı değil: ${content.slug}`);
      const publishedVersions = template.versions;
      const current = publishedVersions[0];
      if (!current || !current.publishedAt)
        fail(`published template version eksik: ${content.slug}`);
      if (current.version > 2)
        fail(`desteklenmeyen template version: ${content.slug}/v${current.version}`);
      if (current.version === 2 && publishedVersions.length !== 2) {
        fail(`template version geçmişi eksik/uyuşmaz: ${content.slug}`);
      }
      if (current.version === 1 && publishedVersions.length !== 1) {
        fail(`template version geçmişi beklenmeyen: ${content.slug}`);
      }
      if (current.questions.length !== content.questions.length) {
        fail(`template soru sayısı hatalı: ${content.slug}`);
      }

      const questions: PlannedQuestion[] = [];
      for (const [index, manifestQuestion] of content.questions.entries()) {
        const label = `${content.slug}/Q${index + 1}`;
        const relation = current.questions[index];
        if (!relation || relation.position !== index || !relation.questionVersion) {
          fail(`${label} current template relation eksik`);
        }
        const questionId = stableId("question", content.slug, String(index + 1));
        if (
          relation.questionId !== questionId ||
          relation.questionVersion.questionId !== questionId
        ) {
          fail(`${label} question identity uyuşmazlığı`);
        }
        const oldVersion = relation.questionVersion;
        if (
          oldVersion.prompt !== manifestQuestion.prompt ||
          oldVersion.explanation !== manifestQuestion.explanation ||
          oldVersion.hint !== manifestQuestion.hint ||
          oldVersion.difficulty !== manifestQuestion.difficulty ||
          !isDeepStrictEqual(oldVersion.correctAnswer, manifestQuestion.correctAnswer)
        ) {
          fail(`${label} içerik/cevap editorial alanı beklenmedik biçimde değişmiş`);
        }
        const newOptions = manifestOptions(manifestQuestion);
        if (manifestQuestion.type === "MULTIPLE_CHOICE") {
          validateManifestAnswer(manifestQuestion, label);
          assertSameOptionSet(oldVersion.options, newOptions, label);
          if (current.version === 2 && !isDeepStrictEqual(oldVersion.options, newOptions)) {
            fail(`${label} yayınlı v2 seçenekleri manifest ile uyuşmuyor`);
          }
        } else if (!isDeepStrictEqual(oldVersion.options, manifestQuestion.options)) {
          fail(`${label} MC olmayan soru etkilenmiş`);
        }
        const needsNewVersion =
          manifestQuestion.type === "MULTIPLE_CHOICE" && current.version === 1;
        const newQuestionVersionId = needsNewVersion
          ? stableId("question-version", content.slug, `${index + 1}-v2`)
          : relation.questionVersionId;
        questions.push({
          manifestQuestion,
          questionId,
          oldQuestionVersionId: relation.questionVersionId,
          newQuestionVersionId,
          newOptions,
          needsNewVersion,
        });
      }
      plans.push({
        slug: content.slug,
        templateId,
        currentTemplateVersionId: current.id,
        newTemplateVersionId: stableId("template-version", content.slug, "v2"),
        templateVersion: current.version,
        questions,
      });
    }

    const expectedRebalancedQuestionVersionIds = plans
      .flatMap((plan) => plan.questions)
      .filter((question) => question.manifestQuestion.type === "MULTIPLE_CHOICE")
      .map((question) => question.newQuestionVersionId);
    const newQuestionVersionIds = plans
      .flatMap((plan) => plan.questions)
      .filter((question) => question.needsNewVersion)
      .map((question) => question.newQuestionVersionId);
    const existingNewQuestionVersions = await prisma.questionVersion.findMany({
      where: { id: { in: expectedRebalancedQuestionVersionIds } },
      select: { id: true },
    });
    const hasExistingTemplateV2 = plans.filter((plan) => plan.templateVersion === 2);
    if (
      hasExistingTemplateV2.length > 0 &&
      (hasExistingTemplateV2.length !== plans.length ||
        existingNewQuestionVersions.length !== expectedRebalancedQuestionVersionIds.length)
    ) {
      fail("rebalance kısmi uygulanmış; otomatik overwrite/delete yapılmayacak");
    }
    if (hasExistingTemplateV2.length === 0 && existingNewQuestionVersions.length > 0) {
      fail("QuestionVersion v2 var fakat template version v2 yok; otomatik onarım yapılmayacak");
    }

    if (hasExistingTemplateV2.length === plans.length) {
      console.log(
        JSON.stringify(
          {
            status: "PASS",
            mode: "NOOP",
            scope: "TEST_VERSIONED_REBALANCE",
            target: { environment: REBALANCE_ENVIRONMENT, ...identity },
            packId: PACK_ID,
            created: { questionVersion: 0, templateVersion: 0 },
            distribution: manifestQa.metrics.mcCorrectPositionCounts,
            maxPositionRatio: manifestQa.metrics.mcMaxPositionRatio,
            productionWrite: "NO",
          },
          null,
          2,
        ),
      );
      return;
    }
    if (isDryRun) {
      console.log(
        JSON.stringify(
          {
            status: "PASS",
            mode: "DRY_RUN",
            scope: "TEST_VERSIONED_REBALANCE",
            target: { environment: REBALANCE_ENVIRONMENT, ...identity },
            packId: PACK_ID,
            planned: {
              questionVersion: newQuestionVersionIds.length,
              templateVersion: plans.length,
            },
            distribution: manifestQa.metrics.mcCorrectPositionCounts,
            maxPositionRatio: manifestQa.metrics.mcMaxPositionRatio,
            productionWrite: "NO",
          },
          null,
          2,
        ),
      );
      return;
    }

    const publishedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const plan of plans) {
        for (const question of plan.questions.filter((item) => item.needsNewVersion)) {
          const oldVersion = await tx.questionVersion.findUnique({
            where: { id: question.oldQuestionVersionId },
            select: { generationMetadata: true, partialCreditEnabled: true },
          });
          if (!oldVersion)
            fail(`source QuestionVersion transaction içinde yok: ${question.oldQuestionVersionId}`);
          const metadata = record(oldVersion.generationMetadata, `${plan.slug}.generationMetadata`);
          await tx.questionVersion.create({
            data: {
              id: question.newQuestionVersionId,
              questionId: question.questionId,
              version: 2,
              prompt: question.manifestQuestion.prompt,
              options: question.newOptions,
              correctAnswer: question.manifestQuestion.correctAnswer as Prisma.InputJsonValue,
              explanation: question.manifestQuestion.explanation,
              hint: question.manifestQuestion.hint,
              difficulty: question.manifestQuestion.difficulty,
              status: "DRAFT",
              generationMetadata: {
                ...metadata,
                packId: PACK_ID,
                rebalancedFromQuestionVersionId: question.oldQuestionVersionId,
                rebalancedBy: "8G-9A",
                optionPositionPolicy: "balanced-max-ratio-0.45",
              } as Prisma.InputJsonValue,
              partialCreditEnabled: oldVersion.partialCreditEnabled,
            },
          });
          await tx.questionVersion.update({
            where: { id: question.newQuestionVersionId },
            data: { status: "PUBLISHED", publishedAt },
          });
        }
        const templateVersion = await tx.exerciseTemplateVersion.create({
          data: {
            id: plan.newTemplateVersionId,
            templateId: plan.templateId,
            version: 2,
            status: "DRAFT",
          },
        });
        const contentVersionId = stableId("content-version", plan.slug, "v1");
        await tx.exerciseTemplateVersionContent.create({
          data: {
            templateVersionId: templateVersion.id,
            contentVersionId,
            position: 0,
          },
        });
        await tx.exerciseTemplateVersionQuestion.createMany({
          data: plan.questions.map((question, position) => ({
            templateVersionId: templateVersion.id,
            questionVersionId: question.newQuestionVersionId,
            questionId: question.questionId,
            position,
          })),
        });
        await tx.exerciseTemplateVersion.update({
          where: { id: templateVersion.id },
          data: { status: "PUBLISHED", publishedAt },
        });
      }
    });

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "WRITE",
          scope: "TEST_VERSIONED_REBALANCE",
          target: { environment: REBALANCE_ENVIRONMENT, ...identity },
          packId: PACK_ID,
          created: { questionVersion: newQuestionVersionIds.length, templateVersion: plans.length },
          distribution: manifestQa.metrics.mcCorrectPositionCounts,
          maxPositionRatio: manifestQa.metrics.mcMaxPositionRatio,
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
  console.error(
    `8G-9A MC rebalance FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
