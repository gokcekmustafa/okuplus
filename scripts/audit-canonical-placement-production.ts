import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  buildCanonicalPlacementAssessmentGraph,
  planCanonicalPlacementPromotion,
  readCanonicalPlacementSkillRefs,
  readCanonicalPlacementSnapshot,
  type CanonicalPlacementSnapshot,
} from "../src/curriculum/canonical-placement-assessment-bootstrap.js";
import { parseCatalogTargetUrl } from "../src/curriculum/catalog-target-verification.js";
import { providerForHost, targetIdentityFingerprint } from "../src/lib/db-fingerprint-contract.js";

type MatchStatus = "MATCH" | "MISMATCH" | "UNVERIFIED";
type CompatibilityStatus = "MATCH" | "CONFLICT" | "INCOMPLETE" | "NOT_VERIFIED";

type IdentityRow = {
  database: string;
  current_user: string;
  server_port: number;
};

type JsonRecord = Record<string, unknown>;

const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK"] as const;

// Historical values copied from the 1.0.0 manifest in commit
// 9a304ccc312deefb8c093581ef732bbf11f004fe. These are only used to scope
// read-only legacy queries; they are not generated from the current manifest.
const LEGACY_CANONICAL_PLACEMENT = Object.freeze({
  sourceCommit: "9a304ccc312deefb8c093581ef732bbf11f004fe",
  manifestId: "OKU-READING-PLACEMENT-V1",
  manifestVersion: "1.0.0",
  itemBankManifestId: "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1",
  itemBankManifestVersion: "1.0.1",
  assessmentId: "canonical-assessment-oku-reading-placement-v1",
  templateId: "canonical-template-oku-reading-placement-v1",
  templateVersionId: "canonical-template-version-oku-reading-placement-v1-v1",
});

type PlacementMarkerRow = {
  id: string;
  tenantId: string | null;
  title: string;
  type: string;
  status: string;
  deletedAt: Date | null;
  config: unknown;
};

function required(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function expectedValue(...names: string[]): string | null {
  for (const name of names) {
    const value = required(name);
    if (value) return value;
  }
  return null;
}

function match(
  actual: string,
  expected: string | null,
  normalize = (value: string) => value,
): MatchStatus {
  if (!expected) return "UNVERIFIED";
  return normalize(actual) === normalize(expected) ? "MATCH" : "MISMATCH";
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function questionTypeDistribution(values: readonly { type: string }[]): Record<string, number> {
  const distribution: Record<string, number> = Object.fromEntries(
    QUESTION_TYPES.map((questionType) => [questionType, 0]),
  );
  for (const value of values) {
    distribution[value.type] = (distribution[value.type] ?? 0) + 1;
  }
  return distribution;
}

function configQuestionTypeDistribution(config: unknown): Record<string, number> | null {
  const record = asRecord(config);
  const value = asRecord(record?.questionTypeDistribution);
  if (!value) return null;

  const distribution: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    distribution[key] = count;
  }
  return distribution;
}

function markerMetadata(config: unknown) {
  const record = asRecord(config);
  return {
    canonicalManifestId: stringValue(record?.canonicalManifestId),
    canonicalManifestVersion: stringValue(record?.canonicalManifestVersion),
    itemBankManifestId: stringValue(record?.itemBankManifestId),
    itemBankManifestVersion: stringValue(record?.itemBankManifestVersion),
    stableAssessmentId: stringValue(record?.stableAssessmentId),
    templateId: stringValue(record?.templateId),
    templateVersionId: stringValue(record?.templateVersionId),
    questionCount: typeof record?.questionCount === "number" ? record.questionCount : null,
    questionTypeDistribution: configQuestionTypeDistribution(config),
  };
}

function safeMarker(row: PlacementMarkerRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    type: row.type,
    status: row.status,
    deleted: row.deletedAt !== null,
    metadata: markerMetadata(row.config),
  };
}

