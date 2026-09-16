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

describe("staging migration precondition diagnostics", () => {
  const targetMigration = "20260907160000_add_training_session_completed_point_event";
  const foundationMigration = "20260914100000_add_learning_experience_foundation";

  it("treats a rolled-back sibling with an active applied sibling as historical", () => {
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

  it("keeps a failed or incomplete migration fail-closed", () => {
    const result = classifyMigrationFailures(
      [{ name: targetMigration, rolledBack: false }],
      [targetMigration],
      new Set([targetMigration]),
    );

    expect(result.historicalRolledBackMigrations).toEqual([]);
    expect(result.unresolvedFailedMigrations).toEqual([
      { name: targetMigration, rolledBack: false },
    ]);
  });

  it("keeps a rolled-back migration pending when no active sibling exists", () => {
    const result = classifyMigrationFailures(
      [{ name: targetMigration, rolledBack: true }],
      [targetMigration],
      new Set([targetMigration]),
    );

    expect(result.historicalRolledBackMigrations).toEqual([]);
    expect(result.unresolvedFailedMigrations).toEqual([
      { name: targetMigration, rolledBack: true },
    ]);
  });

  it("accepts only the expected pending migration", () => {
    const result = classifyPendingMigrations([foundationMigration], new Set([foundationMigration]));

    expect(result.allowedPendingMigrations).toEqual([foundationMigration]);
    expect(result.unexpectedPendingMigrations).toEqual([]);
  });

  it("rejects an unexpected pending migration", () => {
    const result = classifyPendingMigrations(
      ["20260915120000_unexpected"],
      new Set([foundationMigration]),
    );

    expect(result.allowedPendingMigrations).toEqual([]);
    expect(result.unexpectedPendingMigrations).toEqual(["20260915120000_unexpected"]);
  });

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
    expect(workflow).toContain("const allowedPendingMigrationPolicy = [foundation]");
    expect(workflow).toContain("pendingMigrations.length <= allowedPendingMigrationPolicy.length");
    expect(workflow).toContain("classifyPendingMigrations");
    expect(workflow).toContain("unexpectedPendingMigrations");
    expect(workflow).toContain("pendingMigrationsShape: pendingMigrations !== null");
    expect(workflow).toContain("pendingMigrations=${formatMigrationList(");
    expect(workflow).toContain("unexpectedPendingMigrations=${formatMigrationList(");
    expect(workflow).toContain("unresolvedFailedMigrations");
    expect(workflow).toContain("historicalRolledBackMigrations");
    expect(workflow).toContain("noFailedMigrations: unresolvedFailedMigrations !== null");
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
