import { PrismaClient } from "@prisma/client";
import {
  applyCanonicalPlacementPromotion,
  buildCanonicalPlacementAssessmentGraph,
  planCanonicalPlacementPromotion,
  readCanonicalPlacementSnapshot,
} from "../src/curriculum/canonical-placement-assessment-bootstrap.js";
import {
  assertApprovedTargetFingerprint,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
} from "../src/curriculum/catalog-target-verification.js";

type IdentityRow = {
  database: string;
  current_user: string;
};

type JsonRecord = Record<string, unknown>;

const CONFIRMATION = "CREATE_CANONICAL_PLACEMENT_GRAPH_V1";
const BACKUP_CONFIRMATION = "I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK";
const EXISTING_SNAPSHOT_CONFIRMATION = "I_ACCEPT_EXISTING_SNAPSHOT_WITH_UNTESTED_RESTORE";

type BackupConfirmationMode =
  "OPERATOR_VERIFIED" | "EXISTING_SNAPSHOT_UNTESTED_RESTORE_RISK_ACCEPTED";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`required protected value missing: ${name}`);
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertProvisionGate(): {
  rawUrl: string;
  approvedFingerprint: string;
  backupConfirmationMode: BackupConfirmationMode;
} {
  if (process.env.APP_ENV !== "production" || process.env.NODE_ENV !== "production") {
    throw new Error("production application environment is required");
  }
  if (process.env.DB_FINGERPRINT_ENVIRONMENT !== "PRODUCTION") {
    throw new Error("PRODUCTION database fingerprint environment is required");
  }
  if (process.env.CANONICAL_PLACEMENT_PROVISION_ENV !== "PRODUCTION") {
    throw new Error("canonical placement production environment is required");
  }
  if (process.env.CONFIRM_CANONICAL_PLACEMENT_PROVISION !== CONFIRMATION) {
    throw new Error("explicit canonical placement provision confirmation is required");
  }
  const backupConfirmation = process.env.PRODUCTION_BACKUP_CONFIRMATION;
  const backupConfirmationMode: BackupConfirmationMode =
    backupConfirmation === BACKUP_CONFIRMATION
      ? "OPERATOR_VERIFIED"
      : backupConfirmation === EXISTING_SNAPSHOT_CONFIRMATION
        ? "EXISTING_SNAPSHOT_UNTESTED_RESTORE_RISK_ACCEPTED"
        : (() => {
            throw new Error("production backup and rollback confirmation is required");
          })();

  const rawUrl = required("PRODUCTION_DATABASE_URL");
  const approvedFingerprint = required("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
  if (!/^[a-f0-9]{64}$/u.test(approvedFingerprint.toLowerCase())) {
    throw new Error("approved production target fingerprint is invalid");
  }
  return { rawUrl, approvedFingerprint, backupConfirmationMode };
}

function assertCanonicalVisibilityFlags(config: unknown): void {
  if (
    !isRecord(config) ||
    config.canonicalActive !== false ||
    config.calibrationStatus !== "NOT_CALIBRATED" ||
    config.productionAssignmentEnabled !== false ||
    config.reviewRequired !== true ||
    config.resultLevelId !== null
  ) {
    throw new Error("canonical placement visibility/calibration flags are unsafe");
  }
}

function sanitizedSummary(
  status: "NOOP" | "CONFLICT" | "APPLIED" | "FAILED",
  productionWrite: "NO" | "YES",
  plan: ReturnType<typeof planCanonicalPlacementPromotion> | null,
  flags?: {
    canonicalActive: boolean;
    calibrationStatus: unknown;
    productionAssignmentEnabled: boolean;
  },
  backupConfirmationMode?: BackupConfirmationMode,
) {
  return {
    status,
    productionWrite,
    action: plan?.action ?? null,
    conflicts: plan?.conflicts ?? [],
    idempotent: plan?.idempotent ?? false,
    expectedCounts: plan?.expectedCounts ?? null,
    visibility: flags ?? null,
    backupConfirmationMode: backupConfirmationMode ?? null,
  };
}

async function main(): Promise<void> {
  const { rawUrl, approvedFingerprint, backupConfirmationMode } = assertProvisionGate();
  const target = parseCatalogTargetUrl(rawUrl, "PRODUCTION");
  const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  let applied = false;

  try {
    const identityRows = await prisma.$queryRaw<IdentityRow[]>`
      SELECT current_database() AS database, current_user AS current_user
    `;
    const identity = identityRows[0];
    if (!identity) throw new Error("production database identity unavailable");
    assertLiveCatalogTargetIdentity(target, {
      database: identity.database,
      db_user: identity.current_user,
    });
    assertApprovedTargetFingerprint(
      target,
      { database: identity.database, db_user: identity.current_user },
      approvedFingerprint,
    );

    const graph = buildCanonicalPlacementAssessmentGraph();
    assertCanonicalVisibilityFlags(graph.assessment.config);
    const beforeSnapshot = await readCanonicalPlacementSnapshot(prisma, graph);
    const beforePlan = planCanonicalPlacementPromotion(graph, beforeSnapshot);

    if (beforePlan.action === "NOOP") {
      if (!beforeSnapshot.assessment) throw new Error("NOOP graph is missing its assessment");
      assertCanonicalVisibilityFlags(beforeSnapshot.assessment.config);
      const config = beforeSnapshot.assessment.config;
      if (!isRecord(config)) throw new Error("canonical placement config is invalid");
      console.log(
        JSON.stringify(
          sanitizedSummary(
            "NOOP",
            "NO",
            beforePlan,
            {
              canonicalActive: config.canonicalActive === true,
              calibrationStatus: config.calibrationStatus,
              productionAssignmentEnabled: config.productionAssignmentEnabled === true,
            },
            backupConfirmationMode,
          ),
          null,
          2,
        ),
      );
      return;
    }
    if (beforePlan.action !== "CREATE") {
      console.log(
        JSON.stringify(
          sanitizedSummary("CONFLICT", "NO", beforePlan, undefined, backupConfirmationMode),
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    await applyCanonicalPlacementPromotion(prisma, graph);
    applied = true;

    const afterSnapshot = await readCanonicalPlacementSnapshot(prisma, graph);
    const afterPlan = planCanonicalPlacementPromotion(graph, afterSnapshot);
    if (afterPlan.action !== "NOOP" || !afterSnapshot.assessment) {
      throw new Error("canonical placement postcondition is not an exact NOOP graph");
    }
    assertCanonicalVisibilityFlags(afterSnapshot.assessment.config);
    const config = afterSnapshot.assessment.config;
    if (!isRecord(config)) throw new Error("canonical placement config is invalid");

    console.log(
      JSON.stringify(
        sanitizedSummary(
          "APPLIED",
          "YES",
          afterPlan,
          {
            canonicalActive: config.canonicalActive === true,
            calibrationStatus: config.calibrationStatus,
            productionAssignmentEnabled: config.productionAssignmentEnabled === true,
          },
          backupConfirmationMode,
        ),
        null,
        2,
      ),
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        sanitizedSummary("FAILED", applied ? "YES" : "NO", null, undefined, backupConfirmationMode),
        null,
        2,
      ),
    );
    throw error instanceof Error
      ? new Error("canonical placement production provision failed")
      : error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
