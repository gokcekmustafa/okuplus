import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const seedSource = () =>
  readFile(new URL("../scripts/seed-education-v2-p1-a-cycle-v2.ts", import.meta.url), "utf8");

describe("P1-A Cycle 2 provisioning contract", () => {
  it("defaults to dry-run and uses isolated release environment variables", async () => {
    const source = await seedSource();
    expect(source).toContain('const dryRun = !args.has("--apply") || args.has("--dry-run")');
    expect(source).toContain('const TARGET_ENV = "EDUCATION_V2_P1_A_CYCLE_V2_ENVIRONMENT"');
    expect(source).toContain(
      'const PRODUCTION_DATABASE_ENV = "EDUCATION_V2_P1_A_CYCLE_V2_PRODUCTION_DATABASE_URL"',
    );
    expect(source).toContain(
      'const APPROVED_FINGERPRINT_ENV = "EDUCATION_V2_P1_A_CYCLE_V2_APPROVED_TARGET_FINGERPRINT"',
    );
    expect(source).not.toContain("EDUCATION_V2_P1_A_PRODUCTION_DATABASE_URL");
    expect(source).toContain("DB_FINGERPRINT_DATABASE_URL");
  });

  it("fails closed for a partial graph and never overwrites existing rows", async () => {
    const source = await seedSource();
    expect(source).toContain('if (existingCount === 0) return "MISSING"');
    expect(source).toContain('if (existingCount !== expectedCount) return "CONFLICT"');
    expect(source).toContain(
      'fail("Cycle 2 stable graph kısmi veya uyumsuz; overwrite yapılmayacak")',
    );
    expect(source).toContain(
      'if (dryRun || state === "EXISTING") return { state, dbChanged: false }',
    );
  });

  it("keeps production target, fingerprint, release, and explicit approval gates", async () => {
    const source = await seedSource();
    expect(source).toContain("assertLiveCatalogTargetIdentity");
    expect(source).toContain("assertApprovedTargetFingerprint");
    expect(source).toContain("assertSameCatalogDatabaseTarget");
    expect(source).toContain("PRODUCTION_RELEASE_ID_ENV");
    expect(source).toContain("PRODUCTION_CONFIRMATION");
    expect(source).toContain(
      "if (!dryRun && process.env[PRODUCTION_APPROVAL_ENV] !== PRODUCTION_CONFIRMATION)",
    );
    expect(source).toContain(
      'const PRODUCTION_BACKUP_CONFIRMATION_ENV = "EDUCATION_V2_P1_A_CYCLE_V2_BACKUP_CONFIRMATION"',
    );
    expect(source).toContain(
      'const BACKUP_CONFIRMATION = "I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK"',
    );
    expect(source).toContain(
      "if (!dryRun && process.env[PRODUCTION_BACKUP_CONFIRMATION_ENV] !== BACKUP_CONFIRMATION)",
    );
    expect(source).toContain("prisma.$transaction");
    expect(source).toContain("dbChanged: true");
  });

  it("validates and persists the immutable runtime version config", async () => {
    const source = await seedSource();
    expect(source).toContain("parseTrainingExerciseVersionConfig(exercise.contract)");
    expect(source).toContain("runtimeVersionConfig(plan.exercise)");
    expect(source).toContain("renderer tanımı eksik");
    expect(source).not.toContain("toTrainingExerciseVersionConfig");
  });
});
