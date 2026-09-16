import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyMigrationFailures,
  classifyPendingMigrations,
} from "../scripts/staging-migration-precondition.js";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-migration.yml", import.meta.url),
  "utf8",
);

describe("staging migration workflow contract", () => {
  const targetMigration = "20260907160000_add_training_session_completed_point_event";
  const foundationMigration = "20260914100000_add_learning_experience_foundation";

  it("ignores a rolled-back sibling when an active applied sibling exists", () => {
    const result = classifyMigrationFailures(
      [{ name: targetMigration, rolledBack: true }],
      [foundationMigration],
      new Set([targetMigration, foundationMigration]),
    );

    expect(result.historicalRolledBackMigrations).toEqual([
      { name: targetMigration, rolledBack: true },
    ]);
    expect(result.unresolvedFailedMigrations).toEqual([]);
  });

  it("fails closed for an incomplete migration", () => {
    const result = classifyMigrationFailures(
      [{ name: targetMigration, rolledBack: false }],
      [targetMigration],
      new Set([targetMigration]),
    );

    expect(result.unresolvedFailedMigrations).toEqual([
      { name: targetMigration, rolledBack: false },
    ]);
  });

  it("allows only the expected pending migration", () => {
    const result = classifyPendingMigrations([foundationMigration], new Set([foundationMigration]));

    expect(result.allowedPendingMigrations).toEqual([foundationMigration]);
    expect(result.unexpectedPendingMigrations).toEqual([]);
  });

  it("rejects unexpected pending migrations", () => {
    const result = classifyPendingMigrations(
      ["20260915120000_unexpected"],
      new Set([foundationMigration]),
    );

    expect(result.allowedPendingMigrations).toEqual([]);
    expect(result.unexpectedPendingMigrations).toEqual(["20260915120000_unexpected"]);
  });

  it("is manual-only, staging-bound, and checks the approved target", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("ref: ${{ inputs.ref }}");
    expect(workflow).toContain("TARGET_REF: ${{ inputs.ref }}");
    expect(workflow).toContain('test "$TARGET_REF" = "staging"');
    expect(workflow).toContain("DATABASE_URL: ${{ secrets.DATABASE_URL }}");
    expect(workflow).toContain("DB_FINGERPRINT_DATABASE_URL: ${{ secrets.DATABASE_URL }}");
    expect(workflow).toContain(
      "DB_FINGERPRINT_ENVIRONMENT: ${{ vars.DB_FINGERPRINT_ENVIRONMENT }}",
    );
    expect(workflow).toContain(
      "DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT: ${{ vars.DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT }}",
    );
    expect(workflow).toContain("18b7c0ef4791f6596fe2e61879df641fb14e5a7f88e3d06c88f634c17af13b38");
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
  });

  it("uses only the official migration commands and sanitized summary", () => {
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npx prisma generate");
    expect(workflow).toContain("npx tsx scripts/db-fingerprint.ts");
    expect(workflow).toContain("targetFingerprint");
    expect(workflow).toContain("assertLiveCatalogTargetIdentity");
    expect(workflow).toContain("npx prisma migrate deploy");
    expect(workflow).toContain("npx prisma migrate status --schema=prisma/schema.prisma");
    expect(workflow).toContain("npx prisma migrate diff");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).not.toContain("migrate reset");
    expect(workflow).not.toContain("db push");
    expect(workflow).not.toContain("migrate resolve");
    expect(workflow).not.toContain("set -x");
    expect(workflow).not.toMatch(/echo\s+.*(?:DATABASE_URL|PASSWORD|TOKEN)/iu);
    expect(workflow).toContain("20260914100000_add_learning_experience_foundation");
    expect(workflow).toContain("classifyMigrationFailures");
    expect(workflow).toContain("classifyPendingMigrations");
    expect(workflow).toContain("noFailedMigrations: unresolvedFailedMigrations !== null");
    expect(workflow).toContain("historicalRolledBackMigrations");
    expect(workflow).toContain("unresolvedFailedMigrations");
    expect(workflow).toContain("schemaDrift: false");
  });
});
