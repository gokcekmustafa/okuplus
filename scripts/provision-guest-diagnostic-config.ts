import "dotenv/config";
import { isDeepStrictEqual } from "node:util";

import { PrismaClient, type Prisma } from "@prisma/client";

import {
  GUEST_DIAGNOSTIC_CANDIDATES,
  GUEST_DIAGNOSTIC_CONFIG_KEY,
  GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT,
  GUEST_DIAGNOSTIC_QUESTION_COUNT,
  GUEST_DIAGNOSTIC_SCORING_VERSION,
} from "../src/modules/guest-diagnostic/definition.js";

const WRITE_CONFIRMATION = "I_HAVE_VERIFIED_GUEST_DIAGNOSTIC_TARGET";
const APPROVAL_CONFIRMATION = "I_HAVE_APPROVED_GUEST_DIAGNOSTIC_V1";
const ENVIRONMENTS = ["STAGING", "PRODUCTION"] as const;
const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");

const recommendationThresholds = {
  bands: [
    { levelCode: "R1_FOUNDATION", minInclusive: 0, maxExclusive: 0.35 },
    { levelCode: "R2_DEVELOPING", minInclusive: 0.35, maxExclusive: 0.55 },
    { levelCode: "R3_INDEPENDENT", minInclusive: 0.55, maxExclusive: 0.75 },
    { levelCode: "R4_ADVANCED", minInclusive: 0.75, maxInclusive: 1 },
  ],
} as const satisfies Prisma.InputJsonValue;

const skillSignalThresholds = {
  minimumSkillAnsweredCount: 1,
  distinctSkillDelta: 0.5,
} as const satisfies Prisma.InputJsonValue;

type ProvisionEnvironment = (typeof ENVIRONMENTS)[number];

type DatabaseIdentity = {
  database: string;
  db_user: string;
};

type Target = {
  environment: ProvisionEnvironment;
  url: string;
  database: string;
};

function fail(message: string): never {
  throw new Error(`Guest Diagnostic config provisioning reddedildi: ${message}`);
}

function databaseName(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("GUEST_DIAGNOSTIC_PROVISION_DATABASE_URL geçerli bir URL değil");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail("hedef URL PostgreSQL olmalı");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  if (!name) fail("hedef veritabanı adı boş");
  return name;
}

function readTarget(): Target {
  const rawUrl = process.env.GUEST_DIAGNOSTIC_PROVISION_DATABASE_URL?.trim();
  if (!rawUrl) {
    fail("GUEST_DIAGNOSTIC_PROVISION_DATABASE_URL verilmedi; DATABASE_URL fallback'i yok");
  }

  const rawEnvironment = process.env.GUEST_DIAGNOSTIC_PROVISION_ENVIRONMENT?.trim().toUpperCase();
  if (!rawEnvironment || !ENVIRONMENTS.includes(rawEnvironment as ProvisionEnvironment)) {
    fail("GUEST_DIAGNOSTIC_PROVISION_ENVIRONMENT STAGING veya PRODUCTION olmalı");
  }

  const database = databaseName(rawUrl);
  if (/test/iu.test(database)) {
    fail("staging/production provisioning test veritabanına yazamaz");
  }

  if (!isDryRun) {
    if (process.env.GUEST_DIAGNOSTIC_PROVISION_ALLOW_WRITE !== WRITE_CONFIRMATION) {
      fail(`yazma onayı için GUEST_DIAGNOSTIC_PROVISION_ALLOW_WRITE=${WRITE_CONFIRMATION} gerekli`);
    }
    if (process.env.GUEST_DIAGNOSTIC_PROVISION_APPROVAL !== APPROVAL_CONFIRMATION) {
      fail(`ürün onayı için GUEST_DIAGNOSTIC_PROVISION_APPROVAL=${APPROVAL_CONFIRMATION} gerekli`);
    }
  }

  return { environment: rawEnvironment as ProvisionEnvironment, url: rawUrl, database };
}

async function readIdentity(prisma: PrismaClient, target: Target): Promise<DatabaseIdentity> {
  const rows = await prisma.$queryRaw<DatabaseIdentity[]>`
    SELECT current_database()::text AS database, current_user::text AS db_user
  `;
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  if (identity.database !== target.database) {
    fail(`hedef database doğrulaması başarısız: beklenen=${target.database}`);
  }
  return identity;
}

