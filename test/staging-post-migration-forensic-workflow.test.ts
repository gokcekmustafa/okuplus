import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-post-migration-forensic.yml", import.meta.url),
  "utf8",
);

describe("staging post-migration forensic workflow", () => {
  it("is manual-only and targets the protected staging environment", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("ref: ${{ inputs.ref }}");
    expect(workflow).toContain('test "$TARGET_REF" = "staging"');
  });

  it("binds staging credentials and preserves the fingerprint guard", () => {
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
    expect(workflow).toContain("npx tsx scripts/db-fingerprint.ts");
    expect(workflow).toContain("fingerprintConfirmed");
    expect(workflow).toContain("databaseIdentityMatch");
  });

  it("collects read-only history and the full diff without mutation commands", () => {
    expect(workflow).toContain("npx prisma migrate status --schema=prisma/schema.prisma");
    expect(workflow).toContain('FROM public."_prisma_migrations"');
    expect(workflow).toContain("20260914100000_add_learning_experience_foundation");
    expect(workflow).toContain("20260907160000_add_training_session_completed_point_event");
    expect(workflow).toContain("ORDER BY started_at ASC, id ASC");
    expect(workflow).toContain("npx prisma migrate diff");
    expect(workflow).not.toContain("--exit-code");
    expect(workflow).not.toMatch(
      /prisma migrate deploy|prisma migrate resolve|prisma db push|migrate reset/iu,
    );
    expect(workflow).toContain("staging-post-migration-forensic-summary.json");
    expect(workflow).toContain("actions/upload-artifact@v4");
  });

  it("does not publish raw credentials or database connection details", () => {
    expect(workflow).not.toMatch(/echo\s+.*(?:DATABASE_URL|PASSWORD|TOKEN)/iu);
    expect(workflow).not.toContain("set -x");
    expect(workflow).toContain("[REDACTED_SENSITIVE_LINE]");
    expect(workflow).toContain("[REDACTED_LITERAL]");
    expect(workflow).toContain('logs: row.logs_present ? "PRESENT" : "NONE"');
    expect(workflow).not.toContain("console.log(statusText)");
    expect(workflow).not.toContain("console.log(diffText)");
  });
});
