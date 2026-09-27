import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  assertSameCatalogDatabaseTarget,
  parseCatalogTargetUrl,
} from "../src/curriculum/catalog-target-verification.js";

const REQUIRED_ENVIRONMENT = "STAGING" as const;
const REQUIRED_LEVEL_CODE = process.env.EDUCATION_V2_P0_LEVEL_CODE?.trim();

type JsonRecord = Record<string, unknown>;

type GraphStatus = {
  contentBindings: number;
  publishedContentBindings: number;
  questionBindings: number;
  publishedQuestionBindings: number;
  ready: boolean;
};

type TemplateCandidate = {
  id: string;
  templateId: string;
  title: string;
  type: string;
  graph: GraphStatus;
};

type AssessmentCandidate = {
  id: string;
  title: string;
  type: string;
  levelId: string | null;
  templateVersionId: string;
  graph: GraphStatus;
};

function fail(message: string): never {
  throw new Error(`Eğitim V2 staging kayıt keşfi reddedildi: ${message}`);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function asRecord(value: Prisma.JsonValue | null): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function templateVersionIdFromAssessment(config: Prisma.JsonValue | null): string | null {
  const record = asRecord(config);
  return typeof record?.templateVersionId === "string" && record.templateVersionId.trim()
    ? record.templateVersionId.trim()
    : null;
}

function chooseExactlyOne<T extends { id: string }>(kind: string, candidates: T[]): T {
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) fail(`${kind} için doğrulanmış tek published aday bulunamadı`);
  const candidateIds = candidates.map((candidate) => candidate.id).join(", ");
  fail(
    `${kind} için birden fazla published aday var; rastgele seçim yapılmayacak: ${candidateIds}`,
  );
}

