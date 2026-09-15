import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-migration-recovery-resolve.yml", import.meta.url),
  "utf8",
);

const targetMigration = "20260907160000_add_training_session_completed_point_event";

describe("staging migration recovery resolve workflow", () => {
  it("is manual-only and bound to the protected staging environment", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("WORKFLOW_REF: ${{ github.ref }}");
    expect(workflow).toContain('test "$WORKFLOW_REF" = "refs/heads/master"');
  });

  it("requires the explicit APPLY confirmation and exact staging bindings", () => {
    expect(workflow).toContain("RESOLVE_CONFIRM: ${{ inputs.resolve_confirm }}");
    expect(workflow).toContain('test "$RESOLVE_CONFIRM" = "APPLY"');
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

  it("resolves only the fixed target and keeps deploy out of this recovery job", () => {
    expect(workflow).toContain(`TARGET_MIGRATION: ${targetMigration}`);
    expect(workflow).toContain(`prisma migrate resolve --applied ${targetMigration}`);
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("prisma migrate resolve --rolled-back");
    expect(workflow).not.toContain("production-migration");
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).not.toContain("set -x");
  });

  it("enforces the enum/history precheck and emits only sanitized metadata", () => {
    expect(workflow).toContain("PointEventType");
    expect(workflow).toContain("TRAINING_SESSION_COMPLETED");
    expect(workflow).toContain('public."_prisma_migrations"');
    expect(workflow).toContain("databaseUrlMatchesFingerprintTarget");
    expect(workflow).toContain("safeToResolveApplied: true");
    expect((workflow.match(/async function main\(\)/gu) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(workflow).toContain("staging-resolve-precheck.json");
    expect(workflow).toContain("staging-resolve-postcheck.json");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("migrationStatusAcceptable");
    expect(workflow).toContain("TSX_EVAL_TOP_LEVEL_AWAIT_UNSUPPORTED");
    expect(workflow).not.toMatch(/echo\s+.*(?:DATABASE_URL|PASSWORD|TOKEN|COOKIE)/iu);
    expect(workflow).not.toContain("raw");
  });

  it("uses read-only SQL probes and never invokes another migration action", () => {
    expect(workflow).toMatch(/SELECT current_database\(\)/u);
    expect(workflow).toMatch(/SELECT t\.typname/u);
    expect(workflow).toMatch(/SELECT migration_name/u);
    expect(workflow).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/iu);
    expect(workflow).not.toContain("prisma migrate dev");
    expect(workflow).not.toContain("prisma db push");
    expect(workflow).not.toContain("prisma migrate reset");
  });
});