async function readCanonicalMarkers(
  client: PrismaClient,
  table: "Assessment" | "ExerciseTemplate",
  manifestId: string,
): Promise<PlacementMarkerRow[]> {
  return client.$queryRaw<PlacementMarkerRow[]>(Prisma.sql`
    SELECT "id", "tenantId", "title", "type", "status", "deletedAt", "config"
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "config"->>'canonicalManifestId' = ${manifestId}
    ORDER BY "id"
  `);
}

function safeAssessmentRecord(
  row: {
    id: string;
    tenantId: string | null;
    title: string;
    type: string;
    status: string;
    deletedAt: Date | null;
    config: unknown;
  } | null,
) {
  return row
    ? {
        id: row.id,
        tenantId: row.tenantId,
        title: row.title,
        type: row.type,
        status: row.status,
        deleted: row.deletedAt !== null,
        metadata: markerMetadata(row.config),
      }
    : null;
}

function safeTemplateRecord(
  row: {
    id: string;
    tenantId: string | null;
    title: string;
    type: string;
    status: string;
    deletedAt: Date | null;
    config: unknown;
  } | null,
) {
  return row
    ? {
        id: row.id,
        tenantId: row.tenantId,
        title: row.title,
        type: row.type,
        status: row.status,
        deleted: row.deletedAt !== null,
        metadata: markerMetadata(row.config),
      }
    : null;
}

async function readTemplateGraph(client: PrismaClient, templateIds: readonly string[]) {
  const ids = [...new Set(templateIds)];
  if (ids.length === 0) return [];

  const versions = await client.exerciseTemplateVersion.findMany({
    where: { templateId: { in: ids } },
    select: { id: true, templateId: true, version: true, status: true, publishedAt: true },
    orderBy: [{ templateId: "asc" }, { version: "asc" }],
  });
  if (versions.length === 0) return [];

  const versionIds = versions.map((version) => version.id);
  const [contentLinks, questionLinks] = await Promise.all([
    client.exerciseTemplateVersionContent.findMany({
      where: { templateVersionId: { in: versionIds } },
      select: { templateVersionId: true, contentVersionId: true, position: true },
      orderBy: [{ templateVersionId: "asc" }, { position: "asc" }],
    }),
    client.exerciseTemplateVersionQuestion.findMany({
      where: { templateVersionId: { in: versionIds } },
      select: {
        templateVersionId: true,
        questionVersionId: true,
        questionId: true,
        position: true,
      },
      orderBy: [{ templateVersionId: "asc" }, { position: "asc" }],
    }),
  ]);
  const contentVersionIds = [...new Set(contentLinks.map((link) => link.contentVersionId))];
  const questionVersionIds = [...new Set(questionLinks.map((link) => link.questionVersionId))];
  const questionIds = [
    ...new Set(
      questionLinks.map((link) => link.questionId).filter((id): id is string => id !== null),
    ),
  ];
  const [contentVersions, questions, questionVersions] = await Promise.all([
    contentVersionIds.length > 0
      ? client.contentVersion.findMany({
          where: { id: { in: contentVersionIds } },
          select: { id: true, contentId: true, version: true, status: true, publishedAt: true },
        })
      : Promise.resolve([]),
    questionIds.length > 0
      ? client.question.findMany({
          where: { id: { in: questionIds } },
          select: {
            id: true,
            contentId: true,
            position: true,
            type: true,
            status: true,
            deletedAt: true,
          },
        })
      : Promise.resolve([]),
    questionVersionIds.length > 0
      ? client.questionVersion.findMany({
          where: { id: { in: questionVersionIds } },
          select: { id: true, questionId: true, version: true, status: true, publishedAt: true },
        })
      : Promise.resolve([]),
  ]);
  const questionById = new Map(questions.map((question) => [question.id, question]));

  return versions.map((version) => {
    const versionContentLinks = contentLinks.filter(
      (link) => link.templateVersionId === version.id,
    );
    const versionQuestionLinks = questionLinks.filter(
      (link) => link.templateVersionId === version.id,
    );
    const versionQuestions = versionQuestionLinks
      .map((link) => (link.questionId ? questionById.get(link.questionId) : undefined))
      .filter((question): question is NonNullable<typeof question> => question !== undefined);
    return {
      id: version.id,
      templateId: version.templateId,
      version: version.version,
      status: version.status,
      published: version.publishedAt !== null,
      contentLinks: versionContentLinks.length,
      questionLinks: versionQuestionLinks.length,
      questionVersionLinks: new Set(versionQuestionLinks.map((link) => link.questionVersionId))
        .size,
      publishedContentVersions: versionContentLinks.filter((link) =>
        contentVersions.some(
          (contentVersion) =>
            contentVersion.id === link.contentVersionId &&
            contentVersion.status === "PUBLISHED" &&
            contentVersion.publishedAt !== null,
        ),
      ).length,
      publishedQuestionVersions: versionQuestionLinks.filter((link) =>
        questionVersions.some(
          (questionVersion) =>
            questionVersion.id === link.questionVersionId &&
            questionVersion.status === "PUBLISHED" &&
            questionVersion.publishedAt !== null,
        ),
      ).length,
      questionTypeDistribution: questionTypeDistribution(versionQuestions),
      questionIds: versionQuestions
        .map((question) => ({
          id: question.id,
          type: question.type,
          position: question.position,
          status: question.status,
          deleted: question.deletedAt !== null,
        }))
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)),
    };
  });
}

