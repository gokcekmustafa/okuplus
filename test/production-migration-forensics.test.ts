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

describe("protected production migration forensics", () => {
  it("is workflow_dispatch-only and master/protected-environment gated", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain('test "${CONFIRM_FORENSICS}" = "FORENSICS"');
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("pull_request:");
  });

  it("uses only the production secret through process environment", () => {
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).toContain("FORENSICS_OUTPUT_FILE");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("production-migration-forensics-summary.json");
    expect(workflow).toContain('"migrationHistory"');
    expect(workflow).toContain('"migrationFileHistory"');
    expect(workflow).toContain("initMigrationChecksumAudit");
    expect(workflow).toContain("PRODUCTION_CHECKSUM");
    expect(workflow).toContain("REPOSITORY_CHECKSUM");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS");
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
    expect(migrationWorkflow).toContain('value.migrations?.failed?.length ?? ""');
    expect(migrationWorkflow).toContain('value.migrations?.pending?.length ?? ""');
    expect(migrationWorkflow).not.toContain("value.migrations?.failedCount");
    expect(migrationWorkflow).not.toContain("value.migrations?.pendingCount");
  });
});
