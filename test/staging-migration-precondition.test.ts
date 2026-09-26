import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-migration.yml", import.meta.url),
  "utf8",
);

describe("staging migration precondition diagnostics", () => {
  it("reports named checks without weakening the fail-closed gate", () => {
    expect(workflow).toContain("const failedChecks = Object.entries(checks)");
    expect(workflow).toContain("staging-migration-precondition.json");
    expect(workflow).toContain("staging-migration-postcondition.json");
    expect(workflow).toContain("throw new Error(");
    expect(workflow).toContain("staging precondition failed:");
    expect(workflow).not.toContain("continue-on-error");
  });

  it("reports pending migration categories without weakening the allowlist", () => {
    expect(workflow).toContain("pendingMigrations,");
    expect(workflow).toContain("allowedPendingMigrations,");
    expect(workflow).toContain("unexpectedPendingMigrations,");
    expect(workflow).toContain("const allowedPendingMigrationPolicy = [");
    expect(workflow).toContain(
      'const learningPathDomain = "20260925100000_add_learning_path_domain"',
    );
    expect(workflow).toContain(
      'const commonLearningArea = "20260925110000_add_common_learning_area"',
    );
    expect(workflow).toContain("20260907160000_add_training_session_completed_point_event");
    expect(workflow).toContain("pendingMigrations.length <= allowedPendingMigrationPolicy.length");
    expect(workflow).toContain("!allowedPendingMigrationPolicy.includes(name)");
    expect(workflow).toContain("unexpectedPendingMigrations.length === 0");
    expect(workflow).toContain("pendingMigrationsShape: pendingMigrations !== null");
    expect(workflow).toContain("pendingMigrations=${formatMigrationList(");
    expect(workflow).toContain("unexpectedPendingMigrations=${formatMigrationList(");
    expect(workflow).toContain('test "$TARGET_REF" = "master"');
    expect(workflow).toContain('test "$SEED_CONFIRMATION" = "I_HAVE_REVIEWED_EDUCATION_V2_P0"');
  });

  it("ignores only rolled-back history and still blocks unresolved failures", () => {
    expect(workflow).toContain("const failedMigrations =");
    expect(workflow).toContain('typeof entry.rolledBack === "boolean"');
    expect(workflow).toContain(
      "const unresolvedFailedMigrations =\n            failedMigrations?.filter((entry) => !entry.rolledBack) ?? null;",
    );

    const noFailedMigrationChecks = workflow.match(
      /noFailedMigrations:\s*\n?\s*unresolvedFailedMigrations !== null && unresolvedFailedMigrations\.length === 0/g,
    );
    expect(noFailedMigrationChecks).toHaveLength(2);
    expect(workflow).toContain("const migrationStatusCurrent =");
    expect(workflow).toContain(
      'report.status === "REVIEW_REQUIRED" &&\n              pendingMigrations !== null',
    );
    expect(workflow).toContain("rolledBackMigrationNames");
    expect(workflow).toContain("unresolvedFailedMigrationNames");
    expect(workflow).not.toContain(
      "noFailedMigrations: Array.isArray(failed) && failed.length === 0",
    );
  });

  it("keeps staging credentials explicitly bound in the same job", () => {
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("DATABASE_URL: ${{ secrets.DATABASE_URL }}");
    expect(workflow).toContain(
      "DB_FINGERPRINT_DATABASE_URL: ${{ secrets.DB_FINGERPRINT_DATABASE_URL }}",
    );
    expect(workflow).toContain(
      "DB_FINGERPRINT_ENVIRONMENT: ${{ vars.DB_FINGERPRINT_ENVIRONMENT }}",
    );
    expect(workflow).toContain(
      "DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT: ${{ vars.DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT }}",
    );
  });
});
