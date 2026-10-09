import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-migration-recovery.yml", import.meta.url),
  "utf8",
);
const fingerprint = readFileSync(new URL("../scripts/db-fingerprint.ts", import.meta.url), "utf8");
const forensics = readFileSync(
  new URL("../scripts/production-migration-forensics.ts", import.meta.url),
  "utf8",
);

describe("production migration recovery policy integration", () => {
  it("uses the shared read-only policy and accepts an empty pending list", () => {
    expect(workflow).toContain("scripts/production-migration-forensics.ts");
    expect(workflow).toContain("scripts/verify-canonical-placement-migration-policy.ts");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS");
    expect(workflow).not.toContain("unexpected next production migration state");
    expect(workflow).not.toContain("pending[0] !==");
    expect(workflow).toContain("targetApplied");
    expect(workflow).toContain('entry?.state === "APPLIED"');
  });

  it("keeps the targeted recovery write narrow and does not add deploy or rollback", () => {
    expect(workflow).toContain(
      "prisma migrate resolve --applied 20260907170000_add_gp_achievement_metadata",
    );
    expect(workflow).not.toContain("prisma migrate resolve --rolled-back");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed");
  });

  it("keeps general fingerprint fail-closed while exposing safe history facts", () => {
    expect(fingerprint).toContain("const failed = migrationRows.filter");
    expect(fingerprint).toContain("status: failed.length === 0 && pending.length === 0");
    expect(fingerprint).toContain("history: migrationHistory");
    expect(forensics).toContain("pendingMigrations");
    expect(forensics).toContain("AchievementCategory");
    expect(forensics).toContain("AchievementKind");
    expect(forensics).toContain("PointEventType");
    expect(forensics).toContain("Badge");
  });
});
