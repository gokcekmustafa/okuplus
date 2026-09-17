import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildMigrationSetReport,
  type MigrationRow,
} from "../scripts/staging-active-migration-set-forensic.js";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-active-migration-set-forensic.yml", import.meta.url),
  "utf8",
);

const row = (name: string, overrides: Partial<MigrationRow> = {}): MigrationRow => ({
  id: `${name}-id`,
  migrationName: name,
  checksum: `${name}-checksum`,
  startedAt: "2026-09-17T00:00:00.000Z",
  finishedAt: "2026-09-17T00:01:00.000Z",
  rolledBackAt: null,
  appliedStepsCount: 1,
  logs: "NONE",
  ...overrides,
});

describe("staging active migration set forensic workflow", () => {
  it("is manual-only, staging-only, and read-only", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain('test "$TARGET_REF" = "staging"');
    expect(workflow).toContain("ref: ${{ inputs.ref }}");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).not.toMatch(
      /prisma migrate deploy|prisma migrate resolve|prisma db push|migrate reset|migrate dev/iu,
    );
  });

  it("binds staging credentials and preserves identity/fingerprint guards", () => {
    expect(workflow).toContain("DATABASE_URL: ${{ secrets.DATABASE_URL }}");
    expect(workflow).toContain("DB_FINGERPRINT_DATABASE_URL: ${{ secrets.DATABASE_URL }}");
    expect(workflow).toContain(
      "DB_FINGERPRINT_ENVIRONMENT: ${{ vars.DB_FINGERPRINT_ENVIRONMENT }}",
    );
    expect(workflow).toContain(
      "DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT: ${{ vars.DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT }}",
    );
    expect(workflow).toContain("npx tsx scripts/db-fingerprint.ts");
    expect(workflow).toContain("staging-active-migration-set-forensic.ts");
    expect(workflow).toContain("fingerprintStatus");
    expect(workflow).toContain("databaseIdentityStatus");
  });

  it("publishes only sanitized set and migration metadata", () => {
    expect(workflow).toContain("staging-active-migration-set.json");
    expect(workflow).toContain("EXACT_ACTIVE_APPLIED_MIGRATIONS");
    expect(workflow).toContain("EXACT_EXTRA_ACTIVE_IN_DB");
    expect(workflow).toContain("EXACT_MISSING_FROM_DB");
    expect(workflow).toContain("EXACT_DUPLICATE_ACTIVE_NAMES");
    expect(workflow).toContain("EXACT_UNRESOLVED_FAILED_NAMES");
    expect(workflow).not.toContain("console.log(statusText)");
    expect(workflow).not.toContain("console.log(diffText)");
    expect(workflow).not.toMatch(/echo\s+.*(?:DATABASE_URL|PASSWORD|TOKEN)/iu);
    expect(workflow).not.toContain("set -x");
  });
});

describe("active migration set classification", () => {
  it("handles a normal repository/DB active set", () => {
    const report = buildMigrationSetReport([row("a"), row("b")], ["a", "b"]);
    expect(report.activeAppliedNames).toEqual(["a", "b"]);
    expect(report.extraActiveInDb).toEqual([]);
    expect(report.missingFromDb).toEqual([]);
    expect(report.duplicateActiveNames).toEqual([]);
  });

  it("keeps a rolled-back sibling out of the active set", () => {
    const report = buildMigrationSetReport(
      [
        row("target", { finishedAt: null, rolledBackAt: "2026-09-17T00:02:00.000Z" }),
        row("target"),
      ],
      ["target"],
    );
    expect(report.activeAppliedNames).toEqual(["target"]);
    expect(report.rolledBackNames).toEqual(["target"]);
    expect(report.unresolvedFailedNames).toEqual([]);
  });

  it("reports extra, duplicate, unresolved, and missing states separately", () => {
    const report = buildMigrationSetReport(
      [row("known"), row("known"), row("extra"), row("failed", { finishedAt: null })],
      ["known", "missing"],
    );
    expect(report.extraActiveInDb).toEqual(["extra"]);
    expect(report.duplicateActiveNames).toEqual(["known"]);
    expect(report.unresolvedFailedNames).toEqual(["failed"]);
    expect(report.missingFromDb).toEqual(["missing"]);
    expect(report.extraActiveDetails[0]).toMatchObject({
      migration_name: "extra",
      repository_exists: "NO",
    });
  });
});
