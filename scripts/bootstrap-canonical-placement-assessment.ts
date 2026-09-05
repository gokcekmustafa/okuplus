import { PrismaClient, Prisma } from "@prisma/client";
import {
  CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST,
  validateCanonicalPlacementAssessmentManifest,
} from "../src/curriculum/canonical-placement-assessment.js";
import {
  applyCanonicalPlacementPromotion,
  buildCanonicalPlacementAssessmentGraph,
  planCanonicalPlacementPromotion,
  readCanonicalPlacementSnapshot,
} from "../src/curriculum/canonical-placement-assessment-bootstrap.js";
import { CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST } from "../src/curriculum/canonical-placement-item-bank.js";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  type CatalogDbIdentity,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";
import type { ProficiencySkillCode } from "../src/curriculum/proficiency-levels.js";

const STAGING_WRITE_CONFIRMATION = "I_HAVE_VERIFIED_CANONICAL_PLACEMENT_STAGING_TARGET";
const PRODUCTION_WRITE_CONFIRMATION = "I_HAVE_VERIFIED_CANONICAL_PLACEMENT_PRODUCTION_TARGET";
const EDITORIAL_APPROVAL = "I_HAVE_APPROVED_CANONICAL_PLACEMENT_ASSESSMENT";
const PRODUCTION_APPROVAL = "I_HAVE_APPROVED_CANONICAL_PLACEMENT_ASSESSMENT_PRODUCTION";

const args = new Set(process.argv.slice(2));
const isValidateOnly = args.has("--validate-only");
const isDryRun = args.has("--dry-run");
const isApply = args.has("--apply");

type Environment = "STAGING" | "PRODUCTION";
type Target = Omit<CatalogTarget, "environment"> & { environment: Environment };

type TargetIdentity = CatalogDbIdentity;

function fail(message: string): never {
  throw new Error(`canonical placement assessment bootstrap reddedildi: ${message}`);
}

function assertMode(): void {
  const modeCount = [isValidateOnly, isDryRun, isApply].filter(Boolean).length;
  if (modeCount !== 1) {
    fail("tam olarak bir mod seçilmeli: --validate-only, --dry-run veya --apply");
  }
}

