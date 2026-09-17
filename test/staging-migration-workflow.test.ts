import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyMigrationFailures,
  classifyPendingMigrations,
  evaluateMigrationGate,
  evaluateMigrationHealth,
  isMigrationRecord,
  type MigrationRecord,
} from "../scripts/staging-migration-precondition.js";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-migration.yml", import.meta.url),
  "utf8",
);

describe("staging migration workflow contract", () => {
  const targetMigration = "20260907160000_add_training_session_completed_point_event";
  const foundationMigration = "20260914100000_add_learning_experience_foundation";
  const reconciliationMigration = "20260917120000_reconcile_release_0_6_schema";

  it("ignores a rolled-back sibling when an active applied sibling exists", () => {
    const activeAppliedMigrationNames = new Set([targetMigration, foundationMigration]);
    const result = classifyMigrationFailures(
      [{ name: targetMigration, rolledBack: true }],
      [foundationMigration],
      new Set([targetMigration, foundationMigration]),
      activeAppliedMigrationNames,
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

  it("allows the Release 0.6 reconciliation migration", () => {
    const result = classifyPendingMigrations(
      [reconciliationMigration],
      new Set([foundationMigration, reconciliationMigration]),
    );

    expect(result.allowedPendingMigrations).toEqual([reconciliationMigration]);
    expect(result.unexpectedPendingMigrations).toEqual([]);
  });

  it("allows foundation and reconciliation migrations together", () => {
    const result = classifyPendingMigrations(
      [foundationMigration, reconciliationMigration],
      new Set([foundationMigration, reconciliationMigration]),
    );

    expect(result.allowedPendingMigrations).toEqual([foundationMigration, reconciliationMigration]);
    expect(result.unexpectedPendingMigrations).toEqual([]);
  });

  it("does not allow the approved historical migration as pending", () => {
    const historical = "20260907170000_add_gp_achievement_metadata";
    const result = classifyPendingMigrations(
      [historical],
      new Set([foundationMigration, reconciliationMigration]),
    );

    expect(result.allowedPendingMigrations).toEqual([]);
    expect(result.unexpectedPendingMigrations).toEqual([historical]);
  });

  it("rejects unexpected pending migrations", () => {
    const result = classifyPendingMigrations(
      ["20260915120000_unexpected"],
      new Set([foundationMigration, reconciliationMigration]),
    );

    expect(result.allowedPendingMigrations).toEqual([]);
    expect(result.unexpectedPendingMigrations).toEqual(["20260915120000_unexpected"]);
  });

  const migrationRow = (
    migrationName: string,
    overrides: Partial<MigrationRecord> = {},
  ): MigrationRecord => ({
    id: `${migrationName}-id`,
    migrationName,
    checksum: `${migrationName}-checksum`,
    startedAt: "2026-09-17T10:00:00.000Z",
    finishedAt: "2026-09-17T10:00:01.000Z",
    rolledBackAt: null,
    appliedStepsCount: 1,
    logs: "NONE",
    ...overrides,
  });

  const postMigrationGate = (
    health: ReturnType<typeof evaluateMigrationHealth>,
    schemaDiffClean = true,
  ) =>
    evaluateMigrationGate({
      health,
      pendingMigrations: health.missingFromDb,
      allowedPendingMigrations: [],
      requireNoPending: true,
      fingerprintPass: true,
      identityPass: true,
      prismaStatusCurrent: true,
      schemaDiffClean,
    });

  it("passes for the normal 20 migration active set", () => {
    const repositoryNames = Array.from({ length: 20 }, (_, index) => `migration-${index + 1}`);
    const health = evaluateMigrationHealth(
      repositoryNames.map((name) => migrationRow(name)),
      repositoryNames,
    );

    expect(postMigrationGate(health).pass).toBe(true);
    expect(health.missingFromDb).toEqual([]);
    expect(health.extraActiveInDb).toEqual([]);
  });

  it("passes for a historical rolled-back row with an active applied sibling", () => {
    const health = evaluateMigrationHealth(
      [
        migrationRow(targetMigration, {
          id: "rolled-back",
          finishedAt: null,
          rolledBackAt: "2026-09-17T10:00:02.000Z",
          appliedStepsCount: 0,
          logs: "PRESENT",
        }),
        migrationRow(targetMigration, { id: "active-applied", appliedStepsCount: 0 }),
      ],
      [targetMigration],
    );

    expect(postMigrationGate(health).pass).toBe(true);
    expect(health.historicalRolledBackMigrationNames).toEqual([targetMigration]);
    expect(health.unresolvedFailedMigrationNames).toEqual([]);
    expect(health.duplicateActiveNames).toEqual([]);
  });

  it("fails for a rolled-back row without an active sibling", () => {
    const health = evaluateMigrationHealth(
      [
        migrationRow(targetMigration, {
          finishedAt: null,
          rolledBackAt: "2026-09-17T10:00:02.000Z",
        }),
      ],
      [targetMigration],
    );

    expect(postMigrationGate(health).pass).toBe(false);
    expect(health.unresolvedFailedMigrationNames).toEqual([targetMigration]);
  });

  it("fails for an unresolved incomplete migration", () => {
    const health = evaluateMigrationHealth(
      [migrationRow(targetMigration, { finishedAt: null })],
      [targetMigration],
    );

    expect(postMigrationGate(health).pass).toBe(false);
    expect(health.incompleteMigrationNames).toEqual([targetMigration]);
  });

  it("allows an expected pending migration during precondition", () => {
    const health = evaluateMigrationHealth([], [foundationMigration]);
    const result = evaluateMigrationGate({
      health,
      pendingMigrations: health.missingFromDb,
      allowedPendingMigrations: [foundationMigration],
      requireNoPending: false,
      fingerprintPass: true,
      identityPass: true,
      prismaStatusCurrent: true,
      schemaDiffClean: true,
    });

    expect(result.pass).toBe(true);
  });

  it("rejects an unexpected pending migration", () => {
    const unexpected = "20260915120000_unexpected";
    const health = evaluateMigrationHealth([], [unexpected]);
    const result = evaluateMigrationGate({
      health,
      pendingMigrations: health.missingFromDb,
      allowedPendingMigrations: [foundationMigration],
      requireNoPending: false,
      fingerprintPass: true,
      identityPass: true,
      prismaStatusCurrent: true,
      schemaDiffClean: true,
    });

    expect(result.pass).toBe(false);
    expect(result.unexpectedPendingMigrations).toEqual([unexpected]);
  });

  it("rejects a missing migration after deploy", () => {
    const health = evaluateMigrationHealth([], [foundationMigration]);

    expect(postMigrationGate(health).pass).toBe(false);
    expect(postMigrationGate(health).failedChecks).toContain("noPendingMigrations");
  });

  it("rejects an unexpected active migration", () => {
    const health = evaluateMigrationHealth(
      [migrationRow("20260907170000_add_gp_achievement_metadata")],
      [],
    );

    expect(postMigrationGate(health).pass).toBe(false);
    expect(health.extraActiveInDb).toEqual(["20260907170000_add_gp_achievement_metadata"]);
  });

  it("accepts an explicitly approved historical active migration", () => {
    const historical = "20260907170000_add_gp_achievement_metadata";
    const health = evaluateMigrationHealth(
      [migrationRow(targetMigration), migrationRow(historical)],
      [targetMigration],
      [{ name: historical, checksum: `${historical}-checksum` }],
    );

    expect(postMigrationGate(health).pass).toBe(true);
    expect(health.extraActiveInDb).toEqual([historical]);
    expect(health.approvedHistoricalActiveMigrationNames).toEqual([historical]);
    expect(health.unexpectedActiveMigrationNames).toEqual([]);
  });

  it("rejects an approved historical migration with a different checksum", () => {
    const historical = "20260907170000_add_gp_achievement_metadata";
    const health = evaluateMigrationHealth(
      [migrationRow(historical, { checksum: "different-checksum" })],
      [],
      [{ name: historical, checksum: `${historical}-checksum` }],
    );

    expect(health.approvedHistoricalActiveMigrationNames).toEqual([]);
    expect(health.unexpectedActiveMigrationNames).toEqual([historical]);
  });

  it("fails for an approved historical migration that is rolled back without an active sibling", () => {
    const historical = "20260907170000_add_gp_achievement_metadata";
    const health = evaluateMigrationHealth(
      [
        migrationRow(historical, {
          finishedAt: null,
          rolledBackAt: "2026-09-17T10:00:02.000Z",
          appliedStepsCount: 0,
        }),
      ],
      [],
      [{ name: historical, checksum: `${historical}-checksum` }],
    );

    expect(health.approvedHistoricalActiveMigrationNames).toEqual([]);
    expect(health.unresolvedFailedMigrationNames).toEqual([historical]);
  });

  it("fails for duplicate active approved historical rows", () => {
    const historical = "20260907170000_add_gp_achievement_metadata";
    const health = evaluateMigrationHealth(
      [migrationRow(historical, { id: "active-1" }), migrationRow(historical, { id: "active-2" })],
      [],
      [{ name: historical, checksum: `${historical}-checksum` }],
    );

    expect(health.approvedHistoricalActiveMigrationNames).toEqual([historical]);
    expect(health.duplicateActiveNames).toEqual([historical]);
  });

  it("rejects duplicate active migration names", () => {
    const health = evaluateMigrationHealth(
      [
        migrationRow(targetMigration, { id: "active-1" }),
        migrationRow(targetMigration, { id: "active-2" }),
      ],
      [targetMigration],
    );

    expect(postMigrationGate(health).pass).toBe(false);
    expect(health.duplicateActiveNames).toEqual([targetMigration]);
  });

  it("rejects a non-zero schema diff", () => {
    const health = evaluateMigrationHealth([migrationRow(targetMigration)], [targetMigration]);

    expect(postMigrationGate(health, false).pass).toBe(false);
    expect(postMigrationGate(health, false).failedChecks).toContain("schemaDiffClean");
  });

  it("fails closed for malformed migration output rows", () => {
    expect(isMigrationRecord(migrationRow(targetMigration))).toBe(true);
    expect(isMigrationRecord({ ...migrationRow(targetMigration), logs: "raw secret" })).toBe(false);
    expect(isMigrationRecord({ ...migrationRow(targetMigration), appliedStepsCount: "1" })).toBe(
      false,
    );
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
    expect(workflow).toContain("20260907170000_add_gp_achievement_metadata");
    expect(workflow).toContain("541bcf696c4b08d337c80f0bbfc2462ad749d92336225398653aca8eb32fce3b");
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
    expect(workflow).toContain("20260917120000_reconcile_release_0_6_schema");
    expect(workflow).toContain("classifyPendingMigrations");
    expect(workflow).toContain("evaluateMigrationHealth");
    expect(workflow).toContain("evaluateMigrationGate");
    expect(workflow).toContain("isMigrationRecord");
    expect(workflow).not.toContain("migrationCountsMatch");
    expect(workflow).toContain("historicalRolledBackMigrations");
    expect(workflow).toContain("unresolvedFailedMigrations");
    expect(workflow).toContain("schemaDrift: false");
  });
});
