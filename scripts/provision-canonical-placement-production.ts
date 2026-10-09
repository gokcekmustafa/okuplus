import { PrismaClient } from "@prisma/client";
import {
  applyCanonicalPlacementPromotion,
  buildCanonicalPlacementAssessmentGraph,
  CanonicalPlacementSkillCatalogError,
  readCanonicalPlacementSkillRefs,
  type CanonicalPlacementSkillRef,
  planCanonicalPlacementPromotion,
  readCanonicalPlacementSnapshot,
} from "../src/curriculum/canonical-placement-assessment-bootstrap.js";
import {
  assertApprovedTargetFingerprint,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
} from "../src/curriculum/catalog-target-verification.js";
import {
  canonicalPlacementProvisionWriteState,
  classifyCanonicalPlacementProvisionError,
  type CanonicalPlacementProvisionStage,
} from "../src/curriculum/canonical-placement-provision-safety.js";

type IdentityRow = {
  database: string;
  current_user: string;
};

type JsonRecord = Record<string, unknown>;

const CONFIRMATION = "CREATE_CANONICAL_PLACEMENT_GRAPH_V1";
const PLAN_CONFIRMATION = "PLAN_CANONICAL_PLACEMENT_GRAPH_V1";
const BACKUP_CONFIRMATION = "I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK";
const EXISTING_SNAPSHOT_CONFIRMATION = "I_ACCEPT_EXISTING_SNAPSHOT_WITH_UNTESTED_RESTORE";

type BackupConfirmationMode =
  "OPERATOR_VERIFIED" | "EXISTING_SNAPSHOT_UNTESTED_RESTORE_RISK_ACCEPTED";
type ProvisionOperation = "PLAN_ONLY" | "CREATE";

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
  operation: ProvisionOperation;
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
  const operation = process.env.CANONICAL_PLACEMENT_OPERATION;
  if (operation !== "PLAN_ONLY" && operation !== "CREATE") {
    throw new Error("canonical placement operation is invalid");
  }
  const expectedConfirmation = operation === "PLAN_ONLY" ? PLAN_CONFIRMATION : CONFIRMATION;
  if (process.env.CONFIRM_CANONICAL_PLACEMENT_PROVISION !== expectedConfirmation) {
    throw new Error("explicit canonical placement operation confirmation is required");
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
  return { rawUrl, approvedFingerprint, backupConfirmationMode, operation };
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
  status: "PLAN_ONLY" | "NOOP" | "CONFLICT" | "APPLIED" | "FAILED",
  productionWrite: "NO" | "YES" | "UNKNOWN",
  plan: ReturnType<typeof planCanonicalPlacementPromotion> | null,
  flags?: {
    canonicalActive: boolean;
    calibrationStatus: unknown;
    productionAssignmentEnabled: boolean;
    reviewRequired: boolean;
    resultLevelId: null;
  },
  backupConfirmationMode?: BackupConfirmationMode,
  details?: {
    stage: CanonicalPlacementProvisionStage;
    errorClass: "VALIDATION" | "PRISMA" | "UNKNOWN" | null;
    errorCode: string | null;
    constraintField: string | null;
    beforePlanAction: "CREATE" | "NOOP" | "CONFLICT" | null;
    afterPlanAction: "CREATE" | "NOOP" | "CONFLICT" | null;
    missingSkillCodes: string[];
  },
  skillRefs?: CanonicalPlacementSkillRef[],
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
    stage: details?.stage ?? null,
    errorClass: details?.errorClass ?? null,
    errorCode: details?.errorCode ?? null,
    constraintField: details?.constraintField ?? null,
    beforePlanAction: details?.beforePlanAction ?? null,
    afterPlanAction: details?.afterPlanAction ?? null,
    missingSkillCodes: details?.missingSkillCodes ?? [],
    skillRefs: skillRefs ?? null,
  };
}

