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
};

describe("staging migration recovery audit", () => {
  it("marks an existing enum label with incomplete history as safe to resolve", () => {
    const report = buildRecoveryAudit({
      ...baseInput,
      migration: {
        migration_name: "20260907160000_add_training_session_completed_point_event",
        applied_steps_count: 0,
        started_at: new Date("2026-09-15T10:00:00.000Z"),
        finished_at: null,
        rolled_back_at: null,
        logs_present: true,
      },
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
      migration: null,
    });
    const alreadyApplied = buildRecoveryAudit({
      ...baseInput,
      migration: {
        migration_name: "20260907160000_add_training_session_completed_point_event",
        applied_steps_count: 1,
        started_at: new Date("2026-09-15T10:00:00.000Z"),
        finished_at: new Date("2026-09-15T10:01:00.000Z"),
        rolled_back_at: null,
        logs_present: false,
      },
    });

    expect(missingLabel.safeToResolveApplied).toBe(false);
    expect(missingLabel.schemaEffectCheck).toBe("FAIL");
    expect(alreadyApplied.safeToResolveApplied).toBe(false);
    expect(alreadyApplied.recoveryClass).toBe("ALREADY_APPLIED");
  });

  it("keeps the workflow staging-only and read-only", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("WORKFLOW_REF: ${{ github.ref }}");
    expect(workflow).toContain('test "$WORKFLOW_REF" = "refs/heads/master"');
    expect(workflow).toContain("ref: master");
    expect(workflow).toContain("scripts/db-fingerprint.ts");
    expect(workflow).toContain("scripts/staging-migration-recovery-audit.ts");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("prisma migrate resolve");
    expect(auditScript).toMatch(/\$queryRaw[\s\S]*SELECT/iu);
    expect(auditScript).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/iu);
    expect(auditScript).not.toContain("process.env.DATABASE_URL");
    expect(auditScript).toContain('productionTouched: "NO"');
  });
});
