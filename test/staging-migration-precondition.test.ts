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
    expect(workflow).toContain("allowedPendingMigrationPolicy: [foundation]");
    expect(workflow).toContain("pendingMigrationsShape: pendingMigrations !== null");
    expect(workflow).toContain("pendingMigrations=${formatMigrationList(");
    expect(workflow).toContain("unexpectedPendingMigrations=${formatMigrationList(");
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
