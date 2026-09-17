import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");
const schema = readFileSync(join(repositoryRoot, "prisma", "schema.prisma"), "utf8");
const migrationDirectory = "20260917120000_reconcile_release_0_6_schema";
const migration = readFileSync(
  join(repositoryRoot, "prisma", "migrations", migrationDirectory, "migration.sql"),
  "utf8",
);

describe("Release 0.6 canonical schema reconciliation", () => {
  it("keeps Achievement metadata and the current DB contract in Prisma schema", () => {
    expect(schema).toContain("enum AchievementCategory {");
    expect(schema).toContain("enum AchievementKind {");
    expect(schema).toMatch(/category\s+AchievementCategory\s+@default\(TRAINING\)/);
    expect(schema).toMatch(/kind\s+AchievementKind\s+@default\(BADGE\)/);
    expect(schema).toMatch(/targetValue\s+Int\?/);
    expect(schema).toContain("@@index([category, status, displayOrder])");
    expect(schema).toContain("@@index([status, publishedAt])");
    expect(schema).toContain("@@index([contentVersionId])");
    expect(schema).toContain("@@index([tenantId, receivedAt])");
    expect(schema).toContain("@default(now()) @updatedAt");
    expect(schema).toContain(
      'map: "EntitlementUsage_tenantId_userId_feature_usageDate_idempotencyK"',
    );
  });

  it("places the forward migration after the Release 0.6 foundation", () => {
    const migrationNames = readdirSync(join(repositoryRoot, "prisma", "migrations"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(
      migrationNames.indexOf("20260914100000_add_learning_experience_foundation"),
    ).toBeLessThan(migrationNames.indexOf(migrationDirectory));
  });

  it("is additive, idempotent, and fails closed on incompatible Achievement state", () => {
    expect(migration).toContain('CREATE TYPE public."AchievementCategory" AS ENUM');
    expect(migration).toContain('CREATE TYPE public."AchievementKind" AS ENUM');
    expect(migration).toContain("v_labels IS DISTINCT FROM ARRAY[");
    expect(migration).toContain("Badge.category is incompatible");
    expect(migration).toContain("Badge.kind is incompatible");
    expect(migration).toContain("Badge.targetValue is incompatible");
    expect(migration).toContain("Badge canonical index exists with incompatible properties");
    expect(migration).toContain("IF v_exact THEN");
    expect(migration).toContain('CREATE INDEX "Badge_category_status_displayOrder_idx"');
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+|INSERT\s+INTO)\b/i);
  });

  it("does not alter historical migration artifacts", () => {
    expect(migration).not.toContain("20260907170000_add_gp_achievement_metadata");
    expect(migration).not.toContain("_prisma_migrations");
    expect(migration).not.toContain("migrate resolve");
  });
});
