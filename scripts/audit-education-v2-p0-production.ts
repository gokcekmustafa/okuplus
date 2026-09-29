import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ACADEMIC_P0_LESSONS } from "../src/curriculum/academic-reading-p0.js";
import { parseCatalogTargetUrl } from "../src/curriculum/catalog-target-verification.js";
import { providerForHost, targetIdentityFingerprint } from "../src/lib/db-fingerprint-contract.js";

const LEVEL_CODE = process.env.EDUCATION_V2_P0_LEVEL_CODE?.trim() || "G8_12";
const EXPECTED_PATHS = [
  {
    code: `EDUCATION_V2_P0_FAST_READING_${LEVEL_CODE}`,
    area: "FAST_READING" as const,
  },
  {
    code: `EDUCATION_V2_P0_READING_COMPREHENSION_${LEVEL_CODE}`,
    area: "READING_COMPREHENSION" as const,
  },
  { code: `EDUCATION_V2_P0_COMMON_${LEVEL_CODE}`, area: "COMMON" as const },
] as const;

type MatchStatus = "MATCH" | "MISMATCH" | "UNVERIFIED";

type IdentityRow = {
  database: string;
  current_user: string;
  server_port: number;
};

type SafeStep = {
  stableKey: string;
  type: string;
  status: string;
  isActive: boolean;
  contentVersionId: string | null;
  exerciseTemplateVersionId: string | null;
  assessmentId: string | null;
  contentVersion: { status: string; content: { status: string; deletedAt: Date | null } } | null;
  exerciseTemplateVersion: {
    status: string;
    template: { status: string; deletedAt: Date | null };
  } | null;
  assessment: { status: string; deletedAt: Date | null } | null;
};

