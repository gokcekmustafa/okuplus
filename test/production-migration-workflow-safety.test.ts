import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertApprovedMigrationScopeMatchesPending } from "../scripts/verify-production-migration-scope.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-migration.yml", import.meta.url),
  "utf8",
);

const repositoryMigrations = [
  "20261021150000_add_account_deletion_requests",
  "20261022100000_example_followup",
];

describe("production migration workflow safety", () => {
  it("requires the approved pending scope to exactly match the database fingerprint", () => {
    expect(
      assertApprovedMigrationScopeMatchesPending(
        "20261021150000_add_account_deletion_requests",
        ["20261021150000_add_account_deletion_requests"],
        repositoryMigrations,
      ),
    ).toEqual(["20261021150000_add_account_deletion_requests"]);
    expect(assertApprovedMigrationScopeMatchesPending("none", [], repositoryMigrations)).toEqual(
      [],
    );
    expect(
      assertApprovedMigrationScopeMatchesPending(
        "20261022100000_example_followup, 20261021150000_add_account_deletion_requests",
        ["20261021150000_add_account_deletion_requests", "20261022100000_example_followup"],
        repositoryMigrations,
      ),
    ).toEqual(["20261021150000_add_account_deletion_requests", "20261022100000_example_followup"]);
    expect(() =>
      assertApprovedMigrationScopeMatchesPending(
        "20261021150000_add_account_deletion_requests",
        ["20261021150000_add_account_deletion_requests", "20261022100000_example_followup"],
        repositoryMigrations,
      ),
    ).toThrow("does not exactly match");
    expect(() =>
      assertApprovedMigrationScopeMatchesPending(
        "none",
        ["20261022100000_example_followup"],
        repositoryMigrations,
      ),
    ).toThrow("does not exactly match");
  });

  it("rejects duplicate, malformed, and release-unknown migration names", () => {
    expect(() =>
      assertApprovedMigrationScopeMatchesPending(
        "20261021150000_add_account_deletion_requests,20261021150000_add_account_deletion_requests",
        [],
        repositoryMigrations,
      ),
    ).toThrow("duplicate migration names");
    expect(() =>
      assertApprovedMigrationScopeMatchesPending("../migration.sql", [], repositoryMigrations),
    ).toThrow("valid Prisma migration names");
    expect(() =>
      assertApprovedMigrationScopeMatchesPending(
        "20261023100000_unreviewed",
        [],
        repositoryMigrations,
      ),
    ).toThrow("absent from this master release");
  });

  it("scans the account-deletion migration and every explicitly approved candidate", () => {
    expect(workflow).toContain(
      "prisma/migrations/20261021150000_add_account_deletion_requests/migration.sql",
    );
    expect(workflow).toContain('migration_files+=("prisma/migrations/${migration}/migration.sql")');
    expect(workflow).toContain("scripts/verify-production-migration-scope.ts --validate-only");
    expect(workflow).toContain(
      "printf '%s' \"${report}\" | npx tsx scripts/verify-production-migration-scope.ts",
    );
  });

  it("checks exact pending scope before deploy and reports PASS only after required outcomes succeed", () => {
    const scopeCheck = workflow.indexOf(
      "printf '%s' \"${report}\" | npx tsx scripts/verify-production-migration-scope.ts",
    );
    const migrationDeploy = workflow.indexOf(
      "npx prisma migrate deploy --schema=prisma/schema.prisma",
    );
    expect(scopeCheck).toBeGreaterThan(-1);
    expect(migrationDeploy).toBeGreaterThan(scopeCheck);
    expect(workflow).toContain('if [ "${outcome}" != "success" ]; then result="FAIL"; fi');
    expect(workflow).toContain('echo "PRODUCTION_MIGRATION=${result}"');
    expect(workflow).toContain('if [ "${result}" != "PASS" ]; then exit 1; fi');
    expect(workflow).not.toContain('echo "PRODUCTION_MIGRATION=PASS"');
  });
});
