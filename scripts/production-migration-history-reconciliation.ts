export type MigrationHistoryRecord = {
  migrationName: string;
  checksum: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
  appliedStepsCount: number;
};

export type MigrationHistoryReconciliation = {
  migrationName: string;
  classification: "NO_FAILURE" | "HISTORICAL_ROLLBACK_RECONCILED" | "BLOCKED";
  resolved: boolean;
  schemaPreconditions: "PASS" | "FAIL" | "NOT_REQUIRED";
  rollbackRecords: MigrationHistoryRecord[];
  appliedRecords: MigrationHistoryRecord[];
  reasons: string[];
};

/**
 * Preserve every Prisma history row while recognizing only an unambiguous,
 * checksum-identical later APPLIED record whose schema prerequisites are present.
 */
export function classifyMigrationHistoryReconciliation(
  migrationName: string,
  records: readonly MigrationHistoryRecord[],
  schemaPreconditionsMet: boolean,
  repositoryChecksum: string | null,
): MigrationHistoryReconciliation {
  const migrationRecords = records.filter((record) => record.migrationName === migrationName);
  const rollbackRecords = migrationRecords.filter((record) => record.rolledBackAt !== null);
  const appliedRecords = migrationRecords.filter(
    (record) => record.finishedAt !== null && record.rolledBackAt === null,
  );
  const incompleteRecords = migrationRecords.filter(
    (record) => record.finishedAt === null && record.rolledBackAt === null,
  );

  if (rollbackRecords.length === 0 && incompleteRecords.length === 0) {
    return {
      migrationName,
      classification: "NO_FAILURE",
      resolved: true,
      schemaPreconditions: "NOT_REQUIRED",
      rollbackRecords: [],
      appliedRecords,
      reasons: [],
    };
  }

  const reasons: string[] = [];
  if (rollbackRecords.length === 0) reasons.push("INCOMPLETE_RECORD_WITHOUT_ROLLBACK_TIMESTAMP");
  if (rollbackRecords.length !== 1) reasons.push("ROLLBACK_RECORD_COUNT_NOT_ONE");
  if (appliedRecords.length !== 1) reasons.push("APPLIED_RECORD_COUNT_NOT_ONE");
  if (incompleteRecords.length !== 0) reasons.push("INCOMPLETE_RECORD_PRESENT");
  if (!schemaPreconditionsMet) reasons.push("MIGRATION_SCHEMA_PRECONDITIONS_NOT_MET");

  const rollback = rollbackRecords[0];
  const applied = appliedRecords[0];
  if (rollback && applied) {
    if (!rollback.checksum || rollback.checksum !== applied.checksum) {
      reasons.push("ROLLBACK_APPLIED_CHECKSUM_MISMATCH");
    }
    if (
      !repositoryChecksum ||
      rollback.checksum !== repositoryChecksum ||
      applied.checksum !== repositoryChecksum
    ) {
      reasons.push("HISTORY_CHECKSUM_DOES_NOT_MATCH_REPOSITORY");
    }
    if (rollback.appliedStepsCount !== 0) {
      reasons.push("ROLLBACK_RECORD_HAS_APPLIED_STEPS");
    }
    if (
      rollback.rolledBackAt === null ||
      applied.startedAt === null ||
      applied.finishedAt === null ||
      applied.startedAt.getTime() <= rollback.rolledBackAt.getTime() ||
      applied.finishedAt.getTime() <= rollback.rolledBackAt.getTime() ||
      applied.finishedAt.getTime() < applied.startedAt.getTime()
    ) {
      reasons.push("APPLIED_RECORD_NOT_CHRONOLOGICALLY_AFTER_ROLLBACK");
    }
  }

  const resolved = reasons.length === 0;
  return {
    migrationName,
    classification: resolved ? "HISTORICAL_ROLLBACK_RECONCILED" : "BLOCKED",
    resolved,
    schemaPreconditions: schemaPreconditionsMet ? "PASS" : "FAIL",
    rollbackRecords,
    appliedRecords,
    reasons,
  };
}
