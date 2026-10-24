import { createHash } from "node:crypto";

export const CANONICAL_PLACEMENT_MIGRATION = "20260907170000_add_gp_achievement_metadata" as const;
export const INIT_MIGRATION = "20260817000000_init" as const;

export type CanonicalMigrationState = "APPLIED" | "ROLLED_BACK" | "FAILED_OR_INCOMPLETE" | string;

export type CanonicalMigrationHistoryRow = {
  migrationName: string;
  state: CanonicalMigrationState;
  appliedStepsCount: number;
  finishedAt: string | null;
  rolledBackAt: string | null;
};

export type CanonicalPlacementSchemaSummary = {
  columns: ReadonlyArray<{ table_name: string; column_name: string }>;
  indexes: ReadonlyArray<{ indexname: string }>;
  enums: ReadonlyArray<{ type_name: string; enum_value: string }>;
};

export type CanonicalPlacementMigrationPolicyInput = {
  targetIdentityMatch: boolean;
  migrationHistory: ReadonlyArray<CanonicalMigrationHistoryRow>;
  pendingMigrations: readonly string[];
  repositoryOnlyMigrations: readonly string[];
  productionOnlyMigrations: readonly string[];
  checksumMismatches: readonly string[];
  historicalChecksumAcknowledgements: ReadonlyArray<{ migrationName: string }>;
  unresolvedChecksumMismatches: readonly string[];
  schemaDrift: boolean;
  partialSchemaState: "YES" | "NO";
  partialDataState: "YES" | "NO";
  initSchemaCompatibility: string;
  schemaSummary: CanonicalPlacementSchemaSummary;
  /** Verified against pinned source hashes by the protected graph-only workflow. */
  cycle5To8GraphOnlyMigrationSourcesVerified?: boolean;
};

export type CanonicalPlacementMigrationPolicyResult = {
  allowed: boolean;
  reasons: readonly string[];
  targetApplied: boolean;
  targetHistoricalRollback: boolean;
  pendingMigrations: readonly string[];
};

export type Cycle5To8MigrationOperation = "PLAN_ONLY" | "APPLY";

export type Cycle5To8MigrationGateResult = {
  allowed: boolean;
  operation: Cycle5To8MigrationOperation;
  migrationPolicyStatus: "PASS" | "REVIEW_REQUIRED";
  targetIdentityMatch: boolean;
  pendingMigrations: readonly string[];
  repositoryOnlyMigrations: readonly string[];
  productionOnlyMigrations: readonly string[];
  reasons: readonly string[];
  graphOnlyExceptionApplied: boolean;
  productionDbWrite: "NO";
};

/**
 * Cycle graph-only provisioning does not depend on these two migrations: one
 * creates account-deletion request storage and the other adds readiness status
 * inspection. Pinning source hashes keeps a changed migration from inheriting
 * this narrow exception; neither migration is executed by the cycle workflow.
 */
export const CYCLE5_TO_8_GRAPH_ONLY_PENDING_MIGRATION_SHA256 = {
  "20261021150000_add_account_deletion_requests":
    "2753bbc95a9d2afb4bb18582b088d6517207eff549cdf1360bbcc412be84efd9",
  "20261021170000_add_readiness_migration_status_function":
    "55ee1df852291e6221eed9894733159c73b52034b0451b016642ce0e8e88cbf3",
} as const;

export function verifyCycle5To8GraphOnlyMigrationSources(
  sources: Readonly<Record<string, string>>,
): boolean {
  const expectedNames = Object.keys(CYCLE5_TO_8_GRAPH_ONLY_PENDING_MIGRATION_SHA256);
  if (Object.keys(sources).length !== expectedNames.length) return false;
  return expectedNames.every((name) => {
    const source = sources[name];
    if (typeof source !== "string") return false;
    const normalizedSource = source.replace(/\r\n/gu, "\n");
    return (
      createHash("sha256").update(normalizedSource).digest("hex") ===
      CYCLE5_TO_8_GRAPH_ONLY_PENDING_MIGRATION_SHA256[
        name as keyof typeof CYCLE5_TO_8_GRAPH_ONLY_PENDING_MIGRATION_SHA256
      ]
    );
  });
}

