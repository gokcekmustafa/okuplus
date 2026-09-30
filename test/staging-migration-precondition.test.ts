import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-migration.yml", import.meta.url),
  "utf8",
);
const p0Seed = readFileSync(new URL("../scripts/seed-education-v2-p0.ts", import.meta.url), "utf8");
const lessonSeed = readFileSync(
  new URL("../scripts/seed-education-v2-p0-lessons.ts", import.meta.url),
  "utf8",
);
const provisioner = readFileSync(
  new URL("../scripts/provision-education-v2-p0-learning-path.ts", import.meta.url),
  "utf8",
);

describe("staging migration precondition diagnostics", () => {
  it("reports named checks without weakening the fail-closed gate", () => {
    expect(workflow).toContain("const failedChecks = Object.entries(checks)");
    expect(workflow).toContain("staging-migration-precondition.json");
    expect(workflow).toContain("staging-migration-postcondition.json");
    expect(workflow).toContain("staging-schema-diff-summary.json");
    expect(workflow).toContain("schemaDiffResult=");
    expect(workflow).toContain("schemaDiffLineCount");
    expect(workflow).toContain('["added", "removed", "changed", "other"]');
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("throw new Error(");
    expect(workflow).toContain("staging precondition failed:");
    expect(workflow).not.toContain("continue-on-error");
  });

  it("reports pending migration categories without weakening the allowlist", () => {
    expect(workflow).toContain("pendingMigrations,");
    expect(workflow).toContain("allowedPendingMigrations,");
    expect(workflow).toContain("unexpectedPendingMigrations,");
    expect(workflow).toContain("const allowedPendingMigrationPolicy = [");
    expect(workflow).toContain(
      'const learningPathDomain = "20260925100000_add_learning_path_domain"',
    );
    expect(workflow).toContain(
      'const commonLearningArea = "20260925110000_add_common_learning_area"',
    );
    expect(workflow).toContain("20260907160000_add_training_session_completed_point_event");
    expect(workflow).toContain("pendingMigrations.length <= allowedPendingMigrationPolicy.length");
    expect(workflow).toContain("!allowedPendingMigrationPolicy.includes(name)");
    expect(workflow).toContain("unexpectedPendingMigrations.length === 0");
    expect(workflow).toContain("pendingMigrationsShape: pendingMigrations !== null");
    expect(workflow).toContain("pendingMigrations=${formatMigrationList(");
    expect(workflow).toContain("unexpectedPendingMigrations=${formatMigrationList(");
    expect(workflow).toContain('test "$TARGET_REF" = "master"');
    expect(workflow).toContain('test "$SEED_CONFIRMATION" = "I_HAVE_REVIEWED_EDUCATION_V2_P0"');
  });

  it("defines the persistent path migration in every inline verification scope", () => {
    const declarations = workflow.match(
      /const persistentLearningPath = "20260927100000_add_persistent_learning_path"/g,
    );
    expect(declarations).toHaveLength(2);
    expect(workflow).toContain("expectedMigrationNames.every");
    expect(workflow).toContain("persistentLearningPath]");
  });

  it("ignores only rolled-back history and still blocks unresolved failures", () => {
    expect(workflow).toContain("const failedMigrations =");
    expect(workflow).toContain('typeof entry.rolledBack === "boolean"');
    expect(workflow).toContain(
      "const unresolvedFailedMigrations =\n            failedMigrations?.filter((entry) => !entry.rolledBack) ?? null;",
    );

    const noFailedMigrationChecks = workflow.match(
      /noFailedMigrations:\s*\n?\s*unresolvedFailedMigrations !== null && unresolvedFailedMigrations\.length === 0/g,
    );
    expect(noFailedMigrationChecks).toHaveLength(2);
    expect(workflow).toContain("const migrationStatusCurrent =");
    expect(workflow).toContain(
      'report.status === "REVIEW_REQUIRED" &&\n              pendingMigrations !== null',
    );
    expect(workflow).toContain("rolledBackMigrationNames");
    expect(workflow).toContain("unresolvedFailedMigrationNames");
    expect(workflow).not.toContain(
      "noFailedMigrations: Array.isArray(failed) && failed.length === 0",
    );
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

  it("seeds the published P0 content graph before discovering and provisioning the path", () => {
    const contentSeed = workflow.indexOf(
      "scripts/seed-education-v2-p0.ts --dry-run --content-only",
    );
    const lessonSeed = workflow.indexOf("scripts/seed-education-v2-p0-lessons.ts --dry-run");
    const discovery = workflow.indexOf("id: education-v2-discovery");
    const provisioning = workflow.indexOf("id: seed");

    expect(contentSeed).toBeGreaterThan(-1);
    expect(workflow).toContain("scripts/seed-education-v2-p0.ts --apply --content-only");
    expect(lessonSeed).toBeGreaterThan(contentSeed);
    expect(workflow).toContain("scripts/seed-education-v2-p0-lessons.ts --apply");
    expect(workflow).toContain("EDUCATION_V2_P0_ALLOW_WRITE: ${{ inputs.seed_confirmation }}");
    expect(lessonSeed).toBeLessThan(discovery);
    expect(discovery).toBeLessThan(provisioning);
  });

  it("allows only complete additive graphs while preserving the conflict guard", () => {
    expect(p0Seed).toContain('"CREATE" | "ADDITIVE" | "NOOP" | "CONFLICT"');
    expect(p0Seed).toContain("planKeysToCreate");
    expect(p0Seed).toContain("if (!planKeysToCreate.has(plan.content.key)) continue;");
    expect(p0Seed).toContain('if (mode === "CONFLICT")');
    expect(p0Seed).toContain("assessmentKeysToCreate");
  });

  it("keeps the academic lesson transaction open for the full provisioning graph", () => {
    expect(lessonSeed).toContain("transactionOptions: { maxWait: 20_000, timeout: 120_000 }");
  });

  it("selects the complete academic-v2 graph over the legacy base graph", () => {
    expect(provisioner).toContain("metadata?.contractVersion === 2");
    expect(provisioner).toContain("hasCompleteAcademicLessonContent");
    expect(provisioner).toContain("lesson.stages.every");
  });

  it("keeps the persistent path provisioning transaction open for graph discovery", () => {
    expect(provisioner).toContain("transactionOptions: { maxWait: 20_000, timeout: 120_000 }");
  });

  it("assigns unique positions within each area unit", () => {
    expect(provisioner).toContain("lessonIndex * lesson.stages.length + displayOrder + 1");
  });

  it("compares existing learning steps without treating their identity as mutable data", () => {
    expect(provisioner).toContain("const { id, status, isActive, ...existingValues } = existing;");
    expect(provisioner).toContain("isDeepStrictEqual(existingValues, immutable)");
  });
});
