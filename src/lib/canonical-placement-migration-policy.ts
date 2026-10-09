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
};

export type CanonicalPlacementMigrationPolicyResult = {
  allowed: boolean;
  reasons: readonly string[];
  targetApplied: boolean;
  targetHistoricalRollback: boolean;
  pendingMigrations: readonly string[];
};

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