function readTarget(): Target {
  const rawUrl = process.env.CANONICAL_PLACEMENT_ASSESSMENT_DATABASE_URL?.trim();
  if (!rawUrl) {
    fail("CANONICAL_PLACEMENT_ASSESSMENT_DATABASE_URL verilmedi; DATABASE_URL fallback'i yok");
  }

  const environment = process.env.CANONICAL_PLACEMENT_ASSESSMENT_ENVIRONMENT?.trim().toUpperCase();
  if (environment !== "STAGING" && environment !== "PRODUCTION") {
    fail("CANONICAL_PLACEMENT_ASSESSMENT_ENVIRONMENT STAGING veya PRODUCTION olmalı");
  }

  let target: Target;
  try {
    target = parseCatalogTargetUrl(rawUrl, environment as Environment) as Target;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const expectedDatabase = process.env.CANONICAL_PLACEMENT_ASSESSMENT_EXPECTED_DATABASE?.trim();
  if (!expectedDatabase) {
    fail("CANONICAL_PLACEMENT_ASSESSMENT_EXPECTED_DATABASE açıkça verilmelidir");
  }
  if (expectedDatabase !== target.database) {
    fail(
      `URL database ile beklenen database eşleşmiyor: ${target.database} !== ${expectedDatabase}`,
    );
  }

  try {
    assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (isApply) {
    const expectedConfirmation =
      environment === "STAGING" ? STAGING_WRITE_CONFIRMATION : PRODUCTION_WRITE_CONFIRMATION;
    if (process.env.CANONICAL_PLACEMENT_ASSESSMENT_ALLOW_WRITE !== expectedConfirmation) {
      fail(
        `yazma onayı için CANONICAL_PLACEMENT_ASSESSMENT_ALLOW_WRITE=${expectedConfirmation} gerekli`,
      );
    }
    if (process.env.CANONICAL_PLACEMENT_ASSESSMENT_EDITORIAL_APPROVAL !== EDITORIAL_APPROVAL) {
      fail(
        `editorial onay için CANONICAL_PLACEMENT_ASSESSMENT_EDITORIAL_APPROVAL=${EDITORIAL_APPROVAL} gerekli`,
      );
    }
    if (
      environment === "PRODUCTION" &&
      process.env.CANONICAL_PLACEMENT_ASSESSMENT_PRODUCTION_APPROVAL !== PRODUCTION_APPROVAL
    ) {
      fail(
        `production onayı için CANONICAL_PLACEMENT_ASSESSMENT_PRODUCTION_APPROVAL=${PRODUCTION_APPROVAL} gerekli`,
      );
    }
  }

  return target;
}

function safeTarget(target: Target, identity?: TargetIdentity): Record<string, unknown> {
  return {
    environment: target.environment,
    provider: target.provider,
    host: target.host,
    port: target.port,
    database: identity?.database ?? target.database,
    user: identity?.db_user ?? "<not-connected>",
  };
}

async function readIdentity(prisma: PrismaClient): Promise<TargetIdentity> {
  const rows = await prisma.$queryRaw<Array<TargetIdentity>>(
    Prisma.sql`SELECT current_database() AS database, current_user AS db_user`,
  );
  const identity = rows[0];
  if (!identity) fail("database identity okunamadı");
  return identity;
}

function assertIdentity(target: Target, identity: TargetIdentity): void {
  try {
    assertLiveCatalogTargetIdentity(target, identity);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

async function readCanonicalSkills(prisma: PrismaClient) {
  const rows = await prisma.skill.findMany({
    where: { code: { in: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"] } },
    select: { id: true, code: true, name: true },
  });
  const expected = new Set(["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"]);
  const actual = new Set(rows.map((row) => row.code));
  const missing = [...expected].filter((code) => !actual.has(code));
  if (missing.length > 0) {
    fail(`canonical placement için Skill eksik: ${missing.join(", ")}`);
  }
  return rows;
}

function safePlan(plan: ReturnType<typeof planCanonicalPlacementPromotion>) {
  return {
    action: plan.action,
    conflicts: plan.conflicts,
    idempotent: plan.idempotent,
    expectedCounts: plan.expectedCounts,
  };
}

async function main(): Promise<void> {
  assertMode();
  const manifest = validateCanonicalPlacementAssessmentManifest(
    CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST,
  );
  const graph = buildCanonicalPlacementAssessmentGraph(manifest);

  if (isValidateOnly) {
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "VALIDATE_ONLY",
          manifestId: manifest.manifestId,
          manifestVersion: manifest.manifestVersion,
          itemBankManifestId: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestId,
          itemBankManifestVersion: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestVersion,
          assessmentId: graph.assessment.id,
          templateId: graph.template.id,
          templateVersionId: graph.templateVersion.id,
          questionCount: graph.questions.length,
          skillDistribution: manifest.questionPlan.skillDistribution,
          difficultyDistribution: manifest.questionPlan.difficultyDistribution,
          calibrationStatus: manifest.calibrationStatus,
          productionAssignmentEnabled: manifest.scoring.productionAssignmentEnabled,
          dbChanged: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const target = readTarget();
  const prisma = new PrismaClient({
    datasources: { db: { url: target.url } },
    transactionOptions: { maxWait: 3_000, timeout: 30_000 },
  });

  try {
    await prisma.$connect();
    const identity = await readIdentity(prisma);
    assertIdentity(target, identity);
    try {
      assertApprovedTargetFingerprint(
        target,
        identity,
        process.env.CANONICAL_PLACEMENT_ASSESSMENT_APPROVED_TARGET_FINGERPRINT,
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }

    const skills = await readCanonicalSkills(prisma);
    const graphWithLiveSkills = buildCanonicalPlacementAssessmentGraph(
      manifest,
      skills.map((skill) => ({
        id: skill.id,
        code: skill.code as ProficiencySkillCode,
        name: skill.name,
      })),
    );
    const snapshot = await readCanonicalPlacementSnapshot(prisma, graphWithLiveSkills);
    const plan = planCanonicalPlacementPromotion(graphWithLiveSkills, snapshot);

    if (plan.action === "CONFLICT") {
      console.log(
        JSON.stringify(
          {
            status: "BLOCKED",
            mode: isDryRun ? "DRY_RUN" : "APPLY",
            target: safeTarget(target, identity),
            ...safePlan(plan),
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
            mode: isDryRun ? "DRY_RUN" : "NOOP",
            target: safeTarget(target, identity),
            ...safePlan(plan),
            manifestId: manifest.manifestId,
            questionCount: graphWithLiveSkills.questions.length,
            calibrationStatus: manifest.calibrationStatus,
            productionAssignmentEnabled: manifest.scoring.productionAssignmentEnabled,
            resultLevelId: null,
            reviewRequired: true,
            dbChanged: false,
            writePerformed: false,
          },
          null,
          2,
        ),
      );
      return;
    }

    const created = await applyCanonicalPlacementPromotion(prisma, graphWithLiveSkills);
    const after = await readCanonicalPlacementSnapshot(prisma, graphWithLiveSkills);
    const afterPlan = planCanonicalPlacementPromotion(graphWithLiveSkills, after);
    if (afterPlan.action !== "NOOP") {
      fail(`transaction sonrası beklenen NOOP oluşmadı: ${afterPlan.conflicts.join("; ")}`);
    }
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          mode: "APPLY",
          target: safeTarget(target, identity),
          ...safePlan(afterPlan),
          created,
          manifestId: manifest.manifestId,
          questionCount: graphWithLiveSkills.questions.length,
          calibrationStatus: manifest.calibrationStatus,
          productionAssignmentEnabled: manifest.scoring.productionAssignmentEnabled,
          resultLevelId: null,
          reviewRequired: true,
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
    `canonical placement assessment bootstrap FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
