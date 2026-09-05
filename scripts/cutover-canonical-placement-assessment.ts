import { Prisma, PrismaClient } from "@prisma/client";
import {
  CANONICAL_PLACEMENT_IDENTITY,
  type CanonicalPlacementIdentity,
} from "../src/modules/assessments/canonical-selector.js";
import {
  cutoverCanonicalPlacement,
  planCanonicalPlacementCutover,
  readCanonicalPlacementCutoverCandidates,
} from "../src/curriculum/canonical-placement-cutover.js";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  targetFingerprint,
  type CatalogDbIdentity,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";

const CUTOVER_WRITE_CONFIRMATION = "I_HAVE_VERIFIED_CANONICAL_PLACEMENT_CUTOVER_TARGET";
const PRODUCTION_APPROVAL = "I_HAVE_APPROVED_CANONICAL_PLACEMENT_CUTOVER_PRODUCTION";

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const isApply = args.has("--apply");
const isRollback = args.has("--rollback");

type Environment = "STAGING" | "PRODUCTION";

function fail(message: string): never {
  throw new Error(`canonical placement cutover reddedildi: ${message}`);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function assertMode(): void {
  if ((isDryRun ? 1 : 0) + (isApply ? 1 : 0) !== 1) {
    fail("tam olarak bir mod seçilmeli: --dry-run veya --apply");
  }
}

function readTarget(): CatalogTarget & { environment: Environment } {
  const rawUrl = process.env.CANONICAL_PLACEMENT_ASSESSMENT_DATABASE_URL?.trim();
  if (!rawUrl) fail("CANONICAL_PLACEMENT_ASSESSMENT_DATABASE_URL verilmedi");

  const rawEnvironment =
    process.env.CANONICAL_PLACEMENT_ASSESSMENT_ENVIRONMENT?.trim().toUpperCase();
  if (rawEnvironment !== "STAGING" && rawEnvironment !== "PRODUCTION") {
    fail("CANONICAL_PLACEMENT_ASSESSMENT_ENVIRONMENT STAGING veya PRODUCTION olmalı");
  }

  const target = parseCatalogTargetUrl(rawUrl, rawEnvironment as Environment);
  const expectedDatabase = process.env.CANONICAL_PLACEMENT_ASSESSMENT_EXPECTED_DATABASE?.trim();
  if (!expectedDatabase || expectedDatabase !== target.database) {
    fail("beklenen database connection URL database ile eşleşmiyor");
  }
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });

  if (isApply) {
    if (process.env.CANONICAL_PLACEMENT_CUTOVER_ALLOW_WRITE !== CUTOVER_WRITE_CONFIRMATION) {
      fail(
        `yazma onayı için CANONICAL_PLACEMENT_CUTOVER_ALLOW_WRITE=${CUTOVER_WRITE_CONFIRMATION} gerekli`,
      );
    }
    if (
      target.environment === "PRODUCTION" &&
      process.env.CANONICAL_PLACEMENT_CUTOVER_PRODUCTION_APPROVAL !== PRODUCTION_APPROVAL
    ) {
      fail(
        `production onayı için CANONICAL_PLACEMENT_CUTOVER_PRODUCTION_APPROVAL=${PRODUCTION_APPROVAL} gerekli`,
      );
    }
  }
  return target;
}

async function readIdentity(prisma: PrismaClient): Promise<CatalogDbIdentity> {
  const rows = await prisma.$queryRaw<Array<CatalogDbIdentity>>(
    Prisma.sql`SELECT current_database() AS database, current_user AS db_user`,
  );
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  return identity;
}

function safeTarget(target: CatalogTarget, identity: CatalogDbIdentity): Record<string, unknown> {
  return {
    environment: target.environment,
    provider: target.provider,
    host: target.host,
    port: target.port,
    database: identity.database,
    user: identity.db_user,
    fingerprint: targetFingerprint(target, identity),
  };
}

async function main(): Promise<void> {
  assertMode();
  const targetAssessmentId = argValue("--assessment-id");
  if (!targetAssessmentId) fail("--assessment-id gerekli");

  const suppliedTargetVersion = argValue("--target-manifest-version");
  if (isRollback && !suppliedTargetVersion) {
    fail("rollback için --target-manifest-version açıkça verilmelidir");
  }
  const targetVersion = suppliedTargetVersion ?? CANONICAL_PLACEMENT_IDENTITY.manifestVersion;
  const identity: CanonicalPlacementIdentity = {
    manifestId: CANONICAL_PLACEMENT_IDENTITY.manifestId,
    manifestVersion: targetVersion,
  };
  const target = readTarget();
  const prisma = new PrismaClient({
    datasources: { db: { url: target.url } },
    transactionOptions: { maxWait: 3_000, timeout: 30_000 },
  });

  try {
    await prisma.$connect();
    const liveIdentity = await readIdentity(prisma);
    assertLiveCatalogTargetIdentity(target, liveIdentity);
    assertApprovedTargetFingerprint(
      target,
      liveIdentity,
      process.env.CANONICAL_PLACEMENT_ASSESSMENT_APPROVED_TARGET_FINGERPRINT,
    );

    const candidates = await readCanonicalPlacementCutoverCandidates(prisma, identity);
    const plan = planCanonicalPlacementCutover(candidates, targetAssessmentId, identity);
    if (plan.action === "CONFLICT") {
      console.log(
        JSON.stringify(
          {
            status: "BLOCKED",
            mode: isRollback ? "ROLLBACK" : isDryRun ? "DRY_RUN" : "APPLY",
            target: safeTarget(target, liveIdentity),
            ...plan,
            dbChanged: false,
            writePerformed: false,
          },
          null,
          2,
        ),
      );
      fail(plan.conflicts.join("; "));
    }

    if (isDryRun || plan.action === "NOOP") {
      console.log(
        JSON.stringify(
          {
            status: "PASS",
            mode: isRollback ? "ROLLBACK_DRY_RUN" : "DRY_RUN",
            target: safeTarget(target, liveIdentity),
            ...plan,
            dbChanged: false,
            writePerformed: false,
          },
          null,
          2,
        ),
      );
      return;
    }

    const applied = await cutoverCanonicalPlacement(prisma, targetAssessmentId, identity);
    const afterCandidates = await readCanonicalPlacementCutoverCandidates(prisma, identity);
    const after = planCanonicalPlacementCutover(afterCandidates, targetAssessmentId, identity);
    if (after.action !== "NOOP") {
      fail(`cutover sonrası beklenen NOOP oluşmadı: ${after.conflicts.join("; ")}`);
    }
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: isRollback ? "ROLLBACK" : "APPLY",
          target: safeTarget(target, liveIdentity),
          ...applied,
          dbChanged: true,
          writePerformed: true,
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
    `canonical placement cutover FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