const CYCLE5_TO_8_GRAPH_ONLY_ALLOWED_REASONS = [
  "PENDING_MIGRATIONS_REMAIN",
  "REPOSITORY_ONLY_MIGRATION",
] as const;

function canApplyCurriculumGraphsWithoutRunningMigrations(
  input: CanonicalPlacementMigrationPolicyInput,
  policy: CanonicalPlacementMigrationPolicyResult,
): boolean {
  if (
    !input.targetIdentityMatch ||
    input.cycle5To8GraphOnlyMigrationSourcesVerified !== true ||
    input.pendingMigrations.length === 0 ||
    input.productionOnlyMigrations.length !== 0
  ) {
    return false;
  }
  const pending = [...input.pendingMigrations].sort();
  const repositoryOnly = [...input.repositoryOnlyMigrations].sort();
  const allowedPending = Object.keys(CYCLE5_TO_8_GRAPH_ONLY_PENDING_MIGRATION_SHA256).sort();
  if (
    new Set(pending).size !== pending.length ||
    pending.some((name) => !allowedPending.includes(name)) ||
    pending.length !== repositoryOnly.length ||
    pending.some((name, index) => name !== repositoryOnly[index])
  ) {
    return false;
  }
  const reasons = [...policy.reasons].sort();
  return (
    reasons.length === CYCLE5_TO_8_GRAPH_ONLY_ALLOWED_REASONS.length &&
    reasons.every((reason, index) => reason === CYCLE5_TO_8_GRAPH_ONLY_ALLOWED_REASONS[index])
  );
}

const EXPECTED_ACHIEVEMENT_CATEGORIES = [
  "TRAINING",
  "READING",
  "COMPREHENSION",
  "CONSISTENCY",
  "MILESTONE",
] as const;
const EXPECTED_ACHIEVEMENT_KINDS = ["BADGE", "TROPHY"] as const;