function required(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function match(
  actual: string,
  expected: string | null,
  normalize = (value: string) => value,
): MatchStatus {
  if (!expected) return "UNVERIFIED";
  return normalize(actual) === normalize(expected) ? "MATCH" : "MISMATCH";
}

function expectedValue(...names: string[]): string | null {
  for (const name of names) {
    const value = required(name);
    if (value) return value;
  }
  return null;
}

function expectedStableKeys(): Set<string> {
  const keys = new Set<string>();
  for (const lesson of ACADEMIC_P0_LESSONS) {
    for (const stage of lesson.stages) keys.add(`${lesson.skillCode}_${stage.stage}`);
  }
  for (const key of [
    "COMMON_REINFORCEMENT",
    "COMMON_ASSESSMENT",
    "COMMON_MEASUREMENT",
    "COMMON_NEXT_LEARNING",
  ]) {
    keys.add(key);
  }
  return keys;
}

function linkIsPublished(step: SafeStep): boolean {
  if (step.type === "TEACHING" || step.type === "SMALL_STUDY") {
    return (
      Boolean(step.contentVersionId) &&
      step.contentVersion?.status === "PUBLISHED" &&
      step.contentVersion.content.status === "PUBLISHED" &&
      step.contentVersion.content.deletedAt === null
    );
  }
  if (step.type === "PRACTICE" || step.type === "REINFORCEMENT") {
    return (
      Boolean(step.exerciseTemplateVersionId) &&
      step.exerciseTemplateVersion?.status === "PUBLISHED" &&
      step.exerciseTemplateVersion.template.status === "PUBLISHED" &&
      step.exerciseTemplateVersion.template.deletedAt === null
    );
  }
  if (step.type === "ASSESSMENT") {
    return (
      Boolean(step.assessmentId) &&
      step.assessment?.status === "PUBLISHED" &&
      step.assessment.deletedAt === null
    );
  }
  return true;
}

function safeFailure(): { status: "BLOCKED"; productionWrite: "NO"; reason: string } {
  return {
    status: "BLOCKED",
    productionWrite: "NO",
    reason: "production database connection or read-only audit query failed",
  };
}

async function main(): Promise<void> {
  const rawUrl = required("PRODUCTION_DATABASE_URL") ?? required("DB_FINGERPRINT_DATABASE_URL");
  const approvedFingerprint = required("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
  if (!rawUrl || !approvedFingerprint) {
    console.log(
      JSON.stringify(
        { ...safeFailure(), reason: "required production audit configuration is missing" },
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
    console.log(
      JSON.stringify(
        { ...safeFailure(), reason: "production database target is invalid" },
        null,
        2,
      ),
    );
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

    const identityVerified = Object.values(identityChecks).every((value) => value === "MATCH");
    const baseReport = {
      status: identityVerified ? "BLOCKED" : "BLOCKED",
      productionWrite: "NO" as const,
      targetIdentity: identityChecks,
      target: {
        provider: providerForHost(target.host),
        host: target.host,
        port: target.port,
        database: identity.database,
        currentUser: identity.current_user,
        serverPort: actualPort,
      },
      neonProject: "UNVERIFIED",
      neonBranch: "UNVERIFIED",
      levelCode: LEVEL_CODE,
    };

    if (!identityVerified) {
      console.log(JSON.stringify(baseReport, null, 2));
      process.exitCode = 1;
      return;
    }

    const paths = await prisma.learningPath.findMany({
      where: {
        tenantId: null,
        code: { in: EXPECTED_PATHS.map((path) => path.code) },
        version: 1,
        status: "PUBLISHED",
        deletedAt: null,
        level: { code: LEVEL_CODE },
      },
      select: {
        code: true,
        area: true,
        status: true,
        deletedAt: true,
        level: { select: { code: true } },
        units: {
          orderBy: { position: "asc" },
          select: {
            code: true,
            status: true,
            steps: {
              orderBy: { position: "asc" },
              select: {
                stableKey: true,
                type: true,
                status: true,
                isActive: true,
                contentVersionId: true,
                exerciseTemplateVersionId: true,
                assessmentId: true,
                contentVersion: {
                  select: { status: true, content: { select: { status: true, deletedAt: true } } },
                },
                exerciseTemplateVersion: {
                  select: { status: true, template: { select: { status: true, deletedAt: true } } },
                },
                assessment: { select: { status: true, deletedAt: true } },
              },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    });

    const expectedKeys = expectedStableKeys();
    const actualKeys = new Set(
      paths.flatMap((path) =>
        path.units.flatMap((unit) => unit.steps.map((step) => step.stableKey)),
      ),
    );
    const missingPathCodes = EXPECTED_PATHS.filter(
      (expected) => !paths.some((path) => path.code === expected.code),
    ).map((expected) => expected.code);
    const missingExpectedStableKeys = [...expectedKeys].filter((key) => !actualKeys.has(key));
    const allSteps = paths.flatMap((path) => path.units.flatMap((unit) => unit.steps));
    const invalidPublishedLinks = allSteps.filter(
      (step) => step.status !== "PUBLISHED" || !step.isActive || !linkIsPublished(step),
    );
    const stepsByType = Object.fromEntries(
      [...new Set(allSteps.map((step) => step.type))]
        .sort()
        .map((type) => [type, allSteps.filter((step) => step.type === type).length]),
    );
    const complete =
      missingPathCodes.length === 0 &&
      missingExpectedStableKeys.length === 0 &&
      paths.length === EXPECTED_PATHS.length &&
      paths.every(
        (path) => path.units.length > 0 && path.units.every((unit) => unit.status === "PUBLISHED"),
      ) &&
      invalidPublishedLinks.length === 0;
    const report = {
      ...baseReport,
      status: complete ? "PASS" : "BLOCKED",
      publishedPathCount: paths.length,
      publishedUnitCount: paths.reduce((count, path) => count + path.units.length, 0),
      publishedStepCount: allSteps.filter((step) => step.status === "PUBLISHED" && step.isActive)
        .length,
      expectedPathCodes: EXPECTED_PATHS.map((path) => path.code),
      missingPathCodes,
      expectedStepCount: expectedKeys.size,
      stepsByType,
      missingExpectedStableKeys,
      invalidPublishedLinks: invalidPublishedLinks.map((step) => step.stableKey),
      neonProject: "UNVERIFIED",
      neonBranch: "UNVERIFIED",
    };
    console.log(JSON.stringify(report, null, 2));
    if (!complete) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify(safeFailure(), null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