async function assertCandidateGraph(prisma: PrismaClient): Promise<void> {
  const candidateIds = GUEST_DIAGNOSTIC_CANDIDATES.map((candidate) => candidate.questionVersionId);
  const rows = await prisma.questionVersion.findMany({
    where: { id: { in: candidateIds } },
    select: {
      id: true,
      questionId: true,
      type: true,
      options: true,
      correctAnswer: true,
      difficulty: true,
      status: true,
      publishedAt: true,
      question: {
        select: {
          id: true,
          type: true,
          status: true,
          deletedAt: true,
          skill: { select: { code: true } },
          content: { select: { id: true, tenantId: true, status: true, deletedAt: true } },
        },
      },
      contentVersion: {
        select: {
          id: true,
          status: true,
          publishedAt: true,
          content: { select: { id: true, tenantId: true, status: true, deletedAt: true } },
        },
      },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const candidate of GUEST_DIAGNOSTIC_CANDIDATES) {
    const row = byId.get(candidate.questionVersionId);
    const content = row?.question.content;
    const contentVersion = row?.contentVersion;
    if (
      !row ||
      row.questionId !== candidate.questionId ||
      row.status !== "PUBLISHED" ||
      !row.publishedAt ||
      row.question.type === "OPEN_ENDED" ||
      row.question.status !== "PUBLISHED" ||
      row.question.deletedAt !== null ||
      !content ||
      content.tenantId !== null ||
      content.status !== "PUBLISHED" ||
      content.deletedAt !== null ||
      !contentVersion ||
      contentVersion.status !== "PUBLISHED" ||
      !contentVersion.publishedAt ||
      contentVersion.content.id !== content.id ||
      contentVersion.content.tenantId !== null ||
      contentVersion.content.status !== "PUBLISHED" ||
      contentVersion.content.deletedAt !== null ||
      row.question.skill?.code !== candidate.skillCode ||
      row.difficulty !== candidate.difficulty ||
      row.correctAnswer === null ||
      !Array.isArray(row.options)
    ) {
      fail(`published candidate graph eksik veya uyumsuz: ${candidate.questionVersionId}`);
    }
  }

  const templateVersionIds = [
    ...new Set(GUEST_DIAGNOSTIC_CANDIDATES.map((candidate) => candidate.sourceTemplateVersionId)),
  ];
  const links = await prisma.exerciseTemplateVersionQuestion.findMany({
    where: {
      templateVersionId: { in: templateVersionIds },
      questionVersionId: { in: candidateIds },
    },
    select: { templateVersionId: true, questionVersionId: true },
  });
  const linked = new Set(
    links.map((link) => `${link.templateVersionId}:${link.questionVersionId}`),
  );
  for (const candidate of GUEST_DIAGNOSTIC_CANDIDATES) {
    if (!linked.has(`${candidate.sourceTemplateVersionId}:${candidate.questionVersionId}`)) {
      fail(`candidate template-question bağlantısı eksik: ${candidate.questionVersionId}`);
    }
  }

  const versions = await prisma.exerciseTemplateVersion.findMany({
    where: { id: { in: templateVersionIds } },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      template: { select: { tenantId: true, status: true, deletedAt: true } },
    },
  });
  if (
    versions.length !== templateVersionIds.length ||
    versions.some(
      (version) =>
        version.status !== "PUBLISHED" ||
        !version.publishedAt ||
        version.template.tenantId !== null ||
        version.template.status !== "PUBLISHED" ||
        version.template.deletedAt !== null,
    )
  ) {
    fail("published Guest Diagnostic template graph eksik veya uyumsuz");
  }
}

async function ensureRecommendationConfig(
  prisma: PrismaClient,
  target: Target,
): Promise<"NOOP" | "CREATE"> {
  const existing = await prisma.guestDiagnosticRecommendationConfig.findUnique({
    where: {
      configKey_version: {
        configKey: GUEST_DIAGNOSTIC_CONFIG_KEY,
        version: 1,
      },
    },
    select: {
      id: true,
      scoringContractVersion: true,
      minimumAnsweredCount: true,
      minimumScorableCount: true,
      recommendationThresholds: true,
      skillSignalThresholds: true,
      boundaryHandling: true,
      status: true,
      enabled: true,
      publishedAt: true,
    },
  });

  if (existing) {
    const matches =
      existing.scoringContractVersion === GUEST_DIAGNOSTIC_SCORING_VERSION &&
      existing.minimumAnsweredCount === GUEST_DIAGNOSTIC_QUESTION_COUNT &&
      existing.minimumScorableCount === GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT &&
      isDeepStrictEqual(existing.recommendationThresholds, recommendationThresholds) &&
      isDeepStrictEqual(existing.skillSignalThresholds, skillSignalThresholds) &&
      existing.boundaryHandling === "BOUNDARY_SENSITIVE" &&
      existing.status === "PUBLISHED" &&
      existing.enabled &&
      existing.publishedAt !== null;
    if (!matches) {
      fail(
        `mevcut recommendation config ${target.environment} için beklenen contract ile eşleşmiyor`,
      );
    }
    return "NOOP";
  }

  if (isDryRun) return "CREATE";

  await prisma.guestDiagnosticRecommendationConfig.create({
    data: {
      configKey: GUEST_DIAGNOSTIC_CONFIG_KEY,
      version: 1,
      scoringContractVersion: GUEST_DIAGNOSTIC_SCORING_VERSION,
      minimumAnsweredCount: GUEST_DIAGNOSTIC_QUESTION_COUNT,
      minimumScorableCount: GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT,
      recommendationThresholds,
      skillSignalThresholds,
      boundaryHandling: "BOUNDARY_SENSITIVE",
      status: "PUBLISHED",
      enabled: true,
      publishedAt: new Date(),
    },
  });
  return "CREATE";
}

async function main(): Promise<void> {
  const target = readTarget();
  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    const identity = await readIdentity(prisma, target);
    await assertCandidateGraph(prisma);
    const mode = await ensureRecommendationConfig(prisma, target);
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: isDryRun ? "DRY_RUN" : mode,
          environment: target.environment,
          database: identity.database,
          user: identity.db_user,
          candidateCount: GUEST_DIAGNOSTIC_CANDIDATES.length,
          configKey: GUEST_DIAGNOSTIC_CONFIG_KEY,
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
    `Guest Diagnostic config provisioning FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
