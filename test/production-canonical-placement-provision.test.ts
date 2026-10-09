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
    expect(workflow).toContain("PLAN_ONLY");
    expect(workflow).toContain("PLAN_CANONICAL_PLACEMENT_GRAPH_V1");
    expect(workflow).toContain("CANONICAL_PLACEMENT_OPERATION");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain("CREATE_CANONICAL_PLACEMENT_GRAPH_V1");
    expect(workflow).toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(workflow).toContain("I_ACCEPT_EXISTING_SNAPSHOT_WITH_UNTESTED_RESTORE");
    expect(workflow).toContain(
      "the existing snapshot is not current and restore has not been tested",
    );
    expect(workflow).toContain("PRODUCTION_BACKUP_CONFIRMATION_MODE=OPERATOR_VERIFIED");
    expect(workflow).toContain(
      "PRODUCTION_BACKUP_CONFIRMATION_MODE=EXISTING_SNAPSHOT_UNTESTED_RESTORE_RISK_ACCEPTED",
    );
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS");
    expect(workflow).toContain("scripts/db-fingerprint.ts");
    expect(workflow).toContain("scripts/production-migration-forensics.ts");
    expect(workflow).toContain("scripts/verify-canonical-placement-migration-policy.ts");
    expect(workflow).toContain("GENERAL_MIGRATION_FINGERPRINT=REVIEW_REQUIRED");
    expect(workflow).toContain("scripts/provision-canonical-placement-production.ts");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed-");
  });

  it("reuses the canonical transaction and enforces CREATE then NOOP", () => {
    expect(script).toContain("buildCanonicalPlacementAssessmentGraph");
    expect(script).toContain("readCanonicalPlacementSnapshot");
    expect(script).toContain("planCanonicalPlacementPromotion");
    expect(script).toContain("applyCanonicalPlacementPromotion");
    expect(script).toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(script).toContain("I_ACCEPT_EXISTING_SNAPSHOT_WITH_UNTESTED_RESTORE");
    expect(script).toContain('"OPERATOR_VERIFIED"');
    expect(script).toContain('"EXISTING_SNAPSHOT_UNTESTED_RESTORE_RISK_ACCEPTED"');
    expect(script).toContain('beforePlan.action !== "CREATE"');
    expect(script).toContain('afterPlan.action !== "NOOP"');
    expect(script).toContain('operation === "PLAN_ONLY"');
    expect(script).toContain("SNAPSHOT_READ_BEFORE");
    expect(script).toContain("beforePlanAction");
    expect(script).toContain("errorCode");
    expect(script).toContain("canonicalPlacementProvisionWriteState");
    expect(script).toContain("canonicalActive !== false");
    expect(script).toContain('calibrationStatus !== "NOT_CALIBRATED"');
    expect(script).toContain("productionAssignmentEnabled !== false");
    expect(script).not.toContain("$executeRaw");
    expect(script).not.toContain("migrate deploy");
    expect(script).not.toContain("seed");
  });
});
