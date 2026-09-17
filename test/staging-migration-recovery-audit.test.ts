import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRecoveryAudit } from "../scripts/staging-migration-recovery-audit.js";

const auditScript = readFileSync(
  new URL("../scripts/staging-migration-recovery-audit.ts", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL("../.github/workflows/staging-migration-recovery-audit.yml", import.meta.url),
  "utf8",
);

const baseInput = {
  targetEnvironment: "STAGING",
  targetFingerprint: "a".repeat(64),
  fingerprintConfirmed: true,
  fingerprintDatabase: "staging",
  fingerprintUser: "staging_user",
  database: "staging",
  databaseUser: "staging_user",
  enumValues: ["EXERCISE_COMPLETED", "TRAINING_SESSION_COMPLETED", "CORRECT_ANSWER"],
  fingerprintPendingMigrations: ["20260914100000_add_learning_experience_foundation"],
  fingerprintFailedMigrations: [],
  migrationStatus: { exitCode: 1, state: "PENDING" as const },
};

const targetMigration = "20260907160000_add_training_session_completed_point_event";

function migrationRow(
  overrides: Partial<{
    id: string;
    migration_name: string;
    checksum: string;
    applied_steps_count: number;
    started_at: Date | null;
    finished_at: Date | null;
    rolled_back_at: Date | null;
    logs_present: boolean;
  }> = {},
) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    migration_name: targetMigration,
    checksum: "b".repeat(64),
    applied_steps_count: 0,
    started_at: new Date("2026-09-15T10:00:00.000Z"),
    finished_at: null,
    rolled_back_at: null,
    logs_present: true,
    ...overrides,
  };
}

describe("staging migration recovery audit", () => {
  it("marks an existing enum label with incomplete history as safe to resolve", () => {
    const report = buildRecoveryAudit({
      ...baseInput,
      migrationRows: [migrationRow()],
    });

    expect(report.safeToResolveApplied).toBe(true);
    expect(report.migration.state).toBe("FAILED_OR_INCOMPLETE");
    expect(report.enum.labelPresent).toBe(true);
    expect(report.migration.logsPresent).toBe(true);
    expect(report.writeOperations).toBe("NONE");
    expect(report.productionTouched).toBe("NO");
  });

  it("fails closed when the enum label is absent or history is already applied", () => {
    const missingLabel = buildRecoveryAudit({
      ...baseInput,
      enumValues: ["EXERCISE_COMPLETED", "CORRECT_ANSWER"],
      migrationRows: [],
    });
    const alreadyApplied = buildRecoveryAudit({
      ...baseInput,
      migrationRows: [
        migrationRow({
          applied_steps_count: 1,
          finished_at: new Date("2026-09-15T10:01:00.000Z"),
          logs_present: false,
        }),
      ],
    });

    expect(missingLabel.safeToResolveApplied).toBe(false);
    expect(missingLabel.schemaEffectCheck).toBe("FAIL");
    expect(alreadyApplied.safeToResolveApplied).toBe(false);
    expect(alreadyApplied.recoveryClass).toBe("ALREADY_APPLIED");
  });

  it("identifies a rolled-back sibling and one active applied sibling", () => {
    const report = buildRecoveryAudit({
      ...baseInput,
      migrationRows: [
        migrationRow({
          id: "00000000-0000-4000-8000-000000000001",
          rolled_back_at: new Date("2026-09-16T08:02:10.212Z"),
        }),
        migrationRow({
          id: "00000000-0000-4000-8000-000000000002",
          started_at: new Date("2026-09-16T08:02:10.213Z"),
          finished_at: new Date("2026-09-16T08:02:10.213Z"),
          rolled_back_at: null,
          applied_steps_count: 0,
          logs_present: false,
        }),
      ],
    });

    expect(report.migrationRows).toHaveLength(2);
    expect(report.migrationRows[0]?.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(report.rolledBackMigrations).toHaveLength(1);
    expect(report.activeAppliedMigration?.id).toBe("00000000-0000-4000-8000-000000000002");
    expect(report.activeAppliedMigration?.finishedAt).toBe("2026-09-16T08:02:10.213Z");
    expect(report.activeAppliedMigration?.rolledBackAt).toBeNull();
    expect(report.safeToDeploy).toBe(true);
  });

  it("does not allow deploy when only the rolled-back sibling exists", () => {
    const report = buildRecoveryAudit({
      ...baseInput,
      migrationRows: [migrationRow({ rolled_back_at: new Date("2026-09-16T08:02:10.212Z") })],
    });

    expect(report.activeAppliedMigration).toBeNull();
    expect(report.rolledBackMigrations).toHaveLength(1);
    expect(report.safeToDeploy).toBe(false);
  });

  it("fails closed when migrate status is an error", () => {
    const report = buildRecoveryAudit({
      ...baseInput,
      migrationRows: [
        migrationRow({
          finished_at: new Date("2026-09-16T08:02:10.213Z"),
          rolled_back_at: null,
          logs_present: false,
        }),
      ],
      migrationStatus: { exitCode: 2, state: "ERROR" },
    });

    expect(report.safeToDeploy).toBe(false);
  });

  it("keeps the workflow staging-only and read-only", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("WORKFLOW_REF: ${{ github.ref }}");
    expect(workflow).toContain('test "$WORKFLOW_REF" = "refs/heads/staging"');
    expect(workflow).toContain("ref: staging");
    expect(workflow).toContain("scripts/db-fingerprint.ts");
    expect(workflow).toContain("scripts/staging-migration-recovery-audit.ts");
    expect(workflow).toContain("prisma migrate status");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("activeAppliedMigration");
    expect(workflow).toContain("rolledBackMigrations");
    expect(workflow).toContain("safeToDeploy");
    expect(auditScript).toContain("ORDER BY started_at ASC, id ASC");
    expect(auditScript).toContain("activeAppliedMigration");
    expect(auditScript).toContain("safeToDeploy");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("prisma migrate resolve");
    expect(auditScript).toMatch(/\$queryRaw[\s\S]*SELECT/iu);
    expect(auditScript).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/iu);
    expect(auditScript).not.toContain("process.env.DATABASE_URL");
    expect(auditScript).toContain('productionTouched: "NO"');
  });
});
