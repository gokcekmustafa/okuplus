import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-migration-forensics.yml", import.meta.url),
  "utf8",
);
const migrationWorkflow = readFileSync(
  new URL("../.github/workflows/production-migration.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/production-migration-forensics.ts", import.meta.url),
  "utf8",
);
const p0Seed = readFileSync(new URL("../scripts/seed-education-v2-p0.ts", import.meta.url), "utf8");
const p0LessonSeed = readFileSync(
  new URL("../scripts/seed-education-v2-p0-lessons.ts", import.meta.url),
  "utf8",
);
const p0Provisioner = readFileSync(
  new URL("../scripts/provision-education-v2-p0-learning-path.ts", import.meta.url),
  "utf8",
);

describe("protected production migration forensics", () => {
  it("is workflow_dispatch-only and approved-ref/protected-environment gated", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("source_ref:");
    expect(workflow).toContain("master");
    expect(workflow).toContain("codex/education-v2-p0-release-candidate");
    expect(workflow).toContain('case "${SOURCE_REF}" in');
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/${SOURCE_REF}"');
    expect(workflow).toContain("ref: ${{ inputs.source_ref }}");
    expect(workflow).toContain('test "${CONFIRM_FORENSICS}" = "FORENSICS"');
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("pull_request:");
  });

  it("uses only the production secret through process environment", () => {
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).toContain("FORENSICS_OUTPUT_FILE");
    expect(workflow).toContain("set +e");
    expect(workflow).toContain("FORENSICS_EXIT_CODE=$?");
    expect(workflow).toContain("SUMMARY_EXIT_CODE=$?");
    expect(workflow).toContain("see the sanitized summary");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("production-migration-forensics-summary.json");
    expect(workflow).toContain('"migrationHistory"');
    expect(workflow).toContain('"migrationFileHistory"');
    expect(workflow).toContain("initMigrationChecksumAudit");
    expect(workflow).toContain("PRODUCTION_CHECKSUM");
    expect(workflow).toContain("REPOSITORY_CHECKSUM");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_PROVIDER");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_HOST");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_PORT");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_DATABASE");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_USER");
    expect(workflow).toContain("targetIdentityDiagnostics");
    expect(workflow).toContain("TARGET_IDENTITY_FIELDS");
    expect(workflow).toContain(
      "production target identity mismatch; see field-level diagnostic summary",
    );
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("HISTORICAL_CHECKSUM_ACKNOWLEDGEMENTS");
    expect(workflow).toContain("UNRESOLVED_CHECKSUM_MISMATCHES");
    expect(workflow).toContain("BACKFILL_TARGET_COUNT");
    expect(workflow).toContain("dataPreflight: report.releaseMigration1.dataPreflight");
    expect(workflow).toContain("missing migration 1 data preflight output");
    expect(migrationWorkflow).toContain("backfill_preflight_safe");
    expect(workflow).toContain("SCHEMA_COMPATIBILITY");
    expect(workflow).not.toContain("echo ${PRODUCTION_DATABASE_URL}");
    expect(workflow).not.toContain('cat "${FORENSICS_OUTPUT_FILE}"');
    expect(workflow).not.toContain("migrate deploy");
    expect(workflow).not.toContain("migrate resolve");
    expect(workflow).not.toContain("db push");
    expect(workflow).not.toContain("migrate reset");
  });

  it("binds and validates the protected historical acknowledgement without printing it", () => {
    expect(workflow).toContain("name: Verify historical acknowledgement binding");
    expect(workflow).toContain(
      "PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS: ${{ vars.PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS }}",
    );
    expect(workflow).toContain("process.env.PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS");
    expect(workflow).toContain('const migrationName = "20260817000000_init"');
    expect(workflow).toContain('echo "HISTORICAL_ACK_BINDING=PASS"');
    expect(workflow).not.toContain(
      'echo "${PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS}"',
    );
    expect(workflow).not.toContain("JSON.stringify(parsed)");
  });

  it("contains only read-only query access and safe output fields", () => {
    expect(script).toContain("$queryRaw");
    expect(script).not.toContain("$executeRaw");
    expect(script).not.toContain("$transaction");
    expect(script).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/u);
    expect(script).toContain("applied_steps_count");
    expect(script).toContain("safeErrorSummary");
    expect(script).toContain("repositoryChecksum");
    expect(script).toContain("migrationFileHistory");
    expect(script).toContain("approvedHistoricalChecksums");
    expect(script).toContain("repositoryChecksumVariants");
    expect(script).toContain("historicalChecksumAcknowledgements");
    expect(script).toContain("unresolvedChecksumMismatches");
    expect(script).toContain('"I_HISTORICAL_CHECKSUM_ACKNOWLEDGED"');
    expect(script).toContain('"\\r\\n"');
    expect(script).toContain("current_database()");
    expect(script).toContain("current_user");
    expect(script).toContain("inet_server_addr()");
    expect(script).toContain("inet_server_port()");
    expect(script).toContain('"BLOCKED_TARGET_IDENTITY"');
    expect(script).toContain('"UNVERIFIED"');
    expect(script).toContain("maskIdentityValue");
    expect(script).toContain("targetIdentityDiagnostics");
    expect(script).not.toContain('throw new Error("production target identity mismatch")');
    expect(script).toContain("initSchemaCompatibility");
    expect(script).toContain('productionDbWrite: "NO"');
    expect(workflow).toContain('"migrationHistoryCount"');
    expect(workflow).toContain('"failedMigrations"');
    expect(workflow).toContain('"releaseMigration1"');
    expect(workflow).toContain("currentSchemaSummary:");
    expect(script).not.toContain("console.log(rawUrl)");
    expect(script).not.toContain("console.log(process.env.DB_FINGERPRINT_DATABASE_URL)");
  });

  it("keeps the historical acknowledgement fail-closed and init-only", () => {
    expect(script).toContain("row.migration_name === INIT_MIGRATION");
    expect(script).toContain("approvedChecksum === row.checksum");
    expect(script).toContain("const historicallyApproved =");
    expect(script).not.toContain("approvedChecksum === row.checksum &&");
    expect(script).toContain("lineEndingEquivalent");
    expect(script).toContain("unresolvedChecksumMismatches.length === 0");
    expect(script).toContain("!schemaAhead");
    expect(script).toContain("!historyAhead");
    expect(script).toContain("PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS");
    expect(script).toContain("migration1DataPreflight");
    expect(script).toContain("parentConfigMissing");
    expect(script).toContain("missingParent");
    expect(script).toContain("backfillTargetCount");
  });

  it("consumes the db fingerprint migration arrays using their actual output contract", () => {
    expect(migrationWorkflow).toContain(
      "const failed = Array.isArray(value.migrations?.failed) ? value.migrations.failed : [];",
    );
    expect(migrationWorkflow).toContain(
      "const unresolved = failed.filter((entry) => !entry?.rolledBack);",
    );
    expect(migrationWorkflow).toContain(
      "const pending = Array.isArray(value.migrations?.pending) ? value.migrations.pending : [];",
    );
    expect(migrationWorkflow).not.toContain("value.migrations?.failedCount");
    expect(migrationWorkflow).not.toContain("value.migrations?.pendingCount");
  });

  it("provides the schema validator with the required database URL without executing migration work", () => {
    expect(migrationWorkflow).toContain("name: Validate Prisma schema");
    expect(migrationWorkflow).toContain("DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}");
  });

  it("keeps Education V2 P0 production seeding explicitly selected and protected", () => {
    expect(migrationWorkflow).toContain("seed_p0:");
    expect(migrationWorkflow).toContain("production_backup_confirmation:");
    expect(migrationWorkflow).toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(migrationWorkflow).toContain("education-v2-p0");
    expect(migrationWorkflow).toContain(
      "I_HAVE_REVIEWED_EDUCATION_V2_P0_PRODUCTION_EDITORIAL_RELEASE",
    );
    expect(migrationWorkflow).toContain(
      "prisma/migrations/20260927100000_add_persistent_learning_path/migration.sql",
    );
    expect(migrationWorkflow).toContain(
      "EDUCATION_V2_P0_PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
    );
    expect(migrationWorkflow).toContain(
      "EDUCATION_V2_COMMON_REINFORCEMENT_TEMPLATE_VERSION_ID: ${{ vars.EDUCATION_V2_COMMON_REINFORCEMENT_TEMPLATE_VERSION_ID }}",
    );
    expect(migrationWorkflow).not.toContain(
      "EDUCATION_V2_P0_PRODUCTION_DATABASE_URL: ${{ secrets.DATABASE_URL }}",
    );
  });

  it("keeps P0 production content, lesson and path writes target- and approval-gated", () => {
    for (const source of [p0Seed, p0LessonSeed, p0Provisioner]) {
      expect(source).toContain("PRODUCTION");
      expect(source).toContain("EDUCATION_V2_P0_PRODUCTION_DATABASE_URL");
      expect(source).toContain("EDUCATION_V2_P0_PRODUCTION");
      expect(source).toContain("assertApprovedTargetFingerprint");
    }
    expect(p0Seed).toContain('mode !== "CREATE" && mode !== "NOOP"');
    expect(p0LessonSeed).toContain("PRODUCTION_DATABASE_NAME");
    expect(p0Provisioner).toContain("PRODUCTION_DATABASE_HOST");
  });
});