function safeQuestionIds(snapshot: CanonicalPlacementSnapshot): Array<{
  id: string;
  type: string;
  position: number;
  status: string;
}> {
  return snapshot.questions
    .map((question) => ({
      id: question.id,
      type: question.type,
      position: question.position,
      status: question.status,
    }))
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

function snapshotSummary(snapshot: CanonicalPlacementSnapshot) {
  const questionVersionsPublished = snapshot.questionVersions.filter(
    (questionVersion) =>
      questionVersion.status === "PUBLISHED" && questionVersion.publishedAt !== null,
  ).length;
  const contentVersionsPublished = snapshot.contentVersions.filter(
    (contentVersion) =>
      contentVersion.status === "PUBLISHED" && contentVersion.publishedAt !== null,
  ).length;
  const assessmentConfig = asRecord(snapshot.assessment?.config);

  return {
    assessment: snapshot.assessment
      ? {
          id: snapshot.assessment.id,
          title: snapshot.assessment.title,
          type: snapshot.assessment.type,
          status: snapshot.assessment.status,
          canonicalManifestId: stringValue(assessmentConfig?.canonicalManifestId),
          canonicalManifestVersion: stringValue(assessmentConfig?.canonicalManifestVersion),
          questionTypeDistribution: configQuestionTypeDistribution(snapshot.assessment.config),
        }
      : null,
    template: snapshot.template
      ? {
          id: snapshot.template.id,
          title: snapshot.template.title,
          type: snapshot.template.type,
          status: snapshot.template.status,
        }
      : null,
    templateVersion: snapshot.templateVersion
      ? {
          id: snapshot.templateVersion.id,
          templateId: snapshot.templateVersion.templateId,
          version: snapshot.templateVersion.version,
          status: snapshot.templateVersion.status,
          published: snapshot.templateVersion.publishedAt !== null,
        }
      : null,
    counts: {
      contents: snapshot.contents.length,
      contentVersions: snapshot.contentVersions.length,
      publishedContentVersions: contentVersionsPublished,
      questions: snapshot.questions.length,
      publishedQuestions: snapshot.questions.filter((question) => question.status === "PUBLISHED")
        .length,
      questionVersions: snapshot.questionVersions.length,
      publishedQuestionVersions: questionVersionsPublished,
      contentSkills: snapshot.contentSkills.length,
      templateContents: snapshot.templateContents.length,
      templateQuestions: snapshot.templateQuestions.length,
    },
    questionTypeDistribution: questionTypeDistribution(snapshot.questions),
    questionIds: safeQuestionIds(snapshot),
    templateQuestionGraph: {
      uniqueQuestionIds: new Set(
        snapshot.templateQuestions.map((question) => question.questionId).filter(Boolean),
      ).size,
      uniqueQuestionVersionIds: new Set(
        snapshot.templateQuestions.map((question) => question.questionVersionId),
      ).size,
    },
    markerCounts: {
      assessment: snapshot.assessmentMarkerIds.length,
      template: snapshot.templateMarkerIds.length,
    },
  };
}

function blockedReport(reason: string, identityChecks?: Record<string, MatchStatus>) {
  return {
    status: "NOT_VERIFIED" as const,
    productionObservation: false,
    productionWrite: "NO" as const,
    reason,
    ...(identityChecks ? { identityChecks } : {}),
  };
}

async function main(): Promise<void> {
  const rawUrl = required("PRODUCTION_DATABASE_URL");
  const approvedFingerprint = required("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
  if (!rawUrl || !approvedFingerprint) {
    console.log(
      JSON.stringify(
        blockedReport("required protected production audit configuration is missing"),
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  let target: ReturnType<typeof parseCatalogTargetUrl>;
  try {
    target = parseCatalogTargetUrl(rawUrl, "PRODUCTION");
  } catch {
    console.log(JSON.stringify(blockedReport("production target URL is invalid"), null, 2));
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  try {
    const identityRows = await prisma.$queryRaw<IdentityRow[]>`
      SELECT current_database() AS database,
             current_user AS current_user,
             inet_server_port() AS server_port
    `;
    const identity = identityRows[0];
    if (!identity) throw new Error("identity unavailable");

    const expectedProvider = expectedValue(
      "PRODUCTION_DB_APPROVED_PROVIDER",
      "PRODUCTION_DATABASE_PROVIDER",
    );
    const expectedHost = expectedValue("PRODUCTION_DB_APPROVED_HOST", "PRODUCTION_DATABASE_HOST");
    const expectedPort = expectedValue("PRODUCTION_DB_APPROVED_PORT", "PRODUCTION_DATABASE_PORT");
    const expectedDatabase = expectedValue(
      "PRODUCTION_DB_APPROVED_DATABASE",
      "PRODUCTION_DATABASE_NAME",
    );
    const expectedUser = expectedValue("PRODUCTION_DB_APPROVED_USER", "PRODUCTION_DATABASE_USER");
    const actualPort = String(identity.server_port || target.port);
    const actualFingerprint = targetIdentityFingerprint({
      environment: "PRODUCTION",
      provider: providerForHost(target.host),
      host: target.host,
      port: target.port,
      database: identity.database,
      dbUser: identity.current_user,
    });
    const identityChecks = {
      environment: match("PRODUCTION", process.env.DB_FINGERPRINT_ENVIRONMENT?.trim(), (value) =>
        value.toUpperCase(),
      ),
      provider: match(providerForHost(target.host), expectedProvider, (value) =>
        value.toUpperCase(),
      ),
      host: match(target.host, expectedHost, (value) => value.toLowerCase().replace(/\.$/u, "")),
      port: match(actualPort, expectedPort),
      database: match(identity.database, expectedDatabase),
      currentUser: match(identity.current_user, expectedUser),
      fingerprint: actualFingerprint === approvedFingerprint.toLowerCase() ? "MATCH" : "MISMATCH",
    } satisfies Record<string, MatchStatus>;

    if (!Object.values(identityChecks).every((value) => value === "MATCH")) {
      console.log(
        JSON.stringify(
          blockedReport("protected production target identity did not match", identityChecks),
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    const skillRefs = await readCanonicalPlacementSkillRefs(prisma);
    const graph = buildCanonicalPlacementAssessmentGraph(undefined, skillRefs);
    const snapshot = await readCanonicalPlacementSnapshot(prisma, graph);
    const plan = planCanonicalPlacementPromotion(graph, snapshot);
    const currentCompatibility: CompatibilityStatus =
      plan.action === "NOOP" ? "MATCH" : plan.action === "CONFLICT" ? "CONFLICT" : "INCOMPLETE";
    const [assessmentMarkers, templateMarkers, legacyAssessmentRecord, legacyTemplateRecord] =
      await Promise.all([
        readCanonicalMarkers(prisma, "Assessment", graph.manifest.manifestId),
        readCanonicalMarkers(prisma, "ExerciseTemplate", graph.manifest.manifestId),
        prisma.assessment.findUnique({
          where: { id: LEGACY_CANONICAL_PLACEMENT.assessmentId },
          select: {
            id: true,
            tenantId: true,
            title: true,
            type: true,
            status: true,
            deletedAt: true,
            config: true,
          },
        }),
        prisma.exerciseTemplate.findUnique({
          where: { id: LEGACY_CANONICAL_PLACEMENT.templateId },
          select: {
            id: true,
            tenantId: true,
            title: true,
            type: true,
            status: true,
            deletedAt: true,
            config: true,
          },
        }),
      ]);
    const legacyAssessmentMarkers = assessmentMarkers.filter(
      (marker) =>
        markerMetadata(marker.config).canonicalManifestVersion ===
        LEGACY_CANONICAL_PLACEMENT.manifestVersion,
    );
    const legacyTemplateMarkers = templateMarkers.filter(
      (marker) =>
        markerMetadata(marker.config).canonicalManifestVersion ===
        LEGACY_CANONICAL_PLACEMENT.manifestVersion,
    );
    const legacyTemplateGraph = await readTemplateGraph(prisma, [
      LEGACY_CANONICAL_PLACEMENT.templateId,
      ...legacyTemplateMarkers.map((marker) => marker.id),
      ...legacyTemplateMarkers
        .map((marker) => markerMetadata(marker.config).templateId)
        .filter((id): id is string => id !== null),
    ]);
    const legacyObserved =
      legacyAssessmentMarkers.length > 0 ||
      legacyTemplateMarkers.length > 0 ||
      legacyAssessmentRecord !== null ||
      legacyTemplateRecord !== null ||
      legacyTemplateGraph.length > 0;
    const compatibility: CompatibilityStatus =
      currentCompatibility === "CONFLICT" || legacyObserved ? "CONFLICT" : currentCompatibility;
    const expectedSummary = {
      manifestId: graph.manifest.manifestId,
      manifestVersion: graph.manifest.manifestVersion,
      itemBankManifestId: graph.manifest.itemBank.manifestId,
      itemBankManifestVersion: graph.manifest.itemBank.manifestVersion,
      questionCount: graph.questions.length,
      questionTypeDistribution: graph.manifest.questionPlan.questionTypeDistribution,
      expectedCounts: plan.expectedCounts,
      historicalScope: LEGACY_CANONICAL_PLACEMENT,
    };

    console.log(
      JSON.stringify(
        {
          status: compatibility,
          productionObservation: true,
          productionWrite: "NO",
          expected: expectedSummary,
          observed: {
            ...snapshotSummary(snapshot),
            canonicalMarkerVersions: {
              assessment: [
                ...new Set(
                  assessmentMarkers
                    .map((marker) => markerMetadata(marker.config).canonicalManifestVersion)
                    .filter((version): version is string => version !== null),
                ),
              ],
              template: [
                ...new Set(
                  templateMarkers
                    .map((marker) => markerMetadata(marker.config).canonicalManifestVersion)
                    .filter((version): version is string => version !== null),
                ),
              ],
            },
            legacy: {
              assessmentMarkers: legacyAssessmentMarkers.map(safeMarker),
              templateMarkers: legacyTemplateMarkers.map(safeMarker),
              knownAssessmentRecord: safeAssessmentRecord(legacyAssessmentRecord),
              knownTemplateRecord: safeTemplateRecord(legacyTemplateRecord),
              templateGraph: legacyTemplateGraph,
            },
          },
          promotionPlan: {
            action: plan.action,
            idempotent: plan.idempotent,
            conflicts: plan.conflicts,
          },
        },
        null,
        2,
      ),
    );
    if (compatibility !== "MATCH") process.exitCode = 1;
  } catch {
    console.log(
      JSON.stringify(blockedReport("protected production read-only snapshot failed"), null, 2),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