function sameValues(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

function enumValues(summary: CanonicalPlacementSchemaSummary, typeName: string): string[] {
  return summary.enums.filter((row) => row.type_name === typeName).map((row) => row.enum_value);
}

export function evaluateCanonicalPlacementMigrationPolicy(
  input: CanonicalPlacementMigrationPolicyInput,
): CanonicalPlacementMigrationPolicyResult {
  const reasons: string[] = [];
  const targetRows = input.migrationHistory.filter(
    (row) => row.migrationName === CANONICAL_PLACEMENT_MIGRATION,
  );
  const targetAppliedRows = targetRows.filter(
    (row) => row.state === "APPLIED" && row.finishedAt !== null && row.rolledBackAt === null,
  );
  const targetRollbackRows = targetRows.filter((row) => row.state === "ROLLED_BACK");
  const targetApplied = targetAppliedRows.length === 1;
  const targetHistoricalRollback =
    targetRollbackRows.length === 1 &&
    targetRollbackRows[0]?.rolledBackAt !== null &&
    targetRollbackRows[0]?.finishedAt === null &&
    targetRollbackRows[0]?.appliedStepsCount === 0;

  if (!input.targetIdentityMatch) reasons.push("TARGET_IDENTITY_MISMATCH");
  if (!targetApplied) reasons.push("TARGET_APPLIED_RECORD_MISSING_OR_DUPLICATED");
  if (targetRollbackRows.length > 0 && !targetHistoricalRollback) {
    reasons.push("TARGET_ROLLBACK_RECORD_NOT_HISTORICAL_SAFE_FORM");
  }

  const unexpectedNonApplied = input.migrationHistory.filter(
    (row) => row.state !== "APPLIED" && row.migrationName !== CANONICAL_PLACEMENT_MIGRATION,
  );
  if (unexpectedNonApplied.length > 0) reasons.push("UNEXPECTED_FAILED_OR_ROLLED_BACK_MIGRATION");
  if (targetRows.some((row) => row.state === "FAILED_OR_INCOMPLETE")) {
    reasons.push("TARGET_HAS_FAILED_OR_INCOMPLETE_RECORD");
  }

  if (input.repositoryOnlyMigrations.length > 0) reasons.push("REPOSITORY_ONLY_MIGRATION");
  if (input.productionOnlyMigrations.length > 0) reasons.push("PRODUCTION_ONLY_MIGRATION");
  if (input.pendingMigrations.length > 0) reasons.push("PENDING_MIGRATIONS_REMAIN");

  const acknowledgedNames = input.historicalChecksumAcknowledgements.map(
    ({ migrationName }) => migrationName,
  );
  if (acknowledgedNames.some((name) => name !== INIT_MIGRATION)) {
    reasons.push("HISTORICAL_CHECKSUM_ACK_NOT_INIT_ONLY");
  }
  if (
    input.checksumMismatches.includes(INIT_MIGRATION) &&
    !acknowledgedNames.includes(INIT_MIGRATION)
  ) {
    reasons.push("INIT_CHECKSUM_MISMATCH_NOT_ACKNOWLEDGED");
  }
  if (input.checksumMismatches.some((name) => name !== INIT_MIGRATION)) {
    reasons.push("UNEXPECTED_CHECKSUM_MISMATCH");
  }
  if (input.unresolvedChecksumMismatches.length > 0) {
    reasons.push("UNRESOLVED_CHECKSUM_MISMATCH");
  }

  if (input.schemaDrift) reasons.push("SCHEMA_DRIFT");
  if (input.partialSchemaState !== "NO") reasons.push("PARTIAL_SCHEMA_STATE");
  if (input.partialDataState !== "NO") reasons.push("PARTIAL_DATA_STATE");
  if (input.initSchemaCompatibility !== "PASS") reasons.push("INIT_SCHEMA_INCOMPATIBLE");

  const columns = new Set(
    input.schemaSummary.columns.map((row) => `${row.table_name}.${row.column_name}`),
  );
  for (const column of ["Badge.category", "Badge.kind", "Badge.targetValue"]) {
    if (!columns.has(column)) reasons.push(`MISSING_SCHEMA_COLUMN:${column}`);
  }

  if (
    !sameValues(
      enumValues(input.schemaSummary, "AchievementCategory"),
      EXPECTED_ACHIEVEMENT_CATEGORIES,
    )
  ) {
    reasons.push("ACHIEVEMENT_CATEGORY_ENUM_NOT_CANONICAL");
  }
  if (!sameValues(enumValues(input.schemaSummary, "AchievementKind"), EXPECTED_ACHIEVEMENT_KINDS)) {
    reasons.push("ACHIEVEMENT_KIND_ENUM_NOT_CANONICAL");
  }
  if (!enumValues(input.schemaSummary, "PointEventType").includes("TRAINING_SESSION_COMPLETED")) {
    reasons.push("POINT_EVENT_TYPE_MISSING_TRAINING_SESSION_COMPLETED");
  }
  if (
    !input.schemaSummary.indexes.some(
      ({ indexname }) => indexname === "Badge_category_status_displayOrder_idx",
    )
  ) {
    reasons.push("MISSING_BADGE_METADATA_INDEX");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    targetApplied,
    targetHistoricalRollback,
    pendingMigrations: [...input.pendingMigrations],
  };
}

/**
 * A matching production target may be inspected by a read-only Cycle 5–8 plan
 * while migration history needs review. Graph-only APPLY has a narrow exception
 * for two source-hash-pinned, unrelated migrations; those migrations remain
 * unapplied. Any other migration/history/schema issue keeps APPLY blocked.
 */
export function evaluateCycle5To8MigrationGate(
  operation: Cycle5To8MigrationOperation,
  input: CanonicalPlacementMigrationPolicyInput,
): Cycle5To8MigrationGateResult {
  const policy = evaluateCanonicalPlacementMigrationPolicy(input);
  const graphOnlyExceptionApplied =
    !policy.allowed && canApplyCurriculumGraphsWithoutRunningMigrations(input, policy);
  return {
    allowed:
      operation === "PLAN_ONLY"
        ? input.targetIdentityMatch
        : policy.allowed || graphOnlyExceptionApplied,
    operation,
    migrationPolicyStatus: policy.allowed ? "PASS" : "REVIEW_REQUIRED",
    targetIdentityMatch: input.targetIdentityMatch,
    pendingMigrations: [...input.pendingMigrations],
    repositoryOnlyMigrations: [...input.repositoryOnlyMigrations],
    productionOnlyMigrations: [...input.productionOnlyMigrations],
    reasons: [...policy.reasons],
    graphOnlyExceptionApplied,
    productionDbWrite: "NO",
  };
}
