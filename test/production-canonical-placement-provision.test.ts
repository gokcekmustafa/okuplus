import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-canonical-placement-provision.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/provision-canonical-placement-production.ts", import.meta.url),
  "utf8",
);

describe("protected canonical placement production provision", () => {
  it("is a narrow master-only production workflow with backup and fingerprint gates", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain("CREATE_CANONICAL_PLACEMENT_GRAPH_V1");
    expect(workflow).toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(workflow).toContain("scripts/db-fingerprint.ts");
    expect(workflow).toContain("scripts/provision-canonical-placement-production.ts");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed-");
  });

  it("reuses the canonical transaction and enforces CREATE then NOOP", () => {
    expect(script).toContain("buildCanonicalPlacementAssessmentGraph");
    expect(script).toContain("readCanonicalPlacementSnapshot");
    expect(script).toContain("planCanonicalPlacementPromotion");
    expect(script).toContain("applyCanonicalPlacementPromotion");
    expect(script).toContain('beforePlan.action !== "CREATE"');
    expect(script).toContain('afterPlan.action !== "NOOP"');
    expect(script).toContain("canonicalActive !== false");
    expect(script).toContain('calibrationStatus !== "NOT_CALIBRATED"');
    expect(script).toContain("productionAssignmentEnabled !== false");
    expect(script).not.toContain("$executeRaw");
    expect(script).not.toContain("migrate deploy");
    expect(script).not.toContain("seed");
  });
});