async function main(): Promise<void> {
  let stage: CanonicalPlacementProvisionStage = "GATE";
  let backupConfirmationMode: BackupConfirmationMode | undefined;
  let operation: ProvisionOperation | undefined;
  let beforePlan: ReturnType<typeof planCanonicalPlacementPromotion> | null = null;
  let afterPlan: ReturnType<typeof planCanonicalPlacementPromotion> | null = null;
  let graph: ReturnType<typeof buildCanonicalPlacementAssessmentGraph> | null = null;
  let skillRefs: CanonicalPlacementSkillRef[] = [];
  let applied = false;
  let prisma: PrismaClient | null = null;

  try {
    const gate = assertProvisionGate();
    backupConfirmationMode = gate.backupConfirmationMode;
    operation = gate.operation;
    stage = "TARGET_IDENTITY";
    const target = parseCatalogTargetUrl(gate.rawUrl, "PRODUCTION");
    prisma = new PrismaClient({ datasources: { db: { url: gate.rawUrl } } });
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
      gate.approvedFingerprint,
    );

    stage = "SKILL_RESOLUTION";
    skillRefs = await readCanonicalPlacementSkillRefs(prisma);
    stage = "GRAPH_BUILD";
    graph = buildCanonicalPlacementAssessmentGraph(undefined, skillRefs);
    assertCanonicalVisibilityFlags(graph.assessment.config);
    stage = "SNAPSHOT_READ_BEFORE";
    const beforeSnapshot = await readCanonicalPlacementSnapshot(prisma, graph);
    stage = "PLAN_BEFORE";
    beforePlan = planCanonicalPlacementPromotion(graph, beforeSnapshot);

    if (operation === "PLAN_ONLY") {
      console.log(
        JSON.stringify(
          sanitizedSummary(
            beforePlan.action === "CONFLICT" ? "CONFLICT" : "PLAN_ONLY",
            "NO",
            beforePlan,
            undefined,
            backupConfirmationMode,
            {
              stage: "PLAN_BEFORE",
              errorClass: null,
              errorCode: null,
              constraintField: null,
              beforePlanAction: beforePlan.action,
              afterPlanAction: null,
              missingSkillCodes: [],
            },
            skillRefs,
          ),
          null,
          2,
        ),
      );
      if (beforePlan.action === "CONFLICT") process.exitCode = 2;
      return;
    }

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
              reviewRequired: config.reviewRequired === true,
              resultLevelId: config.resultLevelId,
            },
            backupConfirmationMode,
            {
              stage: "PLAN_BEFORE",
              errorClass: null,
              errorCode: null,
              constraintField: null,
              beforePlanAction: beforePlan.action,
              afterPlanAction: null,
              missingSkillCodes: [],
            },
            skillRefs,
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
          sanitizedSummary(
            "CONFLICT",
            "NO",
            beforePlan,
            undefined,
            backupConfirmationMode,
            {
              stage: "PLAN_BEFORE",
              errorClass: null,
              errorCode: null,
              constraintField: null,
              beforePlanAction: beforePlan.action,
              afterPlanAction: null,
              missingSkillCodes: [],
            },
            skillRefs,
          ),
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    stage = "APPLY";
    await applyCanonicalPlacementPromotion(prisma, graph);
    applied = true;

    stage = "SNAPSHOT_READ_AFTER";
    const afterSnapshot = await readCanonicalPlacementSnapshot(prisma, graph);
    stage = "PLAN_AFTER";
    afterPlan = planCanonicalPlacementPromotion(graph, afterSnapshot);
    stage = "POSTCONDITION";
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
            reviewRequired: config.reviewRequired === true,
            resultLevelId: config.resultLevelId,
          },
          backupConfirmationMode,
          {
            stage: "POSTCONDITION",
            errorClass: null,
            errorCode: null,
            constraintField: null,
            beforePlanAction: beforePlan.action,
            afterPlanAction: afterPlan.action,
            missingSkillCodes: [],
          },
          skillRefs,
        ),
        null,
        2,
      ),
    );
  } catch (error) {
    const errorDetails = classifyCanonicalPlacementProvisionError(error, stage);
    const missingSkillCodes =
      error instanceof CanonicalPlacementSkillCatalogError ? error.missingCodes : [];
    console.log(
      JSON.stringify(
        sanitizedSummary(
          "FAILED",
          canonicalPlacementProvisionWriteState(stage, applied),
          afterPlan ?? beforePlan,
          undefined,
          backupConfirmationMode,
          {
            stage,
            errorClass: errorDetails.errorClass,
            errorCode: errorDetails.errorCode,
            constraintField: errorDetails.constraintField,
            beforePlanAction: beforePlan?.action ?? null,
            afterPlanAction: afterPlan?.action ?? null,
            missingSkillCodes,
          },
          skillRefs,
        ),
        null,
        2,
      ),
    );
    const safeError =
      errorDetails.errorClass === "PRISMA" && errorDetails.errorCode
        ? `canonical placement production provision failed at ${stage} (${errorDetails.errorCode})`
        : `canonical placement production provision failed at ${stage}`;
    throw new Error(safeError);
  } finally {
    await prisma?.$disconnect();
  }
}

main().catch((error) => {
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
