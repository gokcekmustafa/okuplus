import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-migration.yml", import.meta.url),
  "utf8",
);

describe("staging migration workflow contract", () => {
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
    expect(workflow).toContain("schemaDrift: false");
  });
});
