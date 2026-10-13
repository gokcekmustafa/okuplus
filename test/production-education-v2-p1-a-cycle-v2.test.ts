import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-v2.yml", import.meta.url),
  "utf8",
);

describe("protected Cycle 2 production provision workflow", () => {
  it("is master-only, production-environment scoped, and read-only by default", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain(
      "EDUCATION_V2_P1_A_CYCLE_V2_PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
    );
    expect(workflow).toContain("scripts/seed-education-v2-p1-a-cycle-v2.ts --dry-run");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed-education-v2-p0");
    expect(workflow).not.toContain("seed-education-v2-p1-a.ts");
    expect(workflow).not.toContain("seed-education-v2-p1-bcd.ts");
    expect(workflow).toContain("STUDENT_ASSIGNMENTS=NOT_TOUCHED");
    expect(workflow).toContain("MIGRATIONS=NOT_RUN");
  });

  it("requires explicit production approval, fingerprint, and verified backup before apply", () => {
    expect(workflow).toContain("APPLY_EDUCATION_V2_P1_A_CYCLE_V2");
    expect(workflow).toContain(
      "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLE_V2_PRODUCTION_EDITORIAL_RELEASE",
    );
    expect(workflow).toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(workflow).toContain("READ_ONLY_NO_WRITE");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(workflow).toContain("scripts/db-fingerprint.ts");
    expect(workflow).toContain("scripts/production-migration-forensics.ts");
    expect(workflow).toContain("scripts/verify-canonical-placement-migration-policy.ts");
    expect(workflow).toContain("target fingerprint changed");
    expect(workflow).toContain("--apply");
    expect(workflow).toContain("report.dbChanged !== false");
    expect(workflow).toContain('report.state !== "EXISTING"');
  });

  it("verifies the complete graph after apply without exposing secrets", () => {
    expect(workflow).toContain("cycle2-plan-after.json");
    expect(workflow).toContain("CYCLE2_GRAPH_POSTCONDITION=EXISTING");
    expect(workflow).toContain("Upload sanitized Cycle 2 report");
    expect(workflow).not.toContain("echo ${EDUCATION_V2_P1_A_CYCLE_V2_PRODUCTION_DATABASE_URL}");
    expect(workflow).not.toContain("echo ${DB_FINGERPRINT_DATABASE_URL}");
  });

  it("preserves the read-only forensics report when the policy gate blocks the run", () => {
    expect(workflow).toContain("cycle2-production-migration-forensics.json");
    expect(workflow).toContain(
      'cp "${migration_report_file}" cycle2-production-migration-forensics.json',
    );
    expect(workflow).toContain("path: cycle2-*.json");
  });
});
