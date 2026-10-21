import { describe, expect, it } from "vitest";
import { classifyMigrationHistoryReconciliation } from "../scripts/production-migration-history-reconciliation.js";

const migrationName = "20260907170000_add_gp_achievement_metadata";
const checksum = "a".repeat(64);
const rollbackAt = new Date("2026-09-24T14:58:55.491Z");

function history(
  overrides: Partial<{
    checksum: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    rolledBackAt: Date | null;
    appliedStepsCount: number;
  }> = {},
) {
  return [
    {
      migrationName,
      checksum,
      startedAt: new Date("2026-09-24T14:18:53.917Z"),
      finishedAt: null,
      rolledBackAt: rollbackAt,
      appliedStepsCount: 0,
    },
    {
      migrationName,
      checksum,
      startedAt: new Date("2026-09-25T09:00:00.000Z"),
      finishedAt: new Date("2026-09-25T09:01:00.000Z"),
      rolledBackAt: null,
      appliedStepsCount: 0,
      ...overrides,
    },
  ];
}

describe("production migration history reconciliation", () => {
  it("recognizes a later same-checksum applied record only with schema preconditions", () => {
    const result = classifyMigrationHistoryReconciliation(migrationName, history(), true, checksum);

    expect(result.classification).toBe("HISTORICAL_ROLLBACK_RECONCILED");
    expect(result.resolved).toBe(true);
    expect(result.rollbackRecords).toHaveLength(1);
    expect(result.appliedRecords).toHaveLength(1);
    expect(result.reasons).toEqual([]);
  });

  it("blocks when no later applied record exists", () => {
    const result = classifyMigrationHistoryReconciliation(
      migrationName,
      history().slice(0, 1),
      true,
      checksum,
    );

    expect(result.classification).toBe("BLOCKED");
    expect(result.reasons).toContain("APPLIED_RECORD_COUNT_NOT_ONE");
  });

  it("blocks when the later applied record has a different checksum", () => {
    const result = classifyMigrationHistoryReconciliation(
      migrationName,
      history({ checksum: "b".repeat(64) }),
      true,
      checksum,
    );

    expect(result.classification).toBe("BLOCKED");
    expect(result.reasons).toContain("ROLLBACK_APPLIED_CHECKSUM_MISMATCH");
  });

  it("blocks when both history records differ from the repository migration checksum", () => {
    const records = history({ checksum: "b".repeat(64) }).map((record) => ({
      ...record,
      checksum: "b".repeat(64),
    }));
    const result = classifyMigrationHistoryReconciliation(migrationName, records, true, checksum);

    expect(result.classification).toBe("BLOCKED");
    expect(result.reasons).toContain("HISTORY_CHECKSUM_DOES_NOT_MATCH_REPOSITORY");
  });

  it("blocks when the applied record is not chronologically after the rollback", () => {
    const result = classifyMigrationHistoryReconciliation(
      migrationName,
      history({
        startedAt: new Date("2026-09-24T14:40:00.000Z"),
        finishedAt: new Date("2026-09-24T14:45:00.000Z"),
      }),
      true,
      checksum,
    );

    expect(result.classification).toBe("BLOCKED");
    expect(result.reasons).toContain("APPLIED_RECORD_NOT_CHRONOLOGICALLY_AFTER_ROLLBACK");
  });

  it("blocks a matching history pair when migration-specific schema prerequisites are missing", () => {
    const result = classifyMigrationHistoryReconciliation(
      migrationName,
      history(),
      false,
      checksum,
    );

    expect(result.classification).toBe("BLOCKED");
    expect(result.schemaPreconditions).toBe("FAIL");
    expect(result.reasons).toContain("MIGRATION_SCHEMA_PRECONDITIONS_NOT_MET");
  });
});