async function readGraph(
  prisma: Prisma.TransactionClient,
  templateVersionId: string,
): Promise<GraphStatus> {
  const rows = await prisma.$queryRaw<
    Array<{
      contentBindings: bigint;
      publishedContentBindings: bigint;
      questionBindings: bigint;
      publishedQuestionBindings: bigint;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(DISTINCT etvc."contentVersionId") AS "contentBindings",
      COUNT(DISTINCT etvc."contentVersionId") FILTER (
        WHERE cv.status::text = 'PUBLISHED'
          AND c.status::text = 'PUBLISHED'
          AND c."deletedAt" IS NULL
      ) AS "publishedContentBindings",
      COUNT(DISTINCT etvq."questionVersionId") AS "questionBindings",
      COUNT(DISTINCT etvq."questionVersionId") FILTER (
        WHERE qv.status::text = 'PUBLISHED'
          AND q.status::text = 'PUBLISHED'
          AND q."deletedAt" IS NULL
      ) AS "publishedQuestionBindings"
    FROM "ExerciseTemplateVersion" etv
    LEFT JOIN "ExerciseTemplateVersionContent" etvc
      ON etvc."templateVersionId" = etv.id
    LEFT JOIN "ContentVersion" cv
      ON cv.id = etvc."contentVersionId"
    LEFT JOIN "Content" c
      ON c.id = cv."contentId"
    LEFT JOIN "ExerciseTemplateVersionQuestion" etvq
      ON etvq."templateVersionId" = etv.id
    LEFT JOIN "QuestionVersion" qv
      ON qv.id = etvq."questionVersionId"
    LEFT JOIN "Question" q
      ON q.id = qv."questionId"
    WHERE etv.id = ${templateVersionId}
  `);
  const row = rows[0];
  if (!row) fail(`template graph okunamadı: ${templateVersionId}`);
  const graph = {
    contentBindings: Number(row.contentBindings),
    publishedContentBindings: Number(row.publishedContentBindings),
    questionBindings: Number(row.questionBindings),
    publishedQuestionBindings: Number(row.publishedQuestionBindings),
    ready:
      Number(row.contentBindings) > 0 &&
      Number(row.contentBindings) === Number(row.publishedContentBindings) &&
      Number(row.questionBindings) > 0 &&
      Number(row.questionBindings) === Number(row.publishedQuestionBindings),
  };
  return graph;
}

async function main(): Promise<void> {
  const environment = requiredEnv("EDUCATION_V2_P0_ENVIRONMENT").toUpperCase();
  if (environment !== REQUIRED_ENVIRONMENT) fail("yalnızca STAGING ortamı kabul edilir");
  if (!REQUIRED_LEVEL_CODE) fail("EDUCATION_V2_P0_LEVEL_CODE gerekli");

  const url = requiredEnv("EDUCATION_V2_P0_DATABASE_URL");
  const approvedTargetUrl = requiredEnv("DB_FINGERPRINT_DATABASE_URL");
  const approvedFingerprint = requiredEnv("EDUCATION_V2_P0_APPROVED_TARGET_FINGERPRINT");
  const target = parseCatalogTargetUrl(url, REQUIRED_ENVIRONMENT);
  const approvedTarget = parseCatalogTargetUrl(approvedTargetUrl, REQUIRED_ENVIRONMENT);
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  assertCatalogEnvironmentSafety(approvedTarget, { rejectTestDatabase: true });
  if (target.provider !== "NEON") fail("staging hedefi Neon olmalı");
  if (approvedTarget.provider !== "NEON") fail("onaylı staging hedefi Neon olmalı");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const approvedPrisma = new PrismaClient({
    datasources: { db: { url: approvedTargetUrl } },
  });
  try {
    const identityRows = await prisma.$queryRaw<Array<{ database: string; db_user: string }>>`
      SELECT current_database() AS database, current_user AS db_user
    `;
    const identity = identityRows[0];
    if (!identity) fail("staging database kimliği okunamadı");
    assertLiveCatalogTargetIdentity(target, identity);
    assertSameCatalogDatabaseTarget(approvedTarget, target);

    const approvedIdentityRows = await approvedPrisma.$queryRaw<
      Array<{ database: string; db_user: string }>
    >`
      SELECT current_database() AS database, current_user AS db_user
    `;
    const approvedIdentity = approvedIdentityRows[0];
    if (!approvedIdentity) fail("onaylı staging database kimliği okunamadı");
    assertLiveCatalogTargetIdentity(approvedTarget, approvedIdentity);
    assertApprovedTargetFingerprint(approvedTarget, approvedIdentity, approvedFingerprint);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p0-discovery', true)`;

      const levelRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "Level" WHERE code = ${REQUIRED_LEVEL_CODE}
      `);
      const level = levelRows[0];
      if (!level) fail(`Level bulunamadı: ${REQUIRED_LEVEL_CODE}`);

      const templateRows = await tx.$queryRaw<
        Array<{ id: string; templateId: string; title: string; type: string }>
      >(Prisma.sql`
        SELECT
          etv.id,
          etv."templateId",
          et.title,
          et.type::text AS type
        FROM "ExerciseTemplateVersion" etv
        JOIN "ExerciseTemplate" et ON et.id = etv."templateId"
        WHERE etv.status::text = 'PUBLISHED'
          AND et.status::text = 'PUBLISHED'
          AND et."deletedAt" IS NULL
          AND et."tenantId" IS NULL
          AND et."skillId" IS NULL
        ORDER BY etv.publishedAt ASC NULLS LAST, etv.id ASC
      `);
      const templateCandidates: TemplateCandidate[] = [];
      for (const row of templateRows) {
        const graph = await readGraph(tx, row.id);
        if (graph.ready) templateCandidates.push({ ...row, graph });
      }
      const reinforcement = chooseExactlyOne(
        "ortak reinforcement template version",
        templateCandidates,
      );

      const assessmentRows = await tx.$queryRaw<
        Array<{
          id: string;
          title: string;
          type: string;
          levelId: string | null;
          config: Prisma.JsonValue | null;
        }>
      >(Prisma.sql`
        SELECT id, title, type::text AS type, "levelId", config
        FROM "Assessment"
        WHERE status::text = 'PUBLISHED'
          AND "deletedAt" IS NULL
          AND "tenantId" IS NULL
      `);
      const assessmentCandidates: AssessmentCandidate[] = [];
      for (const row of assessmentRows) {
        const templateVersionId = templateVersionIdFromAssessment(row.config);
        if (!templateVersionId) continue;
        const graph = await readGraph(tx, templateVersionId);
        if (graph.ready) {
          assessmentCandidates.push({
            id: row.id,
            title: row.title,
            type: row.type,
            levelId: row.levelId,
            templateVersionId,
            graph,
          });
        }
      }
      const assessment = chooseExactlyOne("ortak assessment", assessmentCandidates);

      return {
        reinforcementTemplateVersionId: reinforcement.id,
        assessmentId: assessment.id,
        levelId: level.id,
        candidateCounts: {
          reinforcementTemplates: templateCandidates.length,
          assessments: assessmentCandidates.length,
        },
      };
    });

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          environment: REQUIRED_ENVIRONMENT,
          target: { provider: target.provider, identityVerified: true, fingerprintVerified: true },
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await approvedPrisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
