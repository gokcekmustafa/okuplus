import { readFile } from "node:fs/promises";
import {
  evaluateCanonicalPlacementMigrationPolicy,
  type CanonicalPlacementMigrationPolicyInput,
} from "../src/lib/canonical-placement-migration-policy.js";

function requiredReportPath(): string {
  const value = process.env.MIGRATION_FORENSICS_REPORT_FILE?.trim();
  if (!value) throw new Error("MIGRATION_FORENSICS_REPORT_FILE is required");
  return value;
}

async function main(): Promise<void> {
  const rawReport = JSON.parse(await readFile(requiredReportPath(), "utf8")) as Omit<
    CanonicalPlacementMigrationPolicyInput,
    "targetIdentityMatch"
  > & {
    targetIdentityMatch?: unknown;
  };
  const report: CanonicalPlacementMigrationPolicyInput = {
    ...rawReport,
    targetIdentityMatch:
      rawReport.targetIdentityMatch === true || rawReport.targetIdentityMatch === "MATCH",
  };
  const result = evaluateCanonicalPlacementMigrationPolicy(report);
  console.log(
    JSON.stringify(
      {
        status: result.allowed ? "PASS" : "REVIEW_REQUIRED",
        targetApplied: result.targetApplied,
        targetHistoricalRollback: result.targetHistoricalRollback,
        pendingCount: result.pendingMigrations.length,
        reasons: result.reasons,
        productionDbWrite: "NO",
      },
      null,
      2,
    ),
  );
  if (!result.allowed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "migration policy validation failed");
  process.exitCode = 1;
});
